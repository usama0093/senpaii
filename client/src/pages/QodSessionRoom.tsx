import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import MoreMenu from "../components/MoreMenu";
import SessionBrand from "../components/SessionBrand";
import RichText from "../components/RichText";
import { lazy, Suspense } from "react";
const ThemeToggleButton = lazy(() => import("../components/ThemeToggleButton"));

interface Room {
  sessionId: string;
  pin: string;
  name: string;
  participantId: string;
  status: "WAITING" | "ACTIVE" | "ENDED";
  questionId: string | null;
  question: string;
}

interface SubmittedResponse {
  id: string;
  text: string;
  at: number | string;
}

const MAX_LENGTH = 300;
const ROOM_KEY = "qodSessionRoom";
const draftKey = (sessionId: string) => `qodDraft:${sessionId}`;

const clearDraft = (sessionId: string) => {
  try {
    sessionStorage.removeItem(draftKey(sessionId));
  } catch (err) {
    // ignore
  }
};

const saveDraft = (sessionId: string, questionId: string | null, text: string) => {
  try {
    sessionStorage.setItem(draftKey(sessionId), JSON.stringify({ questionId, text }));
  } catch (err) {
    // ignore
  }
};

function loadRoom(fromState: unknown): Room | null {
  const s = fromState as Room | null;
  if (s && s.sessionId && s.participantId) return s;
  try {
    const raw = sessionStorage.getItem(ROOM_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.sessionId && saved.participantId) return saved as Room;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export default function QodSessionRoom() {
  const location = useLocation();
  const [room] = useState<Room | null>(() => loadRoom(location.state));
  const [questionId, setQuestionId] = useState(room?.questionId ?? null);
  const [question, setQuestion] = useState(room?.question || "");

  // Name editing
  const [displayName, setDisplayName] = useState(room?.name || "");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [allowNameEdit, setAllowNameEdit] = useState(true);

  const [text, setText] = useState("");
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [responses, setResponses] = useState<SubmittedResponse[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(room?.status === "ENDED");
  const [removed, setRemoved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;

    // Rebuilds the page's real state from the server: the session's actual current
    // status/question (the join response is only a snapshot from that moment, and
    // goes stale across a refresh or if time passed before the host started), this
    // participant's own already-submitted responses to it, and any unsent draft
    // they had typed — so a refresh looks the same as it did before.
    const restore = async () => {
      try {
        const statusRes = await api.get(`/qod-sessions/${room.sessionId}/status`);
        if (cancelled) return;
        const { status, questionId: liveQuestionId, question: liveQuestion, settings } = statusRes.data.data;

        setQuestion(liveQuestion);
        setQuestionId(liveQuestionId);
        if (settings) setAllowNameEdit(settings.allowNameEdit);

        if (status === "ENDED") {
          setEnded(true);
          return;
        }

        if (liveQuestionId) {
          const respRes = await api.get(`/qod-sessions/${room.sessionId}/responses`, {
            params: { participantId: room.participantId, questionId: liveQuestionId },
          });
          if (!cancelled) setResponses(respRes.data.data);
        }

        try {
          const raw = sessionStorage.getItem(draftKey(room.sessionId));
          if (raw) {
            const saved = JSON.parse(raw);
            if (!cancelled && saved && saved.questionId === liveQuestionId && typeof saved.text === "string") {
              setText(saved.text);
            }
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        // Falls back silently to the join-time snapshot already in state; the
        // socket below keeps things current for the rest of this visit either way.
      }
    };
    restore();

    socket.on("connect", () =>
      socket.emit("qod-session:join", { pin: room.pin, participantId: room.participantId })
    );
    socket.on(
      "qod-session:question",
      ({ questionId: newQuestionId, text: newText, index }: { questionId: string; text: string; index: number }) => {
        setQuestionId(newQuestionId);
        setQuestion(newText);
        setNotice("");

        // index 0 is always the session's very first question (the WAITING -> ACTIVE
        // transition on Start). Only a genuine move to a later question — never the
        // start itself — should clear what the student has already typed or sent.
        if (index !== 0) {
          setText("");
          setEditingResponseId(null);
          setResponses([]);
          clearDraft(room.sessionId);
        }
      }
    );
    socket.on("qod-session:response-deleted", ({ responseId }: { responseId: string }) => {
      setResponses((prev) => prev.filter((r) => r.id !== responseId));
      setEditingResponseId((prev) => (prev === responseId ? null : prev));
    });
    socket.on("qod-session:participant-removed", ({ participantId }: { participantId: string }) => {
      if (participantId === room.participantId) setRemoved(true);
    });
    socket.on("qod-session:settings-update", (settings: { allowNameEdit: boolean }) => {
      setAllowNameEdit(settings.allowNameEdit);
    });
    socket.on("qod-session:ended", () => setEnded(true));
    socket.connect();

    return () => {
      cancelled = true;
      socket.off("connect");
      socket.off("qod-session:question");
      socket.off("qod-session:response-deleted");
      socket.off("qod-session:participant-removed");
      socket.off("qod-session:settings-update");
      socket.off("qod-session:ended");
      socket.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if ((ended || removed) && room) {
      try {
        sessionStorage.removeItem(ROOM_KEY);
      } catch (err) {
        // ignore
      }
      clearDraft(room.sessionId);
    }
  }, [ended, removed, room]);

  if (!room) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Please join with a QOD PIN first.</p>
        <Link to="/join-qod" className="text-brand-accent font-medium hover:underline">
          Enter a QOD PIN
        </Link>
      </div>
    );
  }

  const handleTextChange = (value: string) => {
    setText(value);
    if (error) setError("");
    saveDraft(room.sessionId, questionId, value);
  };

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      setNameError("Name must be at least 2 characters");
      return;
    }
    setNameError("");
    setSavingName(true);
    try {
      const res = await api.put(`/qod-sessions/${room.sessionId}/participants/${room.participantId}`, {
        displayName: name,
      });
      const finalName = res.data.data.displayName;
      setDisplayName(finalName);
      setEditingName(false);
      try {
        sessionStorage.setItem(ROOM_KEY, JSON.stringify({ ...room, name: finalName }));
      } catch (err) {
        // ignore
      }
    } catch (err: any) {
      setNameError(err.response?.data?.message || "Could not update your name");
    } finally {
      setSavingName(false);
    }
  };

  const cancelEdit = () => {
    setEditingResponseId(null);
    setText("");
    setError("");
    clearDraft(room.sessionId);
  };

  const handleEditResponse = (r: SubmittedResponse) => {
    setEditingResponseId(r.id);
    setText(r.text);
    setError("");
    saveDraft(room.sessionId, questionId, r.text);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    const answer = text.trim();
    if (!answer) {
      setError("Write an answer first");
      return;
    }
    if (!questionId) {
      setError("There is no active question right now");
      return;
    }
    setError("");
    setNotice("");
    setSending(true);

    try {
      if (editingResponseId) {
        const res = await api.put(`/qod-sessions/${room.sessionId}/responses/${editingResponseId}`, {
          participantId: room.participantId,
          text: answer,
        });
        const { id, text: savedText, at } = res.data.data;
        setResponses((prev) => [{ id, text: savedText, at }, ...prev.filter((r) => r.id !== id)]);
        setEditingResponseId(null);
        setNotice("Answer updated!");
      } else {
        const res = await api.post(`/qod-sessions/${room.sessionId}/responses`, {
          participantId: room.participantId,
          questionId,
          text: answer,
        });
        const { id, text: savedText, at } = res.data.data;
        setResponses((prev) => [{ id, text: savedText, at }, ...prev]);
        setNotice("Answer submitted!");
      }
      setText("");
      clearDraft(room.sessionId);
      setTimeout(() => setNotice(""), 3000);
    } catch (err: any) {
      if (err.response?.status === 404) setEnded(true);
      else setError(err.response?.data?.message || "Wait for the host to start the session");
    } finally {
      setSending(false);
    }
  };

  if (removed) {
    return (
      <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center gap-4 p-6 text-center">
        <SessionBrand />
        <Suspense fallback={null}>
          <ThemeToggleButton position="top-right" />
        </Suspense>
        <h1 className="text-3xl font-extrabold text-red-400">You were removed</h1>
        <p className="text-slate-400">The host removed you from this session.</p>
        <Link to="/join-qod" className="text-brand-accent font-medium hover:underline">
          Join another session
        </Link>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center gap-4 p-6 text-center">
        <SessionBrand />
        <Suspense fallback={null}>
          <ThemeToggleButton position="top-right" />
        </Suspense>
        <h1 className="text-3xl font-extrabold text-brand-accent">Quiz of the Day — Session Completed!</h1>
        <p className="text-slate-400">Thank you for participating!</p>
        <Link to="/join-qod" className="text-brand-accent font-medium hover:underline">
          Join another session
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-brand-bg text-brand-text flex items-center justify-center p-6">
      <SessionBrand />
      <Suspense fallback={null}>
        <ThemeToggleButton position="top-right" />
      </Suspense>
      <div className="w-full max-w-md pt-14 md:pt-16">
        {editingName ? (
          <div className="mb-6">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              className="w-full bg-slate-800 text-brand-text text-center rounded-lg px-4 py-3 mb-2 outline-none focus:ring-2 focus:ring-brand-accent"
            />
            {nameError && <p className="text-brand-error text-sm text-center mb-2">{nameError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="flex-1 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-2 disabled:opacity-50"
              >
                {savingName ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(displayName);
                  setNameError("");
                }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold rounded-lg py-2 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center mb-6">
            <p className="text-slate-400">You are</p>
            <p className="text-3xl font-extrabold text-brand-accent mb-2">{displayName}</p>
            {allowNameEdit && (
              <button
                onClick={() => {
                  setNameDraft(displayName);
                  setEditingName(true);
                }}
                className="w-24 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-1"
              >
                Edit
              </button>
            )}
          </div>
        )}

        <div className="surface rounded-xl px-5 py-4 mb-4">
          <p className="text-slate-400 text-sm mb-1">Question</p>
          {question ? (
            <RichText html={question} className="text-xl" />
          ) : (
            <p className="text-xl text-brand-text/60">Waiting for the host to start...</p>
          )}
        </div>

        {editingResponseId && (
          <div className="flex items-center justify-between bg-brand-text/5 rounded-lg px-3 py-2 mb-2">
            <span className="text-brand-text/70 text-sm">Editing your response</span>
            <button onClick={cancelEdit} className="text-brand-text/70 text-sm hover:underline">
              Cancel
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={5}
          maxLength={MAX_LENGTH}
          placeholder="Type your answer..."
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="w-full bg-slate-800 text-brand-text rounded-lg px-4 py-3 mb-1 resize-none outline-none focus:ring-2 focus:ring-brand-accent"
        />

        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            {error && <p className="text-brand-error text-xs">{error}</p>}
            {notice && <p className="text-green-400 text-xs">{notice}</p>}
          </div>
          <p className="text-slate-500 text-xs shrink-0">
            {text.length} / {MAX_LENGTH}
          </p>
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !text.trim() || !questionId}
          className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
        >
          {sending ? "Submitting..." : !questionId ? "Waiting for host..." : editingResponseId ? "Update answer" : "Submit answer"}
        </button>

        {responses.length > 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-slate-400 text-sm">Your responses to this question</p>
            {responses.map((r) => (
              <div
                key={r.id}
                className="bg-slate-900 border border-brand-text/10 rounded-xl px-4 py-3 flex items-start gap-3"
              >
                <p className="flex-1 min-w-0 whitespace-pre-wrap break-words">{r.text}</p>
                <MoreMenu items={[{ label: "Edit", onClick: () => handleEditResponse(r) }]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}