import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import MoreMenu from "../components/MoreMenu";
import DateRangeFilter, { DateRange, EMPTY_RANGE, isInRange } from "../components/DateRangeFilter";
import SortDropdown, { DEFAULT_SORT, sortItems, SortOption, isSortOption } from "../components/SortDropdown";
import { formatDateTime } from "../utils/formatDate";
import ConfirmModal from "../components/ConfirmModal";
import { loadSectionFilters, saveSectionFilters } from "../utils/sectionFilters";

type ReportType = "quiz" | "qod" | "feedback";

interface SessionRow {
  id: string;
  gamePin: string;
  status: "WAITING" | "ACTIVE" | "ENDED";
  createdAt: string;
  endedAt: string | null;
  quiz: { id: string; title: string; topic: string | null } | null;
  quizTitleSnapshot: string | null;
  quizTopicSnapshot: string | null;
  _count: { participants: number };
}

interface QodSessionRow {
  id: string;
  gamePin: string;
  status: "WAITING" | "ACTIVE" | "ENDED";
  createdAt: string;
  endedAt: string | null;
  qodQuiz: { id: string; title: string; topic: string | null } | null;
  quizTitleSnapshot: string | null;
  quizTopicSnapshot: string | null;
  _count: { participants: number };
}

// A common shape so Quiz and QOD rows render through the same JSX.
interface Row {
  id: string;
  quizId: string;
  title: string;
  topic: string | null;
  when: string;
  players: number;
  link: string;
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

const asReportType = (v: string | null): ReportType => (v === "qod" || v === "feedback" ? v : "quiz");

export default function Reports() {
  // Filters are seeded from the URL once, on mount, and written back to it below —
  // that's what lets "Back to Reports" (navigate(-1)) land on the same filtered view.
  // If the URL is bare (arrived via the sidebar or similar), fall back to this
  // section's last-known filters in sessionStorage instead of defaults.
  const [searchParams, setSearchParams] = useSearchParams();
  const isBareUrl = searchParams.toString() === "";
  const stored = isBareUrl ? loadSectionFilters("reports") : {};

  const [reportType, setReportType] = useState<ReportType>(() =>
    asReportType(searchParams.get("type") ?? stored.type ?? null)
  );
  const [quizFilter, setQuizFilter] = useState(() => searchParams.get("quiz") ?? stored.quiz ?? "all");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? stored.q ?? "");
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: searchParams.get("from") ?? stored.from ?? null,
    to: searchParams.get("to") ?? stored.to ?? null,
  }));
  const [sort, setSort] = useState<SortOption>(() => {
    const s = searchParams.get("sort") ?? stored.sort ?? null;
    return isSortOption(s) ? s : DEFAULT_SORT;
  });

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [qodSessions, setQodSessions] = useState<QodSessionRow[]>([]);
  const [qodLoaded, setQodLoaded] = useState(false);
  const [qodLoading, setQodLoading] = useState(false);

  const [error, setError] = useState("");

  // Which report ids are checked for bulk delete. Cleared whenever reportType switches.
  // (Selection itself is deliberately NOT persisted in the URL/back history.)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Delete confirmation (replaces window.confirm). Carries every id being deleted —
  // length 1 for a single-row delete, length N for a bulk delete.
  const [confirmDelete, setConfirmDelete] = useState<{ type: ReportType; ids: string[] } | null>(null);

  // Keep the URL in sync with the filters, using replace so every keystroke doesn't
  // pile up browser-history entries — only the single current /reports entry's URL updates.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (reportType !== "quiz") params.type = reportType;
    if (quizFilter !== "all") params.quiz = quizFilter;
    if (search) params.q = search;
    if (dateRange.from) params.from = dateRange.from;
    if (dateRange.to) params.to = dateRange.to;
    if (sort !== DEFAULT_SORT) params.sort = sort;
    setSearchParams(params, { replace: true });
    saveSectionFilters("reports", params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, quizFilter, search, dateRange, sort]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/sessions");
        setSessions(res.data.data.filter((s: SessionRow) => s.status === "ENDED"));
      } catch (err: any) {
        setError(err.response?.data?.message || "Could not load reports");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // QOD reports are fetched the first time the dropdown switches to QOD, not eagerly.
  useEffect(() => {
    if (reportType !== "qod" || qodLoaded) return;
    setQodLoading(true);
    api
      .get("/qod-sessions")
      .then((res) => {
        setQodSessions(res.data.data.filter((s: QodSessionRow) => s.status === "ENDED"));
        setQodLoaded(true);
      })
      .catch((err: any) => setError(err.response?.data?.message || "Could not load QOD reports"))
      .finally(() => setQodLoading(false));
  }, [reportType, qodLoaded]);

  // Switching the report type starts filters AND selection fresh, since ids don't carry over.
  const handleReportTypeChange = (value: ReportType) => {
    setReportType(value);
    setQuizFilter("all");
    setSearch("");
    setDateRange(EMPTY_RANGE);
    setSort(DEFAULT_SORT);
    setSelectedIds(new Set());
  };

  const handleDelete = (type: ReportType, id: string) => setConfirmDelete({ type, ids: [id] });

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setConfirmDelete({ type: reportType, ids: Array.from(selectedIds) });
  };

  const deleteOneReport = (type: ReportType, id: string) =>
    type === "qod" ? api.delete(`/qod-sessions/${id}/report`) : api.delete(`/sessions/${id}`);

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    const { type, ids } = confirmDelete;
    setConfirmDelete(null);
    setError("");

    const results = await Promise.allSettled(ids.map((id) => deleteOneReport(type, id)));
    const succeededIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const failedCount = ids.length - succeededIds.length;

    if (type === "qod") {
      setQodSessions((prev) => prev.filter((x) => !succeededIds.includes(x.id)));
    } else {
      setSessions((prev) => prev.filter((x) => !succeededIds.includes(x.id)));
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });

    if (failedCount > 0) {
      setError(
        failedCount === ids.length
          ? "Could not delete report(s)"
          : `Deleted ${succeededIds.length} of ${ids.length} reports — ${failedCount} failed`
      );
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ----- build the common row list + the quiz-filter dropdown options for whichever type is active -----
  const isLoading = reportType === "quiz" ? loading : reportType === "qod" ? qodLoading : false;

  const rows: Row[] =
    reportType === "quiz"
     ? sessions.map((s) => ({
          id: s.id,
          quizId: s.quiz?.id ?? "deleted",
          title: s.quiz?.title ?? s.quizTitleSnapshot ?? "Deleted quiz",
          topic: s.quiz?.topic ?? s.quizTopicSnapshot ?? null,
          when: s.endedAt || s.createdAt,
          players: s._count.participants,
          link: `/reports/${s.id}`,
        }))
      : reportType === "qod"
      ? qodSessions.map((s) => ({
          id: s.id,
          quizId: s.qodQuiz?.id ?? "deleted",
          title: s.qodQuiz?.title ?? s.quizTitleSnapshot ?? "Deleted QOD quiz",
          topic: s.qodQuiz?.topic ?? s.quizTopicSnapshot ?? null,
          when: s.endedAt || s.createdAt,
          players: s._count.participants,
          link: `/reports/qod/${s.id}`,
        }))
      : [];

 const quizzes = Array.from(
    new Map(
      rows.map((r) => [
        r.quizId,
        r.quizId === "deleted" ? (reportType === "qod" ? "Deleted QOD quizzes" : "Deleted quizzes") : r.title,
      ])
    ).entries()
  );

  const q = search.trim().toLowerCase();
  const filteredRows = rows.filter((r) => {
    if (quizFilter !== "all" && r.quizId !== quizFilter) return false;
    if (!isInRange(r.when, dateRange)) return false;
    if (!q) return true;
    return r.title.toLowerCase().includes(q) || (r.topic || "").toLowerCase().includes(q) || formatDateTime(r.when).toLowerCase().includes(q);
  });
  const visible = sortItems(
    filteredRows,
    sort,
    (r) => r.when,
    (r) => r.title
  );

  // Select-all reflects only the currently visible (filtered) rows.
  const allSelected = visible.length > 0 && visible.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visible.forEach((r) => next.delete(r.id));
      } else {
        visible.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const filtersActive = quizFilter !== "all" || !!q || !!dateRange.from || sort !== DEFAULT_SORT;
  const clearFilters = () => {
    setQuizFilter("all");
    setSearch("");
    setDateRange(EMPTY_RANGE);
    setSort(DEFAULT_SORT);
  };

  return (
    <div>
      {/* <main> is the scroll container (see AppLayout.tsx), so sticky top-0 pins this
          block to the top of that scroll area; full-bleed background hides rows
          scrolling underneath it. */}
      <div className="sticky top-0 z-10 -mx-6 md:-mx-10 px-6 md:px-10 pt-4 md:pt-6 pb-6 bg-brand-bg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        {reportType !== "feedback" && (
          <input
            type="text"
            placeholder="Search reports..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
          />
        )}
      </div>
      {/* <p className="text-slate-400 mb-6">
        {reportType === "qod"
          ? "Results of your finished QOD sessions. Open one to see every student's responses."
          : "Results of your finished games. Open one to see every player and question."}
      </p> */}

      {/* Report type + filters on the left, select-all/bulk-delete on the right */}
      <div className="flex flex-wrap items-center gap-3">
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
            <select
              value={quizFilter}
              onChange={(e) => setQuizFilter(e.target.value)}
              disabled={isLoading || quizzes.length === 0}
              className="w-52 bg-slate-800 rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-60"
            >
              <option value="all">{reportType === "qod" ? "All QOD quizzes" : "All quizzes"}</option>
              {quizzes.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>

            <SortDropdown value={sort} onChange={setSort} />
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            {filtersActive && (
              <button onClick={clearFilters} className="text-brand-accent text-sm hover:underline">
                Clear filters
              </button>
            )}

            <div className="ml-auto flex items-center gap-3 pr-3">
              <button
                onClick={handleBulkDeleteClick}
                disabled={selectedIds.size === 0}
                title="Delete selected reports"
                className="group flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 p-2 rounded-lg font-semibold transition-all duration-200 hover:bg-red-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <TrashIcon />
                <span>
                  Delete
                </span>
              </button>
              <div className="w-10 flex justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={visible.length === 0}
                  title="Select all"
                  className="w-5 h-5 accent-brand-accent cursor-pointer"
                />
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      {error && <p className="text-brand-error text-sm mb-4">{error}</p>}

      {reportType === "feedback" ? (
        <p className="text-slate-400">Nothing here yet — feedback reports will appear here once that feature exists.</p>
      ) : isLoading ? (
        <p>Loading...</p>
      ) : visible.length === 0 ? (
        <div>
          <p className="text-slate-400">
            {filtersActive
              ? "No reports match your filters."
              : reportType === "qod"
              ? "No finished QOD sessions yet — reports appear here once a session ends."
              : "No finished games yet — reports appear here once a game ends."}
          </p>
          {filtersActive && (
            <button onClick={clearFilters} className="text-brand-accent text-sm hover:underline mt-2">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="surface hover:bg-slate-800 rounded-xl flex items-center gap-3 pr-3 transition">
              <Link to={r.link} state={{ fromReportsList: true }} className="flex-1 min-w-0 p-4 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{r.title}</p>
                  <p className="text-slate-400 text-sm">
                    {formatDateTime(r.when)} · {r.players} player{r.players !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
              <MoreMenu items={[{ label: "Delete report", onClick: () => handleDelete(reportType, r.id), danger: true }]} />
              <div className="w-10 flex justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  className="accent-brand-accent cursor-pointer"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title={confirmDelete && confirmDelete.ids.length > 1 ? `Delete ${confirmDelete.ids.length} reports?` : "Delete report?"}
        message={
          confirmDelete && confirmDelete.ids.length > 1
            ? `Move these ${confirmDelete.ids.length} reports to Trash? You can restore them from Trash.`
            : "Move this report to Trash? You can restore it from Trash."
        }
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}