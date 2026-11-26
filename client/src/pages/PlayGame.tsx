import { useState, useEffect, CSSProperties } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { socket } from "../socket";
import SessionBrand from "../components/SessionBrand";
import RichText from "../components/RichText";
import { lazy, Suspense } from "react";
const ThemeToggleButton = lazy(() => import("../components/ThemeToggleButton"));

interface Question {
  questionId: string;
  text: string;
  timeLimit: number;
  questionNumber: number;
  totalQuestions: number;
  options: { id: string; text: string }[];
  showAnswers: boolean;
}

interface MyEntry {
  participantId: string;
  displayName: string;
  score: number;
  rank: number;
  aheadName: string | null;
  isFinalQuestion?: boolean; // only set on a reconnect catch-up, see socket/index.ts
}

interface Intro {
  questionNumber: number;
  totalQuestions: number;
  text: string;
  showAnswers: boolean;
  introSeconds: number; // sent by the server (socket/index.ts's question:intro payload), same duration HostLobby's own intro bar uses
}

interface AnswerProgress {
  answered: number;
  total: number;
}

type WaitingGameKey = "tap" | "rps" | "slide" | "memory";
const WAITING_GAME_LABELS: Record<WaitingGameKey, string> = {
  tap: "Quick Tap",
  rps: "Rock Paper Scissors",
  slide: "Slide Puzzle",
  memory: "Memory Match",
};

type Phase = "loading" | "waiting" | "intro" | "question" | "answered" | "leaderboard" | "ended" | "removed";

const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-600"];

// Desktop zoom (question/answered phases only — mobile is untouched; the scale
// is applied via a Tailwind class scoped to the md: breakpoint, see the JSX
// below, so it has no effect at all below that width). DESKTOP_DEFAULT_ZOOM is
// already larger than mobile's natural 1x; ZOOM_IN_TARGET is the button's
// jump-to preset. The mouse wheel instead adjusts continuously in small steps.
const DESKTOP_DEFAULT_ZOOM = 1.15;
const ZOOM_IN_TARGET = 1.35;
const ZOOM_TOGGLE_THRESHOLD = (DESKTOP_DEFAULT_ZOOM + ZOOM_IN_TARGET) / 2;

interface RoomState {
  participantId: string;
  displayName: string;
  gamePin: string;
}

const ROOM_KEY = "playGameRoom";

