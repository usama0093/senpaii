-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_selectedOptionId_fkey";

-- DropForeignKey
ALTER TABLE "QodResponse" DROP CONSTRAINT "QodResponse_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QodSession" DROP CONSTRAINT "QodSession_qodQuizId_fkey";

-- DropForeignKey
ALTER TABLE "QuizSession" DROP CONSTRAINT "QuizSession_quizId_fkey";

-- DropForeignKey
ALTER TABLE "SessionQuestion" DROP CONSTRAINT "SessionQuestion_questionId_fkey";

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "correctOptionTextSnapshot" TEXT,
ADD COLUMN     "questionTextSnapshot" TEXT,
ADD COLUMN     "selectedOptionTextSnapshot" TEXT;

-- AlterTable
ALTER TABLE "QodResponse" ADD COLUMN     "questionTextSnapshot" TEXT;

-- AlterTable
ALTER TABLE "QodSession" ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "quizTitleSnapshot" TEXT,
ADD COLUMN     "quizTopicSnapshot" TEXT,
ALTER COLUMN "qodQuizId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "QuizSession" ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "quizTitleSnapshot" TEXT,
ADD COLUMN     "quizTopicSnapshot" TEXT,
ALTER COLUMN "quizId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SessionQuestion" ADD COLUMN     "optionsSnapshot" JSONB,
ADD COLUMN     "pointsSnapshot" INTEGER,
ADD COLUMN     "questionTextSnapshot" TEXT,
ADD COLUMN     "questionTypeSnapshot" "QuestionType";

-- CreateTable
CREATE TABLE "QodSessionQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionTextSnapshot" TEXT,
    "order" INTEGER NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QodSessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QodSessionQuestion_sessionId_questionId_key" ON "QodSessionQuestion"("sessionId", "questionId");

-- AddForeignKey
ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QodSession" ADD CONSTRAINT "QodSession_qodQuizId_fkey" FOREIGN KEY ("qodQuizId") REFERENCES "QodQuiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QodSessionQuestion" ADD CONSTRAINT "QodSessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QodSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
