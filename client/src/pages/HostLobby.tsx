import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import QrCodeButton from "../components/QrCodeButton";
import SessionBrand from "../components/SessionBrand";
import SettingsMenu from "../components/SettingsMenu";
import ConfirmModal from "../components/ConfirmModal";
import RichText from "../components/RichText";

interface Participant {
  participantId: string;
  displayName: string;
}

interface Question {
  questionId: string;
  text: string;
  timeLimit: number;
  questionNumber: number;
  totalQuestions: number;
  options: { id: string; text: string }[];
}

interface Intro {
  questionNumber: number;
  totalQuestions: number;
  text: string;
  introSeconds: number;
}

interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  score: number;
  rank: number;
}

interface SessionSettings {
  autoplay: boolean;
  showQaToStudents: boolean;
  allowNameEdit: boolean;
}

type Phase = "waiting" | "intro" | "question" | "revealed" | "leaderboard" | "ended";

const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-600"];
// Fixed per-tile text, independent of theme — matches the confirmed choice on
// ReportDetail's option bars (white reads fine on all four tiles in both themes).
// Needed here because the page's own text color is no longer hardcoded white.
const optionTextColors = ["text-white", "text-white", "text-white", "text-white"];

// Gold / silver / bronze for the top 3, plain for everyone else.
const rankBadge = (rank: number) =>
  rank === 1
    ? "bg-yellow-400 text-black"
    : rank === 2
    ? "bg-slate-300 text-black"
    : rank === 3
    ? "bg-amber-700 text-white"
    : "bg-slate-700 text-white";

// The key makes the whole screen start fresh whenever the game changes
// (for example when you press Play Again and go from one lobby to the next).
export default function HostLobby() {
  const { sessionId } = useParams();
  return <HostLobbyScreen key={sessionId} />;
}

