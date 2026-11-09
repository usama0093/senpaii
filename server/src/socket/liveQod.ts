import crypto from "crypto";
import type { Socket } from "socket.io";

export interface QodAnswer {
  id: string;
  name: string;
  text: string;
  at: number;
}

interface Participant {
  name: string;
  lastSentAt: number;
  deviceId?: string;
}

export interface LiveQodSettings {
  allowNameEdit: boolean; // lets students use their own Edit button / implicit rejoin-rename
}

export interface LiveQodSession {
  pin: string;
  hostId: string;
  hostKey: string; // secret only the host's screen knows
  createdAt: number;
  question: string;
  started: boolean; // becomes true once the host clicks Continue
  participants: Map<string, Participant>; // token → participant
  answers: QodAnswer[];
  settings: LiveQodSettings;
}

// Live QOD lives ONLY in memory, same as Live Feedback. Nothing is saved to the database.
const sessions = new Map<string, LiveQodSession>();

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // a forgotten session disappears after 6 hours
export const MAX_PARTICIPANTS = 500;
export const MAX_ANSWERS = 500;
export const MAX_TEXT_LENGTH = 300;
export const MAX_NAME_LENGTH = 30;
export const MIN_SEND_GAP_MS = 2000; // one answer every 2 seconds per student

export const studentRoom = (pin: string) => `qod:${pin}`;
export const hostRoom = (pin: string) => `qod-host:${pin}`;

export function getSession(pin: string): LiveQodSession | undefined {
  const session = sessions.get(pin);
  if (session && Date.now() - session.createdAt > MAX_AGE_MS) {
    sessions.delete(pin);
    return undefined;
  }
  return session;
}

export function findSessionByHost(hostId: string): LiveQodSession | undefined {
  for (const pin of Array.from(sessions.keys())) {
    const session = getSession(pin);
    if (session && session.hostId === hostId) return session;
  }
  return undefined;
}

export function createSession(hostId: string): LiveQodSession {
  let pin = "";
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (sessions.has(pin));

  const session: LiveQodSession = {
    pin,
    hostId,
    hostKey: crypto.randomBytes(16).toString("hex"),
    createdAt: Date.now(),
    question: "",
    started: false,
    participants: new Map<string, Participant>(),
    answers: [],
    settings: { allowNameEdit: true },
  };
  sessions.set(pin, session);
  return session;
}

export function removeSession(pin: string) {
  sessions.delete(pin);
}

// Host removes one answer from the live feed. Not a database delete (nothing here was
// ever saved to the DB) — just drops it from the in-memory list so it stops showing,
// including if the host reloads the page.
export function removeAnswer(session: LiveQodSession, answerId: string): boolean {
  const index = session.answers.findIndex((a) => a.id === answerId);
  if (index === -1) return false;
  session.answers.splice(index, 1);
  return true;
}

// A student types their own name (not anonymous). Duplicates get a number appended
// so every name stays unique within this session. A returning student on the same
// device (matched by deviceId) resumes their existing token/name instead of getting
// a second entry — this is what prevents duplicates across a refresh or reconnect.
// Picks a unique display name within this session, appending a number if needed.
// excludeToken leaves one participant (the one being renamed, if any) out of the
// collision check against themselves.
function dedupeName(session: LiveQodSession, requestedName: string, excludeToken?: string): string {
  const used = new Set(
    Array.from(session.participants.entries())
      .filter(([token]) => token !== excludeToken)
      .map(([, p]) => p.name.toLowerCase())
  );
  const base = requestedName.slice(0, MAX_NAME_LENGTH);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} ${n}`;
    n++;
  }
  return candidate;
}

export function addParticipant(
  session: LiveQodSession,
  requestedName: string,
  deviceId?: string
): { name: string; token: string } {
  if (deviceId) {
    for (const [existingToken, p] of session.participants) {
      if (p.deviceId === deviceId) {
        const trimmed = requestedName.trim();
        // A different name typed at rejoin is treated as an implicit rename, but
        // only when the host's name-edit toggle currently allows it.
        if (session.settings.allowNameEdit && trimmed && trimmed !== p.name) {
          p.name = dedupeName(session, trimmed, existingToken);
        }
        return { name: p.name, token: existingToken };
      }
    }
  }

  const candidate = dedupeName(session, requestedName);
  const token = crypto.randomBytes(12).toString("hex");
  session.participants.set(token, { name: candidate, lastSentAt: 0, deviceId });
  return { name: candidate, token };
}

// What the host screen is allowed to see.
export function hostView(session: LiveQodSession) {
  return {
    pin: session.pin,
    hostKey: session.hostKey,
    createdAt: session.createdAt,
    question: session.question,
    started: session.started,
    joined: session.participants.size,
    answers: session.answers,
    settings: session.settings,
  };
}

// Socket side: who listens where.
export function registerLiveQodSocket(socket: Socket) {
  // Students listen for "qod:question" and "qod:ended" in this room.
  socket.on("qod:join", ({ pin }: { pin: string }) => {
    if (typeof pin === "string" && getSession(pin)) socket.join(studentRoom(pin));
  });

  // Only the host's screen (it knows the secret hostKey) receives live answers.
  socket.on("qod:host-join", ({ pin, hostKey }: { pin: string; hostKey: string }) => {
    const session = typeof pin === "string" ? getSession(pin) : undefined;
    if (session && session.hostKey === hostKey) socket.join(hostRoom(pin));
  });
}