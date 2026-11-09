-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Generic',
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;
