import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import ConfirmModal from "../components/ConfirmModal";
import MoreMenu from "../components/MoreMenu";
import SessionBrand from "../components/SessionBrand";
import QrCodeButton from "../components/QrCodeButton";
import SettingsMenu from "../components/SettingsMenu";

interface FeedbackMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

const mergeMessages = (a: FeedbackMessage[], b: FeedbackMessage[]) => {
  const byId = new Map<string, FeedbackMessage>();
  [...a, ...b].forEach((m) => byId.set(m.id, m));
  return Array.from(byId.values()).sort((x, y) => x.at - y.at);
};

const formatTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Full text of one message — the feed row only shows a single truncated line.
function FeedbackDetailModal({ message, onClose }: { message: FeedbackMessage; onClose: () => void }) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 border border-brand-text/10 rounded-2xl shadow-2xl shadow-black/50 p-5"
      >
        <div className="flex justify-between items-start gap-4 mb-3">
          <div>
            <p className="text-brand-accent font-bold text-lg">{message.name}</p>
            <p className="text-slate-500 text-sm">{formatTime(message.at)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text"
          >
            ✕
          </button>
        </div>
        <p className="whitespace-pre-wrap break-words text-3xl">{message.text}</p>
      </div>
    </div>
  );
}

export default function LiveFeedbackHost() {
  const { pin } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [joined, setJoined] = useState(0);
  const [ended, setEnded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [viewMessage, setViewMessage] = useState<FeedbackMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedbackMessage | null>(null);
  const [allowNameEdit, setAllowNameEdit] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const sync = () =>
      api
        .get(`/sessions/feedback/live/${pin}`)
        .then((res) => {
          if (cancelled) return null;
          const data = res.data.data;
          setMessages((prev) => mergeMessages(prev, data.messages));
          setJoined(data.joined);
          setAllowNameEdit(data.settings?.allowNameEdit ?? false);
          return data.hostKey as string;
        });

    sync()
      .then((hostKey) => {
        if (cancelled || !hostKey) return;

        socket.on("connect", () => {
          socket.emit("feedback:host-join", { pin, hostKey });
          sync().catch(() => {});
        });
        socket.on("feedback:new", (m: FeedbackMessage) => setMessages((prev) => mergeMessages(prev, [m])));
        socket.on("feedback:message-deleted", ({ messageId }: { messageId: string }) =>
          setMessages((prev) => prev.filter((m) => m.id !== messageId))
        );
        socket.on("feedback:stats", ({ joined }: { joined: number }) => setJoined(joined));
        socket.on("feedback:settings-update", (settings: { allowNameEdit: boolean }) => {
          setAllowNameEdit(settings.allowNameEdit);
        });
        socket.on("feedback:ended", () => setEnded(true));
        socket.connect();
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
      socket.off("connect");
      socket.off("feedback:new");
      socket.off("feedback:message-deleted");
      socket.off("feedback:stats");
      socket.off("feedback:settings-update");
      socket.off("feedback:ended");
      socket.disconnect();
    };
  }, [pin]);

  const handleEnd = () => setConfirmEndOpen(true);

  const handleConfirmEnd = async () => {
    setConfirmEndOpen(false);
    setError("");
    setEnding(true);
    try {
      await api.delete(`/sessions/feedback/live/${pin}`);
      setEnded(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not end the session");
      setEnding(false);
    }
  };

  const handleConfirmDeleteMessage = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete(`/sessions/feedback/live/${pin}/messages/${target.id}`);
      setMessages((prev) => prev.filter((m) => m.id !== target.id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete the feedback");
    }
  };

  if (notFound || ended) {
    return (
      <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center p-6 text-center">
        <SessionBrand />
        <h1 className="text-3xl font-extrabold text-brand-accent mb-3">
          {ended ? "Session ended" : "This feedback session has ended"}
        </h1>
        <p className="text-slate-400 mb-8">Nothing was saved — the feedback is gone.</p>
        <button
          onClick={() => navigate("/feedback/live")}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg"
        >
          Back to Live Feedback
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-brand-bg text-brand-text p-6 md:p-10">
      <SessionBrand />
      <QrCodeButton joinPath="/live-feedback" pin={pin} pinLabel="Feedback PIN" />
      <div className="flex justify-between items-center mb-6">
        <Link
          to="/feedback/live"
          className="leave-chip border border-brand-text/10 text-base font-bold mb-1 -ml-3 px-3 py-1.5 rounded-lg transition"
        >
          ← Leave
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={handleEnd}
            disabled={ending}
            className="bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {ending ? "Ending..." : "End session"}
          </button>
          <SettingsMenu
            toggles={[
              {
                key: "allowNameEdit",
                label: "Allow name editing",
                checked: allowNameEdit,
                onChange: (checked) => socket.emit("feedback:update-settings", { pin, settings: { allowNameEdit: checked } }),
              },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col items-center text-center mb-8">
        <p className="text-brand-text text-4xl font-bold mb-2">Feedback PIN</p>
        <div
          onClick={() => pin && navigator.clipboard.writeText(pin)}
          title="Click to copy"
          className="chrome-panel border border-brand-text/10 rounded-2xl px-10 py-5 mt-2 mb-4 cursor-pointer transition"
        >
          <span className="text-6xl font-extrabold text-brand-accent tracking-widest">{pin}</span>
        </div>
        <p className="text-lg">
          <span className="font-extrabold text-brand-accent">{joined}</span> student{joined !== 1 ? "s" : ""} joined ·{" "}
          <span className="font-extrabold text-brand-accent">{messages.length}</span> feedback received
        </p>
      </div>

      {error && <p className="text-brand-error text-sm text-center mb-4">{error}</p>}

      <div className="max-w-3xl mx-auto space-y-3">
        {messages.length === 0 && <p className="text-center text-brand-text/60">Waiting for feedback...</p>}
        {[...messages].reverse().map((m) => (
          <div key={m.id} className="bg-slate-900 border border-brand-text/10 rounded-xl px-5 py-4 flex items-start gap-3">
            <button onClick={() => setViewMessage(m)} className="flex-1 min-w-0 text-left">
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-brand-accent font-semibold">{m.name}</span>
                <span className="text-slate-500 text-sm">{formatTime(m.at)}</span>
              </div>
              <p className="text-2xl mt-1 truncate">{m.text}</p>
            </button>
            <div onClick={(e) => e.stopPropagation()}>
              <MoreMenu items={[{ label: "Delete", onClick: () => setDeleteTarget(m), danger: true }]} />
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={confirmEndOpen}
        title="End session?"
        message="End this feedback session? Students can no longer send feedback, and nothing is saved."
        confirmLabel="End session"
        onConfirm={handleConfirmEnd}
        onCancel={() => setConfirmEndOpen(false)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete feedback?"
        message={`Delete ${deleteTarget?.name}'s feedback? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteMessage}
        onCancel={() => setDeleteTarget(null)}
      />

      {viewMessage && <FeedbackDetailModal message={viewMessage} onClose={() => setViewMessage(null)} />}
    </div>
  );
}