-- Rolodex: dietary restrictions for crew & talent. Quick-pick tags
-- (e.g. 'VEGAN', 'NUT_ALLERGY') plus a free-text note. Internal only —
-- shown on the Crew page and in the call sheet editor, never on the
-- call sheet that's sent out. Additive; existing contacts start empty.
ALTER TABLE "Contact" ADD COLUMN "dietaryTags"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Contact" ADD COLUMN "dietaryNotes" TEXT;
