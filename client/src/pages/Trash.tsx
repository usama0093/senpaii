import { useState, useEffect } from "react";
import api from "../api/axios";
import DateRangeFilter, { DateRange, EMPTY_RANGE, isInRange } from "../components/DateRangeFilter";
import { formatDate, formatDateTime } from "../utils/formatDate";
import ConfirmModal from "../components/ConfirmModal";

type Tab = "quiz" | "session" | "qod" | "feedback";
type ReportType = "quiz" | "qod" | "feedback";
type Kind = "quiz" | "qodQuiz" | "session" | "qodSession";

interface TrashQuiz {
  id: string;
  title: string;
  topic: string | null;
  category: string;
  questionCount: number;
  reportCount: number;
  deletedAt: string;
  autoDeleteOn: string | null;
}

interface TrashSession {
  id: string;
  title: string;
  quizId: string | null; // nullable once the source quiz is permanently deleted (report independence)
  quizInTrash: boolean;
  players: number;
  playedAt: string;
  deletedAt: string;
  autoDeleteOn: string | null;
}

interface ConfirmDeleteItem {
  kind: Kind;
  id: string;
  title: string;
  message: string;
}

// A pending bulk action (Restore or Empty) waiting on the confirm modal. Carries its
// own closure so the modal doesn't need to know which branch (all vs selected) built it.
interface ConfirmBulkAction {
  message: string;
  run: () => Promise<void>;
}

const PRESET_DAYS = [7, 14, 30, 60, 90];
const modeFromDays = (days: number | null) =>
  days === null ? "off" : PRESET_DAYS.includes(days) ? String(days) : "custom";

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

const endpointBase: Record<Kind, string> = {
  quiz: "/sessions/trash/quizzes",
  qodQuiz: "/sessions/trash/qod-quizzes",
  session: "/sessions/trash/sessions",
  qodSession: "/sessions/trash/qod-sessions",
};

const kindNoun: Record<Kind, string> = { quiz: "quiz", qodQuiz: "QOD quiz", session: "report", qodSession: "report" };

const kindErr: Record<Kind, { restore: string; deleteMsg: string }> = {
  quiz: { restore: "Could not restore the quiz", deleteMsg: "Could not delete the quiz" },
  qodQuiz: { restore: "Could not restore the QOD quiz", deleteMsg: "Could not delete the QOD quiz" },
  session: { restore: "Could not restore the report", deleteMsg: "Could not delete the report" },
  qodSession: { restore: "Could not restore the report", deleteMsg: "Could not delete the report" },
};

const emptySelected = (): Record<Kind, Set<string>> => ({
  quiz: new Set(),
  qodQuiz: new Set(),
  session: new Set(),
  qodSession: new Set(),
});

