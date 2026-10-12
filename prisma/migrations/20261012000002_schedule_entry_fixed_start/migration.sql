-- Exact start times on stripboard items: "HH:mm" set by hand, NULL = automatic
-- (after the items above, or alongside them). A set time that falls inside the
-- items above runs during them, e.g. Talent call 09:00 during Setup 08:00–10:00.
-- Additive; NULL for every existing entry, so all times stay as they are.
ALTER TABLE "ScheduleEntry" ADD COLUMN "fixedStartTime" TEXT;
