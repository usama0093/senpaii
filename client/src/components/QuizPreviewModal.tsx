// import { useState, useEffect } from "react";
// import { createPortal } from "react-dom";
// import { useTheme } from "../context/ThemeContext";
// import RichText from "./RichText";

// export interface PreviewQuestion {
//   id: string;
//   text: string;
//   timeLimit?: number | null;
//   points?: number;
//   options?: { text: string; isCorrect: boolean }[];
// }

// type Layout = "grid" | "list" | "compact";
// const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-700"];

// interface Props {
//   open: boolean;
//   onClose: () => void;
//   title: string;
//   topic: string | null;
//   category: string;
//   isFavorite: boolean;
//   questionCount: number;
//   loading: boolean;
//   questions: PreviewQuestion[] | null; // null while still loading
//   startLabel?: string; // "Start Session" vs "Start QOD"
//   onStart: () => void;
//   onEdit: () => void;
//   onDuplicate: () => void;
//   onToggleFavorite: () => void;
//   onDelete: () => void;
//   onRename: (newTitle: string) => Promise<void>;
// }

// function QuestionCard({
//   q,
//   number,
//   compact,
//   showAnswers,
//   onClick,
// }: {
//   q: PreviewQuestion;
//   number: number;
//   compact?: boolean;
//   showAnswers: boolean;
//   onClick: () => void;
// }) {
//   return (
//     <button
//       onClick={onClick}
//       className={`text-left glass-card border border-brand-text/10 hover:border-brand-accent rounded-xl transition ${
//         compact ? "px-4 py-2" : "p-4"
//       }`}
//     >
//       <div className="flex items-start gap-2">
//         <span className="font-bold text-brand-text/60 shrink-0">{number}.</span>
//         <RichText html={q.text} className={compact ? "text-sm truncate" : "font-medium"} />
//       </div>
//       {!compact && q.options && (
//         <div className="grid grid-cols-2 gap-1.5 mt-3">
//           {q.options.slice(0, 4).map((o, i) => (
//             <div
//               key={i}
//               className={`${optionColors[i]} rounded-lg px-2 py-1.5 text-xs text-white font-semibold truncate ${
//                 showAnswers && o.isCorrect ? "ring-2 ring-brand-text" : ""
//               }`}
//             >
//               <RichText html={o.text} />
//             </div>
//           ))}
//         </div>
//       )}
//     </button>
//   );
// }

// function FocusedQuestion({
//   q,
//   number,
//   total,
//   showAnswers,
//   onPrev,
//   onNext,
// }: {
//   q: PreviewQuestion;
//   number: number;
//   total: number;
//   showAnswers: boolean;
//   onPrev: () => void;
//   onNext: () => void;
// }) {
//   return (
//     <div>
//       <p className="text-slate-400 text-sm mb-2">
//         Question {number} / {total}
//         {q.timeLimit ? ` · ${q.timeLimit}s` : ""}
//         {q.points ? ` · ${q.points} pts` : ""}
//       </p>
//       <RichText html={q.text} className="text-xl font-bold mb-4" />
//       {q.options && (
//         <div className="space-y-2 mb-4">
//           {q.options.map((o, i) => (
//             <div
//               key={i}
//               className={`${optionColors[i]} rounded-lg px-4 py-2.5 flex items-center gap-2 text-white font-semibold ${
//                 showAnswers && o.isCorrect ? "ring-2 ring-brand-text" : ""
//               }`}
//             >
//               {showAnswers && o.isCorrect && <span>✓</span>}
//               <RichText html={o.text} />
//             </div>
//           ))}
//         </div>
//       )}
//       <div className="flex justify-between">
//         <button
//           onClick={onPrev}
//           disabled={number === 1}
//           className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text px-4 py-2 rounded-lg disabled:opacity-30"
//         >
//           ← Previous
//         </button>
//         <button
//           onClick={onNext}
//           disabled={number === total}
//           className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text px-4 py-2 rounded-lg disabled:opacity-30"
//         >
//           Next →
//         </button>
//       </div>
//     </div>
//   );
// }

// export default function QuizPreviewModal({
//   open,
//   onClose,
//   title,
//   topic,
//   category,
//   isFavorite,
//   questionCount,
//   loading,
//   questions,
//   startLabel = "Start Session",
//   onStart,
//   onEdit,
//   onDuplicate,
//   onToggleFavorite,
//   onDelete,
//   onRename,
// }: Props) {
//   const { theme } = useTheme();
//   const [layout, setLayout] = useState<Layout>("grid");
//   const [showAnswers, setShowAnswers] = useState(false);
//   const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
//   const [renaming, setRenaming] = useState(false);
//   const [nameDraft, setNameDraft] = useState(title);
//   const [savingName, setSavingName] = useState(false);

