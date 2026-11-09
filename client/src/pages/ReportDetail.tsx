import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../api/axios";
import Pagination from "../components/Pagination";
import { formatDateTime } from "../utils/formatDate";
import { downloadCsv, sanitizeFilename } from "../utils/csv";
import RichText from "../components/RichText";
import ConfirmModal from "../components/ConfirmModal";

const PAGE_SIZE = 10; // players shown per page

interface PlayerAnswer {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
  timeTakenMs: number | null;
}

interface PlayerRow {
  participantId: string;
  displayName: string;
  score: number;
  rank: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number;
  avgTimeSec: number | null;
  answers: PlayerAnswer[];
}

interface QuestionRow {
  id: string;
  number: number;
  text: string;
  answered: number;
  correct: number;
  wrong: number;
  unanswered: number;
  percentCorrect: number;
  options: { id: string; text: string; isCorrect: boolean; count: number }[];
}

interface Report {
  session: { id: string; gamePin: string; createdAt: string; endedAt: string | null; quizTitle: string; topic: string | null };
  summary: {
    playerCount: number;
    questionCount: number;
    averageScore: number;
    accuracy: number;
    first: { displayName: string; score: number } | null;
    last: { displayName: string; score: number } | null;
  };
  players: PlayerRow[];
  questions: QuestionRow[];
}

const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-600"];
// Fixed per-tile text color, independent of theme — same logic as the universal green/red
// Correct/Wrong text: these sit on a permanently-colored chip, so contrast must stay
// correct regardless of light/dark mode. Yellow-500 is light and needs dark text;
// the other three are dark and need light text.
const optionTextColors = ["text-white", "text-white", "text-white", "text-white"];

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

// ---------- One player's marks: which questions were right or wrong ----------

