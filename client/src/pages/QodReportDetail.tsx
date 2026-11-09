import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../api/axios";
import Pagination from "../components/Pagination";
import { formatDateTime } from "../utils/formatDate";
import { downloadCsv, sanitizeFilename } from "../utils/csv";
import RichText from "../components/RichText";
import ConfirmModal from "../components/ConfirmModal";

const PAGE_SIZE = 10;

interface PlayerResponse {
  id: string;
  questionId: string;
  text: string;
  answeredAt: string;
}

interface PlayerRow {
  participantId: string;
  displayName: string;
  responseCount: number;
  responses: PlayerResponse[];
}

interface QuestionRow {
  id: string;
  number: number;
  text: string;
}

interface Report {
  session: { id: string; gamePin: string; createdAt: string; endedAt: string | null; quizTitle: string; topic: string | null };
  summary: { playerCount: number; questionCount: number; totalResponses: number };
  players: PlayerRow[];
  questions: QuestionRow[];
}

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

// ---------- One player's responses, grouped by question, in order ----------

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
        <div className="sticky top-0 bg-slate-900 border-b border-brand-text/10 p-5 flex justify-between items-start gap-4">
          <div className="min-w-0">
            {editing ? (
              <div ref={editRef} className="flex items-center gap-2">
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
                {/* Only for a student with zero submitted responses. */}
                {player.responseCount === 0 && (
                  <button
                    type="button"
                    onClick={() => onRequestDelete(player)}
                    aria-label="Delete student"
                    title="Delete this student (no responses submitted)"
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
              {player.responseCount} response{player.responseCount !== 1 ? "s" : ""} submitted
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {questions.map((q) => {
            const mine = player.responses.filter((r) => r.questionId === q.id);
            return (
              <div key={q.id} className="rounded-xl border border-brand-text/10 bg-brand-text/5 p-4">
                <div className="font-medium mb-2 flex items-start gap-1">
                  <span className="shrink-0">{q.number}.</span>
                  <RichText html={q.text} />
                </div>
                {mine.length === 0 ? (
                  <p className="text-slate-500 text-sm">No response</p>
                ) : (
                  <div className="space-y-2">
                    {mine.map((r) => (
                      <div key={r.id} className="bg-slate-800/60 rounded-lg px-3 py-2">
                        <p className="whitespace-pre-wrap break-words">{r.text}</p>
                        <p className="text-slate-500 text-xs mt-1">{formatDateTime(r.answeredAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- The report page ----------

export default function QodReportDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Same reasoning as the Quiz report page — only trust navigate(-1) when we
  // arrived via the Reports list.
  const backToReports = () => {
    if ((location.state as { fromReportsList?: boolean } | null)?.fromReportsList) navigate(-1);
    else navigate("/reports?type=qod");
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
      .get(`/qod-sessions/${sessionId}/report`)
      .then((res) => setReport(res.data.data))
      .catch((err) => setError(err.response?.data?.message || "Could not load the report"));
  }, [sessionId]);

  const handleRenameParticipant = async (participantId: string, newName: string): Promise<boolean> => {
    try {
      await api.put(`/qod-sessions/${sessionId}/participants/${participantId}/name`, { displayName: newName });
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
      ["S.No", "Player", "Responses"],
      ...report.players.map((p, idx) => [idx + 1, p.displayName, p.responseCount]),
    ];
    const dateStamp = new Date(report.session.endedAt || report.session.createdAt).toISOString().slice(0, 10);
    downloadCsv(`${sanitizeFilename(report.session.quizTitle)}_${dateStamp}_players.csv`, rows);
  };

  // DELETE /:sessionId/report -> trashQodSessionReport (NOT the bare /:sessionId,
  // which ends a still-live session instead — see qodSession.routes.ts). Moves
  // this already-ENDED report to Trash, restorable from there.
  const handleConfirmDeleteReport = async () => {
    setConfirmDeleteOpen(false);
    setDeleteError("");
    setDeleting(true);
    try {
      await api.delete(`/qod-sessions/${sessionId}/report`);
      navigate("/reports?type=qod");
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || "Could not delete the report");
      setDeleting(false);
    }
  };

  // Same endpoint QodSessionHost's own "remove a student" action already uses —
  // only ever offered here for a student with zero responses. Note: this will
  // fail with an error if this report's source QOD quiz has since been
  // permanently deleted (a pre-existing limitation of the shared ownership check
  // this endpoint uses) — flagging rather than silently working around it.
  const handleConfirmDeletePlayer = async () => {
    if (!confirmDeletePlayer) return;
    const target = confirmDeletePlayer;
    setConfirmDeletePlayer(null);
    setDeletePlayerError("");
    setDeletingPlayer(true);
    try {
      await api.delete(`/qod-sessions/${sessionId}/participants/${target.participantId}`);
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
        <button
          onClick={backToReports}
          className="border border-brand-text/15 text-brand-text/90 text-sm mb-1 -ml-3 px-3 py-1.5 rounded-lg transition hover:bg-brand-text hover:text-brand-bg"
        >
          ← Back to Reports
        </button>
        <p className="text-brand-error mt-4">{error}</p>
      </div>
    );
  }
  if (!report) return <p>Loading...</p>;

  const { session, summary, players, questions } = report;

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
          <button
            onClick={backToReports}
            className="border border-brand-text/15 text-brand-text/90 text-base font-semibold mb-1 -ml-3 px-3 py-1.5 rounded-lg transition hover:bg-brand-text hover:text-brand-bg"
          >
            ← Back to Reports
          </button>
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

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Players", value: summary.playerCount },
          { label: "Questions", value: summary.questionCount },
          { label: "Total responses", value: summary.totalResponses },
        ].map((card) => (
          <div key={card.label} className="surface p-4">
            <p className="text-slate-400 text-sm">{card.label}</p>
            <p className="text-3xl font-extrabold text-brand-accent">{card.value}</p>
          </div>
        ))}
      </div>

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
                <th className="px-4 py-3">S.No</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Responses</th>
              </tr>
            </thead>
            <tbody>
              {pagePlayers.map((p, idx) => (
                <tr key={p.participantId} className="border-b border-brand-text/5 last:border-0">
                  <td className="px-4 py-3 font-bold">{startIndex + idx + 1}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedPlayerId(p.participantId)}
                      title="See this player's responses"
                      className="text-left hover:text-brand-accent hover:underline"
                    >
                      {p.displayName}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-bold text-brand-accent">{p.responseCount}</td>
                </tr>
              ))}
              {pagePlayers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    No players match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <p className="text-slate-400 text-sm">
            {filtered.length > 0
              ? `Showing ${startIndex + 1}–${startIndex + pagePlayers.length} of ${filtered.length}`
              : ""}
          </p>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>

      {/* Questions — no right/wrong here, just how much each one was answered */}
      <div>
        <h2 className="text-lg font-bold mb-3">Questions ({questions.length})</h2>
        <div className="space-y-3">
          {questions.map((question) => {
            const totalResponses = players.reduce(
              (sum, p) => sum + p.responses.filter((r) => r.questionId === question.id).length,
              0
            );
            const answeredCount = players.filter((p) =>
              p.responses.some((r) => r.questionId === question.id)
            ).length;

            return (
              <div key={question.id} className="surface p-4">
                <div className="font-medium flex items-start gap-1">
                  <span className="shrink-0">{question.number}.</span>
                  <RichText html={question.text} />
                </div>
                <p className="text-slate-400 text-sm mt-2">
                  {answeredCount} of {players.length} student{players.length !== 1 ? "s" : ""} responded ·{" "}
                  {totalResponses} total response{totalResponses !== 1 ? "s" : ""}
                </p>
              </div>
            );
          })}
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
        message={`Delete ${confirmDeletePlayer?.displayName} from this report? They submitted no responses, so this only removes their empty entry. This can't be undone.`}
        confirmLabel={deletingPlayer ? "Deleting..." : "Delete"}
        onConfirm={handleConfirmDeletePlayer}
        onCancel={() => setConfirmDeletePlayer(null)}
      />
    </div>
  );
}