//   useEffect(() => {
//     if (!open) {
//       setFocusedIndex(null);
//       setRenaming(false);
//     }
//   }, [open]);
//   useEffect(() => setNameDraft(title), [title]);

//   if (!open) return null;

//   const hasAnswers = !!questions?.some((q) => q.options);

//   const handleSaveName = async () => {
//     const trimmed = nameDraft.trim();
//     if (!trimmed || trimmed === title) {
//       setRenaming(false);
//       return;
//     }
//     setSavingName(true);
//     try {
//       await onRename(trimmed);
//       setRenaming(false);
//     } finally {
//       setSavingName(false);
//     }
//   };

//   return createPortal(
//     <div data-theme={theme} className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
//       <div
//         onClick={(e) => e.stopPropagation()}
//         className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-brand-text/10 rounded-2xl shadow-2xl shadow-black/50"
//       >
//         {/* Header */}
//         <div className="sticky top-0 bg-slate-900 border-b border-brand-text/10 p-5 z-10">
//           <div className="flex justify-between items-start gap-3 mb-3">
//             <div className="min-w-0 flex-1">
//               {renaming ? (
//                 <div className="flex items-center gap-2">
//                   <input
//                     autoFocus
//                     value={nameDraft}
//                     onChange={(e) => setNameDraft(e.target.value)}
//                     onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
//                     disabled={savingName}
//                     className="text-xl font-bold bg-slate-800 border border-brand-accent rounded-lg px-2 py-1 outline-none flex-1 min-w-0"
//                   />
//                   <button
//                     onClick={handleSaveName}
//                     disabled={savingName}
//                     className="text-brand-accent hover:underline text-sm shrink-0"
//                   >
//                     {savingName ? "Saving..." : "Save"}
//                   </button>
//                   <button onClick={() => setRenaming(false)} className="text-brand-text/60 hover:underline text-sm shrink-0">
//                     Cancel
//                   </button>
//                 </div>
//               ) : (
//                 <h2
//                   onClick={() => setRenaming(true)}
//                   title="Click to rename"
//                   className="text-xl font-bold truncate cursor-pointer hover:text-brand-accent"
//                 >
//                   {isFavorite && <span className="text-brand-accent mr-1">★</span>}
//                   {title}
//                 </h2>
//               )}
//               <p className="text-slate-400 text-sm mt-1">
//                 {questionCount} question{questionCount !== 1 ? "s" : ""} · {category}
//                 {topic ? ` · ${topic}` : ""}
//               </p>
//             </div>
//             <button
//               onClick={onClose}
//               aria-label="Close"
//               className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-brand-text/60 hover:bg-brand-text/10 hover:text-brand-text"
//             >
//               ✕
//             </button>
//           </div>

//           {/* Action row */}
//           <div className="flex flex-wrap gap-2">
//             <button
//               onClick={onStart}
//               className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-4 py-2 rounded-lg text-sm"
//             >
//               ▶ {startLabel}
//             </button>
//             <button
//               onClick={onEdit}
//               className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text px-4 py-2 rounded-lg text-sm"
//             >
//               ✎ Edit
//             </button>
//             <button
//               onClick={onDuplicate}
//               className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text px-4 py-2 rounded-lg text-sm"
//             >
//               ⧉ Duplicate
//             </button>
//             <button
//               onClick={onToggleFavorite}
//               className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text px-4 py-2 rounded-lg text-sm"
//             >
//               {isFavorite ? "★ Unfavorite" : "☆ Favorite"}
//             </button>
//             <button
//               onClick={onDelete}
//               className="border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2 rounded-lg text-sm transition"
//             >
//               🗑 Move to Trash
//             </button>
//           </div>
//         </div>

