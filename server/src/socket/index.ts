import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import type { Question, QuestionOption } from "@prisma/client";
import prisma from "../config/prisma";
import { getRankedParticipants } from "../utils/ranking";
import { registerFeedbackSocket } from "./liveFeedback";
import { registerLiveQodSocket } from "./liveQod";
import { registerQodSessionSocket } from "./qodSession";
import {
  setActiveQuestion,
  getActiveQuestion,
  clearActiveQuestion,
  incrementAnsweredCount,
  setIntroTimer,
  clearIntroTimer,
  hasIntroTimer,
  setSessionSettings,
  getSessionSettings,
  setAutoplayTimer,
  clearAutoplayTimer,
  hasAutoplayTimer,
  markRevealed,
  hasRevealed,
} from "./gameState";
import { setQodSessionSettings } from "./qodGameState";
import { studentRoom as qodStudentRoom, hostRoom as qodHostRoom } from "./qodSession";
import { getSession as getLiveQodSession, hostRoom as liveQodHostRoom, studentRoom as liveQodStudentRoom } from "./liveQod";
import { getSession as getFeedbackSession, hostRoom as feedbackHostRoom, studentRoom as feedbackStudentRoom } from "./liveFeedback";

let io: SocketIOServer;

// How long the question is shown alone before the options appear.
const INTRO_MS = 4000;

// How long the leaderboard stays up before auto-advancing, when Autoplay is on.
const AUTOPLAY_DELAY_MS = 5000;

// How long the host's "Revealed" (correct-answer) screen stays up before the
// leaderboard appears. Previously this phase's visible duration was just an
// accident of however long the leaderboard DB query took — near-instant on local
// Postgres, a noticeable beat on Neon. This makes it a deliberate, fixed duration
// regardless of which database is active.
const REVEALED_DISPLAY_MS = 2000;

type QuestionWithOptions = Question & { options: QuestionOption[] };

// Remembers each session's PIN so we don't query the database for it every time.
const pinCache = new Map<string, string>();

// Sessions currently in the middle of starting a question (stops double clicks).
const advancing = new Set<string>();

// A separate room only the host screen joins (answered count, answer breakdown, top 5).
const hostRoom = (gamePin: string) => `host:${gamePin}`;

