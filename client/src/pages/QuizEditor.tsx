import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import api from "../api/axios";
import MoreMenu from "../components/MoreMenu";
import CategoryPicker from "../components/CategoryPicker";
import { useCategories } from "../hooks/useCategories";
import { formatDateTime } from "../utils/formatDate";
import ConfirmModal from "../components/ConfirmModal";
import RichTextEditor, { isRichTextEmpty } from "../components/RichTextEditor";
import RichText from "../components/RichText";
import EditorHeader from "../components/EditorHeader";

type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE";

interface Option {
  id?: string;
  text: string;
  isCorrect: boolean;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  timeLimit: number;
  points: number;
  options: Option[];
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  category: string;
  questions: Question[];
}

interface SessionItem {
  id: string;
  gamePin: string;
  status: "WAITING" | "ACTIVE" | "ENDED";
  createdAt: string;
  _count: { participants: number };
}

// What the page shows for a brand-new quiz that hasn't been saved yet.
const blankQuiz: Quiz = { id: "", title: "", description: null, topic: null, category: "Generic", questions: [] };

const TIME_OPTIONS = [20, 30, 45, 60, 90, 120];
const MAX_QUESTION_LENGTH = 234; // prevents long questions overlapping the Senpaii heading on the intro screen
const POINT_OPTIONS = [
  { label: "Standard (1000)", value: 1000 },
  { label: "Double (2000)", value: 2000 },
];

// If a question already has a value outside the lists (like 21s), keep it as an extra choice.
const timeChoices = (current: number) =>
  TIME_OPTIONS.includes(current) ? TIME_OPTIONS : [...TIME_OPTIONS, current].sort((a, b) => a - b);
const pointChoices = (current: number) =>
  POINT_OPTIONS.some((p) => p.value === current)
    ? POINT_OPTIONS
    : [...POINT_OPTIONS, { label: `${current} (current)`, value: current }];

const selectClass =
  "w-full bg-slate-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-accent";

const emptyMCOptions = (): Option[] => [
  { text: "", isCorrect: true },
  { text: "", isCorrect: false },
  { text: "", isCorrect: false },
  { text: "", isCorrect: false },
];

const trueFalseOptions = (correctIsTrue: boolean): Option[] => [
  { text: "True", isCorrect: correctIsTrue },
  { text: "False", isCorrect: !correctIsTrue },
];

const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-700"];

const optionBorderColors = [ "border-red-600", "border-blue-600", "border-amber-600", "border-emerald-700"];

