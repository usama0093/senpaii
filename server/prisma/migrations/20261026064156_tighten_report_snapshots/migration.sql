/*
  Warnings:

  - Made the column `questionTextSnapshot` on table `Answer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `questionTextSnapshot` on table `QodResponse` required. This step will fail if there are existing NULL values in that column.
  - Made the column `hostId` on table `QodSession` required. This step will fail if there are existing NULL values in that column.
  - Made the column `questionTextSnapshot` on table `QodSessionQuestion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `hostId` on table `QuizSession` required. This step will fail if there are existing NULL values in that column.
  - Made the column `optionsSnapshot` on table `SessionQuestion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `pointsSnapshot` on table `SessionQuestion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `questionTextSnapshot` on table `SessionQuestion` required. This step will fail if there are existing NULL values in that column.
  - Made the column `questionTypeSnapshot` on table `SessionQuestion` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Answer" ALTER COLUMN "questionTextSnapshot" SET NOT NULL;

-- AlterTable
ALTER TABLE "QodResponse" ALTER COLUMN "questionTextSnapshot" SET NOT NULL;

-- AlterTable
ALTER TABLE "QodSession" ALTER COLUMN "hostId" SET NOT NULL;

-- AlterTable
ALTER TABLE "QodSessionQuestion" ALTER COLUMN "questionTextSnapshot" SET NOT NULL;

-- AlterTable
ALTER TABLE "QuizSession" ALTER COLUMN "hostId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SessionQuestion" ALTER COLUMN "optionsSnapshot" SET NOT NULL,
ALTER COLUMN "pointsSnapshot" SET NOT NULL,
ALTER COLUMN "questionTextSnapshot" SET NOT NULL,
ALTER COLUMN "questionTypeSnapshot" SET NOT NULL;
