-- DropIndex
DROP INDEX "question_payload_gin";

-- DropIndex
DROP INDEX "question_tagsflat_gin";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "chapter" TEXT,
ADD COLUMN     "section" TEXT;

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'sidebar',
    "appTheme" TEXT NOT NULL DEFAULT 'light',
    "sbTheme" TEXT NOT NULL DEFAULT 'dark',
    "dailyGoal" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Question_status_chapter_section_idx" ON "Question"("status", "chapter", "section");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
