import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import ConfirmModal from "../components/ConfirmModal";
import MoreMenu from "../components/MoreMenu";
import SessionBrand from "../components/SessionBrand";
import QrCodeButton from "../components/QrCodeButton";
import SettingsMenu from "../components/SettingsMenu";
import RichTextEditor, { isRichTextEmpty } from "../components/RichTextEditor";
import RichText from "../components/RichText";

interface QodAnswerEntry {
  id: string;
  name: string;
  text: string;
  at: number;
}

const mergeAnswers = (a: QodAnswerEntry[], b: QodAnswerEntry[]) => {
  const byId = new Map<string, QodAnswerEntry>();
  [...a, ...b].forEach((m) => byId.set(m.id, m));
  return Array.from(byId.values()).sort((x, y) => x.at - y.at);
};

const formatTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Full text of one answer — the feed row only shows a single truncated line.
function AnswerDetailModal({ answer, onClose }: { answer: QodAnswerEntry; onClose: () => void }) {
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
            <p className="text-brand-accent font-bold text-lg">{answer.name}</p>
            <p className="text-slate-500 text-sm">{formatTime(answer.at)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text"
          >
            ✕
          </button>
        </div>
        <p className="whitespace-pre-wrap break-words text-3xl">{answer.text}</p>
      </div>
    </div>
  );
}

