import { useState, useEffect } from "react";
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
}

type Phase = "loading" | "waiting" | "intro" | "question" | "answered" | "leaderboard" | "ended" | "removed";

const optionColors = ["bg-red-600", "bg-blue-600", "bg-yellow-500", "bg-green-600"];

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
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; pointsAwarded: number } | null>(null);
  const [myEntry, setMyEntry] = useState<MyEntry | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [allowNameEditAtEnd, setAllowNameEditAtEnd] = useState(false);

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
      setPhase("intro");
    });

    socket.on(
      "question:new",
      (q: Question & { alreadyAnswered?: boolean; result?: { isCorrect: boolean; pointsAwarded: number } }) => {
        setQuestion(q);
        setTimeLeft(q.timeLimit);
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

    socket.on("answer:result", (result: { isCorrect: boolean; pointsAwarded: number }) => {
      setLastResult(result);
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
    socket.on("leaderboard:me", (entry: MyEntry) => {
      setMyEntry(entry);
      // Guarded: during a reconnect catch-up this can arrive after the game has
      // already ended, carrying the student's final score/rank — it must update
      // myEntry without knocking phase back from "ended" to the ordinary
      // per-question "leaderboard" screen.
      setPhase((prev) => (prev === "ended" ? prev : "leaderboard"));
    });

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
        <div className="text-center">
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
        </div>
      )}

      {(phase === "question" || phase === "answered") && question && (
        <div className="w-full max-w-md">
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
            <p className="text-center text-lg text-brand-text">Answer submitted! Waiting for others...</p>
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
      )}

      {phase === "leaderboard" && myEntry && (
        <div className="text-center">
          <p className="text-lg text-brand-text/80 mb-3">{displayName}</p>

          {lastResult ? (
            <p className={`text-4xl font-extrabold mb-4 ${lastResult.isCorrect ? "text-green-500" : "text-red-500"}`}>
              {lastResult.isCorrect ? "Correct!" : "Wrong"}
            </p>
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