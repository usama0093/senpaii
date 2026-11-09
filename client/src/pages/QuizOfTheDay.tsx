import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import MoreMenu from "../components/MoreMenu";
import ConfirmModal from "../components/ConfirmModal";
import QuizPreviewModal, { PreviewQuestion } from "../components/QuizPreviewModal";
import RenameModal from "../components/RenameModal";
import DateRangeFilter, { DateRange, EMPTY_RANGE, isInRange } from "../components/DateRangeFilter";
import { formatDateTime } from "../utils/formatDate";
import { useCategories } from "../hooks/useCategories";
import SortDropdown, { DEFAULT_SORT, sortItems, SortOption, isSortOption } from "../components/SortDropdown";
import { loadSectionFilters, saveSectionFilters } from "../utils/sectionFilters";

type Tab = "qod" | "favorite" | "category" | "live";

interface QodQuizItem {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  category: string;
  isFavorite: boolean;
  createdAt: string;
  _count: { questions: number };
}

const keyOf = (name: string) => name.trim().toLowerCase();

export default function QuizOfTheDay() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters are seeded from the URL once, on mount, and written back to it below
  // (same pattern as Reports.tsx). If the URL is bare (no filter params at all —
  // e.g. arrived via the sidebar, or a Back button whose history was lost), fall
  // back to this section's last-known filters in sessionStorage instead of defaults.
  const isBareUrl = searchParams.toString() === "";
  const stored = isBareUrl ? loadSectionFilters("qod") : {};

  const tabParam = searchParams.get("tab") ?? stored.tab ?? null;
  const [tab, setTab] = useState<Tab>(
    tabParam === "favorite" || tabParam === "category" || tabParam === "live" ? tabParam : "qod"
  );

  const goTab = (t: Tab) => {
    setTab(t);
  };

  // ----- Live Quiz tab: Resume/End card for an already-running session -----
  const [liveLoading, setLiveLoading] = useState(false);
  const [showResumeCard, setShowResumeCard] = useState(false);
  const [livePin, setLivePin] = useState("");
  const [liveJoined, setLiveJoined] = useState(0);
  const [liveAnswerCount, setLiveAnswerCount] = useState(0);
  const [liveEnding, setLiveEnding] = useState(false);
  const [liveError, setLiveError] = useState("");
  // End-session confirmation (replaces window.confirm)
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  useEffect(() => {
    if (tab !== "live") return;
    let cancelled = false;
    setLiveLoading(true);
    setLiveError("");

    (async () => {
      try {
        const res = await api.get("/sessions/qod/live/active");
        if (cancelled) return;
        const data = res.data.data;

        if (data) {
          // A session is already running — offer Resume / End here.
          setLivePin(data.pin);
          setLiveJoined(data.joined);
          setLiveAnswerCount(data.answerCount);
          setShowResumeCard(true);
          setLiveLoading(false);
        } else {
          // Nothing running — start one and jump straight into it (PIN in the URL).
          const startRes = await api.post("/sessions/qod/live");
          if (cancelled) return;
          navigate(`/qod/live/${startRes.data.data.pin}`);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLiveError(err.response?.data?.message || "Could not load the live quiz");
          setLiveLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, navigate]);

  const handleResume = () => {
    navigate(`/qod/live/${livePin}`);
  };

  // Opens the modal instead of ending right away.
  const handleEndLive = () => setConfirmEndOpen(true);

  // Runs the actual end once the modal is confirmed.
  const handleConfirmEndLive = async () => {
    setConfirmEndOpen(false);
    setLiveError("");
    setLiveEnding(true);
    try {
      await api.delete(`/sessions/qod/live/${livePin}`);
      // Switch the local tab state directly rather than navigate("/qod") — tab is
      // local state now (for URL-persistence), so navigating alone wouldn't update it.
      goTab("qod");
    } catch (err: any) {
      setLiveError(err.response?.data?.message || "Could not end the session");
      setLiveEnding(false);
    }
  };

  // ----- QOD / Favorite / Category tabs: the list of created QOD quizzes -----
  const [qodQuizzes, setQodQuizzes] = useState<QodQuizItem[]>([]);
  // qodQuizId -> sessionId, for sessions still WAITING or ACTIVE — lets a host get
  // back into a session they accidentally navigated away from.
  const [openLobbies, setOpenLobbies] = useState<Record<string, string>>({});
  const [qodLoading, setQodLoading] = useState(true);
  const [qodError, setQodError] = useState("");
  const [search, setSearch] = useState(searchParams.get("q") ?? stored.q ?? "");
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: searchParams.get("from") ?? stored.from ?? null,
    to: searchParams.get("to") ?? stored.to ?? null,
  }));
  const [sort, setSort] = useState<SortOption>(() => {
    const s = searchParams.get("sort") ?? stored.sort ?? null;
    return isSortOption(s) ? s : DEFAULT_SORT;
  });
  const [confirmDeleteQod, setConfirmDeleteQod] = useState<QodQuizItem | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<QodQuizItem[]>([]);
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<QodQuizItem | null>(null);

  // Keep the URL in sync with the filters, using replace so every keystroke doesn't
  // pile up browser-history entries — same pattern as Reports.tsx.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (tab !== "qod") params.tab = tab;
    if (search) params.q = search;
    if (dateRange.from) params.from = dateRange.from;
    if (dateRange.to) params.to = dateRange.to;
    if (sort !== DEFAULT_SORT) params.sort = sort;
    setSearchParams(params, { replace: true });
    saveSectionFilters("qod", params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, dateRange, sort]);

  // Category tab
  const { categories, loading: categoriesLoading, addCategory, removeCategory } = useCategories("/qod-quizzes");
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchQodQuizzes();
    fetchOpenQodLobbies();
  }, []);

  const fetchOpenQodLobbies = async () => {
    try {
      const res = await api.get("/qod-sessions");
      const map: Record<string, string> = {};
      for (const s of res.data.data) {
        if (s.status === "WAITING" || s.status === "ACTIVE") map[s.qodQuizId] = s.id;
      }
      setOpenLobbies(map);
    } catch (err) {
      console.error("Could not load open QOD lobbies:", err);
    }
  };

  const fetchQodQuizzes = async () => {
    try {
      const res = await api.get("/qod-quizzes");
      setQodQuizzes(res.data.data);
    } catch (err: any) {
      setQodError(err.response?.data?.message || "Could not load QOD quizzes");
    } finally {
      setQodLoading(false);
    }
  };

  const previewQuiz = qodQuizzes.find((q) => q.id === previewId) ?? null;

  useEffect(() => {
    if (previewId && !previewQuiz) setPreviewId(null);
  }, [previewId, previewQuiz]);

  const openPreview = async (quiz: QodQuizItem, list: QodQuizItem[]) => {
    setPreviewId(quiz.id);
    setPreviewList(list);
    setPreviewQuestions(null);
    setPreviewLoading(true);
    try {
      const res = await api.get(`/qod-quizzes/${quiz.id}`);
      setPreviewQuestions(
        res.data.data.questions.map((q: any) => ({ id: q.id, text: q.text, timeLimit: q.timeLimit }))
      );
    } catch (err) {
      setPreviewQuestions([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRenameQod = async (quiz: QodQuizItem, newTitle: string) => {
    const res = await api.put(`/qod-quizzes/${quiz.id}`, {
      title: newTitle,
      description: quiz.description,
      topic: quiz.topic,
      category: quiz.category,
    });
    setQodQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? { ...q, title: res.data.data.title } : q)));
  };

  const handleCopyQod = async (quiz: QodQuizItem) => {
    setQodError("");
    try {
      await api.post(`/qod-quizzes/${quiz.id}/duplicate`);
      await fetchQodQuizzes(); // the copy shows up at the top
    } catch (err: any) {
      setQodError(err.response?.data?.message || "Could not copy QOD quiz");
    }
  };

  const handleToggleFavoriteQod = async (quiz: QodQuizItem) => {
    setQodError("");
    try {
      await api.put(`/qod-quizzes/${quiz.id}`, { isFavorite: !quiz.isFavorite });
      setQodQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? { ...q, isFavorite: !q.isFavorite } : q)));
    } catch (err: any) {
      setQodError(err.response?.data?.message || "Could not update favorite");
    }
  };

  // Starts (or resumes) a Regular QOD session for this quiz, then jumps to the host screen.
  const [startingQodId, setStartingQodId] = useState<string | null>(null);

  const handleStartQod = async (quiz: QodQuizItem) => {
    setQodError("");
    setStartingQodId(quiz.id);
    try {
      const res = await api.post("/qod-sessions", { qodQuizId: quiz.id });
      navigate(`/qod/session/${res.data.data.id}`);
    } catch (err: any) {
      setQodError(err.response?.data?.message || "Could not start QOD session");
      setStartingQodId(null);
    }
  };

  // Opens the modal instead of deleting right away.
  const handleDeleteQod = (quiz: QodQuizItem) => setConfirmDeleteQod(quiz);

  const handleConfirmDeleteQod = async () => {
    if (!confirmDeleteQod) return;
    const quiz = confirmDeleteQod;
    setConfirmDeleteQod(null);
    setQodError("");
    try {
      await api.delete(`/qod-quizzes/${quiz.id}`);
      setQodQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
    } catch (err: any) {
      setQodError(err.response?.data?.message || "Could not delete QOD quiz");
    }
  };

  // ----- category actions -----
  const handleAddCategory = async () => {
    setCategoryError("");
    if (!newCategory.trim()) {
      setCategoryError("Enter a category name");
      return;
    }
    try {
      await addCategory(newCategory.trim());
      setNewCategory("");
    } catch (err: any) {
      setCategoryError(err.response?.data?.message || "Could not add category");
    }
  };

  const handleDeleteCategory = (id: string, name: string) => setConfirmDeleteCategory({ id, name });

  const handleConfirmDeleteCategory = async () => {
    if (!confirmDeleteCategory) return;
    const { id } = confirmDeleteCategory;
    setConfirmDeleteCategory(null);
    setCategoryError("");
    try {
      await removeCategory(id);
    } catch (err: any) {
      setCategoryError(err.response?.data?.message || "Could not delete category");
    }
  };

  const filtersActive = !!search.trim() || !!dateRange.from || sort !== DEFAULT_SORT;
  const clearFilters = () => {
    setSearch("");
    setDateRange(EMPTY_RANGE);
    setSort(DEFAULT_SORT);
  };

  // ----- search + date filter, shared by QOD / Favorite / Category tabs -----
  const q = search.trim().toLowerCase();
  const filteredQodQuizzes = qodQuizzes.filter((quiz) => {
    if (!isInRange(quiz.createdAt, dateRange)) return false;
    if (!q) return true;
    return (
      quiz.title.toLowerCase().includes(q) ||
      (quiz.topic || "").toLowerCase().includes(q) ||
      quiz.category.toLowerCase().includes(q)
    );
  });
  const visibleQodQuizzes = sortItems(filteredQodQuizzes, sort);
  const favoriteQodQuizzes = visibleQodQuizzes.filter((quiz) => quiz.isFavorite);

  // Every category (even empty ones), each with its QOD quizzes. While searching/filtering, empty ones are hidden.
  const categoryGroups = (() => {
    const known = new Set(categories.map((c) => keyOf(c.name)));

    const groups = categories.map((c) => ({
      id: c.id as string | null,
      name: c.name,
      isDefault: c.isDefault,
      total: qodQuizzes.filter((z) => keyOf(z.category) === keyOf(c.name)).length,
      items: visibleQodQuizzes.filter((z) => keyOf(z.category) === keyOf(c.name)),
    }));

    // A QOD quiz whose category isn't in the list yet is never hidden.
    visibleQodQuizzes.forEach((z) => {
      const k = keyOf(z.category);
      if (!known.has(k)) {
        known.add(k);
        groups.push({
          id: null,
          name: z.category,
          isDefault: false,
          total: qodQuizzes.filter((x) => keyOf(x.category) === k).length,
          items: visibleQodQuizzes.filter((x) => keyOf(x.category) === k),
        });
      }
    });

    return groups.filter((g) => !q || g.items.length > 0);
  })();

  const renderQodRow = (quiz: QodQuizItem, list: QodQuizItem[]) => (
    <div key={quiz.id} className="glass-card border border-brand-text/10 rounded-2xl p-5 hover:border-brand-accent">
      <div className="flex justify-between items-start gap-2">
        <button onClick={() => openPreview(quiz, list)} className="flex-1 min-w-0 text-left hover:opacity-80 transition">
          <h2 className="text-lg font-bold text-brand-text truncate">
            {quiz.isFavorite && <span className="text-brand-accent mr-1">★</span>}
            {quiz.title}
          </h2>
          {quiz.topic && <p className="text-brand-accent text-sm mt-1 truncate">{quiz.topic}</p>}
          <p className="text-slate-400 text-sm mt-1">
            {quiz._count.questions} question{quiz._count.questions !== 1 ? "s" : ""} · {quiz.category}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {formatDateTime(quiz.createdAt)}
          </p>
        </button>
        <MoreMenu
          items={[
            {
              label: startingQodId === quiz.id ? "Starting..." : "Start QOD",
              onClick: () => handleStartQod(quiz),
            },
            { label: "Edit", onClick: () => navigate(`/qod/quiz/${quiz.id}`) },
            { label: "Copy", onClick: () => handleCopyQod(quiz) },
            { label: "Rename", onClick: () => setRenameTarget(quiz) },
            {
              label: quiz.isFavorite ? "Remove favorite" : "Add to favorites",
              onClick: () => handleToggleFavoriteQod(quiz),
            },
            { label: "Delete", onClick: () => handleDeleteQod(quiz), danger: true },
          ]}
        />
      </div>
      {openLobbies[quiz.id] && (
        <Link
          to={`/qod/session/${openLobbies[quiz.id]}`}
          onClick={(e) => e.stopPropagation()}
          className="text-brand-accent text-sm hover:underline mt-2 inline-block"
        >
          Open lobby
        </Link>
      )}
    </div>
  );

  const grid = (items: QodQuizItem[]) => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => renderQodRow(item, items))}</div>
  );

  const tabClass = (active: boolean) =>
    `px-5 py-3 font-semibold border-b-2 -mb-px whitespace-nowrap transition ${
      active ? "border-brand-accent text-brand-accent" : "border-transparent text-brand-text/70 hover:text-brand-text"
    }`;

  return (
    <div>
      {/* <main> is the scroll container (see AppLayout.tsx), so sticky top-0 pins this
          block to the top of that scroll area; full-bleed background hides cards
          scrolling underneath it. */}
      <div className="sticky top-0 z-10 -mx-6 md:-mx-10 px-6 md:px-10 pb-3 pt-4 md:pt-6 bg-brand-bg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Quiz of the Day</h1>
        <input
          type="text"
          placeholder="Search QOD..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-80 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
        />
      </div>

      {/* Tabs + filters: one shared horizontally-scrollable strip on mobile (so the date
          filter / sort controls don't squeeze the tabs into too little space); back to
          the normal tabs-left / filters-right layout at md: and up, same as before. */}
      <div className="flex md:items-center md:justify-between gap-3 border-b border-brand-text/10 overflow-x-auto overflow-y-hidden">
        <div className="flex shrink-0">
          <button onClick={() => goTab("qod")} className={tabClass(tab === "qod")}>
            QOD
          </button>
          {/* Create opens the QOD editor page directly, like Quiz Session's Create tab */}
          <button onClick={() => navigate("/qod/quiz/new")} className={tabClass(false)}>
            Create
          </button>
          <button onClick={() => goTab("favorite")} className={tabClass(tab === "favorite")}>
            Favorite
          </button>
          <button onClick={() => goTab("category")} className={tabClass(tab === "category")}>
            Category
          </button>
          <button onClick={() => goTab("live")} className={tabClass(tab === "live")}>
            Live Quiz
          </button>
        </div>

        {/* Every tab except Create and Live. Sort doesn't apply to Category — it has its own grouping. */}
        {(tab === "qod" || tab === "favorite" || tab === "category") && (
          <div className="shrink-0 flex items-center gap-2 md:ml-0 pr-1">
            {tab !== "category" && <SortDropdown value={sort} onChange={setSort} />}
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            {filtersActive && (
              <button onClick={clearFilters} className="text-brand-accent text-sm hover:underline whitespace-nowrap">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
      </div>

      {qodError && (tab === "qod" || tab === "favorite" || tab === "category") && (
          <p className="text-brand-error text-sm mb-4">{qodError}</p>
        )}

        {/* QOD tab */}
      {tab === "qod" &&
        (qodLoading ? (
          <p>Loading...</p>
        ) : qodQuizzes.length === 0 ? (
          <p className="text-slate-400">No QOD quizzes yet — press Create to make your first one.</p>
        ) : visibleQodQuizzes.length === 0 ? (
          <p className="text-slate-400">No QOD quizzes match your search or date filter.</p>
        ) : (
          grid(visibleQodQuizzes)
        ))}

      {/* Favorite tab */}
      {tab === "favorite" &&
        (qodLoading ? (
          <p>Loading...</p>
        ) : favoriteQodQuizzes.length === 0 ? (
          <p className="text-slate-400">
            {q ? "No favorites match your search." : "No favorites yet — use ⋮ → Add to favorites on a QOD quiz."}
          </p>
        ) : (
          grid(favoriteQodQuizzes)
        ))}

      {/* Category tab */}
      {tab === "category" && (
        <div className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <input
              type="text"
              placeholder="New category (e.g. Science)"
              value={newCategory}
              onChange={(e) => {
                setNewCategory(e.target.value);
                if (categoryError) setCategoryError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
              }}
              className="flex-1 min-w-0 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
            />
            <button
              onClick={handleAddCategory}
              className="p-2 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-5 rounded-lg"
            >
              + Add category
            </button>
          </div>
          <p className="text-brand-error text-sm mt-2 mb-6 min-h-[1.25rem]">{categoryError}</p>

          {qodLoading || categoriesLoading ? (
            <p>Loading...</p>
          ) : categoryGroups.length === 0 ? (
            <p className="text-slate-400">No QOD quizzes match your search or date filter.</p>
          ) : (
            <div className="space-y-8">
              {categoryGroups.map((group) => (
                <div key={group.id ?? group.name}>
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-lg font-bold">
                      {group.name} <span className="text-slate-400 font-normal">({group.total})</span>
                    </h2>
                    {/* Trash icon: only for categories no QOD quiz uses locally (never Generic). The
                        server is the authority on cross-type usage, so a failed delete just shows an error. */}
                    {group.id && !group.isDefault && group.total === 0 && (
                      <button
                        onClick={() => handleDeleteCategory(group.id as string, group.name)}
                        title="Delete this unused category"
                        aria-label={`Delete category ${group.name}`}
                        className="text-brand-text/50 hover:text-red-400"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-slate-500 text-sm">No QOD quizzes in this category.</p>
                  ) : (
                    grid(group.items)
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

        {tab === "live" && (
          <div>
            {liveError && <p className="text-brand-error text-sm mb-4">{liveError}</p>}

            {liveLoading ? (
              <p>Loading...</p>
            ) : showResumeCard ? (
              <div className="surface rounded-2xl p-6 max-w-xl">
                <p className="text-slate-400 text-sm mb-1">A session is already running</p>
                <p className="text-4xl font-extrabold text-brand-accent tracking-widest mb-2">{livePin}</p>
                <p className="text-slate-400 mb-5">
                  {liveJoined} student{liveJoined !== 1 ? "s" : ""} joined · {liveAnswerCount} answer
                  {liveAnswerCount !== 1 ? "s" : ""} received
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleResume}
                    className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-3 rounded-lg"
                  >
                    Resume
                  </button>
                  <button
                    onClick={handleEndLive}
                    disabled={liveEnding}
                    className="bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white font-bold px-6 py-3 rounded-lg transition disabled:opacity-50"
                 >
                    {liveEnding ? "Ending..." : "End session"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

      {previewQuiz && (
        <QuizPreviewModal
          open
          onClose={() => setPreviewId(null)}
          quizId={previewQuiz.id}
          hasPrevCard={previewList.findIndex((q) => q.id === previewId) > 0}
          hasNextCard={previewList.findIndex((q) => q.id === previewId) < previewList.length - 1}
          onPrevCard={() => {
            const i = previewList.findIndex((q) => q.id === previewId);
            if (i > 0) openPreview(previewList[i - 1], previewList);
          }}
          onNextCard={() => {
            const i = previewList.findIndex((q) => q.id === previewId);
            if (i < previewList.length - 1) openPreview(previewList[i + 1], previewList);
          }}
          title={previewQuiz.title}
          topic={previewQuiz.topic}
          category={previewQuiz.category}
          isFavorite={previewQuiz.isFavorite}
          questionCount={previewQuiz._count.questions}
          loading={previewLoading}
          questions={previewQuestions}
          startLabel="Start QOD"
          layouts={["grid", "list"]}
          onStart={() => {
            setPreviewId(null);
            handleStartQod(previewQuiz);
          }}
          onEdit={() => navigate(`/qod/quiz/${previewQuiz.id}`)}
          onDuplicate={() => handleCopyQod(previewQuiz)}
          onToggleFavorite={() => handleToggleFavoriteQod(previewQuiz)}
          onDelete={() => handleDeleteQod(previewQuiz)}
          onRename={(newTitle) => handleRenameQod(previewQuiz, newTitle)}
          onViewReports={() => navigate(`/reports?type=qod&q=${encodeURIComponent(previewQuiz.title)}`)}
        />
      )}

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ""}
        onCancel={() => setRenameTarget(null)}
        onSave={async (newTitle) => {
          await handleRenameQod(renameTarget as QodQuizItem, newTitle);
          setRenameTarget(null);
        }}
      />

      <ConfirmModal
        open={confirmEndOpen}
        title="End session?"
        message="End this live quiz session? Students can no longer submit answers, and nothing is saved."
        confirmLabel="End session"
        onConfirm={handleConfirmEndLive}
        onCancel={() => setConfirmEndOpen(false)}
      />

      <ConfirmModal
        open={!!confirmDeleteQod}
        title="Delete QOD quiz?"
        message={`Move "${confirmDeleteQod?.title}" to Trash? You can restore it from Trash.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteQod}
        onCancel={() => setConfirmDeleteQod(null)}
      />

      <ConfirmModal
        open={!!confirmDeleteCategory}
        title="Delete category?"
        message={`Delete the category "${confirmDeleteCategory?.name}"?`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteCategory}
        onCancel={() => setConfirmDeleteCategory(null)}
      />
    </div>
  );
}