export default function QODLive() {
  const { pin } = useParams();
  const navigate = useNavigate();

  const [started, setStarted] = useState<boolean | null>(null); // null = still loading
  const [question, setQuestion] = useState("");
  const [draft, setDraft] = useState(""); // pre-continue compose box only
  const [draftTouched, setDraftTouched] = useState(false);
  const [continuing, setContinuing] = useState(false);

  // Post-continue: editing the question in place
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [editQuestionDraft, setEditQuestionDraft] = useState("");
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [answers, setAnswers] = useState<QodAnswerEntry[]>([]);
  const [joined, setJoined] = useState(0);
  const [ended, setEnded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [viewAnswer, setViewAnswer] = useState<QodAnswerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QodAnswerEntry | null>(null);
  const [allowNameEdit, setAllowNameEdit] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const sync = () =>
      api.get(`/sessions/qod/live/${pin}`).then((res) => {
        if (cancelled) return null;
        const data = res.data.data;
        setQuestion(data.question);
        setDraft((prev) => (draftTouched ? prev : data.question));
        setStarted(data.started);
        setAnswers((prev) => mergeAnswers(prev, data.answers));
        setJoined(data.joined);
        setAllowNameEdit(data.settings?.allowNameEdit ?? true);
        return data.hostKey as string;
      });

    sync()
      .then((hostKey) => {
        if (cancelled || !hostKey) return;

        socket.on("connect", () => {
          socket.emit("qod:host-join", { pin, hostKey });
          sync().catch(() => {});
        });
        socket.on("qod:new-answer", (a: QodAnswerEntry) => setAnswers((prev) => mergeAnswers(prev, [a])));
        socket.on("qod:answer-deleted", ({ answerId }: { answerId: string }) =>
          setAnswers((prev) => prev.filter((a) => a.id !== answerId))
        );
        socket.on("qod:stats", ({ joined }: { joined: number }) => setJoined(joined));
        socket.on("qod:question", ({ question }: { question: string }) => setQuestion(question));
        socket.on("qod:started", () => setStarted(true));
        socket.on("qod:settings-update", (settings: { allowNameEdit: boolean }) => {
          setAllowNameEdit(settings.allowNameEdit);
        });
        socket.on("qod:ended", () => setEnded(true));
        socket.connect();
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
      socket.off("connect");
      socket.off("qod:new-answer");
      socket.off("qod:answer-deleted");
      socket.off("qod:stats");
      socket.off("qod:question");
      socket.off("qod:started");
      socket.off("qod:settings-update");
      socket.off("qod:ended");
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Pre-continue: saves the typed question (if any) and goes live.
  const handleContinue = async () => {
    setError("");
    setContinuing(true);
    try {
      const hasText = !isRichTextEmpty(draft);
      if (hasText) {
        await api.put(`/sessions/qod/live/${pin}/question`, { question: draft });
        setQuestion(draft);
      }
      await api.put(`/sessions/qod/live/${pin}/continue`);
      setStarted(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not continue");
    } finally {
      setContinuing(false);
    }
  };

  // Post-continue: the question text itself becomes editable, in place.
  const handleStartEditQuestion = () => {
    setEditQuestionDraft(question);
    setEditingQuestion(true);
    setError("");
  };

  const handleSaveQuestionInline = async () => {
    if (isRichTextEmpty(editQuestionDraft)) {
      setError("Write a question first");
      return;
    }
    setError("");
    setSavingQuestion(true);
    try {
      const res = await api.put(`/sessions/qod/live/${pin}/question`, { question: editQuestionDraft });
      setQuestion(res.data.data.question);
      setEditingQuestion(false);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not update the question");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleEnd = () => setConfirmEndOpen(true);

  const handleConfirmEnd = async () => {
    setConfirmEndOpen(false);
    setError("");
    setEnding(true);
    try {
      await api.delete(`/sessions/qod/live/${pin}`);
      setEnded(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not end the session");
      setEnding(false);
    }
  };

  const handleConfirmDeleteAnswer = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete(`/sessions/qod/live/${pin}/answers/${target.id}`);
      setAnswers((prev) => prev.filter((a) => a.id !== target.id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete the answer");
    }
  };

  const settingsToggles = [
    {
      key: "allowNameEdit",
      label: "Allow name editing",
      checked: allowNameEdit,
      onChange: (checked: boolean) =>
        socket.emit("qod:update-settings", { pin, settings: { allowNameEdit: checked } }),
    },
  ];

  const copyPin = () => pin && navigator.clipboard.writeText(pin);

  if (notFound || ended) {
    return (
      <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center p-6 text-center">
        <SessionBrand />
        <h1 className="text-3xl font-extrabold text-brand-accent mb-3">
          {ended ? "Session ended" : "This live quiz session has ended"}
        </h1>
        <p className="text-slate-400 mb-8">Nothing was saved.</p>
        <button
          onClick={() => navigate("/qod?tab=qod")}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg"
        >
          Back to Quiz of the Day
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-brand-bg text-brand-text p-6 md:p-10">
      <SessionBrand />
      <QrCodeButton joinPath="/join-qod" pin={pin} pinLabel="QOD PIN" />
      <div className="flex justify-between items-center mb-6 gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/qod?tab=live"
            className="leave-chip border border-brand-text/10 text-base font-bold px-3 py-1.5 rounded-lg transition"
          >
            ← Leave
          </Link>
          {started && pin && (
            <div
              onClick={copyPin}
              title="Click to copy"
              className="chrome-panel border border-brand-text/10 rounded-lg px-4 py-2 cursor-pointer transition"
            >
              <span className="text-xl font-extrabold text-brand-accent tracking-widest">{pin}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {started && (
            <div className="chrome-panel border border-brand-text/10 rounded-lg px-4 py-2">
              <span className="text-brand-accent font-extrabold">{joined}</span>
              <span className="text-slate-400 text-base font-semibold ml-1">joined</span>
            </div>
          )}
          <button
            onClick={handleEnd}
            disabled={ending}
            className="bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {ending ? "Ending..." : "End session"}
          </button>
          <SettingsMenu toggles={settingsToggles} />
        </div>
      </div>

      {started === null ? (
        <p className="text-center text-brand-text/60">Loading...</p>
      ) : !started ? (
        // ---------- Pre-continue: setup screen, big PIN (unchanged) ----------
        <>
          <div className="flex flex-col items-center text-center mb-8">
            <p className="text-brand-text text-4xl font-bold mb-2">QOD PIN</p>
            <div
              onClick={copyPin}
              title="Click to copy"
              className="chrome-panel border border-brand-text/10 rounded-2xl px-10 py-5 mt-2 mb-4 cursor-pointer transition"
            >
              <span className="text-6xl font-extrabold text-brand-accent tracking-widest">{pin}</span>
            </div>
            <p className="text-lg">
              <span className="font-extrabold text-brand-accent">{joined}</span> student{joined !== 1 ? "s" : ""}{" "}
              joined
            </p>
          </div>

          {error && <p className="text-brand-error text-sm text-center mb-4">{error}</p>}

          <div className="max-w-4xl mx-auto">
            <div className="mb-4">
              <RichTextEditor
                value={draft}
                onChange={(html) => {
                  setDraft(html);
                  setDraftTouched(true);
                }}
                placeholder="Type the question for this round..."
                showToolbar={false}
                minHeightClassName="min-h-[84px]"
                contentClassName="text-2xl"
              />
            </div>

            <p className="text-center text-brand-text/60 mb-5">Answers will appear here once you click Continue.</p>

            <div className="text-center">
              <button
                onClick={handleContinue}
                disabled={continuing}
                className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-3 rounded-lg disabled:opacity-50"
              >
                {continuing ? "Please wait..." : "Continue →"}
              </button>
            </div>
          </div>
        </>
      ) : (
        // ---------- Post-continue: question full-width, Edit in place, then the feed ----------
        <>
          {error && <p className="text-brand-error text-sm text-center mb-4">{error}</p>}

          <div className="w-full md:w-[85%] mx-auto text-center mb-8">
            {editingQuestion ? (
              <div>
                <div className="mb-3">
                  <RichTextEditor
                    value={editQuestionDraft}
                    onChange={setEditQuestionDraft}
                    showToolbar={true}
                    minHeightClassName="min-h-[84px]"
                    contentClassName="text-xl md:text-2xl font-semibold text-center"
                  />
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={handleSaveQuestionInline}
                    disabled={savingQuestion}
                    className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-2 rounded-lg disabled:opacity-50"
                  >
                    {savingQuestion ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingQuestion(false)}
                    className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold px-6 py-2 rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  {question && !isRichTextEmpty(question) ? (
                    <RichText html={question} className="text-2xl md:text-4xl font-bold leading-snug" />
                  ) : (
                    <p className="text-2xl md:text-4xl font-bold leading-snug text-brand-text/60">No question set yet</p>
                  )}
                </div>
                <button
                  onClick={handleStartEditQuestion}
                  className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold px-5 py-2 rounded-lg transition"
                >
                  Edit
                </button>
              </>
            )}
          </div>

          <div className="max-w-3xl mx-auto space-y-3">
            {answers.length === 0 && <p className="text-center text-brand-text/60">Waiting for answers...</p>}
            {[...answers].reverse().map((a) => (
              <div
                key={a.id}
                className="bg-slate-900 border border-brand-text/10 rounded-xl px-5 py-4 flex items-start gap-3"
              >
                <button onClick={() => setViewAnswer(a)} className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-brand-accent font-semibold">{a.name}</span>
                    <span className="text-slate-500 text-sm">{formatTime(a.at)}</span>
                  </div>
                  <p className="text-2xl mt-1 truncate">{a.text}</p>
                </button>
                <div onClick={(e) => e.stopPropagation()}>
                  <MoreMenu items={[{ label: "Delete", onClick: () => setDeleteTarget(a), danger: true }]} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmEndOpen}
        title="End session?"
        message="End this live quiz session? Students can no longer submit answers, and nothing is saved."
        confirmLabel="End session"
        onConfirm={handleConfirmEnd}
        onCancel={() => setConfirmEndOpen(false)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete answer?"
        message={`Delete ${deleteTarget?.name}'s answer? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteAnswer}
        onCancel={() => setDeleteTarget(null)}
      />

      {viewAnswer && <AnswerDetailModal answer={viewAnswer} onClose={() => setViewAnswer(null)} />}
    </div>
  );
}