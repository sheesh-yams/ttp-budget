import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ---------------------------------------------------------------------------
// Stable seed IDs
// Convention: "grc-" prefix for GlobalRateCard, "gtpl-" for GlobalTemplate,
// "seed-" prefix preserved for TTP workspace-specific rows.
// ---------------------------------------------------------------------------

const globalRates = [
  // ── CREW ─────────────────────────────────────────────────────────────────
  { id: 'grc-director',              role: 'Director',               category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 240000, isFeatured: true,  sortOrder: 10 },
  { id: 'grc-executive-producer',    role: 'Executive Producer',     category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 180000, isFeatured: false, sortOrder: 20 },
  { id: 'grc-producer',              role: 'Producer',               category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 120000, isFeatured: true,  sortOrder: 30 },
  { id: 'grc-dp',                    role: 'DP / Cinematographer',   category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 180000, isFeatured: true,  sortOrder: 40 },
  { id: 'grc-videographer',          role: 'Videographer',           category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 85000,  isFeatured: true,  sortOrder: 50 },
  { id: 'grc-videographer-2nd',      role: 'Videographer — 2nd Unit',category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 65000,  isFeatured: false, sortOrder: 60 },
  { id: 'grc-1st-ac',                role: '1st AC',                 category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 90000,  isFeatured: true,  sortOrder: 70 },
  { id: 'grc-2nd-ac',                role: '2nd AC',                 category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 65000,  isFeatured: false, sortOrder: 80 },
  { id: 'grc-gaffer',                role: 'Gaffer',                 category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 120000, isFeatured: true,  sortOrder: 90 },
  { id: 'grc-key-grip',              role: 'Key Grip',               category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 110000, isFeatured: true,  sortOrder: 100 },
  { id: 'grc-best-boy',              role: 'Best Boy',               category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 80000,  isFeatured: false, sortOrder: 110 },
  { id: 'grc-pa',                    role: 'Production Assistant',   category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 45000,  isFeatured: true,  sortOrder: 120 },
  { id: 'grc-art-director',          role: 'Art Director',           category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 150000, isFeatured: false, sortOrder: 130 },
  { id: 'grc-stylist',               role: 'Stylist',                category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 95000,  isFeatured: false, sortOrder: 140 },
  { id: 'grc-hmua',                  role: 'Hair & Makeup Artist',   category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 80000,  isFeatured: false, sortOrder: 150 },
  { id: 'grc-drone-operator',        role: 'Drone Operator',         category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 120000, isFeatured: false, sortOrder: 160 },
  { id: 'grc-bts-photographer',      role: 'BTS Photographer',       category: 'CREW',           defaultUnit: 'DAY',  defaultRateCents: 75000,  isFeatured: false, sortOrder: 170 },

  // ── EQUIPMENT ─────────────────────────────────────────────────────────────
  { id: 'grc-red-komodo',            role: 'RED Komodo Package',          category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 185000, isFeatured: true,  sortOrder: 210 },
  { id: 'grc-arri-alexa',            role: 'ARRI Alexa Mini Package',     category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 280000, isFeatured: false, sortOrder: 220 },
  { id: 'grc-sony-fx9',              role: 'Sony FX9 Package',            category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 95000,  isFeatured: false, sortOrder: 230 },
  { id: 'grc-lens-primes',           role: 'Lens Package (Primes)',        category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 75000,  isFeatured: false, sortOrder: 240 },
  { id: 'grc-lighting-hmi',          role: 'Lighting Package (HMI)',       category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 120000, isFeatured: false, sortOrder: 250 },
  { id: 'grc-grip-package',          role: 'Grip Package',                category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 80000,  isFeatured: false, sortOrder: 260 },
  { id: 'grc-sound-package',         role: 'Sound Package + Mixer',       category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 90000,  isFeatured: false, sortOrder: 270 },
  { id: 'grc-ronin',                 role: 'DJI Ronin Gimbal',            category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 40000,  isFeatured: false, sortOrder: 280 },
  { id: 'grc-drone-mavic',           role: 'DJI Drone (Mavic 3)',         category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 55000,  isFeatured: false, sortOrder: 290 },
  { id: 'grc-production-van',        role: 'Production Van / Truck',      category: 'EQUIPMENT',  defaultUnit: 'DAY',  defaultRateCents: 45000,  isFeatured: false, sortOrder: 300 },

  // ── POST ─────────────────────────────────────────────────────────────────
  { id: 'grc-editor',                role: 'Video Editor',           category: 'POST',           defaultUnit: 'DAY',  defaultRateCents: 75000,  isFeatured: true,  sortOrder: 410 },
  { id: 'grc-motion-graphics',       role: 'Motion Graphics',        category: 'POST',           defaultUnit: 'DAY',  defaultRateCents: 85000,  isFeatured: false, sortOrder: 420 },
  { id: 'grc-color-grade',           role: 'Color Grade',            category: 'POST',           defaultUnit: 'DAY',  defaultRateCents: 140000, isFeatured: true,  sortOrder: 430 },
  { id: 'grc-sound-mix',             role: 'Sound Mix & Master',     category: 'POST',           defaultUnit: 'FLAT', defaultRateCents: 150000, isFeatured: true,  sortOrder: 440 },
  { id: 'grc-vfx',                   role: 'VFX / Compositing',      category: 'POST',           defaultUnit: 'DAY',  defaultRateCents: 120000, isFeatured: false, sortOrder: 450 },
  { id: 'grc-captions',              role: 'Subtitles / Captions',   category: 'POST',           defaultUnit: 'FLAT', defaultRateCents: 35000,  isFeatured: false, sortOrder: 460 },

  // ── LOCATION ─────────────────────────────────────────────────────────────
  { id: 'grc-location-fee',          role: 'Location Fee',           category: 'LOCATION',       defaultUnit: 'DAY',  defaultRateCents: 150000, isFeatured: true,  sortOrder: 510 },
  { id: 'grc-location-scout',        role: 'Location Scout',         category: 'LOCATION',       defaultUnit: 'DAY',  defaultRateCents: 80000,  isFeatured: false, sortOrder: 520 },
  { id: 'grc-studio-rental',         role: 'Studio Rental',          category: 'LOCATION',       defaultUnit: 'DAY',  defaultRateCents: 200000, isFeatured: false, sortOrder: 530 },
  { id: 'grc-permits',               role: 'Permits & Insurance',    category: 'LOCATION',       defaultUnit: 'FLAT', defaultRateCents: 120000, isFeatured: true,  sortOrder: 540 },

  // ── CATERING ─────────────────────────────────────────────────────────────
  { id: 'grc-catering-full',         role: 'Catering & Craft Services',      category: 'CATERING', defaultUnit: 'DAY',  defaultRateCents: 90000,  isFeatured: true,  sortOrder: 610 },
  { id: 'grc-craft-services',        role: 'Craft Services (small crew)',     category: 'CATERING', defaultUnit: 'DAY',  defaultRateCents: 40000,  isFeatured: false, sortOrder: 620 },

  // ── TALENT ─────────────────────────────────────────────────────────────
  { id: 'grc-principal-talent',      role: 'Principal Talent',       category: 'TALENT',         defaultUnit: 'DAY',  defaultRateCents: 200000, isFeatured: false, sortOrder: 710 },
  { id: 'grc-background',            role: 'Background / Extras',    category: 'TALENT',         defaultUnit: 'DAY',  defaultRateCents: 30000,  isFeatured: false, sortOrder: 720 },

  // ── TRAVEL ─────────────────────────────────────────────────────────────
  { id: 'grc-flights',               role: 'Flights (per person)',    category: 'TRAVEL',         defaultUnit: 'FLAT', defaultRateCents: 80000,  isFeatured: false, sortOrder: 810 },
  { id: 'grc-hotel',                 role: 'Hotel (per person/night)',category: 'TRAVEL',         defaultUnit: 'FLAT', defaultRateCents: 25000,  isFeatured: false, sortOrder: 820 },
  { id: 'grc-ground-transport',      role: 'Ground Transport',        category: 'TRAVEL',         defaultUnit: 'DAY',  defaultRateCents: 35000,  isFeatured: false, sortOrder: 830 },

  // ── PRODUCTION_FEE ────────────────────────────────────────────────────────
  { id: 'grc-production-fee',        role: 'Production Fee (20%)',   category: 'PRODUCTION_FEE', defaultUnit: 'FLAT', defaultRateCents: 0,       isFeatured: true,  sortOrder: 910 },
  { id: 'grc-agency-markup',         role: 'Agency Markup (15%)',     category: 'PRODUCTION_FEE', defaultUnit: 'FLAT', defaultRateCents: 0,       isFeatured: false, sortOrder: 920 },
] as const