// A private room per student, so we can send them only their own rank.
const participantRoom = (participantId: string) => `participant:${participantId}`;

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  // io = new SocketIOServer(httpServer, {
  //   cors: { origin: process.env.CLIENT_URL || "http://localhost:5173" },
  // });

  // temporary socket configuration for testing purposes - WIFI
  io = new SocketIOServer(httpServer, {
    cors: { 
      origin: "*", // Allows mobile browsers on local Wi-Fi to open WebSocket connections
      methods: ["GET", "POST"]
    },
  });

  io.on("connection", (socket: Socket) => {
    registerFeedbackSocket(socket);
    registerLiveQodSocket(socket);
    registerQodSessionSocket(socket);
    socket.on("join-room", (gamePin: string) => {
      socket.join(gamePin);
    });

    socket.on("host:join-room", (gamePin: string) => {
      socket.join(hostRoom(gamePin));
    });

    socket.on("student:join", async ({ gamePin, participantId }) => {
      socket.join(gamePin);
      socket.join(participantRoom(participantId));

      // Catch-up for a reconnecting student (page refresh, or a backgrounded tab
      // reloading after the device was locked/turned off) — and also the very
      // FIRST connect after a fresh join, since the client no longer assumes
      // "waiting" by default (see PlayGame.tsx's new "loading" phase). Every
      // branch below sends an explicit event, so the client is never left to guess.
      try {
        const session = await prisma.quizSession.findFirst({
          where: { gamePin },
          select: {
            id: true,
            status: true,
            currentQuestionIndex: true,
            quiz: {
              select: {
                questions: {
                  where: { deletedAt: null },
                  orderBy: { order: "asc" },
                  include: { options: true },
                },
              },
            },
          },
        });
        if (!session) return;

        if (session.status === "WAITING") {
          socket.emit("session:waiting");
          return;
        }

        if (session.status === "ENDED") {
          socket.emit("game:ended");
          if (hasRevealed(session.id)) {
            const { allowNameEdit } = getSessionSettings(session.id);
            socket.emit("game:reveal", { allowNameEdit });

            const ranked = await getRankedParticipants(session.id);
            const index = ranked.findIndex((r) => r.participantId === participantId);
            if (index !== -1) {
              const aheadName = index > 0 ? ranked[index - 1].displayName : null;
              socket.emit("leaderboard:me", { ...ranked[index], aheadName });
            }
          }
          return;
        }

        // ACTIVE
        const totalQuestions = session.quiz?.questions.length ?? 0;
        const isFinalQuestion = session.currentQuestionIndex === totalQuestions - 1;
        const { showQaToStudents } = getSessionSettings(session.id);
        const currentQuestion = session.quiz?.questions[session.currentQuestionIndex];
        const active = getActiveQuestion(session.id);

        if (active && currentQuestion) {
          // Options are on screen right now, mid-countdown — replay with time
          // actually remaining, not the full original duration.
          const elapsedMs = Date.now() - active.startTime;
          const remainingSeconds = Math.max(0, Math.ceil((active.timeLimit * 1000 - elapsedMs) / 1000));

          const alreadyAnswered = await prisma.answer.findUnique({
            where: { participantId_questionId: { participantId, questionId: currentQuestion.id } },
          });

          // Folded into ONE emit rather than question:new + a second event — two
          // separate socket messages meant two separate re-renders, which is what
          // caused the live-tiles-then-answered flicker.
          socket.emit("question:new", {
            questionId: currentQuestion.id,
            text: currentQuestion.text,
            timeLimit: remainingSeconds,
            questionNumber: session.currentQuestionIndex + 1,
            totalQuestions,
            options: currentQuestion.options.map((o) => ({ id: o.id, text: o.text })),
            showAnswers: showQaToStudents,
            ...(alreadyAnswered && {
              alreadyAnswered: true,
              result: { isCorrect: alreadyAnswered.isCorrect, pointsAwarded: alreadyAnswered.pointsAwarded },
            }),
          });
        } else if (hasIntroTimer(session.id) && currentQuestion) {
          socket.emit("question:intro", {
            questionNumber: session.currentQuestionIndex + 1,
            totalQuestions,
            text: currentQuestion.text,
            introSeconds: INTRO_MS / 1000,
            showAnswers: showQaToStudents,
          });
        } else {
          // Idle between questions (leaderboard phase). currentQuestionIndex still
          // points at the question that was JUST completed (it only advances
          // inside advanceToNextQuestion's next call), so it's also the right
          // question to recover this student's own correct/wrong result from —
          // that result was never persisted client-side, only in the Answer table.
          const ranked = await getRankedParticipants(session.id);
          const index = ranked.findIndex((r) => r.participantId === participantId);
          if (index !== -1) {
            if (currentQuestion) {
              const myAnswer = await prisma.answer.findUnique({
                where: { participantId_questionId: { participantId, questionId: currentQuestion.id } },
              });
              if (myAnswer) {
                socket.emit("answer:result", { isCorrect: myAnswer.isCorrect, pointsAwarded: myAnswer.pointsAwarded });
              }
            }
            const aheadName = index > 0 ? ranked[index - 1].displayName : null;
            socket.emit("leaderboard:me", { ...ranked[index], aheadName, isFinalQuestion });
          }
        }
      } catch (err) {
        console.error("[student:join] catch-up failed:", err);
      }
    });

    socket.on("host:next-question", async ({ sessionId }) => {
      try {
        await advanceToNextQuestion(sessionId);
      } catch (err: any) {
        console.error("[next-question] failed:", err);
        socket.emit("error-message", err.message || "Could not start next question");
      }
    });

    socket.on("host:skip-timer", async ({ sessionId }) => {
      try {
        const active = getActiveQuestion(sessionId);
        if (!active) return; // nothing running right now — ignore
        await endQuestion(sessionId, active.questionId);
      } catch (err: any) {
        console.error("[skip-timer] failed:", err);
        socket.emit("error-message", err.message || "Could not skip timer");
      }
    });

    socket.on(
      "student:submit-answer",
      async ({ sessionId, participantId, questionId, selectedOptionId }) => {
        try {
          await handleAnswerSubmission(socket, sessionId, participantId, questionId, selectedOptionId);
        } catch (err: any) {
          console.error("[submit-answer] failed:", err);
          socket.emit("error-message", err.message || "Could not submit answer");
        }
      }
    );

    // Host toggles a setting (autoplay, show/hide Q&A, etc.) from the Settings dropdown.
    // Stored in memory per session, same lifetime as the rest of the live game state.
    socket.on("host:update-settings", async ({ sessionId, settings }) => {
      try {
        const updated = setSessionSettings(sessionId, settings);
        const gamePin = await getGamePin(sessionId);
        io.to(gamePin).to(hostRoom(gamePin)).emit("settings:update", updated);

        // Autoplay was previously only ever checked once, inside endQuestion() —
        // so flipping it on while already idle on the leaderboard (between
        // questions) did nothing until the NEXT question's own endQuestion() ran.
        // React to the toggle itself too: turning it on while idle starts the
        // pending advance immediately; turning it off cancels one that's already
        // counting down, instead of letting it silently fire later.
        if ("autoplay" in settings) {
          if (updated.autoplay) {
            await maybeStartAutoplayIfIdle(sessionId);
          } else {
            clearAutoplayTimer(sessionId);
          }
        }
      } catch (err: any) {
        console.error("[update-settings] failed:", err);
        socket.emit("error-message", err.message || "Could not update settings");
      }
    });

    // Host toggles the Regular QOD "allow name editing" setting from the Settings
    // dropdown. In-memory, same lifetime as the rest of a session's live state —
    // broadcast to BOTH rooms, since students (not just the host) need to know
    // right away whether their own Edit button should currently work.
    socket.on("qod-session:update-settings", async ({ sessionId, settings }) => {
      try {
        const updated = setQodSessionSettings(sessionId, settings);
        const session = await prisma.qodSession.findUnique({
          where: { id: sessionId },
          select: { gamePin: true },
        });
        if (!session) throw new Error("Session not found");
        io.to(qodHostRoom(session.gamePin))
          .to(qodStudentRoom(session.gamePin))
          .emit("qod-session:settings-update", updated);
      } catch (err: any) {
        console.error("[qod-update-settings] failed:", err);
        socket.emit("error-message", err.message || "Could not update settings");
      }
    });

    // Host toggles Live QOD's "allow name editing" setting. Lives directly on the
    // in-memory session object — no database, same as the rest of Live QOD.
    socket.on("qod:update-settings", ({ pin, settings }: { pin: string; settings: { allowNameEdit: boolean } }) => {
      try {
        const session = getLiveQodSession(pin);
        if (!session) throw new Error("Session not found");
        session.settings = { ...session.settings, ...settings };
        io.to(liveQodHostRoom(pin)).to(liveQodStudentRoom(pin)).emit("qod:settings-update", session.settings);
      } catch (err: any) {
        console.error("[qod-live-update-settings] failed:", err);
        socket.emit("error-message", err.message || "Could not update settings");
      }
    });

    // Host toggles Live Feedback's "allow name editing" setting. Same in-memory
    // pattern as Live QOD's own toggle above — no database, session-lifetime only.
    socket.on("feedback:update-settings", ({ pin, settings }: { pin: string; settings: { allowNameEdit: boolean } }) => {
      try {
        const session = getFeedbackSession(pin);
        if (!session) throw new Error("Session not found");
        session.settings = { ...session.settings, ...settings };
        io.to(feedbackHostRoom(pin)).to(feedbackStudentRoom(pin)).emit("feedback:settings-update", session.settings);
      } catch (err: any) {
        console.error("[feedback-update-settings] failed:", err);
        socket.emit("error-message", err.message || "Could not update settings");
      }
    });

    // Host clicks Continue on the final podium screen: this is the moment students'
    // "Game Over!" placeholder becomes the real reveal (name/rank/score, a gated
    // Edit button, Join Another Session). allowNameEdit is read fresh here, same
    // principle as Autoplay/Show-Q&A — the host could flip it right up to this click.
    socket.on("host:reveal-results", async ({ sessionId }) => {
      try {
        const gamePin = await getGamePin(sessionId);
        const { allowNameEdit } = getSessionSettings(sessionId);
        markRevealed(sessionId);
        io.to(gamePin).emit("game:reveal", { allowNameEdit });
      } catch (err: any) {
        console.error("[reveal-results] failed:", err);
        socket.emit("error-message", err.message || "Could not reveal results");
      }
    });

    socket.on("disconnect", () => {});
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.IO has not been initialized yet");
  return io;
}

// The server always finds the PIN itself. Browsers are never trusted for it.
async function getGamePin(sessionId: string): Promise<string> {
  const cached = pinCache.get(sessionId);
  if (cached) return cached;

  const session = await prisma.quizSession.findUnique({
    where: { id: sessionId },
    select: { gamePin: true },
  });
  if (!session) throw new Error("Session not found");

  pinCache.set(sessionId, session.gamePin);
  return session.gamePin;
}

// Host screen gets the top 5. Each student gets only their own entry.
// Everyone's full results stay in the database for the report.
async function broadcastLeaderboard(sessionId: string, gamePin: string) {
  const ranked = await getRankedParticipants(sessionId);

  io.to(hostRoom(gamePin)).emit("leaderboard:update", ranked.slice(0, 5));

  // Each student also learns who's ranked directly above them. Top-5 players don't
  // need this — they're already visible on the host's leaderboard — but it's free
  // to include for everyone here and let the client decide whether to show it.
  ranked.forEach((entry, index) => {
    const aheadName = index > 0 ? ranked[index - 1].displayName : null;
    io.to(participantRoom(entry.participantId)).emit("leaderboard:me", { ...entry, aheadName });
  });
}

function calculatePoints(questionPoints: number, timeTakenMs: number, timeLimitSeconds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0;
  const timeLimitMs = timeLimitSeconds * 1000;
  const speedRatio = Math.max(0, Math.min(1, 1 - timeTakenMs / timeLimitMs));
  return Math.round(questionPoints * (0.5 + 0.5 * speedRatio));
}

// Called when Autoplay is switched ON mid-game. Only actually starts a timer if
// the game is genuinely sitting idle between questions right now (leaderboard
// showing, nothing else running) — a question or its intro already in progress,
// or an autoplay timer already pending, is left completely alone. The status
// check rules out WAITING: no question has run yet there, so there's nothing to
// "continue" from.
async function maybeStartAutoplayIfIdle(sessionId: string) {
  if (getActiveQuestion(sessionId) || hasIntroTimer(sessionId) || hasAutoplayTimer(sessionId)) return;

  const session = await prisma.quizSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (!session || session.status !== "ACTIVE") return;

  setAutoplayTimer(
    sessionId,
    setTimeout(() => {
      advanceToNextQuestion(sessionId).catch(console.error);
    }, AUTOPLAY_DELAY_MS)
  );
}

// Step 1 of a question: show the question text alone, then start the real question after INTRO_MS.
async function advanceToNextQuestion(sessionId: string) {
  // A manual "Next"/"Final List" click always wins over a pending autoplay advance —
  // this also cleans up the timer entry when autoplay itself is what called us.
  clearAutoplayTimer(sessionId);

  // Ignore extra clicks while a question or its intro is already running.
  if (advancing.has(sessionId) || getActiveQuestion(sessionId) || hasIntroTimer(sessionId)) return;
  advancing.add(sessionId);

  try {
    const session = await prisma.quizSession.findUnique({
      where: { id: sessionId },
      include: {
        quiz: {
          include: {
            questions: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { options: true } },
          },
        },
      },
    });

    if (!session || session.deletedAt) throw new Error("Session not found");
    if (!session.quiz) throw new Error("This quiz has been deleted");
    const gamePin = session.gamePin;
    pinCache.set(sessionId, gamePin);

    const nextIndex = session.status === "WAITING" ? 0 : session.currentQuestionIndex + 1;
    const question = session.quiz.questions[nextIndex];
    const totalQuestions = session.quiz.questions.length;
    // Decided once per question, here, so the intro screen and the question screen
    // that follows it always agree — never re-read mid-question.
    const { showQaToStudents } = getSessionSettings(sessionId);

    if (!question) {
      // Freezing these here — the moment the game actually ends — is what makes
      // this report independent of the quiz from now on, not something figured
      // out later at delete-time.
      await prisma.quizSession.update({
        where: { id: sessionId },
        data: {
          status: "ENDED",
          endedAt: new Date(),
          hostId: session.quiz.hostId,
          quizTitleSnapshot: session.quiz.title,
          quizTopicSnapshot: session.quiz.topic,
        },
      });
      clearActiveQuestion(sessionId);
      pinCache.delete(sessionId);
      io.to(gamePin).emit("game:ended");
      return;
    }

    await prisma.quizSession.update({
      where: { id: sessionId },
      data: {
        status: "ACTIVE",
        currentQuestionIndex: nextIndex,
        startedAt: session.startedAt ?? new Date(),
      },
    });

    io.to(gamePin).emit("question:intro", {
      questionNumber: nextIndex + 1,
      totalQuestions,
      text: question.text,
      introSeconds: INTRO_MS / 1000,
      showAnswers: showQaToStudents,
    });

    setIntroTimer(
      sessionId,
      setTimeout(() => {
        startQuestion(sessionId, gamePin, question, nextIndex + 1, totalQuestions, showQaToStudents).catch(console.error);
      }, INTRO_MS)
    );
  } finally {
    advancing.delete(sessionId);
  }
}

