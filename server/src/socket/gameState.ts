interface ActiveQuestionState {
  questionId: string;
  startTime: number;
  timeLimit: number;
  points: number;
  totalParticipants: number;
  answeredCount: number;
  timeoutHandle: NodeJS.Timeout;
}

const activeQuestions = new Map<string, ActiveQuestionState>();

// Timers for the "question shown alone" intro, before the options appear.
const introTimers = new Map<string, NodeJS.Timeout>();

export function setIntroTimer(sessionId: string, handle: NodeJS.Timeout) {
  clearIntroTimer(sessionId);
  introTimers.set(sessionId, handle);
}

export function clearIntroTimer(sessionId: string) {
  const handle = introTimers.get(sessionId);
  if (handle) clearTimeout(handle);
  introTimers.delete(sessionId);
}

export function hasIntroTimer(sessionId: string): boolean {
  return introTimers.has(sessionId);
}

// Timer for auto-advancing to the next question when the "Autoplay" setting is on.
// Lives separately from introTimers so a manual "Next" click (which clears this)
// never has to guess whether a pending timeout is an intro delay or an autoplay one.
const autoplayTimers = new Map<string, NodeJS.Timeout>();

export function setAutoplayTimer(sessionId: string, handle: NodeJS.Timeout) {
  clearAutoplayTimer(sessionId);
  autoplayTimers.set(sessionId, handle);
}

export function clearAutoplayTimer(sessionId: string) {
  const handle = autoplayTimers.get(sessionId);
  if (handle) clearTimeout(handle);
  autoplayTimers.delete(sessionId);
}

export function hasAutoplayTimer(sessionId: string): boolean {
  return autoplayTimers.has(sessionId);
}

export function setActiveQuestion(sessionId: string, state: ActiveQuestionState) {
  activeQuestions.set(sessionId, state);
}

export function getActiveQuestion(sessionId: string): ActiveQuestionState | undefined {
  return activeQuestions.get(sessionId);
}

// Stops everything running for a session: the question timer, any pending intro,
// and any pending autoplay advance.
export function clearActiveQuestion(sessionId: string) {
  const state = activeQuestions.get(sessionId);
  if (state) clearTimeout(state.timeoutHandle);
  activeQuestions.delete(sessionId);
  clearIntroTimer(sessionId);
  clearAutoplayTimer(sessionId);
}

export function incrementAnsweredCount(sessionId: string): number {
  const state = activeQuestions.get(sessionId);
  if (!state) return 0;
  state.answeredCount += 1;
  return state.answeredCount;
}

// ---------- Per-session host settings (Settings dropdown) ----------
// In-memory only, same lifetime as the rest of this file's live game state.
// Always starts at the defaults below for a brand-new session — settings are
// never carried over from a previous game, even a "Play Again" on the same quiz.

export interface SessionSettings {
  autoplay: boolean; // auto-advance to the next question once the timer runs out
  showQaToStudents: boolean; // show the question text + answer options on student screens too
  allowNameEdit: boolean; // lets a student use Edit at the very end of the game (Game Over reveal)
}

const DEFAULT_SETTINGS: SessionSettings = {
  autoplay: false,
  showQaToStudents: false,
  allowNameEdit: false,
};

const sessionSettings = new Map<string, SessionSettings>();

export function getSessionSettings(sessionId: string): SessionSettings {
  return sessionSettings.get(sessionId) ?? DEFAULT_SETTINGS;
}

// Merges a partial update (e.g. just one toggle) into whatever is currently stored
// (or the defaults, if nothing has been set yet this session) and returns the result.
export function setSessionSettings(sessionId: string, patch: Partial<SessionSettings>): SessionSettings {
  const next = { ...getSessionSettings(sessionId), ...patch };
  sessionSettings.set(sessionId, next);
  return next;
}

export function clearSessionSettings(sessionId: string) {
  sessionSettings.delete(sessionId);
}

// ---------- Whether the host has clicked Continue on the final podium ----------
// Lets a reconnecting student (refresh, or a backgrounded tab reloading after the
// device was locked) catch up immediately instead of landing back on a stale
// default phase. Session-lifetime only, same as everything else here.

const revealedSessions = new Set<string>();

export function markRevealed(sessionId: string) {
  revealedSessions.add(sessionId);
}

export function hasRevealed(sessionId: string): boolean {
  return revealedSessions.has(sessionId);
}

export function clearRevealed(sessionId: string) {
  revealedSessions.delete(sessionId);
}