// Same pattern as the QOD student pages: navigate() state only survives while this
// tab stays on the page, so a refresh falls back to whatever was last saved here. A
// fully closed tab (sessionStorage gone too) still works via the server's deviceId
// match — the student just re-enters the PIN and gets their same seat back.
function loadRoomState(fromState: unknown): RoomState | null {
  const s = fromState as RoomState | null;
  if (s && s.participantId && s.displayName && s.gamePin) return s;
  try {
    const raw = sessionStorage.getItem(ROOM_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.participantId && saved.displayName && saved.gamePin) return saved as RoomState;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

export default function PlayGame() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state] = useState<RoomState | null>(() => loadRoomState(location.state));

  // Starts neutral, not "waiting": on first connect (fresh join or a reconnect
  // after refresh/lock), the correct phase isn't known until the server's
  // catch-up replies — see socket/index.ts's student:join handler, which now
  // always sends an explicit phase event, including "session:waiting" below.
  const [phase, setPhase] = useState<Phase>("loading");
  const [question, setQuestion] = useState<Question | null>(null);
  const [intro, setIntro] = useState<Intro | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; pointsAwarded: number; selectedOptionId?: string } | null>(null);
  // Decoupled from `question` on purpose: a cold reconnect landing directly on an
  // already-ended question's leaderboard never receives "question:new" this
  // session, so `question` stays null — this is what the swatch actually maps a
  // color from, kept in sync by every source that carries option data.
  const [recapOptions, setRecapOptions] = useState<{ id: string; text: string }[] | null>(null);
  const [myEntry, setMyEntry] = useState<MyEntry | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [allowNameEditAtEnd, setAllowNameEditAtEnd] = useState(false);

  // Intro-phase progress bar — mirrors HostLobby's own introBar mechanism
  // exactly, independently rendered but timed from the same server-sent
  // introSeconds, so both screens count down over the same duration.
  const [introBar, setIntroBar] = useState("100%");

  // Live "X / Y answered" count + bar during the "answered" wait — reset to
  // null at the start of every new question so a stale count from the
  // previous question is never shown.
  const [answerProgress, setAnswerProgress] = useState<AnswerProgress | null>(null);

  // Quick Tap Target — a purely local, unsynced, unscored fidget activity shown
  // only while waiting on the "answered" screen. Never sent to the server.
  const [tapCount, setTapCount] = useState(0);
  const [targetPos, setTargetPos] = useState({ x: 50, y: 50 });
  const randomizeTarget = () => setTargetPos({ x: Math.random() * 70 + 15, y: Math.random() * 60 + 20 });

  // Waiting-screen mini-game carousel. The ORDER is randomized independently
  // on EACH student's own device, AND re-randomized on every new question —
  // never coordinated with the server or with other students, so two
  // students in the same session (and the same student across questions)
  // will see a freshly shuffled order each time. Generated by
  // reshuffleWaitingGames below, called from the same per-question reset
  // effect that already resets tapCount/activeGameIndex/gameRound.
  const [waitingGameOrder, setWaitingGameOrder] = useState<WaitingGameKey[]>(["tap", "rps", "slide", "memory"]);  const [activeGameIndex, setActiveGameIndex] = useState(0);
  // Remounts each game fresh (via its React key, see the JSX below) whenever
  // a student lands back on "answered" — otherwise a half-finished Slide
  // Puzzle or Memory Match from a previous question would carry over.
  const [gameRound, setGameRound] = useState(0);

  // Desktop zoom — a continuous scale applied only at md+ (see the wrapper's
  // md:-scoped transform class in the JSX below), via either the fixed button
  // (jumps between the default and a zoomed-in preset) or the mouse wheel
  // (small continuous steps, clamped).
  const [zoomScale, setZoomScale] = useState(DESKTOP_DEFAULT_ZOOM);

  // Lets the student fix their name before the host starts the game.
  const [displayName, setDisplayName] = useState(state?.displayName || "");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  // Set when the host opens feedback for this game (it uses the game's own PIN).
  const [feedbackPin, setFeedbackPin] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState("");
  const [joiningFeedback, setJoiningFeedback] = useState(false);

  useEffect(() => {
    if (!state) return;
    try {
      sessionStorage.setItem(ROOM_KEY, JSON.stringify(state));
    } catch (err) {
      // ignore
    }
  }, [state]);

  useEffect(() => {
    // "ended" is intentionally NOT cleared here anymore — a refresh or a
    // backgrounded-tab reload right after the game finishes needs this same
    // room info to reconnect as the same participant and catch up (see the
    // server's student:join handler). Only being removed, or explicitly
    // clicking "Join another session" below, clears it.
    if (phase === "removed") {
      try {
        sessionStorage.removeItem(ROOM_KEY);
      } catch (err) {
        // ignore
      }
    }
  }, [phase]);

  useEffect(() => {
    if (!state) return;

    socket.connect();
    // Tells the server who this student is, so it can send them their own rank.
    socket.on("connect", () =>
      socket.emit("student:join", { gamePin: state.gamePin, participantId: state.participantId })
    );

    // The question is being shown alone on the host screen.
    socket.on("session:waiting", () => {
      setPhase("waiting");
    });

    socket.on("question:intro", (data: Intro) => {
      setIntro(data);
      setLastResult(null);
      setAnswerProgress(null); // a new question — any previous count no longer applies
      setIntroBar("100%");
      setPhase("intro");
      setTimeout(() => setIntroBar("0%"), 50); // starts the shrinking bar, same mechanism as HostLobby's own
    });

    socket.on(
      "question:new",
      (q: Question & { alreadyAnswered?: boolean; result?: { isCorrect: boolean; pointsAwarded: number; selectedOptionId?: string } }) => {
        setQuestion(q);
        setRecapOptions(q.options);
        setTimeLeft(q.timeLimit);
        setAnswerProgress(null); // fresh question — clear any stale count from before
        if (q.alreadyAnswered && q.result) {
          // Reconnect only: already submitted before refreshing — go straight to
          // the post-submit screen, no flash of live tiles first.
          setLastResult(q.result);
          setPhase("answered");
        } else {
          setLastResult(null);
          setPhase("question");
        }
      }
    );

    socket.on("answer:result", (result: { isCorrect: boolean; pointsAwarded: number; selectedOptionId?: string }) => {
      setLastResult(result);
    });

    // The host corrected a mis-marked answer (HostLobby's "Mark correct instead")
    // while this student was on the leaderboard for that same question — updates
    // their Correct/Wrong label and points immediately, no refresh needed. Score/
    // rank themselves arrive separately via the usual "leaderboard:me" broadcast
    // the server already sends after every correction.
    socket.on("answer:corrected", (result: { isCorrect: boolean; pointsAwarded: number; selectedOptionId?: string }) => {
      setLastResult(result);
    });

    // Live "X / Y answered" count while this student waits on the "answered"
    // screen — the same event HostLobby has always received, now also sent to
    // the student room (see socket/index.ts's handleAnswerSubmission).
    socket.on("answer:count", (progress: AnswerProgress) => {
      setAnswerProgress(progress);
    });


    // Only this student's own score and rank — never anyone else's.
    // No separate "revealed" step: the correct/wrong result from answer:result
    // (already in state) is shown together with the total score, below, once
    // leaderboard:me arrives — avoids a one-screen flash before the other.
    // The final question now shows this same screen too (correct/wrong, current
    // score, total score) — only its RANK stays hidden, reserved for the host's
    // Continue-triggered reveal on the Game Over screen (see the JSX below and
    // "game:reveal" further down). The transition to "ended" itself still happens
    // via the existing "game:ended" listener, once the host clicks Final List.
    socket.on(
      "leaderboard:me",
      (entry: MyEntry & { questionOptions?: { id: string; text: string }[] }) => {
        setMyEntry(entry);
        // Sent only on a cold reconnect landing directly on the leaderboard —
        // without this, the swatch has no option list to map a color from.
        if (entry.questionOptions) setRecapOptions(entry.questionOptions);
        // Guarded: during a reconnect catch-up this can arrive after the game has
        // already ended, carrying the student's final score/rank — it must update
        // myEntry without knocking phase back from "ended" to the ordinary
        // per-question "leaderboard" screen.
        setPhase((prev) => (prev === "ended" ? prev : "leaderboard"));
      }
    );

    socket.on("game:ended", () => {
      setPhase("ended");
    });

    // The host clicked Continue on their final podium screen — now it's safe to
    // show this student their actual name/rank/score, not just "Game Over!".
    socket.on("game:reveal", ({ allowNameEdit }: { allowNameEdit: boolean }) => {
      setAllowNameEditAtEnd(allowNameEdit);
      setRevealed(true);
    });

    // The host can flip the toggle even after Continue — keeps the Edit button in
    // sync live, same as Regular QOD / Live QOD's settings broadcasts.
    socket.on("settings:update", (s: { allowNameEdit: boolean }) => {
      setAllowNameEditAtEnd(s.allowNameEdit);
    });

    // The host removed this student from the game.
    socket.on("participant-removed", ({ participantId }: { participantId: string }) => {
      if (participantId === state.participantId) setPhase("removed");
    });

    // The host opened feedback for this game.
    socket.on("feedback:open", ({ pin }: { pin: string }) => {
      setFeedbackPin(pin);
    });

    socket.on("error-message", (msg: string) => {
      alert(msg);
    });

    return () => {
      socket.off("connect");
      socket.off("question:intro");
      socket.off("session:waiting");
      socket.off("question:new");
      socket.off("answer:result");
      socket.off("answer:corrected");
      socket.off("answer:count");
      socket.off("question:ended");
      socket.off("leaderboard:me");
      // socket.off("game:ended");
      socket.off("game:reveal");
      socket.off("settings:update");
      socket.off("participant-removed");
      socket.off("feedback:open");
      socket.off("error-message");
      socket.disconnect();
    };
  }, [state]);

  useEffect(() => {
    if (phase !== "question" || timeLeft <= 0) return;
    const interval = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(interval);
  }, [phase, timeLeft]);

  // A fresh, freshly-shuffled set of waiting-screen games every time the
  // student lands back on "answered" for a NEW question — whether from a
  // fresh submit or a reconnect's alreadyAnswered catch-up. Re-randomized
  // every time (not once per student), and nudged so the leading game isn't
  // the same one that led last question.
  useEffect(() => {
    if (phase === "answered") {
      setTapCount(0);
      randomizeTarget();
      setActiveGameIndex(0);
      setGameRound((r) => r + 1);
      setWaitingGameOrder((prevOrder) => {
        const keys: WaitingGameKey[] = ["tap", "rps", "slide", "memory"];
        let shuffled = keys;
        do {
          shuffled = [...keys];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
        } while (prevOrder.length > 0 && shuffled[0] === prevOrder[0]);
        return shuffled;
      });
    }
  }, [phase]);

  const goToGame = (delta: 1 | -1) => {
    setActiveGameIndex((i) => (i + delta + waitingGameOrder.length) % waitingGameOrder.length);
  };

  const handleZoomButtonClick = () => {
    setZoomScale((prev) => (prev >= ZOOM_TOGGLE_THRESHOLD ? DESKTOP_DEFAULT_ZOOM : ZOOM_IN_TARGET));
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col items-center justify-center gap-4">
        <p>Session expired or page was refreshed.</p>
        <Link to="/join" className="text-brand-accent font-medium hover:underline">
          Rejoin the game
        </Link>
      </div>
    );
  }

    const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      setNameError("Name must be at least 2 characters");
      return;
    }
    setNameError("");
    setSavingName(true);
    try {
      await api.put(`/sessions/${sessionId}/participants/${state.participantId}`, { displayName: name });
      setDisplayName(name);
      setEditingName(false);
    } catch (err: any) {
      setNameError(err.response?.data?.message || "Could not update your name");
    } finally {
      setSavingName(false);
    }
  };

  const handleAnswer = (optionId: string) => {
    if (!question || phase !== "question") return;
    socket.emit("student:submit-answer", {
      sessionId,
      participantId: state.participantId,
      questionId: question.questionId,
      selectedOptionId: optionId,
    });
    setPhase("answered");
  };

  // Joins the feedback session (same PIN as the game) and opens the anonymous feedback box.
  const handleGiveFeedback = async () => {
    if (!feedbackPin) return;
    setFeedbackError("");
    setJoiningFeedback(true);
    try {
      const res = await api.post("/sessions/feedback/live/join", { pin: feedbackPin });
      const room = res.data.data; // { pin, name, token }

      try {
        sessionStorage.setItem("liveFeedbackRoom", JSON.stringify(room));
      } catch (err) {
        // storage unavailable — the page still works
      }

      navigate("/live-feedback/room", { state: room });
    } catch (err: any) {
      if (err.response?.status === 404) {
        setFeedbackError("Feedback has ended.");
        setFeedbackPin(null);
      } else {
        setFeedbackError(err.response?.data?.message || "Could not open feedback");
      }
      setJoiningFeedback(false);
    }
  };

  // Used only to hide the rank section on the "leaderboard" phase below, for the
  // final question — its rank stays reserved for the host's Continue-triggered reveal.
  // Normal live flow: question is still set from before the leaderboard appeared.
  // Reconnect catch-up: question is null (never replayed), so trust the flag the
  // server attached to leaderboard:me instead — see socket/index.ts's ACTIVE branch.
  const isLastQuestionLeaderboard = question
    ? question.questionNumber === question.totalQuestions
    : !!myEntry?.isFinalQuestion;

  return (
    <div className="relative min-h-screen bg-brand-bg text-brand-text p-6 flex flex-col items-center justify-center">
      <SessionBrand />
      <Suspense fallback={null}>
        <ThemeToggleButton position="top-right" />
      </Suspense>

      {phase === "loading" && <p className="text-brand-text/60">Loading...</p>}

      {phase === "waiting" && (
        <div className="text-center w-full max-w-xs">
          {editingName ? (
            <div className="mb-4">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                autoFocus
                className="w-full bg-slate-800 text-brand-text text-center rounded-lg px-4 py-3 mb-2 outline-none focus:ring-2 focus:ring-brand-accent"
              />
              {nameError && <p className="text-brand-error text-sm mb-2">{nameError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="flex-1 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-2 disabled:opacity-50"
                >
                  {savingName ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(displayName);
                    setNameError("");
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 border border-brand-text/10 rounded-lg  hover:text-white font-bold py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2 items-center justify-center">
              <p className="text-xl py-2">You're in, {displayName}!</p>
              <button
                onClick={() => {
                  setNameDraft(displayName);
                  setEditingName(true);
                }}
                className="w-24 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-1"
              >
                Edit
              </button>
            </div>
          )}
          <p className="text-brand-text/60">Waiting for the host to start...</p>
        </div>
      )}

      {phase === "intro" && intro && (
        <div className="text-center w-full max-w-sm">
          <p className="text-brand-text/70 text-lg mb-2">
            Question {intro.questionNumber} of {intro.totalQuestions}
          </p>
          <p className="text-4xl font-extrabold text-brand-accent mb-4">Get ready!</p>
          {intro.showAnswers ? (
            <div className="flex justify-center">
              <RichText html={intro.text} className="text-xl font-bold" />
            </div>
          ) : (
            <p className="text-brand-text/60">Look at the main screen</p>
          )}
          <div className="w-full h-1.5 bg-brand-text/10 rounded-full mt-8 overflow-hidden">
            <div
              className="h-full bg-brand-accent"
              style={{ width: introBar, transition: `width ${intro.introSeconds}s linear` }}
            />
          </div>
        </div>
      )}

      {(phase === "question" || phase === "answered") && question && (
        <>
          <div
            style={{ "--qz": zoomScale } as CSSProperties}
            className="w-full max-w-md md:[transform:scale(var(--qz))] md:origin-top"
          >
            <div className="flex justify-between mb-6">
              <span>
                Q{question.questionNumber}/{question.totalQuestions}
              </span>
              <span className="font-extrabold text-brand-accent">{timeLeft}s</span>
            </div>

            {/* Only on the question (tile) phase — never on "answered", per the fix below */}
            {phase === "question" && question.showAnswers && (
              <div className="flex justify-center mb-4">
                <RichText html={question.text} className="text-lg font-bold" />
              </div>
            )}

            {phase === "answered" ? (
              <div className="text-center">
                <p className="text-lg text-brand-text mb-4">Answer submitted! Waiting for others...</p>

                {answerProgress && answerProgress.total > 0 && (
                  <div className="mb-6">
                    <p className="text-brand-text/60 text-sm mb-1">
                      {answerProgress.answered} / {answerProgress.total} answered
                    </p>
                    <div className="w-full h-2 bg-brand-text/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-accent transition-all duration-300"
                        style={{ width: `${Math.min(100, (answerProgress.answered / answerProgress.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Waiting-screen mini-games — purely local fidget activities to
                    keep students engaged during the 5-15s wait. Never synced,
                    never scored, never affects session flow. Left/Right
                    browses between them; the ORDER itself comes from the
                    server (randomized once per session, see gameState.ts). */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => goToGame(-1)}
                    aria-label="Previous game"
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-brand-text/10 hover:bg-brand-text/20 transition"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-brand-text/40 text-xs mb-1 truncate">
                      {WAITING_GAME_LABELS[waitingGameOrder[activeGameIndex]]} ({activeGameIndex + 1}/{waitingGameOrder.length})
                    </p>
                    {waitingGameOrder[activeGameIndex] === "tap" && (
                      <div className="relative w-full h-40 bg-brand-text/5 rounded-xl overflow-hidden mb-2">
                        <button
                          onClick={() => {
                            setTapCount((c) => c + 1);
                            randomizeTarget();
                          }}
                          style={{ left: `${targetPos.x}%`, top: `${targetPos.y}%` }}
                          className="absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 bg-brand-accent rounded-full active:scale-90 transition-transform"
                          aria-label="Tap the target"
                        />
                      </div>
                    )}
                    {waitingGameOrder[activeGameIndex] === "tap" && (
                      <p className="text-brand-text/40 text-xs">Taps: {tapCount}</p>
                    )}
                    {waitingGameOrder[activeGameIndex] === "rps" && <RockPaperScissorsGame key={`rps-${gameRound}`} />}
                    {waitingGameOrder[activeGameIndex] === "slide" && <SlidePuzzleGame key={`slide-${gameRound}`} />}
                    {waitingGameOrder[activeGameIndex] === "memory" && <MemoryMatchGame key={`memory-${gameRound}`} />}
                  </div>

                  <button
                    onClick={() => goToGame(1)}
                    aria-label="Next game"
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-brand-text/10 hover:bg-brand-text/20 transition"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {question.options.map((option, i) => (
                  <button
                    key={option.id}
                    onClick={() => handleAnswer(option.id)}
                    className={`${optionColors[i]} rounded-xl h-28 active:scale-95 transition flex items-center justify-center text-center px-2`}
                  >
                    {question.showAnswers && <RichText html={option.text} className="text-white font-bold text-sm" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop-only zoom toggle — kept OUTSIDE the scaled wrapper above so
              the control itself never grows or shrinks with the content; the
              mouse wheel over the question/options area (handleWheelZoom,
              above) adjusts the same scale continuously. Mobile is completely
              unaffected — this button simply doesn't render there. */}
          <button
            onClick={handleZoomButtonClick}
            title={zoomScale >= ZOOM_TOGGLE_THRESHOLD ? "Zoom out" : "Zoom in"}
            className="hidden md:flex fixed bottom-6 right-6 z-20 w-12 h-12 items-center justify-center chrome-panel border border-brand-text/10 rounded-full hover:bg-brand-text/10 transition"
          >
            {zoomScale >= ZOOM_TOGGLE_THRESHOLD ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3M8 11h6" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
              </svg>
            )}
          </button>
        </>
      )}

      {phase === "leaderboard" && myEntry && (
        <div className="text-center">
          <p className="text-lg text-brand-text/80 mb-3">{displayName}</p>

          {lastResult ? (
            <>
              <p className={`text-4xl font-extrabold mb-4 ${lastResult.isCorrect ? "text-green-500" : "text-red-500"}`}>
                {lastResult.isCorrect ? "Correct!" : "Wrong"}
              </p>
              {lastResult.selectedOptionId && recapOptions && (
                <div className="flex flex-col items-center gap-1 mb-4">
                  <span className="text-brand-text/60 text-sm">Your answer</span>
                  <span
                    className={`w-24 h-8 ${
                      optionColors[recapOptions.findIndex((o) => o.id === lastResult.selectedOptionId)] || "bg-slate-700"
                    }`}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-2xl font-bold text-brand-text/70 mb-4">No answer</p>
          )}

          <p className="text-brand-text/60 text-sm">Current Score</p>
          <p className="text-2xl font-extrabold text-brand-accent mb-4">{lastResult?.pointsAwarded ?? 0}</p>

          <p className="text-brand-text/60 text-sm">Total Score</p>
          <p className="text-4xl font-extrabold text-brand-accent">{myEntry.score}</p>

          {/* The final question's rank stays reserved for the host's Continue-triggered
              reveal on the Game Over screen — every other question shows it here. */}
          {!isLastQuestionLeaderboard && (
            <div className="mt-4">
              <p className="text-brand-text/60 text-sm">Current Rank</p>
              <p className="text-xl font-bold text-brand-text">#{myEntry.rank}</p>
              {myEntry.aheadName && (
                <p className="text-white/50 text-sm mt-1">Just ahead of you: {myEntry.aheadName}</p>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "removed" && (
        <div className="text-center w-full max-w-xs">
          <h2 className="text-3xl font-extrabold text-red-400 mb-4">You were removed</h2>
          <p className="text-brand-text/70 mb-6">The host removed you from this game.</p>
          <Link to="/join" className="text-brand-accent font-medium hover:underline">
            Join another session
          </Link>
        </div>
      )}

      {phase === "ended" && (
        <div className="text-center w-full max-w-xs">
          <h2 className="text-3xl font-extrabold text-brand-accent mb-6">Game Over!</h2>

          {!revealed ? (
            <>
            <p className="text-brand-text/60">Waiting for the host...</p>
            <Link to="/" 
                onClick={() => {
                  try {
                    sessionStorage.removeItem(ROOM_KEY);
                  } catch (err) {
                    // ignore
                  }
                }}
                className="block mt-6 text-brand-accent font-medium hover:underline"
                >
                Join another session
              </Link>
            </>
          ) : (
            <>
              {editingName ? (
                <div className="mb-4">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-800 text-brand-text text-center rounded-lg px-4 py-3 mb-2 outline-none focus:ring-2 focus:ring-brand-accent"
                  />
                  {nameError && <p className="text-brand-error text-sm mb-2">{nameError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="flex-1 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-2 disabled:opacity-50"
                    >
                      {savingName ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(displayName);
                        setNameError("");
                      }}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 border border-brand-text/10 rounded-lg py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-extrabold text-brand-accent mb-1">{displayName}</p>
                  {allowNameEditAtEnd && (
                    <button
                      onClick={() => {
                        setNameDraft(displayName);
                        setEditingName(true);
                      }}
                      className="w-24 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-1 mb-4"
                    >
                      Edit
                    </button>
                  )}
                </>
              )}

              {myEntry ? (
                <>
                  <p className="text-brand-text/60 text-sm">Final Score</p>
                  <p className="text-4xl font-extrabold text-brand-accent mb-4">{myEntry.score}</p>
                  <p className="text-brand-text/60 text-sm">Final Rank</p>
                  <p className="text-xl font-bold text-brand-text">#{myEntry.rank}</p>
                  {myEntry.aheadName && (
                    <p className="text-white/50 text-sm mt-1">Just ahead of you: {myEntry.aheadName}</p>
                  )}
                </>
              ) : (
                <p className="text-xl">Thanks for playing, {displayName}!</p>
              )}

              {feedbackPin && (
                <button
                  onClick={handleGiveFeedback}
                  disabled={joiningFeedback}
                  className="mt-8 w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-xl py-3 text-lg disabled:opacity-60"
                >
                  {joiningFeedback ? "Opening..." : "💬 Give feedback"}
                </button>
              )}
              {feedbackError && <p className="text-brand-error text-sm mt-3">{feedbackError}</p>}

              <Link
                to="/"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(ROOM_KEY);
                  } catch (err) {
                    // ignore
                  }
                }}
                className="block mt-6 text-brand-accent font-medium hover:underline"
              >
                Join another session
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Waiting-screen mini-games (local only — never synced, never scored) ----------

const RPS_OPTIONS: { emoji: string; name: "rock" | "paper" | "scissors" }[] = [
  { emoji: "✊", name: "rock" },
  { emoji: "✋", name: "paper" },
  { emoji: "✌️", name: "scissors" },
];

function RockPaperScissorsGame() {
  const [cpuChoice, setCpuChoice] = useState<(typeof RPS_OPTIONS)[number] | null>(null);
  const [playerChoice, setPlayerChoice] = useState<(typeof RPS_OPTIONS)[number] | null>(null);
  const [result, setResult] = useState("");

  const play = (choice: (typeof RPS_OPTIONS)[number]) => {
    const cpu = RPS_OPTIONS[Math.floor(Math.random() * RPS_OPTIONS.length)];
    setPlayerChoice(choice);
    setCpuChoice(cpu);
    if (cpu.name === choice.name) setResult("It's a tie!");
    else if (
      (choice.name === "rock" && cpu.name === "scissors") ||
      (choice.name === "paper" && cpu.name === "rock") ||
      (choice.name === "scissors" && cpu.name === "paper")
    )
      setResult("You win! 🎉");
    else setResult("Computer wins!");
  };

  return (
    <div className="bg-brand-text/5 rounded-xl p-4">
      <div className="flex justify-center gap-3 mb-3">
        {RPS_OPTIONS.map((o) => (
          <button
            key={o.name}
            onClick={() => play(o)}
            className="w-12 h-12 rounded-full bg-brand-text/10 hover:bg-brand-text/20 active:scale-90 transition flex items-center justify-center text-xl"
            aria-label={o.name}
          >
            {o.emoji}
          </button>
        ))}
      </div>
      <p className="text-2xl mb-1">
        🤖 {cpuChoice?.emoji ?? ""} <span className="text-brand-text/40 text-sm mx-1">vs</span> {playerChoice?.emoji ?? ""} 🧑
      </p>
      <p className="text-brand-text/60 text-sm font-semibold min-h-[1.25rem]">{result}</p>
    </div>
  );
}

function getSlideNeighbors(idx: number): number[] {
  const row = Math.floor(idx / 3);
  const col = idx % 3;
  const list: number[] = [];
  if (row > 0) list.push(idx - 3);
  if (row < 2) list.push(idx + 3);
  if (col > 0) list.push(idx - 1);
  if (col < 2) list.push(idx + 1);
  return list;
}

function scrambledSlideTiles(): number[] {
  const tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  let empty = 8;
  for (let i = 0; i < 20; i++) {
    const neighbors = getSlideNeighbors(empty);
    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    [tiles[empty], tiles[pick]] = [tiles[pick], tiles[empty]];
    empty = pick;
  }
  return tiles;
}

function SlidePuzzleGame() {
  const [tiles, setTiles] = useState<number[]>(() => scrambledSlideTiles());
  const solved = tiles.slice(0, 8).every((v, i) => v === i + 1) && tiles[8] === 0;

  const tryMove = (idx: number) => {
    if (solved || tiles[idx] === 0) return;
    const empty = tiles.indexOf(0);
    if (!getSlideNeighbors(idx).includes(empty)) return;
    const next = [...tiles];
    [next[idx], next[empty]] = [next[empty], next[idx]];
    setTiles(next);
  };

  return (
    <div className="bg-brand-text/5 rounded-xl p-4">
      <div className="grid grid-cols-3 gap-1.5 w-36 mx-auto mb-2">
        {tiles.map((val, idx) => (
          <button
            key={idx}
            onClick={() => tryMove(idx)}
            className={`aspect-square rounded-lg flex items-center justify-center text-sm font-bold ${
              val === 0 ? "bg-transparent cursor-default" : "bg-brand-accent text-black active:scale-95 transition"
            }`}
          >
            {val === 0 ? "" : val}
          </button>
        ))}
      </div>
      <p className="text-brand-text/60 text-sm">{solved ? "Solved! 🎉" : "Arrange 1-8 in order"}</p>
    </div>
  );
}

function shuffledMemoryEmojis(): string[] {
  const pairs = ["⭐", "⭐", "🔥", "🔥", "💎", "💎"];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

function MemoryMatchGame() {
  const [cards] = useState<string[]>(() => shuffledMemoryEmojis());
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);

  const flip = (idx: number) => {
    if (locked || flipped.includes(idx) || matched.includes(idx)) return;
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length === 2) {
      setLocked(true);
      const [a, b] = next;
      if (cards[a] === cards[b]) {
        setMatched((m) => [...m, a, b]);
        setFlipped([]);
        setLocked(false);
      } else {
        setTimeout(() => {
          setFlipped([]);
          setLocked(false);
        }, 600);
      }
    }
  };

  const allMatched = matched.length === cards.length;

  return (
    <div className="bg-brand-text/5 rounded-xl p-4">
      <div className="grid grid-cols-3 gap-2 w-full max-w-[12rem] mx-auto mb-2">
        {cards.map((emo, idx) => {
          const isFlipped = flipped.includes(idx) || matched.includes(idx);
          return (
            <button
              key={idx}
              onClick={() => flip(idx)}
              className={`aspect-square rounded-lg flex items-center justify-center text-lg transition ${
                matched.includes(idx) ? "bg-green-600 text-white" : isFlipped ? "bg-brand-text/10" : "bg-brand-accent"
              }`}
            >
              {isFlipped ? emo : ""}
            </button>
          );
        })}
      </div>
      <p className="text-brand-text/60 text-sm">{allMatched ? "All matched! 🎉" : "Find the matching pairs"}</p>
    </div>
  );
}