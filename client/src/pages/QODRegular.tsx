import { useSearchParams } from "react-router-dom"; // Usesless now

type Tab = "qod" | "create" | "favorite" | "category" | "soon";

export default function QODRegular() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "create" || tabParam === "favorite" || tabParam === "category" || tabParam === "soon"
      ? tabParam
      : "qod";

  const goTab = (t: Tab) => {
    setSearchParams(t === "qod" ? {} : { tab: t });
  };

  const tabClass = (active: boolean) =>
    `px-5 py-3 font-semibold border-b-2 -mb-px whitespace-nowrap transition ${
      active ? "border-brand-accent text-brand-accent" : "border-transparent text-white/70 hover:text-white"
    }`;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Regular Quiz</h1>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6 overflow-x-auto overflow-y-hidden">
        <button onClick={() => goTab("qod")} className={tabClass(tab === "qod")}>
          QOD
        </button>
        <button onClick={() => goTab("create")} className={tabClass(tab === "create")}>
          Create
        </button>
        <button onClick={() => goTab("favorite")} className={tabClass(tab === "favorite")}>
          Favorite
        </button>
        <button onClick={() => goTab("category")} className={tabClass(tab === "category")}>
          Category
        </button>
        <button onClick={() => goTab("soon")} className={tabClass(tab === "soon")}>
          Yet to decide
        </button>
      </div>

      {tab === "qod" && <p className="text-slate-400">No QOD quizzes yet.</p>}
      {tab === "create" && <p className="text-slate-400">Create form coming next.</p>}
      {tab === "favorite" && <p className="text-slate-400">No favorites yet.</p>}
      {tab === "category" && <p className="text-slate-400">Category view coming next.</p>}
      {tab === "soon" && <p className="text-slate-400">Nothing here yet.</p>}
    </div>
  );
}