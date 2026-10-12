-- Setup and Wrap banners on the stripboard, each with its own colour.
-- Additive: new enum values only; existing banners are unchanged.
ALTER TYPE "BannerType" ADD VALUE IF NOT EXISTS 'SETUP';
ALTER TYPE "BannerType" ADD VALUE IF NOT EXISTS 'WRAP';