//         {/* Preview body */}
//         <div className="p-5">
//           {loading || !questions ? (
//             <p className="text-slate-400">Loading questions...</p>
//           ) : questions.length === 0 ? (
//             <p className="text-slate-400">No questions yet.</p>
//           ) : focusedIndex !== null ? (
//             <FocusedQuestion
//               q={questions[focusedIndex]}
//               number={focusedIndex + 1}
//               total={questions.length}
//               showAnswers={showAnswers}
//               onPrev={() => setFocusedIndex((i) => Math.max(0, (i ?? 0) - 1))}
//               onNext={() => setFocusedIndex((i) => Math.min(questions.length - 1, (i ?? 0) + 1))}
//             />
//           ) : (
//             <>
//               <div className="flex items-center justify-between mb-4">
//                 <h3 className="font-bold">Questions ({questions.length})</h3>
//                 <div className="flex items-center gap-3">
//                   {hasAnswers && (
//                     <button
//                       onClick={() => setShowAnswers((s) => !s)}
//                       className="text-sm text-brand-accent hover:underline"
//                     >
//                       {showAnswers ? "Hide answers" : "Show answers"}
//                     </button>
//                   )}
//                   <div className="flex items-center gap-1">
//                     {(["grid", "list", "compact"] as Layout[]).map((l) => (
//                       <button
//                         key={l}
//                         onClick={() => setLayout(l)}
//                         title={l}
//                         className={`px-2 py-1 rounded-lg border text-xs ${
//                           layout === l
//                             ? "border-brand-accent text-brand-accent bg-brand-accent/10"
//                             : "border-brand-text/10 text-brand-text/60 hover:text-brand-text"
//                         }`}
//                       >
//                         {l === "grid" ? "▦" : l === "list" ? "☰" : "≡"}
//                       </button>
//                     ))}
//                   </div>
//                 </div>
//               </div>

//               <div
//                 className={
//                   layout === "grid"
//                     ? "grid sm:grid-cols-2 gap-3"
//                     : layout === "compact"
//                     ? "space-y-1.5"
//                     : "space-y-3"
//                 }
//               >
//                 {questions.map((q, i) => (
//                   <QuestionCard
//                     key={q.id}
//                     q={q}
//                     number={i + 1}
//                     compact={layout === "compact"}
//                     showAnswers={showAnswers}
//                     onClick={() => setFocusedIndex(i)}
//                   />
//                 ))}
//               </div>
//             </>
//           )}
//         </div>
//       </div>
//     </div>,
//     document.body
//   );
// }

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import RichText from "./RichText";

export interface PreviewQuestion {
  id: string;
  text: string;
  timeLimit?: number | null;
  points?: number;
  options?: { text: string; isCorrect: boolean }[];
}

type Layout = "grid" | "list" | "compact";
const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-700"];

