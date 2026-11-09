/*
  Warnings:

  - A unique constraint covering the columns `[hostId,name,type]` on the table `Category` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('QUIZ', 'QOD');

-- DropIndex
DROP INDEX "Category_hostId_name_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "type" "CategoryType" NOT NULL DEFAULT 'QUIZ';

-- CreateIndex
CREATE UNIQUE INDEX "Category_hostId_name_type_key" ON "Category"("hostId", "name", "type");