// Step 2: the options appear and the server-side timer starts.
async function startQuestion(
  sessionId: string,
  gamePin: string,
  question: QuestionWithOptions,
  questionNumber: number,
  totalQuestions: number,
  showQaToStudents: boolean
) {
  clearIntroTimer(sessionId);

  // Record that this question was actually shown in this game, independent of
  // whether anyone answers it — this is what lets a never-answered question still
  // appear in the report. Upsert guards against this ever firing twice for the
  // same question without crashing on the unique constraint.
  await prisma.sessionQuestion.upsert({
    where: { sessionId_questionId: { sessionId, questionId: question.id } },
    create: {
      sessionId,
      questionId: question.id,
      order: questionNumber,
      questionTextSnapshot: question.text,
      questionTypeSnapshot: question.type,
      pointsSnapshot: question.points,
      optionsSnapshot: question.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, order: o.order })),
    },
    update: {},
  });

  const totalParticipants = await prisma.participant.count({ where: { sessionId } });

  const timeoutHandle = setTimeout(() => {
    endQuestion(sessionId, question.id).catch(console.error);
  }, question.timeLimit * 1000);

  setActiveQuestion(sessionId, {
    questionId: question.id,
    startTime: Date.now(),
    timeLimit: question.timeLimit,
    points: question.points,
    totalParticipants,
    answeredCount: 0,
    timeoutHandle,
  });

  io.to(gamePin).emit("question:new", {
    questionId: question.id,
    text: question.text,
    timeLimit: question.timeLimit,
    questionNumber,
    totalQuestions,
    options: question.options.map((o) => ({ id: o.id, text: o.text })),
    showAnswers: showQaToStudents,
  });
}

