// server/src/scripts/backfillReportSnapshots.ts
//
// One-off: fills in the new snapshot columns on every existing ENDED session so
// old reports are protected too, not just ones from games played after this
// change ships. Safe to re-run — every step only touches rows still missing
// their snapshot. A quiz/question that was ALREADY permanently deleted before
// this script ever ran has nothing left to source a snapshot from; those specific
// old reports will keep a "Deleted quiz" placeholder for whatever piece is
// missing, but nothing crashes and scores/answers/names are untouched either way.
import prisma from "../config/prisma";

async function backfillQuizSessions() {
  // Every session needs hostId, not just ended ones — the column is required on
  // every row regardless of status. A WAITING/ACTIVE session still has its quiz
  // intact, so hostId is simply read off that.
  const sessions = await prisma.quizSession.findMany({
    where: { hostId: null as any },
    include: { quiz: true },
  });

  for (const session of sessions) {
    if (!session.quiz) continue; // nothing left to snapshot from
    await prisma.quizSession.update({
      where: { id: session.id },
      data: {
        hostId: session.quiz.hostId,
        quizTitleSnapshot: session.quiz.title,
        quizTopicSnapshot: session.quiz.topic,
      },
    });
  }
  console.log(`Quiz Session: backfilled ${sessions.length} session(s)`);
}

async function backfillSessionQuestions() {
  const sessionsWithRows = await prisma.sessionQuestion.findMany({
    where: { questionTextSnapshot: null as any },
    select: { id: true, questionId: true },
  });

  for (const row of sessionsWithRows) {
    const question = await prisma.question.findUnique({
      where: { id: row.questionId },
      include: { options: { orderBy: { order: "asc" } } },
    });
    if (!question) continue;
    await prisma.sessionQuestion.update({
      where: { id: row.id },
      data: {
        questionTextSnapshot: question.text,
        questionTypeSnapshot: question.type,
        pointsSnapshot: question.points,
        optionsSnapshot: question.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
          order: o.order,
        })),
      },
    });
  }
  console.log(`SessionQuestion: backfilled ${sessionsWithRows.length} existing row(s)`);

  // Very old sessions (played before SessionQuestion existed) have ZERO rows at
  // all — synthesize them from whichever questions were actually answered.
  const endedSessions = await prisma.quizSession.findMany({
    where: { status: "ENDED" },
    select: { id: true },
  });

  let synthesized = 0;
  for (const session of endedSessions) {
    const existingCount = await prisma.sessionQuestion.count({ where: { sessionId: session.id } });
    if (existingCount > 0) continue;

    const answeredQuestionIds = await prisma.answer.findMany({
      where: { participant: { sessionId: session.id } },
      select: { questionId: true },
      distinct: ["questionId"],
    });
    if (answeredQuestionIds.length === 0) continue;

    const questions = await prisma.question.findMany({
      where: { id: { in: answeredQuestionIds.map((a) => a.questionId) } },
      orderBy: { order: "asc" },
      include: { options: { orderBy: { order: "asc" } } },
    });

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await prisma.sessionQuestion.create({
        data: {
          sessionId: session.id,
          questionId: q.id,
          order: i + 1,
          questionTextSnapshot: q.text,
          questionTypeSnapshot: q.type,
          pointsSnapshot: q.points,
          optionsSnapshot: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, order: o.order })),
        },
      });
    }
    synthesized++;
  }
  console.log(`SessionQuestion: synthesized rows for ${synthesized} pre-existing session(s)`);
}

async function backfillAnswers() {
  const answers = await prisma.answer.findMany({
    where: { questionTextSnapshot: null as any },
    select: { id: true, questionId: true, selectedOptionId: true },
  });

  for (const a of answers) {
    const question = await prisma.question.findUnique({
      where: { id: a.questionId },
      include: { options: true },
    });
    if (!question) continue;
    const selected = question.options.find((o) => o.id === a.selectedOptionId);
    const correct = question.options.find((o) => o.isCorrect);
    await prisma.answer.update({
      where: { id: a.id },
      data: {
        questionTextSnapshot: question.text,
        selectedOptionTextSnapshot: selected?.text ?? null,
        correctOptionTextSnapshot: correct?.text ?? null,
      },
    });
  }
  console.log(`Answer: backfilled ${answers.length} row(s)`);
}

async function backfillQodSessions() {
  const sessions = await prisma.qodSession.findMany({
    where: { hostId: null as any },
    include: { qodQuiz: true },
  });

  for (const session of sessions) {
    if (!session.qodQuiz) continue;
    await prisma.qodSession.update({
      where: { id: session.id },
      data: {
        hostId: session.qodQuiz.hostId,
        quizTitleSnapshot: session.qodQuiz.title,
        quizTopicSnapshot: session.qodQuiz.topic,
      },
    });
  }
  console.log(`QOD Session: backfilled ${sessions.length} session(s)`);
}

async function backfillQodSessionQuestions() {
  // This table is brand new for QOD — every ended session needs rows synthesized.
  const endedSessions = await prisma.qodSession.findMany({
    where: { status: "ENDED" },
    select: { id: true },
  });

  let synthesized = 0;
  for (const session of endedSessions) {
    const existingCount = await prisma.qodSessionQuestion.count({ where: { sessionId: session.id } });
    if (existingCount > 0) continue;

    const respondedQuestionIds = await prisma.qodResponse.findMany({
      where: { participant: { sessionId: session.id } },
      select: { questionId: true },
      distinct: ["questionId"],
    });
    if (respondedQuestionIds.length === 0) continue;

    const questions = await prisma.qodQuestion.findMany({
      where: { id: { in: respondedQuestionIds.map((r) => r.questionId) } },
      orderBy: { order: "asc" },
    });

    for (let i = 0; i < questions.length; i++) {
      await prisma.qodSessionQuestion.create({
        data: {
          sessionId: session.id,
          questionId: questions[i].id,
          order: i + 1,
          questionTextSnapshot: questions[i].text,
        },
      });
    }
    synthesized++;
  }
  console.log(`QodSessionQuestion: synthesized rows for ${synthesized} session(s)`);
}

async function backfillQodResponses() {
  const responses = await prisma.qodResponse.findMany({
    where: { questionTextSnapshot: null as any },
    select: { id: true, questionId: true },
  });

  for (const r of responses) {
    const question = await prisma.qodQuestion.findUnique({ where: { id: r.questionId } });
    if (!question) continue;
    await prisma.qodResponse.update({
      where: { id: r.id },
      data: { questionTextSnapshot: question.text },
    });
  }
  console.log(`QodResponse: backfilled ${responses.length} row(s)`);
}

async function main() {
  await backfillQuizSessions();
  await backfillSessionQuestions();
  await backfillAnswers();
  await backfillQodSessions();
  await backfillQodSessionQuestions();
  await backfillQodResponses();
  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());