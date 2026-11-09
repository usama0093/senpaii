import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import SessionBrand from "../components/SessionBrand";
import RichText from "../components/RichText";
import { lazy, Suspense } from "react";
const ThemeToggleButton = lazy(() => import("../components/ThemeToggleButton"));

interface Room {
  pin: string;
  name: string;
  token: string;
  question: string;
  started: boolean;
  allowNameEdit?: boolean;
}

const MAX_LENGTH = 300;

function loadRoom(fromState: unknown): Room | null {
  const s = fromState as Room | null;
  if (s && s.pin && s.name && s.token) return s;
  try {
    const raw = sessionStorage.getItem("liveQodRoom");
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.pin && saved.name && saved.token) return saved as Room;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export default function QodRoom() {
  const location = useLocation();
  const [room] = useState<Room | null>(() => loadRoom(location.state));
  const [question, setQuestion] = useState(room?.question || "");
  const [started, setStarted] = useState(room?.started ?? false);
  const [displayName, setDisplayName] = useState(room?.name || "");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [allowNameEdit, setAllowNameEdit] = useState(room?.allowNameEdit ?? true);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!room) return;

    socket.on("connect", () => socket.emit("qod:join", { pin: room.pin }));
    socket.on("qod:question", ({ question }: { question: string }) => setQuestion(question));
    socket.on("qod:started", () => setStarted(true));
    socket.on("qod:settings-update", (settings: { allowNameEdit: boolean }) => {
      setAllowNameEdit(settings.allowNameEdit);
    });
    socket.on("qod:ended", () => setEnded(true));
    socket.connect();

    return () => {
      socket.off("connect");
      socket.off("qod:question");
      socket.off("qod:started");
      socket.off("qod:settings-update");
      socket.off("qod:ended");
      socket.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if (ended) {
      try {
        sessionStorage.removeItem("liveQodRoom");
      } catch (err) {
        // ignore
      }
    }
  }, [ended]);

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

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      setNameError("Name must be at least 2 characters");
      return;
    }
    setNameError("");
    setSavingName(true);
    try {
      const res = await api.put(`/sessions/qod/live/${room.pin}/participants/${room.token}`, {
        displayName: name,
      });
      const finalName = res.data.data.name;
      setDisplayName(finalName);
      setEditingName(false);
      try {
        sessionStorage.setItem("liveQodRoom", JSON.stringify({ ...room, name: finalName }));
      } catch (err) {
        // ignore
      }
    } catch (err: any) {
      setNameError(err.response?.data?.message || "Could not update your name");
    } finally {
      setSavingName(false);
    }
  };

  const handleSend = async () => {
    const answer = text.trim();
    if (!answer) {
      setError("Write an answer first");
      return;
    }
    setError("");
    setNotice("");
    setSending(true);

    try {
      await api.post(`/sessions/qod/live/${room.pin}/answers`, { token: room.token, text: answer });
      setText("");
      setSentCount((c) => c + 1);
      setNotice("Answer submitted!");
      setTimeout(() => setNotice(""), 3000);
    } catch (err: any) {
      if (err.response?.status === 404) setEnded(true);
      else setError(err.response?.data?.message || "Could not submit your answer");
    } finally {
      setSending(false);
    }
  };

  if (ended) {
    return (
      <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center gap-4 p-6 text-center">
        <SessionBrand />
        <Suspense fallback={null}>
          <ThemeToggleButton position="top-right" />
        </Suspense>
        <h1 className="text-3xl font-extrabold text-brand-accent">Session ended</h1>
        <p className="text-slate-400">This quiz session has ended. Thank you!</p>
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
      <div className="w-full max-w-md">
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
            <p className="text-xl text-brand-text/60">Waiting for the host to post a question...</p>
          )}
        </div>

        {/* {!started && (
          <p className="text-slate-500 text-sm text-center mb-3">
            The host hasn't started this round yet. You can type your answer, but Submit will unlock once they do.
          </p>
        )} */}

        <textarea
          rows={5}
          maxLength={MAX_LENGTH}
          placeholder="Type your answer..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
          className="w-full bg-slate-800 text-brand-text rounded-lg px-4 py-3 mb-1 resize-none outline-none focus:ring-2 focus:ring-brand-accent"
        />

        <div className="flex items-center justify-between mb-3">
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
          disabled={sending || !text.trim() || !started}
          className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
        >
          {sending ? "Submitting..." : started ? "Submit answer" : "Waiting for host..."}
        </button>

        {sentCount > 0 && (
          <p className="text-slate-500 text-sm text-center mt-4">
            You have submitted {sentCount} answer{sentCount !== 1 ? "s" : ""}. You can send more until the session ends.
          </p>
        )}
      </div>
    </div>
  );
}