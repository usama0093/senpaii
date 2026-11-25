-- AlterTable
ALTER TABLE "QodQuestion" ADD COLUMN     "answer" TEXT,
ADD COLUMN     "responseLimit" INTEGER;

-- AlterTable
ALTER TABLE "QodSessionQuestion" ADD COLUMN     "answerSnapshot" TEXT,
ADD COLUMN     "revealed" BOOLEAN NOT NULL DEFAULT false;