export default function Trash() {
  const [tab, setTab] = useState<Tab>("quiz");
  const [reportType, setReportType] = useState<ReportType>("quiz");

  const [quizzes, setQuizzes] = useState<TrashQuiz[]>([]);
  const [sessions, setSessions] = useState<TrashSession[]>([]);
  const [qodQuizzes, setQodQuizzes] = useState<TrashQuiz[]>([]);
  const [qodSessions, setQodSessions] = useState<TrashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);

  // Auto-delete setting
  const [autoDays, setAutoDays] = useState<number | null>(null);
  const [mode, setMode] = useState("off");
  const [customDays, setCustomDays] = useState("");
  // Confirmations (replace window.confirm)
  const [confirmAutoDelete, setConfirmAutoDelete] = useState<{ days: number | null; wouldDelete: number } | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ConfirmDeleteItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState<ConfirmBulkAction | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<ConfirmBulkAction | null>(null);

  // Checkbox selection, kept separately per section/kind — switching tab or the
  // Reports-type dropdown clears all of it (see handleTabChange / report type onChange).
  const [selected, setSelected] = useState<Record<Kind, Set<string>>>(emptySelected());

  const load = async () => {
    try {
      const res = await api.get("/sessions/trash");
      const data = res.data.data;
      setQuizzes(data.quizzes);
      setSessions(data.sessions);
      setQodQuizzes(data.qodQuizzes || []);
      setQodSessions(data.qodSessions || []);

      const days: number | null = data.settings.autoDeleteDays;
      setAutoDays(days);
      setMode(modeFromDays(days));
      if (days !== null) setCustomDays(String(days));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load Trash");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fail = (err: any, fallback: string) => setError(err.response?.data?.message || fallback);

  // ----- auto-delete -----
  const saveAutoDelete = async (days: number | null) => {
    setError("");
    try {
      const res = await api.put("/sessions/trash/settings", { autoDeleteDays: days });

      if (!res.data.data.saved) {
        setConfirmAutoDelete({ days, wouldDelete: res.data.data.wouldDelete });
        return;
      }

      await load();
    } catch (err: any) {
      setMode(modeFromDays(autoDays));
      fail(err, "Could not save the auto-delete setting");
    }
  };

  const handleConfirmAutoDelete = async () => {
    if (!confirmAutoDelete) return;
    const { days } = confirmAutoDelete;
    setConfirmAutoDelete(null);
    try {
      await api.put("/sessions/trash/settings", { autoDeleteDays: days, confirm: true });
      await load();
    } catch (err: any) {
      setMode(modeFromDays(autoDays));
      fail(err, "Could not save the auto-delete setting");
    }
  };

  const handleCancelAutoDelete = () => {
    setConfirmAutoDelete(null);
    setMode(modeFromDays(autoDays));
  };

  const handleModeChange = (value: string) => {
    setMode(value);
    if (value === "custom") return;
    saveAutoDelete(value === "off" ? null : Number(value));
  };

  const handleSetCustom = () => {
    const n = Number(customDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError("Enter a whole number of days between 1 and 365");
      return;
    }
    saveAutoDelete(n);
  };

  // ----- restore / delete-forever, shared across Quiz / QOD / Reports (single item) -----
  const restoreItem = async (kind: Kind, id: string) => {
    setError("");
    try {
      await api.post(`${endpointBase[kind]}/${id}/restore`);
      await load();
    } catch (err: any) {
      fail(err, kindErr[kind].restore);
    }
  };

  const deleteItemForever = (kind: Kind, item: TrashQuiz | TrashSession) => {
    const isQuizLike = kind === "quiz" || kind === "qodQuiz";
    const noun = kind === "qodQuiz" || kind === "qodSession" ? "responses" : "answers";

    const title = isQuizLike ? `Delete ${kind === "qodQuiz" ? "QOD quiz" : "quiz"} forever?` : "Delete report forever?";
    const message = isQuizLike
      ? `Permanently delete "${(item as TrashQuiz).title}"?${
          (item as TrashQuiz).reportCount > 0
            ? ` Its ${plural((item as TrashQuiz).reportCount, "report")} will remain available in Reports.`
            : ""
        } This can't be undone.`
      : `Permanently delete this report of "${(item as TrashSession).title}"? All players and ${noun} are deleted from the database. This can't be undone.`;

    setConfirmDeleteItem({ kind, id: item.id, title, message });
  };

  const handleConfirmDeleteItem = async () => {
    if (!confirmDeleteItem) return;
    const { kind, id } = confirmDeleteItem;
    setConfirmDeleteItem(null);
    setError("");
    try {
      await api.delete(`${endpointBase[kind]}/${id}`);
      await load();
    } catch (err: any) {
      fail(err, kindErr[kind].deleteMsg);
    }
  };

  // ----- selection helpers -----
  const toggleSelect = (kind: Kind, id: string) => {
    setSelected((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });
  };

  const toggleSelectAll = (kind: Kind, visibleIds: string[], allCurrentlySelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev[kind]);
      if (allCurrentlySelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return { ...prev, [kind]: next };
    });
  };

  const clearSelection = (kind: Kind) => setSelected((prev) => ({ ...prev, [kind]: new Set() }));
  const clearAllSelections = () => setSelected(emptySelected());

  const handleTabChange = (t: Tab) => {
    setTab(t);
    clearAllSelections();
  };

  const handleReportTypeChange = (t: ReportType) => {
    setReportType(t);
    clearAllSelections();
  };

  // ----- empty section (existing "all" endpoints unchanged; selection loops single-item deletes) -----
  const emptyTarget = (): { endpoint: string; count: number; isQuizLike: boolean } | null => {
    if (tab === "quiz") return { endpoint: "quizzes", count: quizzes.length, isQuizLike: true };
    if (tab === "qod") return { endpoint: "qod-quizzes", count: qodQuizzes.length, isQuizLike: true };
    if (tab === "session" && reportType === "quiz") return { endpoint: "sessions", count: sessions.length, isQuizLike: false };
    if (tab === "session" && reportType === "qod") return { endpoint: "qod-sessions", count: qodSessions.length, isQuizLike: false };
    return null; // feedback: nothing to empty yet
  };

  // ----- filters: name + date deleted -----
  const q = search.trim().toLowerCase();

  const activeQuizList: TrashQuiz[] = tab === "quiz" ? quizzes : tab === "qod" ? qodQuizzes : [];
  const visibleQuizList = activeQuizList.filter(
    (z) =>
      isInRange(z.deletedAt, dateRange) &&
      (!q || z.title.toLowerCase().includes(q) || (z.topic || "").toLowerCase().includes(q) || z.category.toLowerCase().includes(q))
  );

  const activeSessionList: TrashSession[] =
    tab === "session" ? (reportType === "qod" ? qodSessions : reportType === "quiz" ? sessions : []) : [];
  const visibleSessionList = activeSessionList.filter(
    (s) => isInRange(s.deletedAt, dateRange) && (!q || s.title.toLowerCase().includes(q))
  );

  const filtersActive = !!q || !!dateRange.from;
  const clearFilters = () => {
    setSearch("");
    setDateRange(EMPTY_RANGE);
  };

  const quizListKind: Kind = tab === "qod" ? "qodQuiz" : "quiz";
  const sessionListKind: Kind = reportType === "qod" ? "qodSession" : "session";

  // Which section's buttons/checkbox apply right now, and its full (unfiltered)
  // item list — used for the "nothing selected = act on everything" default,
  // mirroring Empty This Section's existing filter-ignoring behavior.
  const activeKind: Kind | null =
    tab === "quiz" ? "quiz" : tab === "qod" ? "qodQuiz" : tab === "session" ? sessionListKind : null;
  const activeFullList: (TrashQuiz | TrashSession)[] = tab === "session" ? activeSessionList : activeQuizList;

  const quizAllSelected = visibleQuizList.length > 0 && visibleQuizList.every((item) => selected[quizListKind].has(item.id));
  const sessionAllSelected =
    visibleSessionList.length > 0 && visibleSessionList.every((item) => selected[sessionListKind].has(item.id));

  // ----- bulk Restore -----
  const restoreSection = () => {
    if (!activeKind || reportType === "feedback") return;
    const kind = activeKind;
    const selectedIds = Array.from(selected[kind]);
    const targetIds = selectedIds.length > 0 ? selectedIds : activeFullList.map((i) => i.id);
    if (targetIds.length === 0) return;

    const scope = selectedIds.length > 0 ? plural(targetIds.length, kindNoun[kind]) : `all ${plural(targetIds.length, kindNoun[kind])}`;

    setConfirmRestore({
      message: `Restore ${scope} out of Trash?`,
      run: async () => {
        try {
          const results = await Promise.allSettled(targetIds.map((id) => api.post(`${endpointBase[kind]}/${id}/restore`)));
          const failed = results.filter((r) => r.status === "rejected").length;
          clearSelection(kind);
          await load();
          if (failed > 0) {
            setError(
              failed === targetIds.length
                ? kindErr[kind].restore
                : `Restored ${targetIds.length - failed} of ${targetIds.length} — ${failed} failed`
            );
          }
        } catch (err: any) {
          fail(err, kindErr[kind].restore);
        }
      },
    });
  };

  // ----- bulk Empty / delete forever -----
  const emptySection = () => {
    if (!activeKind || reportType === "feedback") return;
    const kind = activeKind;
    const selectedIds = Array.from(selected[kind]);
    const isQuizLike = kind === "quiz" || kind === "qodQuiz";

    if (selectedIds.length > 0) {
      const message = isQuizLike
        ? `Permanently delete ${plural(selectedIds.length, kindNoun[kind])}? Any reports they have will remain available in Reports. This can't be undone.`
        : `Permanently delete ${plural(selectedIds.length, "report")}? This can't be undone.`;

      setConfirmEmpty({
        message,
        run: async () => {
          try {
            const results = await Promise.allSettled(selectedIds.map((id) => api.delete(`${endpointBase[kind]}/${id}`)));
            const failed = results.filter((r) => r.status === "rejected").length;
            clearSelection(kind);
            await load();
            if (failed > 0) {
              setError(
                failed === selectedIds.length
                  ? kindErr[kind].deleteMsg
                  : `Deleted ${selectedIds.length - failed} of ${selectedIds.length} — ${failed} failed`
              );
            }
          } catch (err: any) {
            fail(err, kindErr[kind].deleteMsg);
          }
        },
      });
      return;
    }

    // Nothing selected: empty the whole section, exactly as before.
    const target = emptyTarget();
    if (!target) return;
    const message = target.isQuizLike
      ? `Permanently delete all ${plural(target.count, "quiz")} in Trash? Any reports they have will remain available in Reports. This can't be undone.`
      : `Permanently delete all ${plural(target.count, "report")} in Trash? This can't be undone.`;
    setConfirmEmpty({
      message,
      run: async () => {
        try {
          await api.post(`/sessions/trash/empty/${target.endpoint}`);
          clearSelection(kind);
          await load();
        } catch (err: any) {
          fail(err, "Could not empty this section");
        }
      },
    });
  };

  const handleConfirmRestore = async () => {
    if (!confirmRestore) return;
    const action = confirmRestore;
    setConfirmRestore(null);
    setError("");
    await action.run();
  };

  const handleConfirmEmpty = async () => {
    if (!confirmEmpty) return;
    const action = confirmEmpty;
    setConfirmEmpty(null);
    setError("");
    await action.run();
  };

  const tabClass = (active: boolean) =>
    `px-5 py-3 font-semibold border-b-2 -mb-px whitespace-nowrap transition ${
      active ? "border-brand-accent text-brand-accent" : "border-transparent text-brand-text/70 hover:text-brand-text"
    }`;

  const emptyMessage = (what: string) =>
    filtersActive ? `No ${what} match your filters.` : `Nothing here — deleted ${what} appear in Trash.`;

  const restoreButton = "bg-brand-text/10 hover:bg-brand-text/20 text-brand-text font-medium px-4 py-2 rounded-lg transition";
  const foreverButton = "text-red-400 hover:bg-red-600 hover:text-white font-medium px-4 py-2 rounded-lg transition";

  return (
    <div>
      {/* <main> is the scroll container (see AppLayout.tsx). Only the title sticks here;
          Auto-delete scrolls normally underneath it, and the tabs row further down gets
          its own sticky block (below) whose top offset matches this block's height, so
          it catches up and locks in directly beneath the title once it scrolls there. */}
      <div className="sticky top-0 z-10 -mx-6 md:-mx-10 px-6 md:px-10 pb-2 md:pb-3 bg-brand-bg">
        <h1 className="text-2xl font-bold pt-4 md:pt-6">Trash</h1>
      </div>
      {/* <p className="text-slate-400 mb-6">
        Deleted quizzes and reports wait here. Restore them, or delete them forever to free up storage.
      </p> */}

      {/* Auto-delete */}
      <div className="surface p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Auto-delete</span>
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value)}
            className="bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <option value="off">Off — I'll delete manually</option>
            {PRESET_DAYS.map((d) => (
              <option key={d} value={d}>
                After {d} days
              </option>
            ))}
            <option value="custom">Custom number of days…</option>
          </select>

          {mode === "custom" && (
            <>
              <input
                type="number"
                min={1}
                max={365}
                placeholder="Days"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="w-28 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
              />
              <button
                onClick={handleSetCustom}
                className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-5 py-2 rounded-lg"
              >
                Set
              </button>
            </>
          )}
        </div>
        <p className="text-slate-400 text-sm mt-3">
          {autoDays === null
            ? "Items stay in Trash until you delete them yourself."
            : `Items are deleted ${autoDays} day${autoDays !== 1 ? "s" : ""} after they are moved here. A quiz that still has reports in Reports is kept.`}
        </p>
      </div>

      {error && <p className="text-brand-error text-sm mb-4">{error}</p>}

      {/* Tabs: sticky, offset to sit directly beneath the sticky title block above
          (title's rendered height: pt-4/md:pt-6 + text-2xl line-height (2rem)). */}
      <div className="sticky top-[3.50rem] md:top-[4.25rem] z-10 -mx-6 md:-mx-10 px-6 md:px-10 pb-3 bg-brand-bg">
      <div className="flex border-b border-brand-text/10 overflow-x-auto overflow-y-hidden">
        <button onClick={() => handleTabChange("quiz")} className={tabClass(tab === "quiz")}>
          Quiz ({quizzes.length})
        </button>
        <button onClick={() => handleTabChange("qod")} className={tabClass(tab === "qod")}>
          QOD ({qodQuizzes.length})
        </button>
        <button onClick={() => handleTabChange("feedback")} className={tabClass(tab === "feedback")}>
          Feedback
        </button>
        <button onClick={() => handleTabChange("session")} className={tabClass(tab === "session")}>
          Reports ({sessions.length + qodSessions.length})
        </button>
      </div>
      </div>

      {tab === "feedback" && (
        <p className="text-slate-400">Nothing here yet — deleted feedback will appear here once that feature exists.</p>
      )}

      {/* Reports tab: Quiz / QOD / Feedback dropdown */}
      {tab === "session" && (
        <div className="flex flex-wrap items-center gap-3 mb-6 pt-1">
          <select
            value={reportType}
            onChange={(e) => handleReportTypeChange(e.target.value as ReportType)}
            className="bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <option value="quiz">Quiz</option>
            <option value="qod">QOD</option>
            <option value="feedback">Feedback</option>
          </select>

          {reportType !== "feedback" && (
            <>
              <input
                type="text"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-72 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
              />
              <DateRangeFilter value={dateRange} onChange={setDateRange} />
              {activeSessionList.length > 0 && (
                <div className="ml-auto flex items-center gap-3 pr-3">
                  <button onClick={restoreSection} className={restoreButton}>
                    Restore
                  </button>
                  <button
                    onClick={emptySection}
                    className="border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white font-medium px-4 py-2 rounded-lg transition"
                  >
                    Empty section
                  </button>
                  <div className="w-10 flex justify-center">
                    <input
                      type="checkbox"
                      checked={sessionAllSelected}
                      onChange={() => toggleSelectAll(sessionListKind, visibleSessionList.map((i) => i.id), sessionAllSelected)}
                      disabled={visibleSessionList.length === 0}
                      title="Select all"
                      className="w-5 h-5 accent-brand-accent cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "session" && reportType === "feedback" && (
        <p className="text-slate-400">Nothing here yet — deleted feedback will appear here once that feature exists.</p>
      )}

      {tab === "session" &&
        reportType !== "feedback" &&
        (loading ? (
          <p>Loading...</p>
        ) : visibleSessionList.length === 0 ? (
          <div>
            <p className="text-slate-400">{emptyMessage("reports")}</p>
            {filtersActive && (
              <button onClick={clearFilters} className="text-brand-accent text-sm hover:underline mt-2">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSessionList.map((s) => (
              <div key={s.id} className="surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{s.title}</p>
                  <p className="text-slate-400 text-sm">
                    Played {formatDateTime(s.playedAt)} · {plural(s.players, "player")}
                    {s.quizInTrash && ` · its ${reportType === "qod" ? "QOD quiz" : "quiz"} is also in Trash`}
                  </p>
                  <p className="text-slate-500 text-sm">
                    Deleted {formatDateTime(s.deletedAt)}
                    {s.autoDeleteOn && ` · Deletes automatically on ${formatDate(s.autoDeleteOn)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => restoreItem(sessionListKind, s.id)} className={restoreButton}>
                    Restore
                  </button>
                  <button onClick={() => deleteItemForever(sessionListKind, s)} className={foreverButton}>
                    Delete forever
                  </button>
                  <div className="w-10 flex justify-center">
                    <input
                      type="checkbox"
                      checked={selected[sessionListKind].has(s.id)}
                      onChange={() => toggleSelect(sessionListKind, s.id)}
                      className="accent-brand-accent cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* Quiz / QOD tabs */}
      {(tab === "quiz" || tab === "qod") && (
        <div className="flex flex-wrap items-center gap-3 mb-6 pt-1">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
          />
          <DateRangeFilter value={dateRange} onChange={setDateRange} />

          {activeQuizList.length > 0 && (
            <div className="ml-auto flex items-center gap-3 pr-3">
              <button onClick={restoreSection} className={restoreButton}>
                Restore
              </button>
              <button
                onClick={emptySection}
                className="border border-red-500/40 text-red-400 hover:bg-red-500/10 font-medium px-4 py-2 rounded-lg transition"
              >
                Empty section
              </button>
              <div className="w-10 flex justify-center">
                <input
                  type="checkbox"
                  checked={quizAllSelected}
                  onChange={() => toggleSelectAll(quizListKind, visibleQuizList.map((i) => i.id), quizAllSelected)}
                  disabled={visibleQuizList.length === 0}
                  title="Select all"
                  className="w-5 h-5 accent-brand-accent cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {(tab === "quiz" || tab === "qod") &&
        (loading ? (
          <p>Loading...</p>
        ) : visibleQuizList.length === 0 ? (
          <div>
            <p className="text-slate-400">{emptyMessage("quizzes")}</p>
            {filtersActive && (
              <button onClick={clearFilters} className="text-brand-accent text-sm hover:underline mt-2">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleQuizList.map((item) => (
              <div key={item.id} className="surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{item.title}</p>
                  <p className="text-slate-400 text-sm">
                    {plural(item.questionCount, "question")} · {item.category}
                    {item.reportCount > 0 && ` · ${plural(item.reportCount, "report")}`}
                  </p>
                  <p className="text-slate-500 text-sm">
                    Deleted {formatDateTime(item.deletedAt)}
                    {item.autoDeleteOn
                      ? ` · Deletes automatically on ${formatDate(item.autoDeleteOn)}`
                      : autoDays !== null
                      ? " · Kept while it has reports"
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => restoreItem(quizListKind, item.id)} className={restoreButton}>
                    Restore
                  </button>
                  <button onClick={() => deleteItemForever(quizListKind, item)} className={foreverButton}>
                    Delete forever
                  </button>
                  <div className="w-10 flex justify-center">
                    <input
                      type="checkbox"
                      checked={selected[quizListKind].has(item.id)}
                      onChange={() => toggleSelect(quizListKind, item.id)}
                      className="accent-brand-accent cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      <ConfirmModal
        open={!!confirmAutoDelete}
        title="Delete items now?"
        message={
          confirmAutoDelete
            ? `${plural(confirmAutoDelete.wouldDelete, "item")} in Trash ${
                confirmAutoDelete.wouldDelete !== 1 ? "are" : "is"
              } already older than ${confirmAutoDelete.days} days and will be permanently deleted right away. Continue?`
            : ""
        }
        confirmLabel="Continue"
        onConfirm={handleConfirmAutoDelete}
        onCancel={handleCancelAutoDelete}
      />

      <ConfirmModal
        open={!!confirmDeleteItem}
        title={confirmDeleteItem?.title || ""}
        message={confirmDeleteItem?.message || ""}
        confirmLabel="Delete forever"
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => setConfirmDeleteItem(null)}
      />

      <ConfirmModal
        open={!!confirmRestore}
        title="Restore?"
        message={confirmRestore?.message || ""}
        confirmLabel="Restore"
        onConfirm={handleConfirmRestore}
        onCancel={() => setConfirmRestore(null)}
      />

      <ConfirmModal
        open={!!confirmEmpty}
        title="Empty this section?"
        message={confirmEmpty?.message || ""}
        confirmLabel="Delete all"
        onConfirm={handleConfirmEmpty}
        onCancel={() => setConfirmEmpty(null)}
      />
    </div>
  );
}