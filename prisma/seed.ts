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

// ---------------------------------------------------------------------------
// Global contract blocks
// Convention: "gcb-" prefix for GlobalContractBlock
// "isFeatured: true" = seeded into every new workspace automatically
// ---------------------------------------------------------------------------

const globalContractBlocks = [
  // ── ALWAYS-ON (isDefault) ────────────────────────────────────────────────
  {
    id: 'gcb-general-terms',
    title: 'General Terms & Conditions',
    category: 'TERMS',
    isDefault: true,
    orderIndex: 10,
    isFeatured: true,
    triggers: [],
    body: `<p><strong>{{workspace.name}}</strong> ("Company") and the client identified in this proposal ("Client") agree to the following terms governing all work performed under this engagement.</p>

<p><strong>Payment.</strong> All fees are due per the payment schedule in this proposal. Invoices unpaid after thirty (30) days accrue a late fee of 1.5% per month (18% per annum) on the outstanding balance. The Company reserves the right to pause work on any project with an overdue balance exceeding fourteen (14) days.</p>

<p><strong>Intellectual Property.</strong> All creative work, footage, deliverables, and materials produced by the Company remain the exclusive property of {{workspace.name}} until payment is received in full. Upon receipt of final payment, the Company grants Client the usage rights specified in this proposal. The Company retains the right to display completed work in its portfolio unless otherwise agreed in writing.</p>

<p><strong>Client Responsibilities.</strong> Client is responsible for providing accurate creative briefs, timely approvals, and access to any locations, talent, or assets required for production. Delays caused by Client availability, late approvals, or incomplete information may result in revised timelines and additional fees.</p>

<p><strong>Cancellation.</strong> If Client cancels this engagement after a signed proposal, any deposits paid are non-refundable. If cancellation occurs after production has begun, Client is responsible for all costs incurred to date plus a kill fee equal to 25% of the remaining balance.</p>

<p><strong>Limitation of Liability.</strong> The Company's total liability for any claim arising from this engagement shall not exceed the total fees paid by Client under this proposal. The Company is not liable for indirect, incidental, or consequential damages of any kind.</p>

<p><strong>Governing Law.</strong> This agreement is governed by the laws of the state in which {{workspace.name}} operates. Any dispute shall be resolved by binding arbitration in that jurisdiction.</p>`,
  },

  {
    id: 'gcb-revision-policy',
    title: 'Revision Policy',
    category: 'TERMS',
    isDefault: true,
    orderIndex: 20,
    isFeatured: true,
    triggers: [],
    body: `<p>This proposal includes a defined number of revision rounds as specified in the deliverables above. Revisions are defined as reasonable adjustments to color, pacing, text, or music within the agreed creative direction. Revisions do not include fundamental changes to concept, structure, or scope.</p>

<p><strong>Revision process.</strong> Client feedback should be consolidated into a single, detailed note per round delivered via email or the project management platform designated by the Company. Fragmented or sequential feedback within the same revision round may consume multiple rounds.</p>

<p><strong>Additional revisions.</strong> Revision rounds beyond the included number are billed at the applicable day rate, invoiced and due before work resumes.</p>

<p><strong>Approval.</strong> Once Client provides written approval of a deliverable, that deliverable is considered final. Any changes requested after approval are treated as additional revisions and billed accordingly.</p>`,
  },

  // ── TRIGGERED BLOCKS ─────────────────────────────────────────────────────
  {
    id: 'gcb-video-sow',
    title: 'Video Production — Scope of Work',
    category: 'SOW',
    isDefault: false,
    orderIndex: 30,
    isFeatured: true,
    triggers: [
      { kind: 'KEYWORD', matchValue: 'video' },
      { kind: 'KEYWORD', matchValue: 'film' },
      { kind: 'KEYWORD', matchValue: 'shoot' },
    ],
    body: `<p>This scope of work governs video production services provided by {{workspace.name}} for the project identified in this proposal.</p>

<p><strong>Pre-Production.</strong> The Company will develop a shot list and production schedule based on the approved creative brief. Client must confirm final locations, talent, and any branded assets no later than five (5) business days before the scheduled shoot date. Changes to these elements after confirmation may result in additional fees.</p>

<p><strong>Production.</strong> All shoot days are scheduled for the hours defined in the confirmed call sheet. Overtime beyond the scheduled wrap time is billed at 1.5× the daily crew rate, invoiced after completion. The Company maintains creative control over technical execution (camera operation, lighting design, audio capture) while following the agreed creative direction.</p>

<p><strong>Post-Production.</strong> The Company will edit and deliver the agreed deliverables per the revision policy in this proposal. Delivery format, resolution, and codec will match the specifications outlined in the deliverables section. Final files are delivered digitally via the Company's preferred platform.</p>

<p><strong>Music & Licensing.</strong> Unless otherwise specified, music is sourced from a licensed library included in the production budget. Client-requested commercial tracks (e.g., major label music) require a sync license purchased separately by Client.</p>`,
  },

  {
    id: 'gcb-photo-sow',
    title: 'Photography — Scope of Work',
    category: 'SOW',
    isDefault: false,
    orderIndex: 40,
    isFeatured: true,
    triggers: [
      { kind: 'KEYWORD', matchValue: 'photo' },
      { kind: 'KEYWORD', matchValue: 'stills' },
      { kind: 'KEYWORD', matchValue: 'photography' },
    ],
    body: `<p>This scope of work governs photography services provided by {{workspace.name}} for the project identified in this proposal.</p>

<p><strong>Shoot day.</strong> The Company will photograph the agreed subjects and scenarios per the approved shot list. Client must confirm wardrobe, props, and talent no later than three (3) business days before the shoot. Setup and breakdown time is included in the scheduled day rate.</p>

<p><strong>Selection & editing.</strong> The Company will provide a private online gallery of selects (unretouched low-resolution previews) for Client to choose final images. Client selects the quantity of finals specified in the deliverables section. Images not selected are not delivered.</p>

<p><strong>Retouching.</strong> Final images are delivered retouched to a professional standard appropriate for the intended use. Extensive retouching beyond standard color correction, exposure, and skin tone adjustment is scoped separately.</p>

<p><strong>Delivery.</strong> Final high-resolution files are delivered as full-resolution JPEGs (sRGB, unless otherwise specified) via the Company's preferred digital delivery platform within the turnaround time stated in the deliverables section.</p>`,
  },

  {
    id: 'gcb-raw-footage-terms',
    title: 'Raw Footage Delivery Terms',
    category: 'TERMS',
    isDefault: false,
    orderIndex: 50,
    isFeatured: true,
    triggers: [
      { kind: 'DELIVERABLE_TYPE', matchValue: 'RAW_FOOTAGE' },
      { kind: 'KEYWORD', matchValue: 'raw' },
      { kind: 'KEYWORD', matchValue: 'rushes' },
    ],
    body: `<p>Where raw or unedited footage is included as a deliverable, the following terms apply.</p>

<p><strong>What "raw footage" means.</strong> Raw footage consists of all camera-original files captured during the production day(s), delivered in the original recording codec and color space (e.g., R3D, BRAW, S-Log, LOG-C). No color correction, audio mix, or sync is applied unless specifically noted in the deliverables section.</p>

<p><strong>No editing guarantee.</strong> Raw footage is delivered as-captured. The Company makes no representation that raw files are suitable for any particular use without further post-production work. Technical variations in exposure, focus, or audio level are inherent to the nature of raw acquisition.</p>

<p><strong>Storage & delivery.</strong> Raw files are delivered on a hard drive (at Client's cost, if applicable) or via high-capacity file transfer. Delivery timelines for raw footage are separate from those for edited deliverables and will be specified in the project schedule.</p>

<p><strong>Retention.</strong> The Company will retain a backup of raw files for sixty (60) days after delivery. After that period, the Company may delete source files. Client is responsible for maintaining its own archival copies.</p>`,
  },

  {
    id: 'gcb-social-usage-rights',
    title: 'Social Content Usage Rights',
    category: 'IP_RIGHTS',
    isDefault: false,
    orderIndex: 60,
    isFeatured: true,
    triggers: [
      { kind: 'KEYWORD', matchValue: 'social' },
      { kind: 'KEYWORD', matchValue: 'tiktok' },
      { kind: 'KEYWORD', matchValue: 'instagram' },
      { kind: 'KEYWORD', matchValue: 'reels' },
      { kind: 'KEYWORD', matchValue: 'content' },
    ],
    body: `<p>Upon receipt of final payment, {{workspace.name}} grants Client a non-exclusive, perpetual license to use the delivered social content assets on Client's owned digital and social media channels, including but not limited to Instagram, TikTok, Facebook, YouTube, and LinkedIn.</p>

<p><strong>Included uses.</strong> Organic posting on Client's own social channels; reposting or sharing by tagged parties; use in paid social advertising campaigns run by or on behalf of Client.</p>

<p><strong>Excluded uses.</strong> Broadcast (TV, out-of-home, cinema); third-party licensing or resale; use in campaigns for brands or products other than those named in this proposal. Extended or additional usage rights are available at an additional licensing fee.</p>

<p><strong>Credits.</strong> Client agrees to credit {{workspace.name}} when tagging or mentioning production on public posts, unless Client operates in a category where supplier disclosure is not standard practice.</p>

<p><strong>Portfolio.</strong> The Company retains the right to display all delivered assets in its portfolio, social channels, and marketing materials, unless Client requests a written embargo before signing.</p>`,
  },

  {
    id: 'gcb-talent-releases',
    title: 'Talent & Appearance Releases',
    category: 'COMPLIANCE',
    isDefault: false,
    orderIndex: 70,
    isFeatured: true,
    triggers: [
      { kind: 'BUDGET_ACCOUNT', matchValue: 'Talent' },
      { kind: 'BUDGET_ACCOUNT', matchValue: 'Cast' },
      { kind: 'KEYWORD', matchValue: 'talent' },
    ],
    body: `<p>Any production involving on-screen talent (principals, background, extras, or any identifiable person) requires a signed appearance release before that individual's likeness may be used in any deliverable or marketing material.</p>

<p><strong>Client responsibility.</strong> Unless the Company is separately engaged to manage talent casting and contracting, Client is responsible for obtaining signed appearance releases from all on-screen talent prior to the shoot date. The Company will not knowingly deliver content featuring individuals who have not signed a valid release.</p>

<p><strong>Minors.</strong> Any talent under the age of 18 requires a release signed by a parent or legal guardian. The Company reserves the right to require proof of age and guardian identity before any minor appears on camera.</p>

<p><strong>Release archive.</strong> Client must retain signed releases for the full duration of any usage of the applicable content. The Company is indemnified by Client for any claims arising from Client's failure to obtain or retain valid releases.</p>

<p><strong>Indemnification.</strong> Client agrees to indemnify and hold harmless {{workspace.name}}, its employees, and agents from any claims, damages, or costs arising from the use of a person's likeness without proper authorization.</p>`,
  },

  {
    id: 'gcb-drone-compliance',
    title: 'Drone & Aerial Operations',
    category: 'COMPLIANCE',
    isDefault: false,
    orderIndex: 80,
    isFeatured: true,
    triggers: [
      { kind: 'KEYWORD', matchValue: 'drone' },
      { kind: 'KEYWORD', matchValue: 'aerial' },
      { kind: 'KEYWORD', matchValue: 'fpv' },
    ],
    body: `<p>Aerial and drone operations are conducted in compliance with FAA regulations under Part 107. The following conditions apply to any engagement that includes drone or aerial cinematography.</p>

<p><strong>Permits & airspace.</strong> Drone operations in controlled airspace require advance authorization (LAANC or FAA waiver). Authorization times vary and are not guaranteed. Client must notify the Company of the shoot location no later than ten (10) business days in advance to allow sufficient time to obtain required authorizations.</p>

<p><strong>Weather & safety.</strong> Drone operations may be cancelled or postponed at the operator's sole discretion due to weather conditions (wind, precipitation, visibility), airspace conflicts, or safety concerns. Weather cancellations will be rescheduled at no additional charge if caused by conditions outside the Company's control.</p>

<p><strong>Location access.</strong> Client is responsible for obtaining property owner permission for drone flights over private land. The Company is not liable for shots that cannot be executed due to denied access or late-arising permit restrictions.</p>

<p><strong>Privacy.</strong> The Company will not intentionally capture images of private individuals without consent. Any such incidental captures will be removed in post-production upon request.</p>`,
  },

  {
    id: 'gcb-rush-delivery',
    title: 'Rush Delivery Terms',
    category: 'TERMS',
    isDefault: false,
    orderIndex: 90,
    isFeatured: true,
    triggers: [
      { kind: 'KEYWORD', matchValue: 'rush' },
      { kind: 'KEYWORD', matchValue: 'expedited' },
      { kind: 'KEYWORD', matchValue: 'urgent' },
    ],
    body: `<p>Rush delivery is defined as any delivery timeline shorter than the Company's standard post-production turnaround of five (5) business days per finished minute of content, or the standard editing window stated in the deliverables section.</p>

<p><strong>Rush fee.</strong> Rush delivery carries a surcharge of 30–50% of the applicable post-production rate, depending on the severity of acceleration required. The exact rush rate will be quoted and agreed in writing before work begins.</p>

<p><strong>Scope of rush.</strong> Rush timelines apply only to the specific deliverables noted as rush in this proposal. Other deliverables in the same project remain on standard timelines unless separately designated as rush.</p>

<p><strong>Client cooperation.</strong> Rush delivery requires Client to provide consolidated, complete feedback within 24 hours of each review link being shared. Delays in Client feedback will extend the delivery timeline accordingly, and the rush fee remains due regardless.</p>`,
  },

  {
    id: 'gcb-deliverable-licensing',
    title: 'Deliverable Licensing & Usage Rights',
    category: 'IP_RIGHTS',
    isDefault: false,
    orderIndex: 100,
    isFeatured: true,
    triggers: [
      { kind: 'DELIVERABLE_TYPE', matchValue: 'DELIVERABLE' },
    ],
    body: `<p>Upon receipt of final payment in full, {{workspace.name}} grants Client the following rights in the delivered content ("Deliverables"):</p>

<p><strong>License grant.</strong> A non-exclusive, perpetual license to reproduce, display, distribute, and publicly perform the Deliverables for the purpose(s) stated in the approved creative brief. Any use beyond the stated purpose requires a separate license agreement.</p>

<p><strong>Exclusivity.</strong> Unless an exclusivity fee is included in this proposal, the license is non-exclusive. The Company retains the right to use similar creative approaches, styles, and techniques for other clients.</p>

<p><strong>Modifications.</strong> Client may edit or adapt the Deliverables for internal use (resizing, cropping, format conversion). Material alterations to creative content — including adding or removing significant visual elements, changing voiceover, or recontextualizing the work — require written approval from the Company.</p>

<p><strong>Third-party elements.</strong> The Company will use commercially reasonable efforts to license or clear all third-party elements (music, stock footage, fonts) included in the Deliverables. Client assumes responsibility for any third-party clearances required for uses beyond the scope of this proposal.</p>`,
  },
]

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

  // ── 2b. GlobalContractBlock rows ────────────────────────────────────────────
  console.log('\nSeeding GlobalContractBlock...')
  let gcbCount = 0
  for (const b of globalContractBlocks) {
    await db.globalContractBlock.upsert({
      where: { id: b.id },
      update: {
        title:      b.title,
        category:   b.category as never,
        body:       b.body,
        isDefault:  b.isDefault,
        orderIndex: b.orderIndex,
        isFeatured: b.isFeatured,
      },
      create: {
        id:         b.id,
        title:      b.title,
        category:   b.category as never,
        body:       b.body,
        isDefault:  b.isDefault,
        orderIndex: b.orderIndex,
        isFeatured: b.isFeatured,
        triggers: {
          create: b.triggers.map(t => ({ kind: t.kind as never, matchValue: t.matchValue })),
        },
      },
    })
    gcbCount++
  }
  console.log(`✓  GlobalContractBlock: ${gcbCount} upserted`)

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

  // ── 5b. TTP contract blocks (seeded from globals, additive) ─────────────────
  // Uses the same upsert-skip pattern as TTP rate cards: existing blocks are
  // never overwritten so TTP customizations persist across re-seeds.
  console.log('\nSeeding TTP contract blocks...')
  const ttpWorkspaceId = workspace.id
  const [allGlobals, existingTtpBlocks] = await Promise.all([
    db.globalContractBlock.findMany({ where: { isFeatured: true }, orderBy: { orderIndex: 'asc' }, include: { triggers: true } }),
    db.contractBlock.findMany({ where: { workspaceId: ttpWorkspaceId }, select: { title: true } }),
  ])
  const existingTitles = new Set(existingTtpBlocks.map(b => b.title))
  let cbCount = 0
  for (const g of allGlobals) {
    if (existingTitles.has(g.title)) continue
    await db.contractBlock.create({
      data: {
        workspaceId: ttpWorkspaceId,
        title:       g.title,
        category:    g.category,
        body:        g.body,
        isDefault:   g.isDefault,
        isActive:    true,
        orderIndex:  g.orderIndex,
        triggers: {
          create: g.triggers.map(t => ({
            workspaceId: ttpWorkspaceId,
            kind:        t.kind,
            matchValue:  t.matchValue,
          })),
        },
      },
    })
    cbCount++
  }
  console.log(`✓  TTP contract blocks: ${cbCount} created (${existingTtpBlocks.length} already existed)`)

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
  • ${gcbCount} GlobalContractBlock rows

TTP workspace:
  • Rate cards and templates preserved (upsert skips existing rows)

Next steps:
  1. npx prisma studio  — inspect the global library tables
  2. npm run dev        — start the app
`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
