import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import api from "../api/axios";
import MoreMenu from "../components/MoreMenu";
import CategoryPicker from "../components/CategoryPicker";
import ConfirmModal from "../components/ConfirmModal";
import { useCategories } from "../hooks/useCategories";
import RichTextEditor, { isRichTextEmpty } from "../components/RichTextEditor";
import RichText from "../components/RichText";
import EditorHeader from "../components/EditorHeader";

interface QodQuestion {
  id: string;
  text: string;
  timeLimit: number | null;
}

interface QodQuiz {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  category: string;
  questions: QodQuestion[];
}

const blankQodQuiz: QodQuiz = { id: "", title: "", description: null, topic: null, category: "Generic", questions: [] };

// Centered modal: the full question text. Portal-rendered to document.body so it's
// never clipped by a blurred/overflow-hidden card (design system rule) — same
// styling as QuizEditor's canonical preview modal. QOD questions have no options or
// correct answer to show here, since they're free-typed responses, not multiple
// choice — this is purely for reading a long question in full.
function QuestionPreviewModal({ question, onClose }: { question: QodQuestion; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-black border-2 border-brand-accent rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-3">
          <RichText html={question.text} className="text-xl font-bold text-white" />
          <button onClick={onClose} className="text-neutral-500 hover:text-white shrink-0 text-xl leading-none">
            ✕
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function QodQuizEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { qodQuizId } = useParams();
  const navigate = useNavigate();

  // /qod/quiz/new = a QOD quiz that is only saved once you press Create quiz or add its first question.
  const isNew = qodQuizId === "new";

  const [qodQuiz, setQodQuiz] = useState<QodQuiz | null>(isNew ? blankQodQuiz : null);
  const [loading, setLoading] = useState(!isNew);

  const { categories, refresh: refreshCategories, addCategory, removeCategory } = useCategories("/qod-quizzes");

  // Quiz details (title + description + topic + category)
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsDescription, setDetailsDescription] = useState("");
  const [detailsTopic, setDetailsTopic] = useState("");
  const [detailsCategory, setDetailsCategory] = useState("Generic");
  const [detailsMsg, setDetailsMsg] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // Question form
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [listError, setListError] = useState("");
  const [confirmDeleteQuestionId, setConfirmDeleteQuestionId] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<QodQuestion | null>(null);

  useEffect(() => {
    if (isNew) {
      setQodQuiz(blankQodQuiz);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchQodQuiz();
  }, [qodQuizId]);

  const fetchQodQuiz = async () => {
    const res = await api.get(`/qod-quizzes/${qodQuizId}`);
    setQodQuiz(res.data.data);
    setDetailsTitle(res.data.data.title);
    setDetailsDescription(res.data.data.description || "");
    setDetailsTopic(res.data.data.topic || "");
    setDetailsCategory(res.data.data.category || "Generic");
    setLoading(false);
  };

  // Reloads only the questions, so unsaved text in the details box isn't lost.
  const refreshQuestions = async () => {
    const res = await api.get(`/qod-quizzes/${qodQuizId}`);
    setQodQuiz((prev) => (prev ? { ...prev, questions: res.data.data.questions } : prev));
  };

  // Saves a brand-new QOD quiz from the details box and returns its id.
  const createQodQuizFromDetails = async (): Promise<string> => {
    const res = await api.post("/qod-quizzes", {
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
      setDetailsError("Title is required");
      return;
    }
    setSavingDetails(true);
    try {
      if (isNew) {
        const id = await createQodQuizFromDetails();
        navigate(`/qod/quiz/${id}`, { replace: true }); // now it's a normal saved QOD quiz
        return;
      }

      const res = await api.put(`/qod-quizzes/${qodQuizId}`, {
        title: detailsTitle.trim(),
        description: isRichTextEmpty(detailsDescription) ? null : detailsDescription,
        topic: detailsTopic.trim(),
        category: detailsCategory.trim(),
      });
      setQodQuiz((prev) =>
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
      refreshCategories();
    } catch (err: any) {
      setDetailsError(err.response?.data?.message || "Could not save details");
    } finally {
      setSavingDetails(false);
    }
  };

  const resetForm = () => {
    setEditingQuestionId(null);
    setText("");
    setError("");
  };

  const startEditing = (q: QodQuestion) => {
    setEditingQuestionId(q.id);
    setText(q.text);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setError("");

    if (isRichTextEmpty(text)) return setError("Question text is required");
    if (isNew && !detailsTitle.trim()) {
      setDetailsError("Title is required");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return setError("Enter a title in Quiz details first");
    }

    setSaving(true);
    let createdQuizId: string | null = null;
    try {
      let activeQuizId = qodQuizId as string;
      if (isNew) {
        activeQuizId = await createQodQuizFromDetails();
        createdQuizId = activeQuizId;
      }

      if (editingQuestionId) {
        const res = await api.put(`/qod-quizzes/${activeQuizId}/questions/${editingQuestionId}`, {
          text: text.trim(),
        });
        const updated: QodQuestion = res.data.data;
        setQodQuiz((prev) =>
          prev
            ? { ...prev, questions: prev.questions.map((q) => (q.id === editingQuestionId ? updated : q)) }
            : prev
        );
      } else {
        const res = await api.post(`/qod-quizzes/${activeQuizId}/questions`, {
          text: text.trim(),
        });
        if (isNew) {
          resetForm();
          navigate(`/qod/quiz/${activeQuizId}`, { replace: true });
          return;
        }
        setQodQuiz((prev) => (prev ? { ...prev, questions: [...prev.questions, res.data.data] } : prev));
      }
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not save question");
      if (createdQuizId) navigate(`/qod/quiz/${createdQuizId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  // Opens the modal instead of deleting right away.
  const handleDeleteQuestion = (questionId: string) => setConfirmDeleteQuestionId(questionId);

  const handleConfirmDeleteQuestion = async () => {
    if (!confirmDeleteQuestionId) return;
    const questionId = confirmDeleteQuestionId;
    setConfirmDeleteQuestionId(null);
    setListError("");
    try {
      await api.delete(`/qod-quizzes/${qodQuizId}/questions/${questionId}`);
      setQodQuiz((prev) => (prev ? { ...prev, questions: prev.questions.filter((q) => q.id !== questionId) } : prev));
      if (editingQuestionId === questionId) resetForm();
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not delete question");
    }
  };

  const handleDuplicateQuestion = async (questionId: string) => {
    setListError("");
    try {
      await api.post(`/qod-quizzes/${qodQuizId}/questions/${questionId}/duplicate`);
      await refreshQuestions();
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not duplicate question");
    }
  };

  // Drag-and-drop reorder (same endpoint/pattern as QuizEditor.tsx).
  const handleDragEnd = async (result: DropResult) => {
    if (!qodQuiz || !result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const reordered = Array.from(qodQuiz.questions);
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    setQodQuiz({ ...qodQuiz, questions: reordered }); // show the new order immediately
    setListError("");

    try {
      await api.put(`/qod-quizzes/${qodQuizId}/questions/reorder`, { orderedIds: reordered.map((q) => q.id) });
    } catch (err: any) {
      setListError(err.response?.data?.message || "Could not save the new order");
      await refreshQuestions(); // go back to what the server has
    }
  };

  const questionMenuItems = (q: QodQuestion) => [
    { label: "Duplicate", onClick: () => handleDuplicateQuestion(q.id) },
    { label: "Edit", onClick: () => startEditing(q) },
    { label: "Delete", onClick: () => handleDeleteQuestion(q.id), danger: true },
  ];

  // Same mechanism as the ⋮ menu's "Start QOD" (creates/resumes a session for this
  // quiz) — just a second, more visible way to do it, matching Quiz Session's editor page.
  const handleStartSession = async () => {
    setError("");
    setStartingSession(true);
    try {
      const res = await api.post("/qod-sessions", { qodQuizId });
      navigate(`/qod/session/${res.data.data.id}`);
    } catch (err: any) {
      console.error("Start session failed:", err);
      setError(err.response?.data?.message || err.message || "Could not start session");
    } finally {
      setStartingSession(false);
    }
  };

  if (loading || !qodQuiz) {
    return <div className="min-h-screen bg-brand-bg text-brand-text p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <EditorHeader />
      <div className="px-6 md:px-10 pb-6 md:pb-10 pt-20 md:pt-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="leave-chip border border-brand-text/10 text-base font-bold mb-1 -ml-3 px-3 py-1.5 rounded-lg transition"
          >
            ← Back
          </button>
          <h1 onClick={() => inputRef.current?.focus()}  
          className="text-2xl font-bold text-brand-accent cursor-pointer">{isNew ? "New QOD quiz" : qodQuiz.title}</h1>
          {!isNew && qodQuiz.topic && <p className="text-slate-400 text-sm">{qodQuiz.topic}</p>}
        </div>
        <button
          onClick={handleStartSession}
          disabled={isNew || qodQuiz.questions.length === 0 || startingSession}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-3 rounded-lg disabled:opacity-40"
        >
          {startingSession ? "Starting..." : "▶ Start Session"}
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
              placeholder={isNew ? "Enter Title" : ""}
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
              placeholder={isNew ? "Enter Topic" : ""}
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
            onChange={(html) => {
              setDetailsDescription(html);
              setDetailsMsg("");
              setDetailsError("");
            }}
            placeholder="What is this QOD about?"
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
          <h2 className="text-lg font-bold mb-3">Questions ({qodQuiz.questions.length})</h2>
          {qodQuiz.questions.length === 0 && <p className="text-slate-400">No questions yet — add your first one →</p>}
          {listError && <p className="text-brand-error text-sm mb-3">{listError}</p>}

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="qod-questions">
              {(droppableProvided) => (
                <div
                  className="space-y-3"
                  ref={droppableProvided.innerRef}
                  {...droppableProvided.droppableProps}
                >
                  {qodQuiz.questions.map((q, i) => (
                    <Draggable key={q.id} draggableId={q.id} index={i}>
                      {(draggableProvided, snapshot) => (
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          onClick={() => setPreviewQuestion(q)}
                          className={`glass-card border rounded-xl p-4 cursor-pointer ${
                            editingQuestionId === q.id ? "border-brand-accent" : "border-brand-text/10"
                          } ${snapshot.isDragging ? "ring-2 ring-brand-accent" : ""}`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              {/* Drag handle: only this icon starts a drag, so clicking the
                                  menu elsewhere on the card never triggers one. */}
                              <span
                                {...draggableProvided.dragHandleProps}
                                onClick={(e) => e.stopPropagation()}
                                title="Drag to reorder"
                                className="mt-1.5 shrink-0 text-slate-500 hover:text-brand-text cursor-grab active:cursor-grabbing"
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
                              <div className="min-w-0 flex items-start gap-1">
                                <span className="font-medium shrink-0">{i + 1}.</span>
                                <RichText html={q.text} className="font-medium min-w-0" />
                              </div>
                            </div>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                              <MoreMenu items={questionMenuItems(q)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {droppableProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <ConfirmModal
            open={!!confirmDeleteQuestionId}
            title="Delete question?"
            message="Delete this question?"
            confirmLabel="Delete"
            onConfirm={handleConfirmDeleteQuestion}
            onCancel={() => setConfirmDeleteQuestionId(null)}
          />
        </div>

        {/* Right column: add-a-question form */}
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

            <div className="mb-3">
              <RichTextEditor value={text} onChange={setText} placeholder="Question text" />
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
        </div>
      </div>

      {previewQuestion && (
        <QuestionPreviewModal question={previewQuestion} onClose={() => setPreviewQuestion(null)} />
      )}
      </div>
    </div>
  );
}