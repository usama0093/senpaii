import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import ConfirmModal from "../components/ConfirmModal";
import MoreMenu from "../components/MoreMenu";
import SessionBrand from "../components/SessionBrand";
import QrCodeButton from "../components/QrCodeButton";
import SettingsMenu from "../components/SettingsMenu";
import RichText from "../components/RichText";

interface ResponseEntry {
  id: string;
  participantId: string;
  displayName: string;
  text: string;
  at: string | number;
}

interface CurrentQuestion {
  id: string;
  text: string;
}

interface Participant {
  participantId: string;
  displayName: string;
}

const mergeResponses = (a: ResponseEntry[], b: ResponseEntry[]) => {
  const byId = new Map<string, ResponseEntry>();
  [...a, ...b].forEach((r) => byId.set(r.id, r));
  return Array.from(byId.values()).sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
};

const formatTime = (at: string | number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Full text of one response — the feed row only shows a single truncated line.
function ResponseDetailModal({ response, onClose }: { response: ResponseEntry; onClose: () => void }) {
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
            <p className="text-brand-accent font-bold text-lg">{response.displayName}</p>
            <p className="text-slate-500 text-sm">{formatTime(response.at)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text"
          >
            ✕
          </button>
        </div>
        <p className="whitespace-pre-wrap break-words text-3xl">{response.text}</p>
      </div>
    </div>
  );
}

export default function QodSessionHost() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"WAITING" | "ACTIVE" | "ENDED" | null>(null);
  const [gamePin, setGamePin] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [allowNameEdit, setAllowNameEdit] = useState(true);
  const [responses, setResponses] = useState<ResponseEntry[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [viewResponse, setViewResponse] = useState<ResponseEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResponseEntry | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);

  useEffect(() => {
    let cancelled = false;

    const sync = () =>
      api.get(`/qod-sessions/${sessionId}`).then((res) => {
        if (cancelled) return null;
        const data = res.data.data;
        setGamePin(data.gamePin);
        setStatus(data.status);
        setCurrentQuestion(data.currentQuestion);
        setCurrentQuestionIndex(data.currentQuestionIndex);
        setTotalQuestions(data.totalQuestions);
        setParticipantCount(data.participantCount);
        setParticipants(data.participants);
        setResponses(data.responses);
        setAllowNameEdit(data.settings?.allowNameEdit ?? true);
        return data.gamePin as string;
      });

    sync()
      .then((pin) => {
        if (cancelled || !pin) return;

        socket.on("connect", () => {
          socket.emit("qod-session:host-join", { pin });
          sync().catch(() => {});
        });
        socket.on("qod-session:question", () => {
          sync().catch(() => {});
        });
        socket.on("qod-session:new-response", (r: ResponseEntry) =>
          setResponses((prev) => mergeResponses(prev, [r]))
        );
        socket.on("qod-session:response-deleted", ({ responseId }: { responseId: string }) =>
          setResponses((prev) => prev.filter((r) => r.id !== responseId))
        );
        // A new student joined — refresh both the count and the name list (pre-start),
        // since participants can join at any time, including mid-session.
        socket.on("qod-session:stats", () => {
          sync().catch(() => {});
        });
        socket.on("qod-session:participant-renamed", () => {
          sync().catch(() => {});
        });
        socket.on("qod-session:settings-update", (settings: { allowNameEdit: boolean }) => {
          setAllowNameEdit(settings.allowNameEdit);
        });
        socket.on("qod-session:participant-removed", ({ participantId }: { participantId: string }) => {
          setParticipants((prev) => prev.filter((p) => p.participantId !== participantId));
          setResponses((prev) => prev.filter((r) => r.participantId !== participantId));
          setParticipantCount((prev) => Math.max(0, prev - 1));
        });
        socket.on("qod-session:ended", () => setStatus("ENDED"));
        socket.connect();
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
      socket.off("connect");
      socket.off("qod-session:question");
      socket.off("qod-session:new-response");
      socket.off("qod-session:response-deleted");
      socket.off("qod-session:stats");
      socket.off("qod-session:participant-renamed");
      socket.off("qod-session:settings-update");
      socket.off("qod-session:participant-removed");
      socket.off("qod-session:ended");
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const isLastQuestion = totalQuestions > 0 && currentQuestionIndex >= totalQuestions - 1;

  const handleNext = async () => {
    setError("");
    setAdvancing(true);
    try {
      const res = await api.put(`/qod-sessions/${sessionId}/next`);
      setStatus("ACTIVE");
      setCurrentQuestionIndex(res.data.data.currentQuestionIndex);
      setCurrentQuestion(res.data.data.question);
      setResponses([]); // brand-new question, feed starts empty
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not advance to the next question");
    } finally {
      setAdvancing(false);
    }
  };

  const handleEnd = () => setConfirmEndOpen(true);

  const handleConfirmEnd = async () => {
    setConfirmEndOpen(false);
    setError("");
    setEnding(true);
    const hadNoGameplay = status === "WAITING";
    try {
      await api.delete(`/qod-sessions/${sessionId}`);
      // Ended from an empty/never-started waiting room: the server deleted it
      // outright (no report), so there's nothing to show here — back to the hub.
      if (hadNoGameplay) {
        navigate("/qod");
        return;
      }
      setStatus("ENDED");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not end the session");
      setEnding(false);
    }
  };

  const handleConfirmDeleteResponse = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete(`/qod-sessions/${sessionId}/responses/${target.id}`);
      setResponses((prev) => prev.filter((r) => r.id !== target.id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete the response");
    }
  };

  const handleConfirmRemoveParticipant = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      await api.delete(`/qod-sessions/${sessionId}/participants/${target.participantId}`);
      // The actual removal from state happens via the "qod-session:participant-removed"
      // socket broadcast above, same pattern as every other live update on this page.
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not remove the participant");
    }
  };

  const settingsToggles = [
    {
      key: "allowNameEdit",
      label: "Allow name editing",
      checked: allowNameEdit,
      onChange: (checked: boolean) =>
        socket.emit("qod-session:update-settings", { sessionId, settings: { allowNameEdit: checked } }),
    },
  ];

  const copyPin = () => gamePin && navigator.clipboard.writeText(gamePin);

  if (notFound || status === "ENDED") {
    return (
      <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center p-6 text-center">
        <SessionBrand />
        <h1 className="text-3xl font-extrabold text-brand-accent mb-3">
          {status === "ENDED" ? "Session ended" : "This QOD session was not found"}
        </h1>
        <div className="flex gap-3">
          {status === "ENDED" && (
            <button
              onClick={() => navigate(`/reports/qod/${sessionId}`)}
              className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold px-8 py-4 rounded-xl text-lg transition"
            >
              View report
            </button>
          )}
          <button
            onClick={() => navigate("/qod")}
            className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg"
          >
            Back to Quiz of the Day
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-brand-bg text-brand-text p-6 md:p-10">
      <SessionBrand />
      <QrCodeButton joinPath="/join-qod" pin={gamePin} pinLabel="QOD PIN" />
      {/* Top bar: only shown once the session is actually running — before Start, there's
          nothing to show here (no PIN yet in this slot, no End Session either; see below). */}
      <div className="flex justify-between items-center mb-8 gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/qod"
            className="leave-chip border border-brand-text/10 text-base font-bold px-3 py-1.5 rounded-lg transition"
          >
            ← Leave
          </Link>
          {status === "ACTIVE" && gamePin && (
            <div
              onClick={copyPin}
              title="Click to copy"
              className="inline-block chrome-panel border border-brand-text/10 rounded-lg px-4 py-2 cursor-pointer transition"
            >
              <span className="text-xl font-extrabold text-brand-accent tracking-widest">{gamePin}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {status === "ACTIVE" && (
            <>
              <div className="chrome-panel border border-brand-text/10 rounded-lg px-4 py-2">
                <span className="text-brand-accent font-extrabold">{participantCount}</span>
                <span className="text-slate-400 text-base font-semibold ml-1">joined</span>
              </div>

              {!isLastQuestion && (
                <button
                  onClick={handleNext}
                  disabled={advancing}
                  className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-5 py-2 rounded-lg disabled:opacity-50"
                >
                  {advancing ? "Please wait..." : "Next"}
                </button>
              )}
            </>
          )}
          <button
            onClick={handleEnd}
            disabled={ending}
            className="bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {ending ? "Ending..." : "End Session"}
          </button>
          <SettingsMenu toggles={settingsToggles} />
        </div>
      </div>

      
      {status === null ? (
        <p className="text-center text-brand-text/60">Loading...</p>
      ) : status === "WAITING" ? (
        // Mirrors Quiz Session's Game PIN waiting screen: heading, big PIN, joined
        // count + names, then Start. No End Session here — closing the tab is enough
        // before anything has actually started.
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-brand-text text-4xl font-bold mb-2">Quiz of the Day</p>
          <div
            onClick={copyPin}
            title="Click to copy"
            className="chrome-panel border border-brand-text/10 rounded-2xl px-10 py-6 mb-8 cursor-pointer transition"
          >
            <span className="text-6xl font-extrabold text-brand-accent tracking-widest">{gamePin || "------"}</span>
          </div>

          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-4xl font-bold text-brand-accent">{participantCount}</span>
            <span className="text-xl font-bold">student{participantCount !== 1 ? "s" : ""} joined</span>
          </div>

          <div className="flex flex-wrap gap-3 justify-center max-w-2xl mb-10">
            {participants.map((p) => (
              <button
                key={p.participantId}
                onClick={() => setRemoveTarget(p)}
                title="Click to remove this student"
                className="bg-slate-800 border border-brand-text/10 text-brand-text px-4 py-2 rounded-full font-medium hover:bg-brand-text/10 hover:border-red-400/60 transition"
              >
                {p.displayName}
              </button>
            ))}
          </div>
          {participantCount === 0 && <p className="text-brand-text mb-10">Waiting for students to join...</p>}

          {error && <p className="text-brand-error text-sm mb-4">{error}</p>}

          <button
            onClick={handleNext}
            disabled={advancing || participantCount === 0}
            title={participantCount === 0 ? "At least one student must join first" : undefined}
            className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg disabled:opacity-50"
          >
            {advancing ? "Starting..." : "Start"}
          </button>
        </div>
      ) : (
        <>
          {error && <p className="text-brand-error text-sm text-center mb-4">{error}</p>}

          <div className="w-full md:w-[85%] mx-auto text-center mb-8">
            {totalQuestions > 0 && (
              <p className="text-slate-500 text-sm mb-2">
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </p>
            )}
            {currentQuestion && (
              <RichText html={currentQuestion.text} className="text-2xl md:text-4xl font-bold leading-snug" />
            )}
          </div>

          <div className="max-w-3xl mx-auto space-y-3">
            {responses.length === 0 && <p className="text-center text-brand-text/60">Waiting for answers...</p>}
            {responses.map((r) => (
              <div
                key={r.id}
                className="bg-slate-900 border border-brand-text/10 rounded-xl px-5 py-4 flex items-start gap-3"
              >
                <button onClick={() => setViewResponse(r)} className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-brand-accent font-semibold">{r.displayName}</span>
                    <span className="text-slate-500 text-sm">{formatTime(r.at)}</span>
                  </div>
                  <p className="text-2xl mt-1 truncate">{r.text}</p>
                </button>
                <div onClick={(e) => e.stopPropagation()}>
                  <MoreMenu
                    items={[
                      { label: "Delete response", onClick: () => setDeleteTarget(r), danger: true },
                      {
                        label: "Remove participant",
                        onClick: () =>
                          setRemoveTarget({ participantId: r.participantId, displayName: r.displayName }),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmEndOpen}
        title="End session?"
        message="End this QOD session? Students can no longer submit answers."
        confirmLabel="End session"
        onConfirm={handleConfirmEnd}
        onCancel={() => setConfirmEndOpen(false)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete response?"
        message={`Delete ${deleteTarget?.displayName}'s response? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteResponse}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={!!removeTarget}
        title="Remove participant?"
        message={`Remove ${removeTarget?.displayName} from this session? They can rejoin with the PIN if needed.`}
        confirmLabel="Remove"
        onConfirm={handleConfirmRemoveParticipant}
        onCancel={() => setRemoveTarget(null)}
      />

      {viewResponse && <ResponseDetailModal response={viewResponse} onClose={() => setViewResponse(null)} />}
    </div>
  );
}