// Shared options rendering for both the click-to-open modal and the hover overlay.
function OptionsPreviewList({ question, compact }: { question: Question; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1.5 mt-2" : "space-y-2 mt-4"}>
      {question.options.map((o, idx) => (
        <div
          key={idx}
          className={` rounded-lg flex items-center gap-3 px-3 ${
            compact ? "py-1.5" : "py-2"
          } ${o.isCorrect ? ` border-2 ${optionBorderColors[idx]}` : ""}`}
        >
          <RichText html={o.text} className={`flex-1 text-white font-semibold ${compact ? "text-sm" : "text-lg"}`} />
          {o.isCorrect && (
            <span className="shrink-0 bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
              ✓ Correct
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Centered modal: full question + all options + which one is correct. Portal-rendered
// to document.body so it's never clipped by a blurred/overflow-hidden card (design system rule).
function QuestionPreviewModal({ question, onClose }: { question: Question; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-black border-2 border-brand-accent rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-3 mb-2">
          <RichText html={question.text} className="text-xl font-bold text-white" />
          <button onClick={onClose} className="text-neutral-500 hover:text-white shrink-0 text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-neutral-400 text-sm">
          {question.type === "TRUE_FALSE" ? "True/False" : "Multiple Choice"} · {question.timeLimit}s · {question.points} pts
        </p>
        <OptionsPreviewList question={question} />
      </div>
    </div>,
    document.body
  );
}

export default function QuizEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { quizId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Entering via a quiz card (normal case): navigate(-1) correctly restores the
  // list's previous view (filters/search persist in the URL already, per the
  // locked Quiz Session/QOD pattern). Entering via Leave/End Session: those now
  // tag their navigation with fromHostLobby and use replace, but Back still needs
  // to skip past that entry deliberately rather than trust -1, since an older
  // history entry could still be the lobby depending on how they got there.
  const handleBack = () => {
    if ((location.state as { fromHostLobby?: boolean } | null)?.fromHostLobby) {
      navigate("/sessions");
    } else {
      navigate(-1);
    }
  };

  // /quiz/new = a quiz that is only saved once you press Create quiz or add its first question.
  const isNew = quizId === "new";

  const [quiz, setQuiz] = useState<Quiz | null>(isNew ? blankQuiz : null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(!isNew);

  const { categories, refresh: refreshCategories, addCategory, removeCategory } = useCategories();

  // Quiz details (title + topic + category)
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsDescription, setDetailsDescription] = useState("");
  const [detailsTopic, setDetailsTopic] = useState("");
  const [detailsCategory, setDetailsCategory] = useState("Generic");
  const [detailsMsg, setDetailsMsg] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // Question form
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("MULTIPLE_CHOICE");
  const [text, setText] = useState("");
  const [timeLimit, setTimeLimit] = useState(20);
  const [points, setPoints] = useState(1000);
  const [options, setOptions] = useState<Option[]>(emptyMCOptions());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Question list actions + bulk edit
  const [listError, setListError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rangeFrom, setRangeFrom] = useState("1");
  const [rangeTo, setRangeTo] = useState("1");
  const [bulkTime, setBulkTime] = useState("");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [applying, setApplying] = useState(false);

  // Display-only sort: never touches the saved order (see handleDragEnd), so a live
  // game's question order is never affected by this toggle.
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Question preview (click opens the modal; hovering shows the floating overlay)
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  // const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Delete confirmations (replace window.confirm)
  const [confirmDeleteQuestionId, setConfirmDeleteQuestionId] = useState<string | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<SessionItem | null>(null);

  useEffect(() => {
    if (isNew) {
      setQuiz(blankQuiz);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchQuiz();
    fetchSessions();
  }, [quizId]);

  const fetchQuiz = async () => {
    const res = await api.get(`/quizzes/${quizId}`);
    setQuiz(res.data.data);
    setDetailsTitle(res.data.data.title);
    setDetailsDescription(res.data.data.description || "");
    setDetailsTopic(res.data.data.topic || "");
    setDetailsCategory(res.data.data.category || "Generic");
    setLoading(false);
  };

  // Reloads only the questions, so unsaved text in the details box isn't lost.
  const refreshQuestions = async () => {
    const res = await api.get(`/quizzes/${quizId}`);
    setQuiz((prev) => (prev ? { ...prev, questions: res.data.data.questions } : prev));
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get(`/sessions/quizzes/${quizId}`);
      setSessions(res.data.data);
    } catch (err) {
      console.error("Could not load sessions:", err);
    }
  };

  // Saves a brand-new quiz from the details box and returns its id.
  const createQuizFromDetails = async (): Promise<string> => {
    const res = await api.post("/quizzes", {
      title: detailsTitle.trim(),
      description: isRichTextEmpty(detailsDescription) ? null : detailsDescription,
      topic: detailsTopic.trim(),
      category: detailsCategory.trim(),
    });
    return res.data.data.id;
  };

  const handleSaveDetails = async () => {
    setDetailsMsg("");
    setDetailsError("");
    if (!detailsTitle.trim()) {
      setDetailsError("Quiz title is required");
      return;
    }
    setSavingDetails(true);
    try {
      if (isNew) {
        const id = await createQuizFromDetails();
        navigate(`/quiz/${id}`, { replace: true }); // now it's a normal saved quiz
        return;
      }

      const res = await api.put(`/quizzes/${quizId}`, {
        title: detailsTitle.trim(),
        description: isRichTextEmpty(detailsDescription) ? null : detailsDescription,
        topic: detailsTopic.trim(),
        category: detailsCategory.trim(),
      });
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              title: res.data.data.title,
              description: res.data.data.description,
              topic: res.data.data.topic,
              category: res.data.data.category,
            }
          : prev
      );
      setDetailsCategory(res.data.data.category);
      setDetailsMsg("Saved");
      refreshCategories(); // so the unused/used state of categories is up to date
    } catch (err: any) {
      setDetailsError(err.response?.data?.message || "Could not save details");
    } finally {
      setSavingDetails(false);
    }
  };

  const resetForm = () => {
    setEditingQuestionId(null);
    setQuestionType("MULTIPLE_CHOICE");
    setText("");
    setTimeLimit(20);
    setPoints(1000);
    setOptions(emptyMCOptions());
    setError("");
  };

  const handleTypeChange = (type: QuestionType) => {
    setQuestionType(type);
    setOptions(type === "TRUE_FALSE" ? trueFalseOptions(true) : emptyMCOptions());
  };

  const updateOptionText = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, text: value } : o)));
  };

  const setCorrectOption = (index: number) => {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === index })));
  };

  const startEditing = (q: Question) => {
    setEditingQuestionId(q.id);
    setQuestionType(q.type);
    setText(q.text);
    setTimeLimit(q.timeLimit);
    setPoints(q.points);
    setOptions(q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setError("");

    if (isRichTextEmpty(text)) return setError("Question text is required");
    if (questionType === "MULTIPLE_CHOICE" && options.some((o) => isRichTextEmpty(o.text))) {
      return setError("All 4 options must be filled in");
    }
    if (isNew && !detailsTitle.trim()) {
      setDetailsError("Quiz title is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return setError("Enter a quiz title in Quiz details first");
    }

    setSaving(true);
    let createdQuizId: string | null = null;
    try {
      // A brand-new quiz is saved now, together with its first question.
      let activeQuizId = quizId as string;
      if (isNew) {
        activeQuizId = await createQuizFromDetails();
        createdQuizId = activeQuizId;
      }

      if (editingQuestionId) {
        const res = await api.put(`/quizzes/${activeQuizId}/questions/${editingQuestionId}`, {
          text: text.trim(),
          timeLimit,
          points,
          options,
        });
        const updated: Question = res.data.data;
        setQuiz((prev) =>
          prev
            ? { ...prev, questions: prev.questions.map((q) => (q.id === editingQuestionId ? updated : q)) }
            : prev
        );
        // An edited, already-played question gets a new id — keep its checkbox selection.
        setSelectedIds((prev) => prev.map((id) => (id === editingQuestionId ? updated.id : id)));
      } else {
        const res = await api.post(`/quizzes/${activeQuizId}/questions`, {
          text: text.trim(),
          timeLimit,
          points,
          type: questionType,
          options,
        });
        if (isNew) {
          resetForm();
          navigate(`/quiz/${activeQuizId}`, { replace: true }); // the page reloads with the saved quiz
          return;
        }
        setQuiz((prev) => (prev ? { ...prev, questions: [...prev.questions, res.data.data] } : prev));
      }
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not save question");
      // If the quiz itself was already created, move to it so it isn't created twice.
      if (createdQuizId) navigate(`/quiz/${createdQuizId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  // Opens the modal instead of deleting right away.
  const handleDeleteQuestion = (questionId: string) => setConfirmDeleteQuestionId(questionId);

  // Runs the actual delete once the modal is confirmed.
  const handleConfirmDeleteQuestion = async () => {
    if (!confirmDeleteQuestionId) return;
    const questionId = confirmDeleteQuestionId;
    setConfirmDeleteQuestionId(null);
    setListError("");
    try {
      await api.delete(`/quizzes/${quizId}/questions/${questionId}`);
      setQuiz((prev) => (prev ? { ...prev, questions: prev.questions.filter((q) => q.id !== questionId) } : prev));
      setSelectedIds((prev) => prev.filter((id) => id !== questionId));
      if (editingQuestionId === questionId) resetForm();
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not delete question");
    }
  };

  const handleDuplicateQuestion = async (questionId: string) => {
    setListError("");
    try {
      await api.post(`/quizzes/${quizId}/questions/${questionId}/duplicate`);
      await refreshQuestions(); // the copy appears right after the original
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not duplicate question");
    }
  };

  // Drag-and-drop reorder (same endpoint as the old ▲▼ buttons). Only reachable when
  // sortDirection === "asc" (the real stored order is being shown) — see isDragDisabled below.
  const handleDragEnd = async (result: DropResult) => {
    if (!quiz || !result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const reordered = Array.from(quiz.questions);
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    setQuiz({ ...quiz, questions: reordered }); // show the new order immediately
    setListError("");

    try {
      await api.put(`/quizzes/${quizId}/questions/reorder`, { orderedIds: reordered.map((q) => q.id) });
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not save the new order");
      await refreshQuestions(); // go back to what the server has
    }
  };

  // ----- bulk edit -----
  const toggleSelected = (id: string) => {
    setBulkMsg("");
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    setBulkMsg("");
    setSelectedIds(quiz ? quiz.questions.map((q) => q.id) : []);
  };

  const handleSelectRange = () => {
    if (!quiz) return;
    setBulkMsg("");
    const a = Number(rangeFrom);
    const b = Number(rangeTo);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    setSelectedIds(quiz.questions.slice(from - 1, to).map((q) => q.id));
  };

  const handleApplyBulk = async () => {
    setListError("");
    setBulkMsg("");
    if (selectedIds.length === 0) return setListError("Select at least one question first");
    if (!bulkTime && !bulkPoints) return setListError("Choose a time limit or points to apply");

    const payload: { questionIds: string[]; timeLimit?: number; points?: number } = { questionIds: selectedIds };
    if (bulkTime) payload.timeLimit = Number(bulkTime);
    if (bulkPoints) payload.points = Number(bulkPoints);

    setApplying(true);
    try {
      await api.put(`/quizzes/${quizId}/questions/bulk`, payload);
      setQuiz((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((q) =>
                selectedIds.includes(q.id)
                  ? {
                      ...q,
                      ...(payload.timeLimit !== undefined && { timeLimit: payload.timeLimit }),
                      ...(payload.points !== undefined && { points: payload.points }),
                    }
                  : q
              ),
            }
          : prev
      );
      setBulkMsg(`Updated ${selectedIds.length} question${selectedIds.length !== 1 ? "s" : ""}`);
      setBulkTime("");
      setBulkPoints("");
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not apply changes");
    } finally {
      setApplying(false);
    }
  };

  const handleStartSession = async () => {
    try {
      const res = await api.post(`/sessions/quizzes/${quizId}/start`);
      navigate(`/host/lobby/${res.data.data.id}`);
    } catch (err: any) {
      console.error("Start session failed:", err);
      setError(err.response?.data?.message || err.message || "Could not start session");
    }
  };

  // Opens the modal instead of deleting right away.
  const handleDeleteSession = (s: SessionItem) => setConfirmDeleteSession(s);

  // Runs the actual delete once the modal is confirmed.
  const handleConfirmDeleteSession = async () => {
    if (!confirmDeleteSession) return;
    const sessionId = confirmDeleteSession.id;
    setConfirmDeleteSession(null);
    try {
      await api.delete(`/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete session");
    }
  };

  const sessionMenuItems = (s: SessionItem) => [
    // A report exists only once the game has ended.
    ...(s.status === "ENDED" ? [{ label: "View Report", onClick: () => navigate(`/reports/${s.id}`) }] : []),
    { label: "Delete", onClick: () => handleDeleteSession(s), danger: true },
  ];

  // Duplicate / Edit / Delete, grouped under the ⋮ menu.
  const questionMenuItems = (q: Question) => [
    { label: "Duplicate", onClick: () => handleDuplicateQuestion(q.id) },
    { label: "Edit", onClick: () => startEditing(q) },
    { label: "Delete", onClick: () => handleDeleteQuestion(q.id), danger: true },
  ];

  if (loading || !quiz) {
    return <div className="min-h-screen bg-brand-bg text-brand-text p-8">Loading...</div>;
  }

  const questionNumbers = quiz.questions.map((_, i) => i + 1);

  // A question's real position in the quiz (unaffected by the display-only sort toggle).
  const trueNumberOf = (id: string) => quiz.questions.findIndex((q) => q.id === id) + 1;

  // What's actually rendered: natural order ascending, reversed for descending.
  // This never touches quiz.questions itself, so play order is never affected.
  const displayedQuestions = sortDirection === "desc" ? [...quiz.questions].slice().reverse() : quiz.questions;

  const bulkEditPanel = quiz.questions.length > 0 && (
    <div className="glass-card border border-brand-text/10 rounded-xl p-4">
      <h3 className="font-bold mb-3">Apply to multiple questions</h3>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <button
          onClick={handleSelectAll}
          className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-sm px-3 py-2 rounded-lg"
        >
          Select all
        </button>
        <button
          onClick={() => {
            setSelectedIds([]);
            setBulkMsg("");
          }}
          className="bg-slate-800 hover:bg-slate-700 border border-white/10 text-sm px-3 py-2 rounded-lg"
        >
          Clear
        </button>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">From question</label>
            <select
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="bg-slate-800 rounded-lg px-2 py-2 outline-none"
            >
              {questionNumbers.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">To</label>
            <select
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="bg-slate-800 rounded-lg px-2 py-2 outline-none"
            >
              {questionNumbers.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSelectRange}
            className="bg-slate-800 hover:bg-slate-700 border border-white/10 text-sm px-3 py-2 rounded-lg"
          >
            Select range
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-400 mb-3">
        {selectedIds.length} selected — or tick questions in the list below.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-sm text-slate-400 block mb-1">Time limit</label>
          <select value={bulkTime} onChange={(e) => setBulkTime(e.target.value)} className={selectClass}>
            <option value="">Keep current</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t} seconds
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-slate-400 block mb-1">Points</label>
          <select value={bulkPoints} onChange={(e) => setBulkPoints(e.target.value)} className={selectClass}>
            <option value="">Keep current</option>
            {POINT_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleApplyBulk}
          disabled={applying || selectedIds.length === 0 || (!bulkTime && !bulkPoints)}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-5 py-2 rounded-lg disabled:opacity-40"
        >
          {applying ? "Applying..." : "Apply to selected"}
        </button>
        {bulkMsg && <span className="text-green-400 text-sm">{bulkMsg}</span>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <EditorHeader />
      <div className="px-6 md:px-10 pb-6 md:pb-10 pt-20 md:pt-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button
            onClick={handleBack}
            className="leave-chip border border-brand-text/10 text-base font-bold mb-1 -ml-3 px-3 py-1.5 rounded-lg transition"
          >
            ← Back
          </button>
          <h1 onClick={() => inputRef.current?.focus()} 
          className="text-2xl font-bold text-brand-accent cursor-pointer">{isNew ? "New quiz" : quiz.title}</h1>
          {!isNew && quiz.topic && <p className="text-slate-400 text-sm">{quiz.topic}</p>}
        </div>
        <button
          onClick={handleStartSession}
          disabled={isNew || quiz.questions.length === 0}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-3 rounded-lg disabled:opacity-40"
        >
          ▶ Start Session
        </button>
      </div>

      <div className="glass-card border border-brand-text/10 rounded-2xl p-5 mb-8">
        <h2 className="text-lg font-bold mb-3">Quiz details</h2>
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Title</label>
            <input
              type="text"
              ref={inputRef}
              placeholder={isNew ? "Enter Quiz Title" : ""}
              value={detailsTitle}
              onChange={(e) => {
                setDetailsTitle(e.target.value);
                setDetailsMsg("");
                setDetailsError("");
              }}
              className="w-full bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
            />
            {detailsError && <span className="text-brand-error text-sm">{detailsError}</span>}
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Topic (optional)</label>
            <input
              type="text"
              placeholder={isNew ? "Enter Quiz Topic" : ""}
              value={detailsTopic}
              onChange={(e) => {
                setDetailsTopic(e.target.value);
                setDetailsMsg("");
                setDetailsError("");
              }}
              className="w-full bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-1">Category</label>
            <CategoryPicker
              value={detailsCategory}
              onChange={(name) => {
                setDetailsCategory(name);
                setDetailsMsg("");
                setDetailsError("");
              }}
              categories={categories}
              onAdd={addCategory}
              onRemove={removeCategory}
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-sm text-slate-400 block mb-1">Description (optional)</label>
          <RichTextEditor
            value={detailsDescription}
            placeholder="What is this Quiz Session about?"
            onChange={(html) => {
              setDetailsDescription(html);
              setDetailsMsg("");
              setDetailsError("");
            }}
            showToolbar={false}
            minHeightClassName="min-h-[52px]"
          />
        </div>


        <div className="flex items-center gap-4">
          <button
            onClick={handleSaveDetails}
            disabled={savingDetails}
            className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {savingDetails ? "Saving..." : isNew ? "Create quiz" : "Save details"}
          </button>
          {isNew && <span className="text-slate-500 text-sm">Not saved yet — add a question or press Create quiz.</span>}
          {detailsMsg && <span className="text-green-400 text-sm">{detailsMsg}</span>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left column: created questions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Questions ({quiz.questions.length})</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSortDirection("asc")}
                title="Ascending (original order) — drag-and-drop reorder works in this view"
                className={`p-1.5 rounded-lg border ${
                  sortDirection === "asc"
                    ? "border-brand-accent text-brand-accent bg-brand-accent/10"
                    : "border-brand-text/10 text-slate-400 hover:text-brand-text"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => setSortDirection("desc")}
                title="Descending (newest first) — view only, doesn't change play order"
                className={`p-1.5 rounded-lg border ${
                  sortDirection === "desc"
                    ? "border-brand-accent text-brand-accent bg-brand-accent/10"
                    : "border-brand-text/10 text-slate-400 hover:text-brand-text"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {quiz.questions.length === 0 && <p className="text-slate-400">No questions yet — add your first one →</p>}
          {listError && <p className="text-brand-error text-sm mb-3">{listError}</p>}

          {/* <div className="max-h-[86rem] overflow-y-auto no-scrollbar pr-1"> */}
        <div className="max-h-[79rem] overflow-y-auto no-scrollbar pr-1">       
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="questions">
              {(droppableProvided) => (
                <div
                  className="space-y-3"
                  ref={droppableProvided.innerRef}
                  {...droppableProvided.droppableProps}
                >
                  {displayedQuestions.map((q, i) => (
                    <Draggable key={q.id} draggableId={q.id} index={i} isDragDisabled={sortDirection !== "asc"}>
                      {(draggableProvided, snapshot) => (
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          onClick={() => setPreviewQuestion(q)}
                          className={`relative glass-card border rounded-xl p-4 cursor-pointer ${
                            editingQuestionId === q.id ? "border-brand-accent" : "border-white/10"
                          } ${snapshot.isDragging ? "ring-2 ring-brand-accent" : ""}`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              {/* Drag handle: grayed out and inert while the descending
                                  (view-only) sort is active, since reordering a reversed
                                  view must never silently rewrite the real play order. */}
                              <span
                                {...draggableProvided.dragHandleProps}
                                onClick={(e) => e.stopPropagation()}
                                title={sortDirection === "asc" ? "Drag to reorder" : "Switch to ascending to reorder"}
                                className={`mt-1.5 shrink-0 ${
                                  sortDirection === "asc"
                                    ? "text-slate-500 hover:text-brand-text cursor-grab active:cursor-grabbing"
                                    : "text-slate-700 cursor-not-allowed"
                                }`}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="9" cy="6" r="1.5" />
                                  <circle cx="15" cy="6" r="1.5" />
                                  <circle cx="9" cy="12" r="1.5" />
                                  <circle cx="15" cy="12" r="1.5" />
                                  <circle cx="9" cy="18" r="1.5" />
                                  <circle cx="15" cy="18" r="1.5" />
                                </svg>
                              </span>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(q.id)}
                                onChange={() => toggleSelected(q.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 mt-1.5 shrink-0"
                                title="Select for bulk edit"
                              />
                              <div className="min-w-0 flex items-start gap-1">
                                <span className="font-medium shrink-0">{trueNumberOf(q.id)}.</span>
                                <RichText html={q.text} className="font-medium min-w-0" />
                              </div>
                            </div>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <MoreMenu items={questionMenuItems(q)} />
                            </div>
                          </div>
                          <p className="text-slate-400 text-sm mt-1 ml-12">
                            {q.type === "TRUE_FALSE" ? "True/False" : "Multiple Choice"} · {q.timeLimit}s · {q.points} pts
                          </p>

                          {/* Hover preview: floating overlay, doesn't shift any layout */}
                          {/* {hoveredId === q.id && !snapshot.isDragging && (
                            <div className="absolute left-0 right-0 top-full mt-2 z-30 glass-card border border-brand-accent rounded-xl p-3 shadow-2xl">
                              <OptionsPreviewList question={q} compact />
                            </div>
                          )} */}

                        </div>
                      )}
                    </Draggable>
                  ))}
                  {droppableProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          </div>

          <ConfirmModal
            open={!!confirmDeleteQuestionId}
            title="Delete question?"
            message="Delete this question? Past game reports won't change."
            confirmLabel="Delete"
            onConfirm={handleConfirmDeleteQuestion}
            onCancel={() => setConfirmDeleteQuestionId(null)}
          />
        </div>

        {/* Right column: add-a-question form, then bulk-edit, then session records */}
        <div className="space-y-8 self-start">
          <div className="glass-card border border-brand-text/10 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editingQuestionId ? "Edit Question" : "Add a Question"}</h2>
              {editingQuestionId && (
                <button onClick={resetForm} className="text-slate-400 text-sm hover:underline">
                  Cancel edit
                </button>
              )}
            </div>

            {!editingQuestionId && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleTypeChange("MULTIPLE_CHOICE")}
                  className={`flex-1 py-2 rounded-lg font-medium ${
                    questionType === "MULTIPLE_CHOICE" ? "bg-brand-accent text-black" : "bg-slate-800 text-brand-text"
                  }`}
                >
                  Multiple Choice
                </button>
                <button
                  onClick={() => handleTypeChange("TRUE_FALSE")}
                  className={`flex-1 py-2 rounded-lg font-medium ${
                    questionType === "TRUE_FALSE" ? "bg-brand-accent text-black" : "bg-slate-800 text-brand-text"
                  }`}
                >
                  True / False
                </button>
              </div>
            )}

            <div className="mb-3">
              <RichTextEditor
                value={text}
                onChange={setText}
                placeholder="Question text"
                characterLimit={MAX_QUESTION_LENGTH}
                contentClassName="text-lg"
              />
            </div>

            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-sm text-slate-400 block mb-1">Time limit</label>
                <select
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                  className={selectClass}
                >
                  {timeChoices(timeLimit).map((t) => (
                    <option key={t} value={t}>
                      {t} seconds
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm text-slate-400 block mb-1">Points</label>
                <select value={points} onChange={(e) => setPoints(Number(e.target.value))} className={selectClass}>
                  {pointChoices(points).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {options.map((option, index) => (
                <div key={index} onClick={() => setCorrectOption(index)} className={`${optionColors[index]} rounded-lg flex items-center gap-3 px-2 py-1 cursor-text`}>
                  <input
                    type="radio"
                    checked={option.isCorrect}
                    onChange={() => setCorrectOption(index)}
                    className="ml-3 w-6 h-6 shrink-0 cursor-pointer"
                    title="Mark as correct answer"
                  />
                  {questionType === "TRUE_FALSE" ? (
                    <span className="flex-1 text-white font-semibold py-2 text-xl">{option.text}</span>
                  ) : (
                    <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                      <RichTextEditor
                        value={option.text}
                        onChange={(html) => updateOptionText(index, html)}
                        showToolbar={false}
                        wrapperClassName=""
                        paddingClassName="py-2 pr-3"
                        minHeightClassName="min-h-0"
                        contentClassName="text-white font-bold text-lg"
                      />
                    </div>
                  )}
                </div>   
              ))}
            </div>

            {error && <p className="text-brand-error text-sm mb-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingQuestionId ? "Update Question" : "Add Question"}
            </button>
          </div>

          {bulkEditPanel}

          {!isNew && (
            <div>
              <h2 className="text-lg font-bold mb-3">Sessions ({sessions.length})</h2>
              {sessions.length === 0 && <p className="text-slate-400">No sessions yet — press Start Session.</p>}
              <div className="max-h-[20rem] overflow-y-auto no-scrollbar pr-1 space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="glass-card border border-brand-text/10 rounded-xl p-4 flex justify-between items-center gap-3"
                  >
                    <div>
                      {s.status !== "ENDED" && (
                        <p className="font-medium">
                          PIN <span className="text-brand-accent tracking-widest">{s.gamePin}</span>
                        </p>
                      )}
                      <p className="text-slate-400 text-sm">
                        {s.status} · {s._count.participants} player{s._count.participants !== 1 ? "s" : ""} ·{" "}
                        {formatDateTime(s.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {(s.status === "WAITING" || s.status === "ACTIVE") && (
                        <Link to={`/host/lobby/${s.id}`} className="text-brand-accent text-sm hover:underline">
                          Open lobby
                        </Link>
                      )}
                      <MoreMenu items={sessionMenuItems(s)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {previewQuestion && (
        <QuestionPreviewModal question={previewQuestion} onClose={() => setPreviewQuestion(null)} />
      )}

      <ConfirmModal
        open={!!confirmDeleteSession}
        title="Delete game?"
        message="Delete this game? A finished game (a report) moves to Trash so you can restore it. A game that never finished is deleted completely."
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteSession}
        onCancel={() => setConfirmDeleteSession(null)}
      />
      </div>
    </div>
  );
}