// The ONE place a question ever ends — timer, host skip, or "everyone answered."
async function endQuestion(sessionId: string, questionId: string) {
  const active = getActiveQuestion(sessionId);
  if (!active || active.questionId !== questionId) return; // already ended elsewhere

  clearActiveQuestion(sessionId); // also cancels the pending timer

  const gamePin = await getGamePin(sessionId);

  const [question, grouped] = await Promise.all([
    prisma.question.findUnique({ where: { id: questionId }, include: { options: true } }),
    prisma.answer.groupBy({
      by: ["selectedOptionId"],
      where: { questionId, participant: { sessionId } },
      _count: { _all: true },
    }),
  ]);
  const correctOption = question?.options.find((o) => o.isCorrect);

  // How many players picked each option — sent to the host screen only.
  const counts: Record<string, number> = {};
  for (const g of grouped) {
    if (g.selectedOptionId) counts[g.selectedOptionId] = g._count._all;
  }
  io.to(hostRoom(gamePin)).emit("question:stats", { questionId, counts });

  io.to(gamePin).emit("question:ended", { questionId, correctOptionId: correctOption?.id });

  await new Promise((resolve) => setTimeout(resolve, REVEALED_DISPLAY_MS));

  await broadcastLeaderboard(sessionId, gamePin);

  // Autoplay: after the leaderboard is up, move on by itself — a manual "Next"/
  // "Final List" click (which clears this timer, see advanceToNextQuestion) always wins.
  const { autoplay } = getSessionSettings(sessionId);
  if (autoplay) {
    setAutoplayTimer(
      sessionId,
      setTimeout(() => {
        advanceToNextQuestion(sessionId).catch(console.error);
      }, AUTOPLAY_DELAY_MS)
    );
  }
}

