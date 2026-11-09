-- CreateTable
CREATE TABLE "QodQuiz" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "topic" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Generic',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "timePerQuestion" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QodQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QodQuestion" (
    "id" TEXT NOT NULL,
    "qodQuizId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timeLimit" INTEGER,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QodQuestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "QodQuiz" ADD CONSTRAINT "QodQuiz_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QodQuestion" ADD CONSTRAINT "QodQuestion_qodQuizId_fkey" FOREIGN KEY ("qodQuizId") REFERENCES "QodQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
