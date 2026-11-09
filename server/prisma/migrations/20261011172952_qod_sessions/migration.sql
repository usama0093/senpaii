-- CreateEnum
CREATE TYPE "QodSessionStatus" AS ENUM ('WAITING', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "QodSession" (
    "id" TEXT NOT NULL,
    "qodQuizId" TEXT NOT NULL,
    "gamePin" TEXT NOT NULL,
    "status" "QodSessionStatus" NOT NULL DEFAULT 'WAITING',
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QodSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QodParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QodParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QodResponse" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QodResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QodSession_gamePin_key" ON "QodSession"("gamePin");

-- CreateIndex
CREATE UNIQUE INDEX "QodResponse_participantId_questionId_key" ON "QodResponse"("participantId", "questionId");

-- AddForeignKey
ALTER TABLE "QodSession" ADD CONSTRAINT "QodSession_qodQuizId_fkey" FOREIGN KEY ("qodQuizId") REFERENCES "QodQuiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QodParticipant" ADD CONSTRAINT "QodParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QodSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QodResponse" ADD CONSTRAINT "QodResponse_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "QodParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QodResponse" ADD CONSTRAINT "QodResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QodQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
