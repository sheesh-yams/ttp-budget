-- Free-text location on scenes: a room/area within the chosen Location
-- ("Master bedroom"), or the whole place when no Location is picked ("Garage").
-- Additive; NULL for every existing scene, so nothing changes until it's typed.
ALTER TABLE "Scene" ADD COLUMN "locationDetail" TEXT;
