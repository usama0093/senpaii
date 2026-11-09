import crypto from "crypto";
import type { Socket } from "socket.io";

export interface FeedbackMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

interface Participant {
  name: string;
  lastSentAt: number;
}

export interface FeedbackSettings {
  allowNameEdit: boolean; // off by default — lets a student override their random anonymous name
}

export interface LiveFeedbackSession {
  pin: string;
  hostId: string;
  hostKey: string; // secret only the host's screen knows
  createdAt: number;
  participants: Map<string, Participant>; // token → participant
  messages: FeedbackMessage[];
  settings: FeedbackSettings;
}

const MAX_NAME_LENGTH = 40;

// Live feedback lives ONLY in memory. When a session ends it is simply forgotten:
// nothing is written to the database, so there is nothing to clean up afterwards.
const sessions = new Map<string, LiveFeedbackSession>();

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // a forgotten session disappears after 6 hours
export const MAX_PARTICIPANTS = 500;
export const MAX_MESSAGES = 500;
export const MAX_TEXT_LENGTH = 300;
export const MIN_SEND_GAP_MS = 2000; // one message every 2 seconds per student

export const studentRoom = (pin: string) => `feedback:${pin}`;
export const hostRoom = (pin: string) => `feedback-host:${pin}`;

const ANIME_ADJECTIVES = [
  "Shadow", "Crimson", "Golden", "Silent", "Fierce", "Slayer", "Phantom", "Mighty",
  "Divine", "Iron", "Storm", "Hollow", "Blazing", "Voltage", "Void", "Cursed",
];

const ANIME_CREATURES = [
  "Shinobi", "Titan", "Ninja", "Kitsune", "Dragon", "Ronin", "Spirit", "Samurai",
  "Mecha", "Yokai", "Ghoul", "Alchemist", "Beast", "Android", "Valkyrie", "Esper",
];

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

export function getSession(pin: string): LiveFeedbackSession | undefined {
  const session = sessions.get(pin);
  if (session && Date.now() - session.createdAt > MAX_AGE_MS) {
    sessions.delete(pin);
    return undefined;
  }
  return session;
}

export function findSessionByHost(hostId: string): LiveFeedbackSession | undefined {
  for (const pin of Array.from(sessions.keys())) {
    const session = getSession(pin);
    if (session && session.hostId === hostId) return session;
  }
  return undefined;
}

// export function createSession(hostId: string): LiveFeedbackSession {
//   let pin = "";
//   do {
//     pin = String(Math.floor(100000 + Math.random() * 900000));
//   } while (sessions.has(pin));

//   const session: LiveFeedbackSession = {
//     pin,
//     hostId,
//     hostKey: crypto.randomBytes(16).toString("hex"),
//     createdAt: Date.now(),
//     participants: new Map<string, Participant>(),
//     messages: [],
//   };
//   sessions.set(pin, session);
//   return session;
// }

export function createSession(hostId: string, fixedPin?: string): LiveFeedbackSession {
  // A fixed PIN is used when feedback starts from a finished game: it reuses the game's PIN.
  let pin = fixedPin ?? "";
  if (!fixedPin) {
    do {
      pin = String(Math.floor(100000 + Math.random() * 900000));
    } while (sessions.has(pin));
  }

  const session: LiveFeedbackSession = {
    pin,
    hostId,
    hostKey: crypto.randomBytes(16).toString("hex"),
    createdAt: Date.now(),
    participants: new Map<string, Participant>(),
    messages: [],
    settings: { allowNameEdit: false }, // off by default, per design — never on at session start
  };
  sessions.set(pin, session);
  return session;
}

export function removeSession(pin: string) {
  sessions.delete(pin);
}


// Host removes one message from the feed. Not a database delete — nothing here was
// ever saved there — just drops it from the in-memory list.
export function removeMessage(session: LiveFeedbackSession, messageId: string): boolean {
  const index = session.messages.findIndex((m) => m.id === messageId);
  if (index === -1) return false;
  session.messages.splice(index, 1);
  return true;
}

// Gives a student a random anonymous name (unique in this session) and a private token.
export function addParticipant(session: LiveFeedbackSession): { name: string; token: string } {
  const used = new Set(Array.from(session.participants.values()).map((p) => p.name));

  let name = `${pick(ANIME_ADJECTIVES)} ${pick(ANIME_CREATURES)}`;
  for (let tries = 0; tries < 20 && used.has(name); tries++) {
    name = `${pick(ANIME_ADJECTIVES)} ${pick(ANIME_CREATURES)}`;
  }
  if (used.has(name)) name = `${name} ${session.participants.size + 1}`;

  const token = crypto.randomBytes(12).toString("hex");
  session.participants.set(token, { name, lastSentAt: 0 });
  return { name, token };
}

// What the host screen is allowed to see.
export function hostView(session: LiveFeedbackSession) {
  return {
    pin: session.pin,
    hostKey: session.hostKey,
    createdAt: session.createdAt,
    joined: session.participants.size,
    messages: session.messages,
    settings: session.settings,
  };
}

// A student overrides their random anonymous name. Only ever called when the
// host's allowNameEdit toggle is on (the controller checks before calling this) —
// this function itself just handles the rename + dedupe, same rule addParticipant
// already uses: if the requested name collides with another participant in this
// session, a number is appended. Returns null if the token doesn't match anyone or
// the name is too short, so the controller can turn that into the right error.
export function renameParticipant(session: LiveFeedbackSession, token: string, requestedName: string): string | null {
  const participant = session.participants.get(token);
  if (!participant) return null;

  const trimmed = requestedName.trim();
  if (trimmed.length < 2) return null;

  const used = new Set(
    Array.from(session.participants.entries())
      .filter(([t]) => t !== token)
      .map(([, p]) => p.name.toLowerCase())
  );
  const base = trimmed.slice(0, MAX_NAME_LENGTH);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} ${n}`;
    n++;
  }

  participant.name = candidate;
  return candidate;
}

// Socket side: who listens where.
export function registerFeedbackSocket(socket: Socket) {
  // Students listen for "feedback:ended" in this room. Also doubles as the
  // reconnect/refresh catch-up check: the client already calls this on every
  // "connect" (see FeedbackRoom.tsx), so a student whose session ended while
  // their device was locked or the tab was closed learns that immediately
  // instead of silently sitting on the compose screen until their next send fails.
  socket.on("feedback:join", ({ pin }: { pin: string }) => {
    const session = typeof pin === "string" ? getSession(pin) : undefined;
    if (session) {
      socket.join(studentRoom(pin));
    } else {
      socket.emit("feedback:ended");
    }
  });

  // Only the host's screen (it knows the secret hostKey) receives the live feedback.
  socket.on("feedback:host-join", ({ pin, hostKey }: { pin: string; hostKey: string }) => {
    const session = typeof pin === "string" ? getSession(pin) : undefined;
    if (session && session.hostKey === hostKey) socket.join(hostRoom(pin));
  });
}