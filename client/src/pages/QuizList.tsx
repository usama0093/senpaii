// import { useState, useEffect } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import api from "../api/axios";
// import { useAuth } from "../context/AuthContext";

// interface Quiz {
//   id: string;
//   title: string;
//   description: string | null;
//   _count: { questions: number };
// }

// export default function QuizList() {
//   const [quizzes, setQuizzes] = useState<Quiz[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [newTitle, setNewTitle] = useState("");
//   const [creating, setCreating] = useState(false);

//   const { host, logout } = useAuth();
//   const navigate = useNavigate();

//   useEffect(() => {
//     fetchQuizzes();
//   }, []);

//   const fetchQuizzes = async () => {
//     const res = await api.get("/quizzes");
//     setQuizzes(res.data.data);
//     setLoading(false);
//   };

//   const handleCreate = async () => {
//     if (!newTitle.trim()) return;
//     setCreating(true);
//     const res = await api.post("/quizzes", { title: newTitle.trim() });
//     setNewTitle("");
//     setCreating(false);
//     navigate(`/quiz/${res.data.data.id}`);
//   };

//   return (
//     <div className="min-h-screen bg-brand-bg text-white p-6 md:p-10">
//       <div className="flex justify-between items-center mb-8">
//         <h1 className="text-2xl font-bold text-brand-accent">Senpaii</h1>
//         <div className="flex items-center gap-4">
//           <span className="text-white">{host?.name}</span>
//           <button
//             onClick={logout}
//             className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg"
//           >
//             Log Out
//           </button>
//         </div>
//       </div>

//       <div className="flex gap-3 mb-8">
//         <input
//           type="text"
//           placeholder="New quiz title..."
//           value={newTitle}
//           onChange={(e) => setNewTitle(e.target.value)}
//           className="flex-1 bg-slate-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
//         />
//         <button
//           onClick={handleCreate}
//           disabled={creating}
//           className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 rounded-lg disabled:opacity-50"
//         >
//           + Create Quiz
//         </button>
//       </div>

//       {loading ? (
//         <p>Loading...</p>
//       ) : quizzes.length === 0 ? (
//         <p className="text-slate-400">No quizzes yet — create your first one above.</p>
//       ) : (
//         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
//           {quizzes.map((quiz) => (
//             <Link
//               key={quiz.id}
//               to={`/quiz/${quiz.id}`}
//               className="bg-slate-900 hover:bg-slate-800 rounded-2xl p-5 transition"
//             >
//               <h2 className="text-lg font-bold text-white">{quiz.title}</h2>
//               <p className="text-slate-400 text-sm mt-1">
//                 {quiz._count.questions} question{quiz._count.questions !== 1 ? "s" : ""}
//               </p>
//             </Link>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import MoreMenu from "../components/MoreMenu";

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  topic: string | null;
  _count: { questions: number };
}

export default function QuizList() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    const res = await api.get("/quizzes");
    setQuizzes(res.data.data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      setError("Quiz title is required");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const res = await api.post("/quizzes", { title: newTitle.trim() });
      setNewTitle("");
      navigate(`/quiz/${res.data.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not create quiz");
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (quiz: Quiz) => {
    setError("");
    try {
      await api.post(`/quizzes/${quiz.id}/duplicate`);
      await fetchQuizzes(); // the copy shows up at the top
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not duplicate quiz");
    }
  };

  const handleDelete = async (quiz: Quiz) => {
      if (!window.confirm(`Delete "${quiz.title}"? If it was never played it is deleted completely. If it has been played, it is hidden from your dashboard and its reports are kept until you delete them.`)) return;
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete quiz");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="flex gap-3 mb-2">
        <input
          type="text"
          placeholder="New quiz title..."
          value={newTitle}
          onChange={(e) => {
            setNewTitle(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          className="flex-1 bg-slate-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 rounded-lg disabled:opacity-50"
        >
          + Create Quiz
        </button>
      </div>
      <p className="text-brand-error text-sm mb-6 min-h-[1.25rem]">{error}</p>

      {loading ? (
        <p>Loading...</p>
      ) : quizzes.length === 0 ? (
        <p className="text-slate-400">No quizzes yet — create your first one above.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="surface rounded-2xl p-5">
              <div className="flex justify-between items-start gap-2">
                <Link to={`/quiz/${quiz.id}`} className="flex-1 min-w-0 hover:opacity-80 transition">
                  <h2 className="text-lg font-bold text-white truncate">{quiz.title}</h2>
                  {quiz.topic && <p className="text-brand-accent text-sm mt-1 truncate">{quiz.topic}</p>}
                  <p className="text-slate-400 text-sm mt-1">
                    {quiz._count.questions} question{quiz._count.questions !== 1 ? "s" : ""}
                  </p>
                </Link>
                <MoreMenu
                  items={[
                    { label: "Duplicate", onClick: () => handleDuplicate(quiz) },
                    { label: "Delete", onClick: () => handleDelete(quiz), danger: true },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}