-- Concurrent schedule items: an entry that runs at the same time as the entry
-- above it on its shoot day (starts with it instead of after it). The entry
-- after a concurrent group starts when the longest one ends.
-- Additive; default false keeps every existing schedule sequential as today.
ALTER TABLE "ScheduleEntry" ADD COLUMN "concurrentWithPrevious" BOOLEAN NOT NULL DEFAULT false;