function HostLobbyScreen() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [gamePin, setGamePin] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [intro, setIntro] = useState<Intro | null>(null);
  const [introBar, setIntroBar] = useState("100%");
  const [timeLeft, setTimeLeft] = useState(0);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<SessionSettings>({ autoplay: false, showQaToStudents: false, allowNameEdit: false });
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const [confirmEndSession, setConfirmEndSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  // Where "← Leave" and a completed End Session both go — the quiz's own question
  // creation page, since Open Lobby now lives there rather than a general session list.
  const [quizId, setQuizId] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/sessions/${sessionId}/participants`).then((res) => {
      setGamePin(res.data.data.gamePin);
      setQuizId(res.data.data.quizId);
      setParticipants(
        res.data.data.participants.map((p: any) => ({ participantId: p.id, displayName: p.displayName }))
      );
      if (res.data.data.settings) setSettings(res.data.data.settings);
    });

    socket.connect();

    socket.on("connect", () => {
      api.get(`/sessions/${sessionId}/participants`).then((res) => {
        socket.emit("join-room", res.data.data.gamePin);
        socket.emit("host:join-room", res.data.data.gamePin); // host-only data room
      });
    });

    socket.on("participant-joined", (p: Participant) => {
      setParticipants((prev) => [...prev, p]);
    });

    socket.on("participant-renamed", ({ participantId, displayName }: { participantId: string; displayName: string }) => {
      setParticipants((prev) => prev.map((p) => (p.participantId === participantId ? { ...p, displayName } : p)));
    });

    socket.on("participant-removed", ({ participantId }: { participantId: string }) => {
      setParticipants((prev) => prev.filter((p) => p.participantId !== participantId));
    });

    // Step 1: the question is shown alone for a few seconds.
    socket.on("question:intro", (data: Intro) => {
      setIntro(data);
      setCorrectOptionId(null);
      setAnsweredCount(0);
      setOptionCounts({});
      setIntroBar("100%");
      setPhase("intro");
      setTimeout(() => setIntroBar("0%"), 50); // starts the shrinking bar
    });

    // Step 2: the options appear and the timer starts.
    socket.on("question:new", (q: Question) => {
      setQuestion(q);
      setCorrectOptionId(null);
      setAnsweredCount(0);
      setOptionCounts({});
      setPhase("question");
      setTimeLeft(q.timeLimit);
    });

    socket.on("answer:count", ({ answered }: { answered: number }) => {
      setAnsweredCount(answered);
    });

    socket.on("question:stats", ({ counts }: { counts: Record<string, number> }) => {
      setOptionCounts(counts);
    });

    socket.on("question:ended", ({ correctOptionId }: { correctOptionId: string }) => {
      setCorrectOptionId(correctOptionId);
      setPhase("revealed");
    });

    socket.on("leaderboard:update", (data: LeaderboardEntry[]) => {
      setLeaderboard(data);
      setPhase("leaderboard");
    });

    socket.on("game:ended", () => setPhase("ended"));
    socket.on("settings:update", (s: SessionSettings) => setSettings(s));
    socket.on("error-message", (msg: string) => console.error("Server says:", msg));

    return () => {
      socket.off("connect");
      socket.off("participant-joined");
      socket.off("participant-renamed");
      socket.off("participant-removed");
      socket.off("question:intro");
      socket.off("question:new");
      socket.off("answer:count");
      socket.off("question:stats");
      socket.off("question:ended");
      socket.off("leaderboard:update");
      socket.off("game:ended");
      socket.off("settings:update");
      socket.off("error-message");
      socket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    if (phase !== "question" || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [phase, timeLeft]);

  const handleNextQuestion = () => socket.emit("host:next-question", { sessionId, gamePin });
  const handleSkipTimer = () => socket.emit("host:skip-timer", { sessionId, gamePin });

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      await api.delete(`/sessions/${sessionId}/participants/${target.participantId}`);
      // The actual removal from the list happens via the "participant-removed"
      // socket broadcast above, same pattern as every other live update on this page.
    } catch (err) {
      console.error("Could not remove participant", err);
    }
  };

  // Only reachable from the WAITING lobby (see the button below) — the game hasn't
  // started yet, so there's no report worth keeping. Same endpoint/semantics as the
  // "Delete" action on a still-WAITING session from the quiz's own session list.
  const handleConfirmEndSession = async () => {
    setConfirmEndSession(false);
    setEndingSession(true);
    try {
      await api.delete(`/sessions/${sessionId}`);
      // replace (not push) + fromHostLobby: stops this entry from stacking under
      // the editor — that stacking is what let QuizEditor's Back button bounce
      // into this lobby and loop (see QuizEditor.tsx's handleBack).
      navigate(quizId ? `/quiz/${quizId}` : "/sessions", { replace: true, state: { fromHostLobby: true } });
    } catch (err) {
      console.error("Could not end session", err);
      setEndingSession(false);
    }
  };

  const updateSetting = (key: keyof SessionSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    socket.emit("host:update-settings", { sessionId, settings: { [key]: value } });
  };

  // Space bar triggers whichever primary "advance" button is currently showing —
  // Start Game (waiting, once someone has joined) or Next Question / Final List
  // (leaderboard) — both already go through handleNextQuestion above.
  useEffect(() => {
    const canAdvance = (phase === "waiting" && participants.length > 0) || phase === "leaderboard";
    if (!canAdvance) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // defensive; no text inputs on this page
      e.preventDefault();
      handleNextQuestion();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, participants.length]);

  // Local countdown display only — the server decides the actual advance timing.
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "leaderboard" || !settings.autoplay) {
      setAutoplayCountdown(null);
      return;
    }
    setAutoplayCountdown(5);
    const interval = setInterval(() => {
      setAutoplayCountdown((c) => (c !== null && c > 0 ? c - 1 : c));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, settings.autoplay]);

  // Numbers for the answer breakdown on the results screen
  const totalAnswered = Object.values(optionCounts).reduce((sum, n) => sum + n, 0);
  const noAnswer = Math.max(0, participants.length - totalAnswered);
  const isLastQuestion = !!question && question.questionNumber === question.totalQuestions;

  return (
    <div className="relative min-h-screen bg-brand-bg text-brand-text flex flex-col">
      <SessionBrand />
      <QrCodeButton joinPath="/join" pin={gamePin} pinLabel="Game PIN" />
      <SettingsMenu
        fixed
        toggles={[
          {
            key: "autoplay",
            label: "Autoplay (auto-advance when time runs out)",
            checked: settings.autoplay,
            onChange: (v) => updateSetting("autoplay", v),
          },
          {
            key: "showQaToStudents",
            label: "Show question & answers on student screens",
            checked: settings.showQaToStudents,
            onChange: (v) => updateSetting("showQaToStudents", v),
          },
          {
            key: "allowNameEdit",
            label: "Allow name editing at Game Over",
            checked: settings.allowNameEdit,
            onChange: (v) => updateSetting("allowNameEdit", v),
          },
        ]}
      />
      {/* Persistent PIN, visible once the game is live — lets a student mid-join.
          The waiting screen already shows a much bigger centered PIN, so this one is
          only needed once that big version is gone. */}
      {(phase !== "waiting" && phase !== "ended" && !isLastQuestion)&& gamePin && (
        <div
          onClick={() => navigator.clipboard.writeText(gamePin)}
          title="Click to copy"
          className={`chrome-panel fixed top-6 z-20 border border-brand-text/10 rounded-lg px-4 py-2 cursor-pointer transition ${
                phase === "question" ? "left-40" : "left-6"
              }`}
        >
          <span className="text-3xl font-extrabold text-brand-accent tracking-widest">{gamePin}</span>
        </div>
      )}
      {phase === "waiting" && (
        <div className="flex-1 flex flex-col p-6">
          <div className="flex justify-between items-center mb-6">
            <Link
              to={quizId ? `/quiz/${quizId}` : "/sessions"}
              replace
              state={{ fromHostLobby: true }}
              className="leave-chip border border-brand-text/10 text-base font-bold px-3 py-1.5 rounded-lg transition"
            >
              ← Leave
            </Link>
            <button
              onClick={() => setConfirmEndSession(true)}
              disabled={endingSession}
              className="bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white font-bold px-5 py-2 mr-16 rounded-lg transition disabled:opacity-50"
            >
              {endingSession ? "Ending..." : "End Session"}
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-brand-text text-4xl font-bold mb-2">Game PIN</p>
          <div
            onClick={() => navigator.clipboard.writeText(gamePin)}
            title="Click to copy"
            className="chrome-panel border border-brand-text/10 rounded-2xl px-10 py-6 mb-8 cursor-pointer transition"
          >
            <span className="text-6xl font-extrabold text-brand-accent tracking-widest">
              {gamePin || "------"}
            </span>
          </div>

          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-4xl font-bold text-brand-accent">{participants.length}</span>
            <span className="text-xl font-bold">player{participants.length !== 1 ? "s" : ""} joined</span>
          </div>

          <div className="flex flex-wrap gap-3 justify-center max-w-2xl mb-10">
            {participants.map((p) => (
              <button
                key={p.participantId}
                onClick={() => setRemoveTarget(p)}
                title="Click to remove this player"
                className="bg-slate-800 border border-brand-text/10 text-brand-text px-4 py-2 rounded-full font-medium hover:bg-brand-text/10 hover:border-red-400/60 transition"
              >
                {p.displayName}
              </button>
            ))}
          </div>
          {participants.length === 0 && <p className="text-brand-text mb-10">Waiting for players to join...</p>}
          <button
            onClick={handleNextQuestion}
            disabled={participants.length === 0}
            className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg disabled:opacity-40"
          >
            Start Game
          </button>
          </div>
        </div>
      )}

      {phase === "intro" && intro && (
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
          <p className="text-xl text-brand-text/70 mb-6">
            Question {intro.questionNumber} / {intro.totalQuestions}
          </p>
          <div className="flex justify-center w-full">
            <RichText html={intro.text} className="text-5xl md:text-6xl font-extrabold max-w-5xl leading-tight" />
          </div>
          <div className="w-full max-w-3xl h-2 bg-brand-text/10 rounded-full mt-12 overflow-hidden">
            <div
              className="h-full bg-brand-accent"
              style={{ width: introBar, transition: `width ${intro.introSeconds}s linear` }}
            />
          </div>
        </div>
      )}

      {phase === "question" && question && (
        <div className="flex-1 flex flex-col p-6">
          <div className="flex justify-between items-center mb-4 pr-14">
            <span className="text-lg">
              Question {question.questionNumber} / {question.totalQuestions}
            </span>
            <div className="flex items-center gap-4">
              <span className="text-lg chrome-panel border border-brand-text/10 rounded-lg px-4 py-2">
                <span className="font-extrabold text-brand-accent">{answeredCount}</span> / {participants.length} answered
              </span>
              <span className="text-3xl font-extrabold text-brand-accent">{timeLeft}s</span>
              <button
                onClick={handleSkipTimer}
                className="bg-slate-800 hover:bg-brand-text/10 border border-brand-text/10 text-brand-text text-sm px-4 py-2 rounded-lg transition"
              >
                Skip ⏭
              </button>
            </div>
          </div>
          <div className="flex justify-center mb-6">
            <RichText html={question.text} className="text-4xl font-bold" />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4">
            {question.options.map((option, i) => (
              <div
                key={option.id}
                className={`${optionColors[i]} ${optionTextColors[i]} rounded-2xl flex items-center justify-center text-3xl font-bold text-center p-6`}
              >
                <RichText html={option.text} />
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "revealed" && question && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 w-full">
          <h2 className="text-2xl font-bold text-center mb-8">Correct Answer</h2>
          <div className="grid grid-cols-2 gap-4 w-full max-w-4xl flex-1 max-h-[60vh]">
            {question.options.map((option, i) => {
              const isCorrect = option.id === correctOptionId;
              return (
                <div
                  key={option.id}
                  className={`relative overflow-hidden ${optionColors[i]} rounded-2xl flex items-center justify-center text-2xl font-bold text-center p-6 ${
                    isCorrect ? "ring-4 ring-brand-text" : ""
                  }`}
                >
                  {/* Dims toward black regardless of theme — opacity-* on the tile
                      itself blended toward the page background instead, which
                      washed out to near-white in Light Mode. See master context. */}
                  {/* {!isCorrect && <div className="absolute inset-0 bg-black/50" />} */}
                  <div className={`relative ${optionTextColors[i]}`}>
                    <RichText html={option.text} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "leaderboard" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className={isLastQuestion ? "w-full max-w-2xl" : "w-full max-w-5xl grid md:grid-cols-2 gap-10"}>
            {/* Answer breakdown: how many players picked each option */}
            {question && (
              <div>
                <h2 className="text-2xl font-bold text-center mb-2 mt-5 text-brand-accent">Answers</h2>
                <div className="flex justify-center mb-6">
                  <RichText html={question.text} className="text-brand-text/70" />
                </div>
                <div className="space-y-3">
                  {question.options.map((option, i) => {
                    const count = optionCounts[option.id] || 0;
                    const pct = totalAnswered > 0 ? (count / totalAnswered) * 100 : 0;
                    const isCorrect = option.id === correctOptionId;
                    return (
                      <div
                        key={option.id}
                        className={`relative overflow-hidden rounded-xl ${optionColors[i]} ${
                          isCorrect ? "ring-4 ring-brand-text" : ""
                        }`}
                      >
                        {/* Same black-overlay dimming as the revealed screen, kept
                            as a separate layer from the answer-count bar below so
                            the two don't fight over how dark the tile should be. */}
                         {/* {!isCorrect && <div className="absolute inset-0 bg-black/50" />} */}
                        <div className="absolute inset-y-0 left-0 bg-black/30" style={{ width: `${pct}%` }} /> 
                        <div className={`relative flex items-center justify-between px-5 py-4 gap-3 ${optionTextColors[i]}`}>
                          <span className="font-bold text-lg flex items-center gap-1">
                            {isCorrect && <span>✓</span>}
                            <RichText html={option.text} />
                          </span>
                          <span className="font-extrabold text-2xl">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {noAnswer > 0 && (
                  <p className="text-center text-brand-text/60 mt-4">
                    {noAnswer} player{noAnswer !== 1 ? "s" : ""} did not answer
                  </p>
                )}

                {/* Last question: results first, then the Final List button */}
                {isLastQuestion && (
                  <>
                    <button
                      onClick={handleNextQuestion}
                      className="mt-8 w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold py-4 rounded-xl text-lg"
                    >
                      🏆 Final List
                    </button>
                    {autoplayCountdown !== null && (
                      <p className="text-center text-brand-text/50 text-sm mt-3">
                        Autoplay: continuing in {autoplayCountdown}s... (press Space or click to continue now)
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Top 5 by total points (every question except the last) */}
            {!isLastQuestion && (
              <div>
                <h2 className="text-2xl font-bold text-center mb-6 text-brand-accent">Top 5</h2>
                <div className="space-y-2 mb-8">
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.participantId}
                      className="bg-slate-900 border border-brand-text/10 rounded-xl px-4 py-3 flex items-center gap-4"
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold shrink-0 ${rankBadge(
                          entry.rank
                        )}`}
                      >
                        {entry.rank}
                      </span>
                      <span className="flex-1 font-medium truncate">{entry.displayName}</span>
                      <span className="font-extrabold text-2xl text-brand-accent">{entry.score}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleNextQuestion}
                  className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold py-4 rounded-xl text-lg"
                >
                  Next Question
                </button>
                {autoplayCountdown !== null && (
                  <p className="text-center text-brand-text/50 text-sm mt-3">
                    Autoplay: next question in {autoplayCountdown}s... (press Space or click to continue now)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "ended" && <Podium players={leaderboard} sessionId={sessionId as string} />}

      <ConfirmModal
        open={!!removeTarget}
        title="Remove player?"
        message={`Remove ${removeTarget?.displayName} from this game? They can rejoin with the PIN if needed.`}
        confirmLabel="Remove"
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmModal
        open={confirmEndSession}
        title="End this session?"
        message="End this game before it's been played? Since it hasn't started, nothing is kept — it's deleted completely, not moved to Trash."
        confirmLabel="End Session"
        onConfirm={handleConfirmEndSession}
        onCancel={() => setConfirmEndSession(false)}
      />
    </div>
  );
}