interface Props {
  open: boolean;
  onClose: () => void;
  quizId: string; // reset key — focused question resets whenever this changes
  title: string;
  topic: string | null;
  category: string;
  isFavorite: boolean;
  questionCount: number;
  loading: boolean;
  questions: PreviewQuestion[] | null;
  startLabel?: string;
  layouts?: Layout[];
  // Card-to-card navigation (Queue -> Stack -> Linked List, etc.) — owned by the
  // parent page, since it alone knows the list and its order.
  hasPrevCard: boolean;
  hasNextCard: boolean;
  onPrevCard: () => void;
  onNextCard: () => void;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => Promise<void>;
  onViewReports?: () => void;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a13.6 13.6 0 0 1 3.06-4.44M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 7.5a13.6 13.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// Header card-nav/close icons: plain SVGs at one fixed size, not text glyphs —
// a glyph's own font metrics (baseline, line-height) differ per character and
// per font-size, which is what caused Prev/Next (‹ › at text-2xl) to sit visibly
// lower than Close (✕ at default size) despite identical container boxes.
function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function QuestionCard({
  q,
  number,
  compact,
  showAnswers,
  onClick,
}: {
  q: PreviewQuestion;
  number: number;
  compact?: boolean;
  showAnswers: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full block text-left border border-brand-text/10 hover:border-brand-accent bg-slate-800/50 rounded-xl transition-colors ${
        compact ? "px-4 py-2" : "p-4"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`${compact ? "text-xl" : "text-2xl"} font-bold text-brand-text shrink-0`}>{number}.</span>
        <RichText html={q.text} className={compact ? "text-xl truncate text-brand-text" : "text-2xl font-medium text-brand-text"} />
      </div>
      {!compact && q.options && (
        <div className="grid grid-cols-2 gap-2.5 mt-5 p-3">
          {q.options.slice(0, 4).map((o, i) => (
            <div
              key={i}
              className={`${optionColors[i]} rounded-lg p-4 text-lg text-white font-semibold truncate ${
                showAnswers && o.isCorrect ? "ring-2 ring-brand-text" : ""
              }`}
            >
              <RichText html={o.text} />
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

export default function QuizPreviewModal({
  open,
  onClose,
  quizId,
  title,
  topic,
  category,
  isFavorite,
  questionCount,
  loading,
  questions,
  startLabel = "Start Session",
  layouts = ["grid", "list", "compact"],
  hasPrevCard,
  hasNextCard,
  onPrevCard,
  onNextCard,
  onStart,
  onEdit,
  onDuplicate,
  onToggleFavorite,
  onDelete,
  onRename,
  onViewReports,
}: Props) {
  const { theme } = useTheme();
  const [layout, setLayout] = useState<Layout>("list");
  const [showAnswers, setShowAnswers] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const [savingName, setSavingName] = useState(false);

  // Switching to a different card (Prev/Next, or picking a new card entirely)
  // always returns to the overview — a question focused on the OLD quiz would be
  // meaningless once the quiz itself has changed underneath it.
  useEffect(() => {
    setFocusedIndex(null);
  }, [quizId]);

  useEffect(() => {
    if (!open) {
      setFocusedIndex(null);
      setRenaming(false);
    }
  }, [open]);
  useEffect(() => setNameDraft(title), [title]);

  if (!open) return null;

  const hasAnswers = !!questions?.some((q) => q.options);
  const total = questions?.length ?? 0;

  const goPrevQuestion = () => setFocusedIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  const goNextQuestion = () => setFocusedIndex((i) => (i === null ? null : Math.min(total - 1, i + 1)));

  const startRename = () => {
    setNameDraft(title);
    setRenaming(true);
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === title) {
      setRenaming(false);
      return;
    }
    setSavingName(true);
    try {
      await onRename(trimmed);
      setRenaming(false);
    } finally {
      setSavingName(false);
    }
  };

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-2 md:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full md:w-[95vw] md:h-[90vh] max-w-none bg-slate-900 border border-brand-text/10 rounded-2xl shadow-2xl shadow-black/50 flex flex-col"
      >
        {/* Header — never scrolls */}
        <div className="shrink-0 border-b border-brand-text/10 p-5">
          <div className="flex justify-between items-start gap-3 mb-3">
            <div className="min-w-0 flex-1">
              {renaming ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    disabled={savingName}
                    className="text-xl font-bold bg-slate-800 text-brand-text border border-brand-accent rounded-lg px-2 py-1 outline-none flex-1 min-w-0"
                  />
                  <button onClick={handleSaveName} disabled={savingName} className="text-brand-accent hover:underline text-sm shrink-0">
                    {savingName ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setRenaming(false)} className="text-brand-text/60 hover:underline text-sm shrink-0">
                    Cancel
                  </button>
                </div>
              ) : (
                <h2 className="text-xl font-bold truncate text-brand-text">
                  {isFavorite && <span className="text-brand-accent mr-1">★</span>}
                  {title}
                </h2>
              )}
              <p className="text-slate-400 text-sm mt-1">
                {questionCount} question{questionCount !== 1 ? "s" : ""} · {category}
                {topic ? ` · ${topic}` : ""}
              </p>
            </div>

            {/* Card-to-card navigation (Queue <-> Stack <-> Linked List), left of
                Close. All three share one height (h-10) and flex items-center, so
                their icons — now plain SVGs, not font glyphs — line up exactly. */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onPrevCard}
                disabled={!hasPrevCard}
                aria-label="Previous quiz"
                title="Previous quiz"
                className="h-10 flex items-center gap-1.5 px-3 rounded-lg border border-brand-text/10 bg-slate-800 hover:bg-slate-700 text-brand-text hover:text-white font-semibold text-sm transition-colors disabled:opacity-30"
              >
                <ChevronLeftIcon />
                Previous
              </button>
              <button
                onClick={onNextCard}
                disabled={!hasNextCard}
                aria-label="Next quiz"
                title="Next quiz"
                className="h-10 flex items-center gap-1.5 px-3 rounded-lg border border-brand-text/10 bg-slate-800 hover:bg-slate-700 text-brand-text hover:text-white font-semibold text-sm transition-colors disabled:opacity-30"
              >
                Next
                <ChevronRightIcon />
              </button>
              <button
                onClick={onClose}
                aria-label="Close"
                className="h-10 w-10 flex items-center justify-center rounded-lg border border-brand-text/10 bg-slate-800 hover:bg-slate-700 text-brand-text hover:text-white transition-colors"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={onStart} className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-4 py-2 rounded-lg text-base">
              ▶ {startLabel}
            </button>
            <button onClick={onEdit} className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 hover:text-white text-brand-text px-4 py-2 rounded-lg text-base font-semibold transition-colors">
              ✎ Edit
            </button>
            <button onClick={startRename} className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 hover:text-white text-brand-text px-4 py-2 rounded-lg text-base font-semibold transition-colors">
              ✏ Rename
            </button>
            <button onClick={onDuplicate} className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 hover:text-white text-brand-text px-4 py-2 rounded-lg text-base font-semibold transition-colors">
              ⧉ Duplicate
            </button>
            <button onClick={onToggleFavorite} className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 hover:text-white text-brand-text px-4 py-2 rounded-lg text-base font-semibold transition-colors">
              {isFavorite ? "★ Unfavorite" : "☆ Favorite"}
            </button>
            {onViewReports && (
              <button onClick={onViewReports} className="bg-slate-800 hover:bg-slate-700 border border-brand-text/10 hover:text-white text-brand-text px-4 py-2 rounded-lg text-base font-semibold transition-colors">
                📊 Report
              </button>
            )}
            <button onClick={onDelete} className="border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2 font-bold rounded-lg text-base transition-colors disabled:opacity-50">
              🗑 Move to Trash
            </button>
          </div>
        </div>

        {/* Body — the only scrollable part */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading || !questions ? (
            <p className="text-slate-400">Loading questions...</p>
          ) : questions.length === 0 ? (
            <p className="text-slate-400">No questions yet.</p>
          ) : focusedIndex !== null ? (
            // Opaque bg-slate-800 instead of sitting directly on the modal's own
            // bg-slate-900 — same token every input/search/filter control in the
            // app already uses, so this reads as a clearly distinct panel rather
            // than blending into (or in Light Mode, clashing with) the modal.
            <div className="bg-slate-800 rounded-xl p-5 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400 text-sm">
                  Question {focusedIndex + 1} / {total}
                  {questions[focusedIndex].timeLimit ? ` · ${questions[focusedIndex].timeLimit}s` : ""}
                  {questions[focusedIndex].points ? ` · ${questions[focusedIndex].points} pts` : ""}
                </p>
                <button
                  onClick={() => setFocusedIndex(null)}
                  className="text-base font-semibold text-brand-text hover:text-brand-text hover:bg-brand-text/10 px-3 py-2 rounded-lg transition-colors"
                >
                  ✕ Back to all questions
                </button>
              </div>

              <RichText html={questions[focusedIndex].text} className="text-2xl md:text-3xl font-bold mb-5 text-brand-text" />

              {questions[focusedIndex].options && (
                <div className="space-y-3 mb-5">
                  {questions[focusedIndex].options!.map((o, i) => (
                    <div
                      key={i}
                      className={`${optionColors[i]} rounded-lg px-5 py-3.5 flex items-center gap-2 text-white font-semibold text-xl md:text-lg ${
                        showAnswers && o.isCorrect ? "ring-2 ring-brand-text" : ""
                      }`}
                    >
                      {showAnswers && o.isCorrect && <span>✓</span>}
                      <RichText html={o.text} />
                    </div>
                  ))}
                </div>
              )}

              {/* Question-level navigation — stays entirely within this quiz, never
                  touches the header's card-level Prev/Next above. */}
              <div className="flex justify-between">
                <button
                  onClick={goPrevQuestion}
                  disabled={focusedIndex === 0}
                  className="bg-slate-900 hover:bg-slate-700 border border-brand-text/10 hover:text-white font-bold text-brand-text px-4 py-2 rounded-lg transition-colors disabled:opacity-30"
                >
                  ← Previous question
                </button>
                <button
                  onClick={goNextQuestion}
                  disabled={focusedIndex === total - 1}
                  className="bg-slate-900 hover:bg-slate-700 border border-brand-text/10 hover:text-white font-bold text-brand-text px-4 py-2 rounded-lg transition-colors disabled:opacity-30"
                >
                  Next question →
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-brand-text">Questions ({questions.length})</h3>
                <div className="flex items-center gap-3">
                  {hasAnswers && (
                    <button
                      onClick={() => setShowAnswers((s) => !s)}
                      className="flex items-center gap-1.5 text-base text-brand-text px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700  hover:text-white font-bold transition-colors"
                    >
                      <EyeIcon open={showAnswers} />
                      {showAnswers ? "Hide answers" : "Show answers"}
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    {layouts.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLayout(l)}
                        title={l}
                        className={`px-2 py-1 rounded-lg border text-base transition-colors font-bold ${
                          layout === l
                            ? "border-brand-accent text-brand-accent bg-brand-accent/10 "
                            : "border-brand-text/10 text-brand-text/60 bg-slate-800 hover:bg-slate-700 hover:text-white"
                        }`}
                      >
                        {l === "grid" ? "▦" : l === "list" ? "☰" : "≡"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className={
                  layout === "grid"
                    ? "grid sm:grid-cols-2 gap-3"
                    : layout === "compact"
                    ? "space-y-1.5"
                    : "space-y-3"
                }
              >
                {questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    number={i + 1}
                    compact={layout === "compact"}
                    showAnswers={showAnswers}
                    onClick={() => setFocusedIndex(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}