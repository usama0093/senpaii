import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import SessionBrand from "../components/SessionBrand";
import { lazy, Suspense } from "react";
const ThemeToggleButton = lazy(() => import("../components/ThemeToggleButton"));

interface Room {
  pin: string;
  name: string;
  token: string;
  allowNameEdit?: boolean;
}

const MAX_LENGTH = 300;

// Uses what the join page passed along, or what this tab remembered.
function loadRoom(fromState: unknown): Room | null {
  const s = fromState as Room | null;
  if (s && s.pin && s.name && s.token) return s;
  try {
    const raw = sessionStorage.getItem("liveFeedbackRoom");
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.pin && saved.name && saved.token) return saved as Room;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export default function FeedbackRoom() {
  const location = useLocation();
  const [room] = useState<Room | null>(() => loadRoom(location.state));

  const [displayName, setDisplayName] = useState(room?.name || "");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(room?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [allowNameEdit, setAllowNameEdit] = useState(room?.allowNameEdit ?? false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);

  // Find out when the host ends the session.
  useEffect(() => {
    if (!room) return;

    socket.on("connect", () => socket.emit("feedback:join", { pin: room.pin }));
    socket.on("feedback:settings-update", (settings: { allowNameEdit: boolean }) => {
      setAllowNameEdit(settings.allowNameEdit);
    });
    socket.on("feedback:ended", () => setEnded(true));
    socket.connect();

    return () => {
      socket.off("connect");
      socket.off("feedback:settings-update");
      socket.off("feedback:ended");
      socket.disconnect();
    };
  }, [room]);

  // Forget the saved name once the session is over.
  useEffect(() => {
    if (ended) {
      try {
        sessionStorage.removeItem("liveFeedbackRoom");
      } catch (err) {
        // ignore
      }
    }
  }, [ended]);

  if (!room) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p>Please join with a Feedback PIN first.</p>
        <Link to="/live-feedback" className="text-brand-accent font-medium hover:underline">
          Enter a Feedback PIN
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
      const res = await api.put(`/sessions/feedback/live/${room.pin}/participants/${room.token}`, {
        displayName: name,
      });
      const finalName = res.data.data.name;
      setDisplayName(finalName);
      setEditingName(false);
      try {
        sessionStorage.setItem("liveFeedbackRoom", JSON.stringify({ ...room, name: finalName }));
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
    const message = text.trim();
    if (!message) {
      setError("Write some feedback first");
      return;
    }
    setError("");
    setNotice("");
    setSending(true);

    try {
      await api.post(`/sessions/feedback/live/${room.pin}/messages`, { token: room.token, text: message });
      setText("");
      setSentCount((c) => c + 1);
      setNotice("Thanks! Your feedback was sent.");
      setTimeout(() => setNotice(""), 3000);
    } catch (err: any) {
      if (err.response?.status === 404) setEnded(true);
      else setError(err.response?.data?.message || "Could not send your feedback");
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
        <p className="text-slate-400">This feedback session has ended. Thank you!</p>
        <Link to="/live-feedback" className="text-brand-accent font-medium hover:underline">
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
            <p className="text-3xl font-extrabold text-brand-accent mb-1">{displayName}</p>
            {allowNameEdit && (
              <button
              onClick={() => {
                setNameDraft(displayName);
                setEditingName(true);
              }}
              className="w-24 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-1 mb-2 mt-2"
              >
                Edit
              </button>
            )}
            <p className="text-slate-500 text-sm mb-2">Your name is anonymous — nobody knows who you are.</p>
          </div>
        )}

        <textarea
          rows={5}
          maxLength={MAX_LENGTH}
          placeholder="Type your feedback..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError("");
          }}
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
          disabled={sending || !text.trim()}
          className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send feedback"}
        </button>

        {sentCount > 0 && (
          <p className="text-slate-500 text-sm text-center mt-4">
            You have sent {sentCount} feedback{sentCount !== 1 ? "s" : ""}. You can send more until the session ends.
          </p>
        )}
      </div>
    </div>
  );
}