async function handleAnswerSubmission(
  socket: Socket,
  sessionId: string,
  participantId: string,
  questionId: string,
  selectedOptionId: string
) {
  const active = getActiveQuestion(sessionId);
  if (!active || active.questionId !== questionId) {
    throw new Error("This question is no longer active");
  }

  const alreadyAnswered = await prisma.answer.findUnique({
    where: { participantId_questionId: { participantId, questionId } },
  });
  if (alreadyAnswered) throw new Error("You have already answered this question");

  const question = await prisma.question.findUnique({ where: { id: questionId }, include: { options: true } });
  if (!question) throw new Error("Question not found");

  const selectedOption = question.options.find((o) => o.id === selectedOptionId);
  if (!selectedOption) throw new Error("Invalid option selected");
  const correctOption = question.options.find((o) => o.isCorrect);

  const timeTakenMs = Date.now() - active.startTime;
  const pointsAwarded = calculatePoints(active.points, timeTakenMs, active.timeLimit, selectedOption.isCorrect);

  await prisma.answer.create({
    data: {
      participantId,
      questionId,
      selectedOptionId,
      isCorrect: selectedOption.isCorrect,
      pointsAwarded,
      timeTakenMs,
      questionTextSnapshot: question.text,
      selectedOptionTextSnapshot: selectedOption.text,
      correctOptionTextSnapshot: correctOption?.text ?? null,
    },
  }); 

  await prisma.participant.update({
    where: { id: participantId },
    data: { score: { increment: pointsAwarded } },
  });

  socket.emit("answer:result", { isCorrect: selectedOption.isCorrect, pointsAwarded });

  // Tell the host screen how many have answered so far (host room only).
  const answeredCount = incrementAnsweredCount(sessionId);
  const gamePin = await getGamePin(sessionId);
  io.to(hostRoom(gamePin)).emit("answer:count", { answered: answeredCount, total: active.totalParticipants });

  // Everyone answered? End now instead of waiting out the timer.
  if (answeredCount >= active.totalParticipants) {
    await endQuestion(sessionId, questionId);
  }
}