// Template structures reference GlobalRateCard IDs so the library page can
// resolve names. When seeding into a workspace, rateCardId is cleared
// (workspace copy has its own IDs matched by role).
const globalTemplates = [
  {
    id: 'gtpl-music-video-standard',
    name: 'Music Video — Standard Crew',
    shootType: 'MUSIC_VIDEO',
    templateKind: 'FULL',
    isFeatured: true,
    sortOrder: 10,
    description: '1-day shoot with full crew, RED camera, and complete post package.',
    structure: {
      accounts: [
        { name: 'Above the Line', code: '100', items: [
          { description: 'Director',            qty: 1, unit: 'DAY',  rateCents: 240000 },
          { description: 'Producer',            qty: 1, unit: 'DAY',  rateCents: 120000 },
        ]},
        { name: 'Camera', code: '200', items: [
          { description: 'DP / Cinematographer',qty: 1, unit: 'DAY',  rateCents: 180000 },
          { description: '1st AC',              qty: 1, unit: 'DAY',  rateCents: 90000  },
          { description: 'RED Komodo Package',  qty: 1, unit: 'DAY',  rateCents: 185000 },
          { description: 'Lens Package (Primes)',qty: 1,unit: 'DAY',  rateCents: 75000  },
        ]},
        { name: 'Lighting & Grip', code: '300', items: [
          { description: 'Gaffer',                  qty: 1, unit: 'DAY', rateCents: 120000 },
          { description: 'Key Grip',                qty: 1, unit: 'DAY', rateCents: 110000 },
          { description: 'Lighting Package (HMI)',  qty: 1, unit: 'DAY', rateCents: 120000 },
          { description: 'Grip Package',            qty: 1, unit: 'DAY', rateCents: 80000  },
        ]},
        { name: 'Location', code: '400', items: [
          { description: 'Location Fee',        qty: 1, unit: 'DAY',  rateCents: 150000 },
          { description: 'Permits & Insurance', qty: 1, unit: 'FLAT', rateCents: 120000 },
        ]},
        { name: 'Art & Styling', code: '500', items: [
          { description: 'Stylist',             qty: 1, unit: 'DAY',  rateCents: 95000  },
          { description: 'Hair & Makeup Artist',qty: 1, unit: 'DAY',  rateCents: 80000  },
        ]},
        { name: 'Production Support', code: '600', items: [
          { description: 'Production Assistant',    qty: 2, unit: 'DAY', rateCents: 45000 },
          { description: 'Catering & Craft Services',qty:1, unit: 'DAY', rateCents: 90000 },
        ]},
        { name: 'Post Production', code: '700', items: [
          { description: 'Video Editor',        qty: 3, unit: 'DAY',  rateCents: 75000  },
          { description: 'Color Grade',         qty: 1, unit: 'DAY',  rateCents: 140000 },
          { description: 'Sound Mix & Master',  qty: 1, unit: 'FLAT', rateCents: 150000 },
        ]},
        { name: 'Production Fee', code: '900', items: [
          { description: 'Production Fee (20%)',qty: 1, unit: 'FLAT', rateCents: 0 },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-brand-campaign-2day',
    name: 'Brand Campaign — 2-Day Shoot',
    shootType: 'BRAND_CAMPAIGN',
    templateKind: 'FULL',
    isFeatured: true,
    sortOrder: 20,
    description: 'Corporate/brand shoot with ARRI, full crew, studio, talent, and deliverables.',
    structure: {
      accounts: [
        { name: 'Above the Line', code: '100', items: [
          { description: 'Director',             qty: 2, unit: 'DAY', rateCents: 240000 },
          { description: 'Executive Producer',   qty: 2, unit: 'DAY', rateCents: 180000 },
        ]},
        { name: 'Camera', code: '200', items: [
          { description: 'DP / Cinematographer',qty: 2, unit: 'DAY',  rateCents: 180000 },
          { description: '1st AC',              qty: 2, unit: 'DAY',  rateCents: 90000  },
          { description: '2nd AC',              qty: 2, unit: 'DAY',  rateCents: 65000  },
          { description: 'ARRI Alexa Mini Package',qty:2,unit: 'DAY', rateCents: 280000 },
          { description: 'Lens Package (Primes)',qty: 2, unit: 'DAY', rateCents: 75000  },
        ]},
        { name: 'Lighting & Grip', code: '300', items: [
          { description: 'Gaffer',               qty: 2, unit: 'DAY', rateCents: 120000 },
          { description: 'Best Boy',             qty: 2, unit: 'DAY', rateCents: 80000  },
          { description: 'Key Grip',             qty: 2, unit: 'DAY', rateCents: 110000 },
          { description: 'Lighting Package (HMI)',qty:2, unit: 'DAY', rateCents: 120000 },
          { description: 'Grip Package',         qty: 2, unit: 'DAY', rateCents: 80000  },
        ]},
        { name: 'Location', code: '400', items: [
          { description: 'Studio Rental',        qty: 2, unit: 'DAY', rateCents: 200000 },
          { description: 'Permits & Insurance',  qty: 1, unit: 'FLAT',rateCents: 120000 },
        ]},
        { name: 'Talent', code: '500', items: [
          { description: 'Principal Talent',     qty: 2, unit: 'DAY', rateCents: 200000 },
        ]},
        { name: 'Art & Styling', code: '600', items: [
          { description: 'Art Director',         qty: 2, unit: 'DAY', rateCents: 150000 },
          { description: 'Stylist',              qty: 2, unit: 'DAY', rateCents: 95000  },
          { description: 'Hair & Makeup Artist', qty: 2, unit: 'DAY', rateCents: 80000  },
        ]},
        { name: 'Production Support', code: '700', items: [
          { description: 'Production Assistant',     qty: 2, unit: 'DAY', rateCents: 45000 },
          { description: 'Catering & Craft Services',qty: 2, unit: 'DAY', rateCents: 90000 },
          { description: 'BTS Photographer',         qty: 2, unit: 'DAY', rateCents: 75000 },
        ]},
        { name: 'Post Production', code: '800', items: [
          { description: 'Video Editor',         qty: 5, unit: 'DAY',  rateCents: 75000  },
          { description: 'Motion Graphics',      qty: 2, unit: 'DAY',  rateCents: 85000  },
          { description: 'Color Grade',          qty: 1, unit: 'DAY',  rateCents: 140000 },
          { description: 'Sound Mix & Master',   qty: 1, unit: 'FLAT', rateCents: 150000 },
          { description: 'Subtitles / Captions', qty: 1, unit: 'FLAT', rateCents: 35000  },
        ]},
        { name: 'Production Fee', code: '900', items: [
          { description: 'Production Fee (20%)', qty: 1, unit: 'FLAT', rateCents: 0 },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-product-shoot-studio',
    name: 'Product Shoot — Studio Day',
    shootType: 'PRODUCT_SHOOT',
    templateKind: 'FULL',
    isFeatured: true,
    sortOrder: 30,
    description: 'Single studio day for product photography/video with styled set.',
    structure: {
      accounts: [
        { name: 'Crew', code: '100', items: [
          { description: 'Director',             qty: 1, unit: 'DAY', rateCents: 240000 },
          { description: 'DP / Cinematographer', qty: 1, unit: 'DAY', rateCents: 180000 },
          { description: '1st AC',               qty: 1, unit: 'DAY', rateCents: 90000  },
          { description: 'Gaffer',               qty: 1, unit: 'DAY', rateCents: 120000 },
          { description: 'Art Director',         qty: 1, unit: 'DAY', rateCents: 150000 },
          { description: 'Stylist',              qty: 1, unit: 'DAY', rateCents: 95000  },
          { description: 'Production Assistant', qty: 1, unit: 'DAY', rateCents: 45000  },
        ]},
        { name: 'Equipment', code: '200', items: [
          { description: 'RED Komodo Package',   qty: 1, unit: 'DAY', rateCents: 185000 },
          { description: 'Lighting Package (HMI)',qty:1, unit: 'DAY', rateCents: 120000 },
          { description: 'Grip Package',         qty: 1, unit: 'DAY', rateCents: 80000  },
        ]},
        { name: 'Location', code: '300', items: [
          { description: 'Studio Rental',        qty: 1, unit: 'DAY', rateCents: 200000 },
        ]},
        { name: 'Post Production', code: '400', items: [
          { description: 'Video Editor',         qty: 2, unit: 'DAY', rateCents: 75000  },
          { description: 'Color Grade',          qty: 1, unit: 'DAY', rateCents: 140000 },
        ]},
        { name: 'Production Fee', code: '900', items: [
          { description: 'Production Fee (20%)', qty: 1, unit: 'FLAT', rateCents: 0 },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-event-recap-single-cam',
    name: 'Event Recap — Single Camera',
    shootType: 'EVENT_RECAP',
    templateKind: 'FULL',
    isFeatured: true,
    sortOrder: 40,
    description: 'Live event coverage with one camera operator and quick-turn edit.',
    structure: {
      accounts: [
        { name: 'Crew', code: '100', items: [
          { description: 'Videographer',         qty: 1, unit: 'DAY', rateCents: 85000 },
          { description: 'Production Assistant', qty: 1, unit: 'DAY', rateCents: 45000 },
        ]},
        { name: 'Equipment', code: '200', items: [
          { description: 'Sony FX9 Package',     qty: 1, unit: 'DAY', rateCents: 95000 },
          { description: 'Sound Package + Mixer',qty: 1, unit: 'DAY', rateCents: 90000 },
        ]},
        { name: 'Post Production', code: '300', items: [
          { description: 'Video Editor',         qty: 2, unit: 'DAY',  rateCents: 75000  },
          { description: 'Sound Mix & Master',   qty: 1, unit: 'FLAT', rateCents: 150000 },
          { description: 'Subtitles / Captions', qty: 1, unit: 'FLAT', rateCents: 35000  },
        ]},
        { name: 'Production Fee', code: '900', items: [
          { description: 'Production Fee (20%)', qty: 1, unit: 'FLAT', rateCents: 0 },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-social-content-influencer',
    name: 'Social Content — Influencer Day',
    shootType: 'INFLUENCER',
    templateKind: 'FULL',
    isFeatured: true,
    sortOrder: 50,
    description: 'Lean one-day shoot for social-first content. Videographer-led, minimal crew.',
    structure: {
      accounts: [
        { name: 'Crew', code: '100', items: [
          { description: 'Videographer',         qty: 1, unit: 'DAY', rateCents: 85000 },
          { description: 'Production Assistant', qty: 1, unit: 'DAY', rateCents: 45000 },
        ]},
        { name: 'Equipment', code: '200', items: [
          { description: 'Sony FX9 Package',  qty: 1, unit: 'DAY', rateCents: 95000 },
          { description: 'DJI Ronin Gimbal',  qty: 1, unit: 'DAY', rateCents: 40000 },
        ]},
        { name: 'Location', code: '300', items: [
          { description: 'Location Fee',        qty: 1, unit: 'DAY',  rateCents: 150000 },
          { description: 'Permits & Insurance', qty: 1, unit: 'FLAT', rateCents: 120000 },
        ]},
        { name: 'Post Production', code: '400', items: [
          { description: 'Video Editor',         qty: 2, unit: 'DAY',  rateCents: 75000  },
          { description: 'Sound Mix & Master',   qty: 1, unit: 'FLAT', rateCents: 150000 },
          { description: 'Subtitles / Captions', qty: 1, unit: 'FLAT', rateCents: 35000  },
        ]},
        { name: 'Production Fee', code: '900', items: [
          { description: 'Production Fee (20%)', qty: 1, unit: 'FLAT', rateCents: 0 },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-drone-addon',
    name: 'Drone Add-on',
    shootType: 'OTHER',
    templateKind: 'PACKAGE',
    isFeatured: true,
    sortOrder: 60,
    description: 'Aerial coverage package — operator + drone. Drop into any shoot budget.',
    structure: {
      accounts: [
        { name: 'Aerial / Drone', code: '1', items: [
          { description: 'Drone Operator',      qty: 1, unit: 'DAY', rateCents: 120000 },
          { description: 'DJI Drone (Mavic 3)', qty: 1, unit: 'DAY', rateCents: 55000  },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-post-addon',
    name: 'Post-Production Add-on',
    shootType: 'OTHER',
    templateKind: 'PACKAGE',
    isFeatured: true,
    sortOrder: 70,
    description: 'Full post package — edit, color, mix, captions. Add to any production budget.',
    structure: {
      accounts: [
        { name: 'Post Production', code: '1', items: [
          { description: 'Video Editor',         qty: 3, unit: 'DAY',  rateCents: 75000  },
          { description: 'Motion Graphics',      qty: 1, unit: 'DAY',  rateCents: 85000  },
          { description: 'Color Grade',          qty: 1, unit: 'DAY',  rateCents: 140000 },
          { description: 'Sound Mix & Master',   qty: 1, unit: 'FLAT', rateCents: 150000 },
          { description: 'Subtitles / Captions', qty: 1, unit: 'FLAT', rateCents: 35000  },
        ]},
      ],
    },
  },
  {
    id: 'gtpl-hmw-addon',
    name: 'Hair, Makeup & Wardrobe',
    shootType: 'OTHER',
    templateKind: 'PACKAGE',
    isFeatured: true,
    sortOrder: 80,
    description: 'Glam department package. Add-on to any talent-forward shoot.',
    structure: {
      accounts: [
        { name: 'Hair, Makeup & Wardrobe', code: '1', items: [
          { description: 'Hair & Makeup Artist', qty: 1, unit: 'DAY', rateCents: 80000 },
          { description: 'Stylist',              qty: 1, unit: 'DAY', rateCents: 95000 },
          { description: 'Art Director',         qty: 1, unit: 'DAY', rateCents: 150000},
        ]},
      ],
    },
  },
] as const

async function main() {
  console.log('🌱  Seeding database...')

  // ── 1. GlobalRateCard rows ──────────────────────────────────────────────────
  console.log('\nSeeding GlobalRateCard...')
  let grcCount = 0
  for (const r of globalRates) {
    await db.globalRateCard.upsert({
      where: { id: r.id },
      update: {
        role:             r.role,
        category:         r.category as never,
        defaultUnit:      r.defaultUnit as never,
        defaultRateCents: r.defaultRateCents,
        isFeatured:       r.isFeatured,
        sortOrder:        r.sortOrder,
        searchTokens:     `${r.role} ${r.category}`.toLowerCase(),
      },
      create: {
        id:               r.id,
        role:             r.role,
        category:         r.category as never,
        defaultUnit:      r.defaultUnit as never,
        defaultRateCents: r.defaultRateCents,
        isFeatured:       r.isFeatured,
        sortOrder:        r.sortOrder,
        searchTokens:     `${r.role} ${r.category}`.toLowerCase(),
      },
    })
    grcCount++
  }
  console.log(`✓  GlobalRateCard: ${grcCount} upserted`)

  // ── 2. GlobalTemplate rows ──────────────────────────────────────────────────
  console.log('\nSeeding GlobalTemplate...')
  let gtplCount = 0
  for (const t of globalTemplates) {
    await db.globalTemplate.upsert({
      where: { id: t.id },
      update: {
        name:         t.name,
        description:  t.description,
        shootType:    t.shootType as never,
        templateKind: t.templateKind as never,
        isFeatured:   t.isFeatured,
        sortOrder:    t.sortOrder,
        structure:    JSON.parse(JSON.stringify(t.structure)),
      },
      create: {
        id:           t.id,
        name:         t.name,
        description:  t.description,
        shootType:    t.shootType as never,
        templateKind: t.templateKind as never,
        isFeatured:   t.isFeatured,
        sortOrder:    t.sortOrder,
        structure:    JSON.parse(JSON.stringify(t.structure)),
      },
    })
    gtplCount++
  }
  console.log(`✓  GlobalTemplate: ${gtplCount} upserted`)

  // ── 3. TTP workspace (production workspace — existing data preserved) ────────
  console.log('\nSeeding TTP workspace...')
  const workspace = await db.workspace.upsert({
    where: { id: 'ttp-workspace' },
    update: {
      contactEmail: 'ashish@thethirdplacecreative.co',
      website: 'https://www.thethirdplacecreative.co',
    },
    create: {
      id: 'ttp-workspace',
      name: 'The Third Place Creative',
      legalName: 'The Third Place Creative LLC',
      contactEmail: 'ashish@thethirdplacecreative.co',
      website: 'https://www.thethirdplacecreative.co',
      primaryColor: '#5D00A4',
      accentColor: '#04FFCC',
      invoiceNumberPrefix: 'TTP',
      defaultMarkupPct: 0.20,
      defaultTaxPct: 0,
      defaultPaymentTermsDays: 30,
      defaultProposalTerms:
        'Payment is due per the schedule above. A late fee of 1.5% per month applies to overdue balances. All creative work remains the property of The Third Place Creative LLC until payment is received in full.',
      defaultInvoiceTerms:
        'Please remit payment by the due date above. Late payments incur a 1.5% monthly fee. Make checks payable to The Third Place Creative LLC.',
    },
  })
  console.log('✓  Workspace:', workspace.name)

  // ── 4. TTP rate cards (workspace-scoped, seeded with stable seed- IDs) ───────
  // These are the workspace's own copies — already exist in production, upsert
  // only creates if missing. DO NOT overwrite existing TTP data.
  const ttpRates = [
    { role: 'Director',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 240000, isFavorite: true  },
    { role: 'Executive Producer',    category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 180000, isFavorite: false },
    { role: 'Producer',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 120000, isFavorite: true  },
    { role: 'DP / Cinematographer',  category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 180000, isFavorite: true  },
    { role: 'Videographer',          category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 85000,  isFavorite: true  },
    { role: 'Videographer — 2nd Unit',category:'CREW', defaultUnit: 'DAY', defaultRateCents: 65000,  isFavorite: false },
    { role: '1st AC',                category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 90000,  isFavorite: false },
    { role: '2nd AC',                category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 65000,  isFavorite: false },
    { role: 'Gaffer',                category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 120000, isFavorite: false },
    { role: 'Key Grip',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 110000, isFavorite: false },
    { role: 'Best Boy',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 80000,  isFavorite: false },
    { role: 'Production Assistant',  category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 45000,  isFavorite: false },
    { role: 'Art Director',          category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 150000, isFavorite: false },
    { role: 'Stylist',               category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 95000,  isFavorite: false },
    { role: 'Hair & Makeup Artist',  category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 80000,  isFavorite: false },
    { role: 'Drone Operator',        category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 120000, isFavorite: false },
    { role: 'BTS Photographer',      category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 75000,  isFavorite: false },
    { role: 'RED Komodo Package',    category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 185000, isFavorite: true  },
    { role: 'ARRI Alexa Mini Package',category:'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 280000, isFavorite: false },
    { role: 'Sony FX9 Package',      category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 95000,  isFavorite: false },
    { role: 'Lens Package (Primes)', category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 75000,  isFavorite: false },
    { role: 'Lighting Package (HMI)',category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 120000, isFavorite: false },
    { role: 'Grip Package',          category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 80000,  isFavorite: false },
    { role: 'Sound Package + Mixer', category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 90000,  isFavorite: false },
    { role: 'DJI Ronin Gimbal',      category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 40000,  isFavorite: false },
    { role: 'DJI Drone (Mavic 3)',   category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 55000,  isFavorite: false },
    { role: 'Production Van / Truck',category: 'EQUIPMENT', defaultUnit: 'DAY',  defaultRateCents: 45000,  isFavorite: false },
    { role: 'Video Editor',          category: 'POST', defaultUnit: 'DAY',  defaultRateCents: 75000,  isFavorite: true  },
    { role: 'Motion Graphics',       category: 'POST', defaultUnit: 'DAY',  defaultRateCents: 85000,  isFavorite: false },
    { role: 'Color Grade',           category: 'POST', defaultUnit: 'DAY',  defaultRateCents: 140000, isFavorite: false },
    { role: 'Sound Mix & Master',    category: 'POST', defaultUnit: 'FLAT', defaultRateCents: 150000, isFavorite: false },
    { role: 'VFX / Compositing',     category: 'POST', defaultUnit: 'DAY',  defaultRateCents: 120000, isFavorite: false },
    { role: 'Subtitles / Captions',  category: 'POST', defaultUnit: 'FLAT', defaultRateCents: 35000,  isFavorite: false },
    { role: 'Location Fee',          category: 'LOCATION', defaultUnit: 'DAY',  defaultRateCents: 150000, isFavorite: false },
    { role: 'Location Scout',        category: 'LOCATION', defaultUnit: 'DAY',  defaultRateCents: 80000,  isFavorite: false },
    { role: 'Studio Rental',         category: 'LOCATION', defaultUnit: 'DAY',  defaultRateCents: 200000, isFavorite: false },
    { role: 'Permits & Insurance',   category: 'LOCATION', defaultUnit: 'FLAT', defaultRateCents: 120000, isFavorite: false },
    { role: 'Catering & Craft Services',  category: 'CATERING', defaultUnit: 'DAY',  defaultRateCents: 90000,  isFavorite: false },
    { role: 'Craft Services (small crew)',category: 'CATERING', defaultUnit: 'DAY',  defaultRateCents: 40000,  isFavorite: false },
    { role: 'Principal Talent',      category: 'TALENT', defaultUnit: 'DAY',  defaultRateCents: 200000, isFavorite: false },
    { role: 'Background / Extras',   category: 'TALENT', defaultUnit: 'DAY',  defaultRateCents: 30000,  isFavorite: false },
    { role: 'Flights (per person)',   category: 'TRAVEL', defaultUnit: 'FLAT', defaultRateCents: 80000,  isFavorite: false },
    { role: 'Hotel (per person/night)',category:'TRAVEL', defaultUnit: 'FLAT', defaultRateCents: 25000,  isFavorite: false },
    { role: 'Ground Transport',      category: 'TRAVEL', defaultUnit: 'DAY',  defaultRateCents: 35000,  isFavorite: false },
    { role: 'Production Fee (20%)',  category: 'PRODUCTION_FEE', defaultUnit: 'FLAT', defaultRateCents: 0, isFavorite: false },
    { role: 'Agency Markup (15%)',   category: 'PRODUCTION_FEE', defaultUnit: 'FLAT', defaultRateCents: 0, isFavorite: false },
  ] as const

  let rateCount = 0
  for (const r of ttpRates) {
    const seedId = `seed-${r.role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
    await db.rateCard.upsert({
      where: { id: seedId },
      update: {}, // never overwrite TTP edits
      create: {
        id: seedId,
        workspaceId: workspace.id,
        role: r.role,
        category: r.category as never,
        defaultUnit: r.defaultUnit as never,
        defaultRateCents: r.defaultRateCents,
        isFavorite: r.isFavorite,
        searchTokens: `${r.role} ${r.category}`.toLowerCase(),
      },
    })
    rateCount++
  }
  console.log(`✓  TTP rate cards: ${rateCount} upserted`)

  // ── 5. TTP budget templates ────────────────────────────────────────────────
  const ttpTemplates = [
    {
      id: 'tmpl-music-video-standard',
      name: 'Music Video — Standard',
      shootType: 'MUSIC_VIDEO',
      description: '1-day shoot with full crew, RED camera, and post package.',
      structure: {
        accounts: [
          { name: 'Above the Line', code: '100', items: [
            { description: 'Director', rateCardId: 'seed-director', qty: 1, unit: 'DAY', rateCents: 240000 },
            { description: 'Producer', rateCardId: 'seed-producer', qty: 1, unit: 'DAY', rateCents: 120000 },
          ]},
          { name: 'Camera', code: '200', items: [
            { description: 'DP / Cinematographer', rateCardId: 'seed-dp---cinematographer', qty: 1, unit: 'DAY', rateCents: 180000 },
            { description: '1st AC', rateCardId: 'seed-1st-ac', qty: 1, unit: 'DAY', rateCents: 90000 },
            { description: 'RED Komodo Package', rateCardId: 'seed-red-komodo-package', qty: 1, unit: 'DAY', rateCents: 185000 },
            { description: 'Lens Package (Primes)', rateCardId: 'seed-lens-package--primes-', qty: 1, unit: 'DAY', rateCents: 75000 },
          ]},
          { name: 'Lighting & Grip', code: '300', items: [
            { description: 'Gaffer', rateCardId: 'seed-gaffer', qty: 1, unit: 'DAY', rateCents: 120000 },
            { description: 'Key Grip', rateCardId: 'seed-key-grip', qty: 1, unit: 'DAY', rateCents: 110000 },
            { description: 'Lighting Package (HMI)', rateCardId: 'seed-lighting-package--hmi-', qty: 1, unit: 'DAY', rateCents: 120000 },
            { description: 'Grip Package', rateCardId: 'seed-grip-package', qty: 1, unit: 'DAY', rateCents: 80000 },
          ]},
          { name: 'Location', code: '400', items: [
            { description: 'Location Fee', rateCardId: 'seed-location-fee', qty: 1, unit: 'DAY', rateCents: 150000 },
            { description: 'Permits & Insurance', rateCardId: 'seed-permits---insurance', qty: 1, unit: 'FLAT', rateCents: 120000 },
          ]},
          { name: 'Art & Styling', code: '500', items: [
            { description: 'Stylist', rateCardId: 'seed-stylist', qty: 1, unit: 'DAY', rateCents: 95000 },
            { description: 'Hair & Makeup Artist', rateCardId: 'seed-hair---makeup-artist', qty: 1, unit: 'DAY', rateCents: 80000 },
          ]},
          { name: 'Production Support', code: '600', items: [
            { description: 'Production Assistant', rateCardId: 'seed-production-assistant', qty: 2, unit: 'DAY', rateCents: 45000 },
            { description: 'Catering & Craft Services', rateCardId: 'seed-catering---craft-services', qty: 1, unit: 'DAY', rateCents: 90000 },
          ]},
          { name: 'Post Production', code: '700', items: [
            { description: 'Video Editor', rateCardId: 'seed-video-editor', qty: 3, unit: 'DAY', rateCents: 75000 },
            { description: 'Color Grade', rateCardId: 'seed-color-grade', qty: 1, unit: 'DAY', rateCents: 140000 },
            { description: 'Sound Mix & Master', rateCardId: 'seed-sound-mix---master', qty: 1, unit: 'FLAT', rateCents: 150000 },
          ]},
          { name: 'Production Fee', code: '900', items: [
            { description: 'Production Fee (20%)', rateCardId: 'seed-production-fee--20--', qty: 1, unit: 'FLAT', rateCents: 0 },
          ]},
        ],
      },
    },
    {
      id: 'tmpl-brand-campaign-1day',
      name: 'Brand Campaign — 1-Day',
      shootType: 'BRAND_CAMPAIGN',
      description: 'Corporate/brand shoot with studio, talent, and deliverables.',
      structure: {
        accounts: [
          { name: 'Above the Line', code: '100', items: [
            { description: 'Director', rateCardId: 'seed-director', qty: 1, unit: 'DAY', rateCents: 240000 },
            { description: 'Executive Producer', rateCardId: 'seed-executive-producer', qty: 1, unit: 'DAY', rateCents: 180000 },
          ]},
          { name: 'Camera', code: '200', items: [
            { description: 'DP / Cinematographer', rateCardId: 'seed-dp---cinematographer', qty: 1, unit: 'DAY', rateCents: 180000 },
            { description: '1st AC', rateCardId: 'seed-1st-ac', qty: 1, unit: 'DAY', rateCents: 90000 },
            { description: '2nd AC', rateCardId: 'seed-2nd-ac', qty: 1, unit: 'DAY', rateCents: 65000 },
            { description: 'ARRI Alexa Mini Package', rateCardId: 'seed-arri-alexa-mini-package', qty: 1, unit: 'DAY', rateCents: 280000 },
            { description: 'Lens Package (Primes)', rateCardId: 'seed-lens-package--primes-', qty: 1, unit: 'DAY', rateCents: 75000 },
          ]},
          { name: 'Lighting & Grip', code: '300', items: [
            { description: 'Gaffer', rateCardId: 'seed-gaffer', qty: 1, unit: 'DAY', rateCents: 120000 },
            { description: 'Best Boy', rateCardId: 'seed-best-boy', qty: 1, unit: 'DAY', rateCents: 80000 },
            { description: 'Key Grip', rateCardId: 'seed-key-grip', qty: 1, unit: 'DAY', rateCents: 110000 },
            { description: 'Lighting Package (HMI)', rateCardId: 'seed-lighting-package--hmi-', qty: 1, unit: 'DAY', rateCents: 120000 },
            { description: 'Grip Package', rateCardId: 'seed-grip-package', qty: 1, unit: 'DAY', rateCents: 80000 },
          ]},
          { name: 'Location', code: '400', items: [
            { description: 'Studio Rental', rateCardId: 'seed-studio-rental', qty: 1, unit: 'DAY', rateCents: 200000 },
            { description: 'Permits & Insurance', rateCardId: 'seed-permits---insurance', qty: 1, unit: 'FLAT', rateCents: 120000 },
          ]},
          { name: 'Talent', code: '500', items: [
            { description: 'Principal Talent', rateCardId: 'seed-principal-talent', qty: 2, unit: 'DAY', rateCents: 200000 },
          ]},
          { name: 'Art & Styling', code: '600', items: [
            { description: 'Art Director', rateCardId: 'seed-art-director', qty: 1, unit: 'DAY', rateCents: 150000 },
            { description: 'Stylist', rateCardId: 'seed-stylist', qty: 1, unit: 'DAY', rateCents: 95000 },
            { description: 'Hair & Makeup Artist', rateCardId: 'seed-hair---makeup-artist', qty: 1, unit: 'DAY', rateCents: 80000 },
          ]},
          { name: 'Production Support', code: '700', items: [
            { description: 'Production Assistant', rateCardId: 'seed-production-assistant', qty: 2, unit: 'DAY', rateCents: 45000 },
            { description: 'Catering & Craft Services', rateCardId: 'seed-catering---craft-services', qty: 1, unit: 'DAY', rateCents: 90000 },
            { description: 'BTS Photographer', rateCardId: 'seed-bts-photographer', qty: 1, unit: 'DAY', rateCents: 75000 },
          ]},
          { name: 'Post Production', code: '800', items: [
            { description: 'Video Editor', rateCardId: 'seed-video-editor', qty: 5, unit: 'DAY', rateCents: 75000 },
            { description: 'Motion Graphics', rateCardId: 'seed-motion-graphics', qty: 2, unit: 'DAY', rateCents: 85000 },
            { description: 'Color Grade', rateCardId: 'seed-color-grade', qty: 1, unit: 'DAY', rateCents: 140000 },
            { description: 'Sound Mix & Master', rateCardId: 'seed-sound-mix---master', qty: 1, unit: 'FLAT', rateCents: 150000 },
            { description: 'Subtitles / Captions', rateCardId: 'seed-subtitles---captions', qty: 1, unit: 'FLAT', rateCents: 35000 },
          ]},
          { name: 'Production Fee', code: '900', items: [
            { description: 'Production Fee (20%)', rateCardId: 'seed-production-fee--20--', qty: 1, unit: 'FLAT', rateCents: 0 },
          ]},
        ],
      },
    },
    {
      id: 'tmpl-social-content-quick',
      name: 'Social Content — Quick Turn',
      shootType: 'SOCIAL_CONTENT',
      description: 'Lean half-day shoot for social deliverables. Videographer-led.',
      structure: {
        accounts: [
          { name: 'Crew', code: '100', items: [
            { description: 'Videographer', rateCardId: 'seed-videographer', qty: 1, unit: 'DAY', rateCents: 85000 },
            { description: 'Production Assistant', rateCardId: 'seed-production-assistant', qty: 1, unit: 'DAY', rateCents: 45000 },
          ]},
          { name: 'Equipment', code: '200', items: [
            { description: 'Sony FX9 Package', rateCardId: 'seed-sony-fx9-package', qty: 1, unit: 'DAY', rateCents: 95000 },
            { description: 'DJI Ronin Gimbal', rateCardId: 'seed-dji-ronin-gimbal', qty: 1, unit: 'DAY', rateCents: 40000 },
          ]},
          { name: 'Location', code: '300', items: [
            { description: 'Location Fee', rateCardId: 'seed-location-fee', qty: 1, unit: 'DAY', rateCents: 150000 },
            { description: 'Permits & Insurance', rateCardId: 'seed-permits---insurance', qty: 1, unit: 'FLAT', rateCents: 120000 },
          ]},
          { name: 'Post Production', code: '400', items: [
            { description: 'Video Editor', rateCardId: 'seed-video-editor', qty: 2, unit: 'DAY', rateCents: 75000 },
            { description: 'Sound Mix & Master', rateCardId: 'seed-sound-mix---master', qty: 1, unit: 'FLAT', rateCents: 150000 },
            { description: 'Subtitles / Captions', rateCardId: 'seed-subtitles---captions', qty: 1, unit: 'FLAT', rateCents: 35000 },
          ]},
          { name: 'Production Fee', code: '900', items: [
            { description: 'Production Fee (20%)', rateCardId: 'seed-production-fee--20--', qty: 1, unit: 'FLAT', rateCents: 0 },
          ]},
        ],
      },
    },
  ]

  for (const t of ttpTemplates) {
    await db.budgetTemplate.upsert({
      where: { id: t.id },
      update: {}, // never overwrite TTP edits
      create: {
        id: t.id,
        workspaceId: workspace.id,
        name: t.name,
        shootType: t.shootType as never,
        description: t.description,
        structure: JSON.parse(JSON.stringify(t.structure)),
      },
    })
    console.log(`✓  TTP template: ${t.name}`)
  }

  // ── 6. Sample data for TTP (client + project) ──────────────────────────────
  const hulu = await db.client.upsert({
    where: { id: 'seed-client-hulu' },
    update: {},
    create: {
      id: 'seed-client-hulu',
      workspaceId: workspace.id,
      name: 'Hulu',
      contactName: 'Jessica Morales',
      contactEmail: 'jmorales@hulu.com',
    },
  })
  console.log('✓  Sample client: Hulu')

  await db.project.upsert({
    where: { id: 'seed-project-hulu-sizzle' },
    update: {},
    create: {
      id: 'seed-project-hulu-sizzle',
      workspaceId: workspace.id,
      clientId: hulu.id,
      name: 'Hulu — Summer 2026 Sizzle Reel',
      shootType: 'BRAND_CAMPAIGN',
      status: 'LEAD',
      shootStartDate: new Date('2026-07-12'),
      shootEndDate: new Date('2026-07-13'),
    },
  })
  console.log('✓  Sample project: Hulu Summer Sizzle')

  console.log(`
🎉  Seed complete.

Global library:
  • ${grcCount} GlobalRateCard rows
  • ${gtplCount} GlobalTemplate rows

TTP workspace:
  • Rate cards and templates preserved (upsert skips existing rows)

Next steps:
  1. npx prisma studio  — inspect the new GlobalRateCard and GlobalTemplate tables
  2. npm run dev        — start the app
`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