// ---------- Final list: 5th → 3s → 4th → 3s → 3rd → 3s → 2nd → 3s → 1st ----------

const podiumHeight: Record<number, string> = { 1: "h-64", 2: "h-48", 3: "h-36" };
const podiumColor: Record<number, string> = {
  1: "bg-yellow-400 text-black",
  2: "bg-slate-300 text-black",
  3: "bg-amber-700 text-white",
};

const FIRST_REVEAL_MS = 1000; // a short beat before the first reveal
const REVEAL_GAP_MS = 3000; // 3 seconds between each reveal

function Podium({ players, sessionId }: { players: LeaderboardEntry[]; sessionId: string }) {
  const navigate = useNavigate();
  const top = players.slice(0, 5);
  const n = top.length;
  const [step, setStep] = useState(0); // how many players have been revealed so far
  const [showContinue, setShowContinue] = useState(false);
  const [showOptions, setShowOptions] = useState(false); // Continue was clicked → show the three cards
  const [busy, setBusy] = useState<"play" | "feedback" | null>(null);
  const [error, setError] = useState("");

  // Reveals one player at a time, from the last place up to 1st.
  useEffect(() => {
    if (step >= n) return;
    const timer = setTimeout(() => setStep((s) => s + 1), step === 0 ? FIRST_REVEAL_MS : REVEAL_GAP_MS);
    return () => clearTimeout(timer);
  }, [step, n]);

  // The Continue button appears a moment after 1st place is revealed.
  useEffect(() => {
    if (step < n) return;
    const timer = setTimeout(() => setShowContinue(true), 2000);
    return () => clearTimeout(timer);
  }, [step, n]);

  const isRevealed = (rank: number) => step > n - rank;
  const findByRank = (rank: number) => top.find((p) => p.rank === rank);

  // New lobby for the same quiz.
  const handlePlayAgain = async () => {
    setError("");
    setBusy("play");
    try {
      const info = await api.get(`/sessions/${sessionId}/participants`);
      const res = await api.post(`/sessions/quizzes/${info.data.data.quizId}/start`);
      navigate(`/host/lobby/${res.data.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not start a new game");
      setBusy(null);
    }
  };

  // Live feedback that uses this game's PIN.
  const handleFeedback = async () => {
    setError("");
    setBusy("feedback");
    try {
      const res = await api.post(`/sessions/${sessionId}/feedback`);
      navigate(`/feedback/live/${res.data.data.pin}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not start feedback");
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      {n === 0 ? (
        <p className="text-brand-text/70">No players took part in this game.</p>
      ) : (
        <>
          {/* Podium: 2nd on the left, 1st in the middle, 3rd on the right */}
          <div className="flex items-end justify-center gap-4 mb-8">
            {[2, 1, 3].map((rank) => {
              const player = findByRank(rank);
              if (!player) return null;
              const shown = isRevealed(rank);
              return (
                <div
                  key={rank}
                  className={`flex flex-col items-center w-40 md:w-52 transition-all duration-700 ${
                    shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-16"
                  }`}
                >
                  {rank === 1 && shown && <span className="text-5xl mb-2 mt-12 animate-bounce">👑</span>}
                  <p className="font-bold text-xl text-center truncate w-full">{player.displayName}</p>
                  <p className="font-extrabold text-brand-accent text-2xl mb-2">{player.score}</p>
                  <div
                    className={`${podiumHeight[rank]} ${podiumColor[rank]} w-full rounded-t-2xl flex items-start justify-center pt-4 text-4xl font-extrabold`}
                  >
                    {rank}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4th and 5th place */}
          {top.some((p) => p.rank > 3) && (
            <div className="w-full max-w-md space-y-2">
              {top
                .filter((p) => p.rank > 3)
                .map((p) => (
                  <div
                    key={p.participantId}
                    className={`bg-slate-900 border border-brand-text/10 rounded-xl px-4 py-3 flex items-center gap-4 transition-all duration-700 ${
                      isRevealed(p.rank) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                    }`}
                  >
                    <span className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-extrabold shrink-0">
                      {p.rank}
                    </span>
                    <span className="flex-1 font-medium truncate">{p.displayName}</span>
                    <span className="font-extrabold text-2xl text-brand-accent">{p.score}</span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {/* Continue → replaced by the three cards */}
      {showOptions ? (
        <div className="w-full max-w-3xl mt-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={handlePlayAgain}
              disabled={busy !== null}
              className="bg-brand-accent hover:bg-brand-accent-hover text-black rounded-2xl p-5 text-center transition disabled:opacity-60"
            >
              <span className="block text-3xl mb-1">▶</span>
              <span className="block text-lg font-extrabold">{busy === "play" ? "Starting..." : "Play Again"}</span>
              <span className="block text-sm text-black/70">Same quiz, new game</span>
            </button>

            <button
              onClick={() => navigate(`/reports/${sessionId}`)}
              disabled={busy !== null}
              className="surface hover:bg-brand-text/10 p-5 text-center transition disabled:opacity-60"
            >
              <span className="block text-3xl mb-1">📊</span>
              <span className="block text-lg font-extrabold">Report</span>
              <span className="block text-sm text-brand-text/60">Every player's results</span>
            </button>

            <button
              onClick={handleFeedback}
              disabled={busy !== null}
              className="surface hover:bg-brand-text/10 p-5 text-center transition disabled:opacity-60"
            >
              <span className="block text-3xl mb-1">💬</span>
              <span className="block text-lg font-extrabold">{busy === "feedback" ? "Starting..." : "Feedback"}</span>
              <span className="block text-sm text-brand-text/60">Ask players for feedback</span>
            </button>
          </div>

          {error && <p className="text-brand-error text-sm text-center mt-4">{error}</p>}

          <div className="text-center mt-6">
            <button
              onClick={() => navigate("/sessions")}
              className="border border-brand-text/15 text-brand-text/70 text-sm mb-1 -ml-3 px-3 py-1.5 rounded-lg transition hover:bg-brand-text hover:text-brand-bg"
            >
              ← Back to Quiz Session
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            socket.emit("host:reveal-results", { sessionId });
            setShowOptions(true);
          }}
          className={`mt-10 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg transition-opacity duration-700 ${
            showContinue ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          Continue →
        </button>
      )}
    </div>
  );
}