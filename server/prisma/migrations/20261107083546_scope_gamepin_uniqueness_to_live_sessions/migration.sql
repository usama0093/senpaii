-- DropIndex
DROP INDEX "QodSession_gamePin_key";

-- DropIndex
DROP INDEX "QuizSession_gamePin_key";

-- Replace with partial unique indexes: gamePin only has to be unique among
-- sessions that are still WAITING or ACTIVE. An ENDED session's PIN becomes
-- free for reuse immediately, while the report itself (its own id, snapshots)
-- stays completely unaffected — nothing about report independence changes.
CREATE UNIQUE INDEX "QuizSession_gamePin_live_key" ON "QuizSession" ("gamePin") WHERE "status" != 'ENDED';
CREATE UNIQUE INDEX "QodSession_gamePin_live_key" ON "QodSession" ("gamePin") WHERE "status" != 'ENDED';