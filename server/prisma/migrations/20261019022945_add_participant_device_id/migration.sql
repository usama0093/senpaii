/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,deviceId]` on the table `Participant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sessionId,deviceId]` on the table `QodParticipant` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "deviceId" TEXT;

-- AlterTable
ALTER TABLE "QodParticipant" ADD COLUMN     "deviceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Participant_sessionId_deviceId_key" ON "Participant"("sessionId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "QodParticipant_sessionId_deviceId_key" ON "QodParticipant"("sessionId", "deviceId");