function PlayerDetail({
  player,
  questions,
  onClose,
  onRename,
  onRequestDelete,
  deleteError,
}: {
  player: PlayerRow;
  questions: QuestionRow[];
  onClose: () => void;
  onRename: (participantId: string, newName: string) => Promise<boolean>;
  onRequestDelete: (player: PlayerRow) => void;
  deleteError: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(player.displayName);
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) {
        setEditing(false);
        setDraftName(player.displayName);
        setRenameError("");
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, editing, player.displayName]);

  const startEdit = () => {
    setDraftName(player.displayName);
    setRenameError("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftName(player.displayName);
    setRenameError("");
  };

  const handleSave = async () => {
    const trimmed = draftName.trim();
    if (trimmed.length < 2) {
      setRenameError("Name must be at least 2 characters");
      return;
    }
    setSaving(true);
    setRenameError("");
    const ok = await onRename(player.participantId, trimmed);
    setSaving(false);
    if (ok) setEditing(false);
    else setRenameError("Could not save — try again");
  };

  // Clicking anywhere else in the modal while editing cancels and restores the old name.
  // (A click on the true backdrop closes the whole modal instead — that's handled
  // by the outer div's own onClick, unaffected by this.)
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editing && editRef.current && !editRef.current.contains(e.target as Node)) {
      cancelEdit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={handleContentClick}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-brand-text/10 rounded-2xl shadow-2xl shadow-black/50"
      >
        {/* Summary */}
        <div className="sticky top-0 bg-slate-900 border-b border-brand-text/10 p-5 flex justify-between items-start gap-4">
          <div className="min-w-0">
            <p className="text-slate-400 text-sm">Rank #{player.rank}</p>

            {editing ? (
              <div ref={editRef} className="flex items-center gap-2 mt-1">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  disabled={saving}
                  autoFocus
                  className="text-2xl font-bold bg-slate-800 border border-brand-accent rounded-lg px-2 py-0.5 outline-none w-48 max-w-full disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  aria-label="Save name"
                  title="Save name"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-brand-accent hover:bg-brand-text/10 disabled:opacity-50"
                >
                  <SaveIcon />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{player.displayName}</h2>
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="Edit name"
                  title="Edit name"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-brand-text/50 hover:bg-brand-text/10 hover:text-brand-text"
                >
                  <EditIcon />
                </button>
                {/* Only for a student with zero answers — deleting anyone who
                    actually answered would silently change the quiz's average
                    score/accuracy for everyone else, which this must never do. */}
                {player.answers.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onRequestDelete(player)}
                    aria-label="Delete student"
                    title="Delete this student (no answers submitted)"
                    className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-600 hover:text-white transition"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            )}
            {renameError && <p className="text-brand-error text-xs mt-1">{renameError}</p>}
            {deleteError && <p className="text-brand-error text-xs mt-1">{deleteError}</p>}

            <p className="text-slate-400 text-sm mt-1">
              <span className="text-brand-correct">{player.correct} correct</span> ·{" "}
              <span className="text-brand-wrong">{player.wrong} wrong</span> · {player.unanswered} no answer ·{" "}
              {player.accuracy}% accuracy
            </p>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <div className="text-right">
              <p className="text-3xl font-extrabold text-brand-accent">{player.score}</p>
              <p className="text-slate-400 text-xs">marks</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Every question */}
        <div className="p-5 space-y-3">
          {questions.map((q) => {
            const answer = player.answers.find((a) => a.questionId === q.id);
            const chosen = answer ? q.options.find((o) => o.id === answer.selectedOptionId) : undefined;
            const correctOption = q.options.find((o) => o.isCorrect);

            const status = !answer ? "none" : answer.isCorrect ? "correct" : "wrong";
            const border =
              status === "correct" ? "border-green-500/40" : status === "wrong" ? "border-red-500/40" : "border-brand-text/10";

            return (
              <div key={q.id} className={`rounded-xl border ${border} bg-brand-text/5 p-4`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="font-medium flex items-start gap-1 min-w-0">
                    <span className="shrink-0">{q.number}.</span>
                    <RichText html={q.text} />
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold ${
                      status === "correct" ? "text-brand-correct" : status === "wrong" ? "text-brand-wrong" : "text-slate-400"
                    }`}
                  >
                    {status === "correct" ? "✓ Correct" : status === "wrong" ? "✗ Wrong" : "– No answer"}
                  </span>
                </div>

                <div className="text-sm mt-2 space-y-0.5">
                  <div className="text-slate-400 flex items-start gap-1 flex-wrap">
                    <span>Answered:</span>
                    {answer && chosen ? (
                      <RichText html={chosen.text} className="text-brand-text" />
                    ) : (
                      <span className="text-brand-text">{answer ? "—" : "No answer"}</span>
                    )}
                  </div>
                  {status !== "correct" && (
                    <div className="text-slate-400 flex items-start gap-1 flex-wrap">
                      <span>Correct answer:</span>
                      {correctOption ? (
                        <RichText html={correctOption.text} className="text-brand-correct" />
                      ) : (
                        <span className="text-brand-correct">—</span>
                      )}
                    </div>
                  )}
                  {answer && (
                    <p className="text-slate-500">
                      +{answer.pointsAwarded} points
                      {answer.timeTakenMs !== null ? ` · ${(answer.timeTakenMs / 1000).toFixed(1)}s` : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- The report page ----------

export default function ReportDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // navigate(-1) only lands back on the right page if we arrived via the Reports
  // list (tagged with this state) — e.g. coming straight from a just-finished
  // game's own "Report" link has no such tag, so fall back to a plain /reports.
  const backToReports = () => {
    if ((location.state as { fromReportsList?: boolean } | null)?.fromReportsList) navigate(-1);
    else navigate("/reports");
  };
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const [playerSearch, setPlayerSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [confirmDeletePlayer, setConfirmDeletePlayer] = useState<PlayerRow | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  const [deletePlayerError, setDeletePlayerError] = useState("");

  useEffect(() => {
    api
      .get(`/sessions/${sessionId}/report`)
      .then((res) => setReport(res.data.data))
      .catch((err) => setError(err.response?.data?.message || "Could not load the report"));
  }, [sessionId]);

  const handleRenameParticipant = async (participantId: string, newName: string): Promise<boolean> => {
    try {
      await api.put(`/sessions/${sessionId}/participants/${participantId}/name`, { displayName: newName });
      setReport((prev) =>
        prev
          ? { ...prev, players: prev.players.map((p) => (p.participantId === participantId ? { ...p, displayName: newName } : p)) }
          : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  // Always exports every player, regardless of the on-page search box or pagination.
  const handleDownload = () => {
    if (!report) return;
    const rows: (string | number)[][] = [
      ["Rank", "Player", "Score", "Correct", "Wrong", "No Answer", "Accuracy (%)", "Avg Time (s)"],
      ...report.players.map((p) => [
        p.rank,
        p.displayName,
        p.score,
        p.correct,
        p.wrong,
        p.unanswered,
        p.accuracy,
        p.avgTimeSec !== null ? p.avgTimeSec : "",
      ]),
    ];
    // Was keyed on gamePin — no longer safe now that PINs are freed and reused
    // once a session ends (see the partial-unique-index migration). The ended
    // date is both more meaningful here and guaranteed not to collide the way a
    // reused PIN eventually would.
    const dateStamp = new Date(report.session.endedAt || report.session.createdAt).toISOString().slice(0, 10);
    downloadCsv(`${sanitizeFilename(report.session.quizTitle)}_${dateStamp}_players.csv`, rows);
  };

  // Same soft-delete endpoint QuizEditor's own session-delete action uses — an
  // ENDED session (the only kind with a report to view here) moves to Trash
  // rather than being destroyed outright, so it stays restorable.
  const handleConfirmDeleteReport = async () => {
    setConfirmDeleteOpen(false);
    setDeleteError("");
    setDeleting(true);
    try {
      await api.delete(`/sessions/${sessionId}`);
      navigate("/reports");
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || "Could not delete the report");
      setDeleting(false);
    }
  };

  // Same endpoint HostLobby's own "remove a player" action already uses — only
  // ever offered here for a student with zero answers, so there's nothing of
  // theirs to cascade besides an empty row. Every other player's score, rank and
  // answers are completely untouched.
  const handleConfirmDeletePlayer = async () => {
    if (!confirmDeletePlayer) return;
    const target = confirmDeletePlayer;
    setConfirmDeletePlayer(null);
    setDeletePlayerError("");
    setDeletingPlayer(true);
    try {
      await api.delete(`/sessions/${sessionId}/participants/${target.participantId}`);
      setReport((prev) =>
        prev ? { ...prev, players: prev.players.filter((p) => p.participantId !== target.participantId) } : prev
      );
      setSelectedPlayerId(null);
    } catch (err: any) {
      setDeletePlayerError(err.response?.data?.message || "Could not delete this student");
    } finally {
      setDeletingPlayer(false);
    }
  };

  if (error) {
    return (
      <div>
        <button onClick={backToReports} className="border border-brand-text/15 text-brand-text/90 text-sm mb-1 -ml-3 px-3 py-1.5 rounded-lg transition hover:bg-brand-text hover:text-brand-bg">Back to Reports</button>
        <p className="text-brand-error mt-4">{error}</p>
      </div>
    );
  }
  if (!report) return <p>Loading...</p>;

  const { session, summary, players, questions } = report;

  // Search, then show 10 players per page.
  const q = playerSearch.trim().toLowerCase();
  const filtered = players.filter((p) => !q || p.displayName.toLowerCase().includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagePlayers = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const selectedPlayer = players.find((p) => p.participantId === selectedPlayerId) ?? null;

  return (
    <div className="space-y-8 pt-4 md:pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={backToReports} className="border border-brand-text/15 text-brand-text/90 text-base font-semibold mb-1 -ml-3 px-3 py-1.5 rounded-lg transition hover:bg-brand-text hover:text-brand-bg">← Back to Reports</button>
          <h1 className="text-2xl font-bold text-brand-accent mt-1">{session.quizTitle}</h1>
          <p className="text-slate-400 text-sm">
            {formatDateTime(session.endedAt || session.createdAt)}
            {session.topic ? ` · ${session.topic}` : ""}
          </p>
          {deleteError && <p className="text-brand-error text-sm mt-2">{deleteError}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
            title="Delete this report"
            aria-label="Delete this report"
            className="border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white font-bold px-3 py-2 rounded-lg transition disabled:opacity-50"
          >
            <TrashIcon />
          </button>
          <button
            onClick={handleDownload}
            className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold px-4 py-2 rounded-lg transition"
          >
            Download
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Players", value: summary.playerCount },
          { label: "Questions", value: summary.questionCount },
          { label: "Average score", value: summary.averageScore },
          { label: "Overall accuracy", value: `${summary.accuracy}%` },
        ].map((card) => (
          <div key={card.label} className="surface p-4">
            <p className="text-slate-400 text-sm">{card.label}</p>
            <p className="text-3xl font-extrabold text-brand-accent">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="surface p-4">
          <p className="text-slate-400 text-sm">🥇 First place</p>
          <p className="font-bold text-lg">
            {summary.first ? `${summary.first.displayName} — ${summary.first.score} pts` : "—"}
          </p>
        </div>
        <div className="surface p-4">
          <p className="text-slate-400 text-sm">Last place</p>
          <p className="font-bold text-lg">
            {summary.last ? `${summary.last.displayName} — ${summary.last.score} pts` : "—"}
          </p>
        </div>
      </div>

      {/* Players */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold">All players ({players.length})</h2>
          <input
            type="text"
            placeholder="Search players..."
            value={playerSearch}
            onChange={(e) => {
              setPlayerSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-64 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
          />
        </div>

        <div className="surface rounded-xl overflow-x-auto">
          <table className="w-full text-left">
             <thead className="text-slate-400 text-sm border-b border-brand-text/10">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Wrong</th>
                <th className="px-4 py-3">No answer</th>
                <th className="px-4 py-3">Accuracy</th>
                <th className="px-4 py-3">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {pagePlayers.map((p) => (
                <tr key={p.participantId} className="border-b border-brand-text/5 last:border-0">
                  <td className="px-4 py-3 font-bold">{p.rank}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedPlayerId(p.participantId)}
                      title="See this player's answers"
                      className="text-left hover:text-brand-accent hover:underline"
                    >
                      {p.displayName}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-bold text-brand-accent">{p.score}</td>
                  <td className="px-4 py-3 text-brand-correct">{p.correct}</td>
                  <td className="px-4 py-3 text-brand-wrong">{p.wrong}</td>
                  <td className="px-4 py-3 text-slate-400">{p.unanswered}</td>
                  <td className="px-4 py-3">{p.accuracy}%</td>
                  <td className="px-4 py-3">{p.avgTimeSec !== null ? `${p.avgTimeSec}s` : "—"}</td>
                </tr>
              ))}
              {pagePlayers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    No players match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Page numbers with Previous / Next */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <p className="text-slate-400 text-sm">
            {filtered.length > 0
              ? `Showing ${startIndex + 1}–${startIndex + pagePlayers.length} of ${filtered.length}`
              : ""}
          </p>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>

      {/* Questions */}
      <div>
        <h2 className="text-lg font-bold mb-3">Questions ({questions.length})</h2>
        <div className="space-y-4">
          {questions.map((question) => (
            <div key={question.id} className="surface p-4">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="font-medium flex items-start gap-1 min-w-0">
                  <span className="shrink-0">{question.number}.</span>
                  <RichText html={question.text} />
                </div>
                <span className="font-extrabold text-brand-accent shrink-0">{question.percentCorrect}% correct</span>
              </div>
              <div className="space-y-2">
                {question.options.map((o, i) => {
                  const pct = summary.playerCount > 0 ? (o.count / summary.playerCount) * 100 : 0;
                  return (
                    <div
                      key={o.id}
                      className={`relative overflow-hidden rounded-lg ${optionColors[i]} ${
                        o.isCorrect ? "ring-2 ring-brand-text" : "opacity-50"
                      }`}
                    >
                      <div className="absolute inset-y-0 left-0 bg-black/30" style={{ width: `${pct}%` }} />
                      <div className={`relative flex justify-between px-4 py-2 gap-3 ${optionTextColors[i]}`}>
                        <span className="font-medium flex items-center gap-1">
                          {o.isCorrect && <span>✓</span>}
                          <RichText html={o.text} />
                        </span>
                        <span className="font-bold">{o.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-slate-400 text-sm mt-3">
                {question.correct} correct · {question.wrong} wrong · {question.unanswered} did not answer
              </p>
            </div>
          ))}
        </div>
      </div>

      {selectedPlayer && (
        <PlayerDetail
          player={selectedPlayer}
          questions={questions}
          onClose={() => setSelectedPlayerId(null)}
          onRename={handleRenameParticipant}
          onRequestDelete={setConfirmDeletePlayer}
          deleteError={deletePlayerError}
        />
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Delete report?"
        message="Delete this report? It will move to Trash, where you can restore it within your auto-delete window."
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteReport}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmModal
        open={!!confirmDeletePlayer}
        title="Delete student?"
        message={`Delete ${confirmDeletePlayer?.displayName} from this report? They submitted no answers, so this only removes their empty entry — nobody else's score or rank changes. This can't be undone.`}
        confirmLabel={deletingPlayer ? "Deleting..." : "Delete"}
        onConfirm={handleConfirmDeletePlayer}
        onCancel={() => setConfirmDeletePlayer(null)}
      />
    </div>
  );
}