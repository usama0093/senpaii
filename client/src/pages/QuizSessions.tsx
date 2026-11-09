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

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  category: string;
  isFavorite: boolean;
  createdAt: string;
  _count: { questions: number };
}

type Tab = "quiz" | "favorite" | "category";

const keyOf = (name: string) => name.trim().toLowerCase();

export default function QuizSessions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters are seeded from the URL once, on mount, and written back to it below
  // (same pattern as Reports.tsx). If the URL is bare (no filter params at all —
  // e.g. arrived via the sidebar, or a Back button whose history was lost), fall
  // back to this section's last-known filters in sessionStorage instead of defaults.
  const isBareUrl = searchParams.toString() === "";
  const stored = isBareUrl ? loadSectionFilters("sessions") : {};

  const tabParam = searchParams.get("tab") ?? stored.tab ?? null;
  const [tab, setTab] = useState<Tab>(
    tabParam === "favorite" || tabParam === "category" ? tabParam : "quiz"
  );

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(searchParams.get("q") ?? stored.q ?? "");
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: searchParams.get("from") ?? stored.from ?? null,
    to: searchParams.get("to") ?? stored.to ?? null,
  }));
  const [sort, setSort] = useState<SortOption>(() => {
    const s = searchParams.get("sort") ?? stored.sort ?? null;
    return isSortOption(s) ? s : DEFAULT_SORT;
  });
   // Delete confirmation (replaces window.confirm — the quiz waiting to be confirmed, or null if closed)
  const [confirmQuiz, setConfirmQuiz] = useState<Quiz | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<Quiz[]>([]);
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Quiz | null>(null);

  // Category tab
  const { categories, loading: categoriesLoading, addCategory, removeCategory } = useCategories();
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
 // Delete-category confirmation (replaces window.confirm)
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const res = await api.get("/quizzes");
      setQuizzes(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load quizzes");
    } finally {
      setLoading(false);
    }
  };

  const previewQuiz = quizzes.find((q) => q.id === previewId) ?? null;

  // Auto-closes if the previewed quiz gets deleted out from under it.
  useEffect(() => {
    if (previewId && !previewQuiz) setPreviewId(null);
  }, [previewId, previewQuiz]);

  const openPreview = async (quiz: Quiz, list: Quiz[]) => {
    setPreviewId(quiz.id);
    setPreviewList(list);
    setPreviewQuestions(null);
    setPreviewLoading(true);
    try {
      const res = await api.get(`/quizzes/${quiz.id}`);
      setPreviewQuestions(
        res.data.data.questions.map((q: any) => ({
          id: q.id,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          options: q.options,
        }))
      );
    } catch (err) {
      setPreviewQuestions([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRename = async (quiz: Quiz, newTitle: string) => {
    const res = await api.put(`/quizzes/${quiz.id}`, {
      title: newTitle,
      description: quiz.description,
      topic: quiz.topic,
      category: quiz.category,
    });
    setQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? { ...q, title: res.data.data.title } : q)));
  };

  const goTab = (t: Tab) => {
    setError("");
    setCategoryError("");
    setTab(t);
  };

  // Keep the URL in sync with the filters, using replace so every keystroke doesn't
  // pile up browser-history entries — same pattern as Reports.tsx.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (tab !== "quiz") params.tab = tab;
    if (search) params.q = search;
    if (dateRange.from) params.from = dateRange.from;
    if (dateRange.to) params.to = dateRange.to;
    if (sort !== DEFAULT_SORT) params.sort = sort;
    setSearchParams(params, { replace: true });
    saveSectionFilters("sessions", params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, dateRange, sort]);

  // ----- card actions -----
  const handleStart = async (quiz: Quiz) => {
    setError("");
    try {
      const res = await api.post(`/sessions/quizzes/${quiz.id}/start`);
      navigate(`/host/lobby/${res.data.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not start the session");
    }
  };

  const handleCopy = async (quiz: Quiz) => {
    setError("");
    try {
      await api.post(`/quizzes/${quiz.id}/duplicate`);
      await fetchQuizzes(); // the copy shows up at the top
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not copy quiz");
    }
  };

  const handleFavorite = async (quiz: Quiz) => {
    setError("");
    try {
      await api.put(`/quizzes/${quiz.id}`, { isFavorite: !quiz.isFavorite });
      setQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? { ...q, isFavorite: !q.isFavorite } : q)));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not update favorite");
    }
  };

  // Opens the modal instead of deleting right away.
  const handleDelete = (quiz: Quiz) => setConfirmQuiz(quiz);

  // Runs the actual delete once the modal is confirmed.
  const handleConfirmDelete = async () => {
    if (!confirmQuiz) return;
    setError("");
    try {
      await api.delete(`/quizzes/${confirmQuiz.id}`);
      setQuizzes((prev) => prev.filter((q) => q.id !== confirmQuiz.id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete quiz");
    } finally {
      setConfirmQuiz(null);
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

  // Opens the modal instead of deleting right away.
  const handleDeleteCategory = (id: string, name: string) => setConfirmDeleteCategory({ id, name });

  // Runs the actual delete once the modal is confirmed.
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

  // ----- search + lists -----
  const q = search.trim().toLowerCase();
  const filteredQuizzes = quizzes.filter(
    (quiz) => {
      if (!isInRange(quiz.createdAt, dateRange)) return false;
      if (!q) return true;
      return (
        quiz.title.toLowerCase().includes(q) ||
        (quiz.topic || "").toLowerCase().includes(q) ||
        quiz.category.toLowerCase().includes(q)
      )
  });
  const visible = sortItems(filteredQuizzes, sort);
  const favorites = visible.filter((quiz) => quiz.isFavorite);

  // Every category (even empty ones), each with its quizzes. While searching, empty ones are hidden.
  const categoryGroups = (() => {
    const known = new Set(categories.map((c) => keyOf(c.name)));

    const groups = categories.map((c) => ({
      id: c.id as string | null,
      name: c.name,
      isDefault: c.isDefault,
      total: quizzes.filter((z) => keyOf(z.category) === keyOf(c.name)).length,
      items: visible.filter((z) => keyOf(z.category) === keyOf(c.name)),
    }));

    // A quiz whose category isn't in the list yet is never hidden.
    visible.forEach((z) => {
      const k = keyOf(z.category);
      if (!known.has(k)) {
        known.add(k);
        groups.push({
          id: null,
          name: z.category,
          isDefault: false,
          total: quizzes.filter((x) => keyOf(x.category) === k).length,
          items: visible.filter((x) => keyOf(x.category) === k),
        });
      }
    });

    return groups.filter((g) => !q || g.items.length > 0);
  })();

  const renderCard = (quiz: Quiz, list: Quiz[]) => (
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
            { label: "Start Session", onClick: () => handleStart(quiz) },
            { label: "Edit", onClick: () => navigate(`/quiz/${quiz.id}`) },
            { label: "Copy", onClick: () => handleCopy(quiz) },
            { label: "Rename", onClick: () => setRenameTarget(quiz) },
            {
              label: quiz.isFavorite ? "Remove favorite" : "Add to favorites",
              onClick: () => handleFavorite(quiz),
            },
            { label: "Delete", onClick: () => handleDelete(quiz), danger: true },
          ]}
        />
      </div>
    </div>
  );

  const grid = (items: Quiz[]) => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => renderCard(item, items))}</div>
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
      <div className="sticky top-0 z-10 -mx-6 md:-mx-10 px-6 md:px-10 pt-4 md:pt-6 pb-3 bg-brand-bg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold">Quiz Session</h1>
          <input
            type="text"
            placeholder="Search quizzes..."
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
          <button onClick={() => goTab("quiz")} className={tabClass(tab === "quiz")}>
            Quiz
          </button>
          {/* Create opens the quiz editor page directly */}
          <button onClick={() => navigate("/quiz/new")} className={tabClass(false)}>
            Create
          </button>
          <button onClick={() => goTab("favorite")} className={tabClass(tab === "favorite")}>
            Favorite
          </button>
          <button onClick={() => goTab("category")} className={tabClass(tab === "category")}>
            Category
          </button>
          <button
            disabled
            title="Coming soon"
            className="px-5 py-3 font-semibold border-b-2 border-transparent -mb-px whitespace-nowrap text-brand-text/30 cursor-not-allowed"
          >
            Coming soon
          </button>
        </div>

          {/* Every tab except Create and Live. Sort doesn't apply to Category — it has its own grouping. */}
          {(tab === "quiz" || tab === "favorite" || tab === "category") && (
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
      {/* Everything below this point scrolls on its own; the block above never moves. */}
        {error && <p className="text-brand-error text-sm mb-4">{error}</p>}

        {/* Quiz tab */}
        {tab === "quiz" &&
          (loading ? (
            <p>Loading...</p>
          ) : quizzes.length === 0 ? (
            <p className="text-slate-400">No quizzes yet — press Create to make your first one.</p>
          ) : visible.length === 0 ? (
            <p className="text-slate-400">No quizzes match your search.</p>
          ) : (
            grid(visible)
          ))}

        {/* Favorite tab */}
        {tab === "favorite" &&
          (loading ? (
            <p>Loading...</p>
          ) : favorites.length === 0 ? (
            <p className="text-slate-400">
              {q ? "No favorites match your search." : "No favorites yet — use ⋮ → Add to favorites on a quiz."}
            </p>
          ) : (
            grid(favorites)
          ))}

        {/* Category tab */}
        {tab === "category" && (
          <div className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
              <input
                type="text"
                placeholder="New category (e.g. Intelligence)"
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

            {loading || categoriesLoading ? (
              <p>Loading...</p>
            ) : categoryGroups.length === 0 ? (
              <p className="text-slate-400">No quizzes match your search.</p>
            ) : (
              <div className="space-y-8">
                {categoryGroups.map((group) => (
                  <div key={group.id ?? group.name}>
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-lg font-bold">
                        {group.name} <span className="text-slate-400 font-normal">({group.total})</span>
                      </h2>
                      {/* Trash icon: only for categories no quiz uses (never Generic) */}
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
                      <p className="text-slate-500 text-sm">No quizzes in this category.</p>
                    ) : (
                      grid(group.items)
                    )}
                  </div>
                ))}
              </div>
            )}
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
          onStart={() => handleStart(previewQuiz)}
          onEdit={() => navigate(`/quiz/${previewQuiz.id}`)}
          onDuplicate={() => handleCopy(previewQuiz)}
          onToggleFavorite={() => handleFavorite(previewQuiz)}
          onDelete={() => handleDelete(previewQuiz)}
          onRename={(newTitle) => handleRename(previewQuiz, newTitle)}
          // Grounded in QodReportDetail.tsx's own fallback ("/reports?type=qod"),
          // which confirms Reports.tsx supports a `type` param. The `q` param
          // follows the same search-filter convention Trash.tsx/this page already
          // use. Unverified against Reports.tsx itself — confirm this filters
          // correctly, or send that file to lock the param names down exactly.
          onViewReports={() => navigate(`/reports?type=quiz&q=${encodeURIComponent(previewQuiz.title)}`)}
        />
      )}

      <RenameModal
        open={!!renameTarget}
        initialValue={renameTarget?.title ?? ""}
        onCancel={() => setRenameTarget(null)}
        onSave={async (newTitle) => {
          await handleRename(renameTarget as Quiz, newTitle);
          setRenameTarget(null);
        }}
      />

      <ConfirmModal
        open={!!confirmQuiz}
        title="Delete quiz?"
        message={`Move "${confirmQuiz?.title}" to Trash? You can restore it from Trash. Its past reports stay in Reports.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmQuiz(null)}
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