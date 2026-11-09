// Per-session host settings for Regular QOD (Settings dropdown). In-memory only,
// same lifetime model as Quiz Session's gameState.ts SessionSettings — always
// starts at the default below for a brand-new session, never persisted as a quiz
// default. Applies for the whole time a session is live (WAITING + ACTIVE), the
// same window renaming has always been allowed in.

export interface QodSessionSettings {
  allowNameEdit: boolean; // lets students use their own Edit button / implicit rejoin-rename
}

const DEFAULT_SETTINGS: QodSessionSettings = {
  allowNameEdit: true,
};

const qodSessionSettings = new Map<string, QodSessionSettings>();

export function getQodSessionSettings(sessionId: string): QodSessionSettings {
  return qodSessionSettings.get(sessionId) ?? DEFAULT_SETTINGS;
}

// Merges a partial update (e.g. just this one toggle) into whatever is currently
// stored (or the defaults, if nothing has been set yet this session) and returns it.
export function setQodSessionSettings(
  sessionId: string,
  patch: Partial<QodSessionSettings>
): QodSessionSettings {
  const next = { ...getQodSessionSettings(sessionId), ...patch };
  qodSessionSettings.set(sessionId, next);
  return next;
}

export function clearQodSessionSettings(sessionId: string) {
  qodSessionSettings.delete(sessionId);
}