import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('🌱  Seeding database...')

  // ─── Workspace ─────────────────────────────────────────────────────────────
  const workspace = await db.workspace.upsert({
    where: { id: 'ttp-workspace' },
    update: {},
    create: {
      id: 'ttp-workspace',
      name: 'The Third Place Creative',
      legalName: 'The Third Place Creative LLC',
      contactEmail: 'hello@thethirdplace.co',
      website: 'https://thethirdplace.co',
      primaryColor: '#5D00A4',
      accentColor: '#04FFCC',
      invoiceNumberPrefix: 'TTP',
      defaultMarkupPct: 0.20,   // 20%
      defaultTaxPct: 0,
      defaultPaymentTermsDays: 30,
      defaultProposalTerms:
        'Payment is due per the schedule above. A late fee of 1.5% per month applies to overdue balances. All creative work remains the property of The Third Place Creative LLC until payment is received in full.',
      defaultInvoiceTerms:
        'Please remit payment by the due date above. Late payments incur a 1.5% monthly fee. Make checks payable to The Third Place Creative LLC.',
    },
  })
  console.log('✓  Workspace:', workspace.name)

  // ─── Rate cards ────────────────────────────────────────────────────────────
  const rates = [
    // CREW
    { role: 'Director',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 240000, isFavorite: true },
    { role: 'Executive Producer',    category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 180000 },
    { role: 'Producer',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 120000, isFavorite: true },
    { role: 'DP / Cinematographer',  category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 180000, isFavorite: true },
    { role: 'Videographer',          category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 85000,  isFavorite: true },
    { role: 'Videographer — 2nd Unit',category:'CREW', defaultUnit: 'DAY', defaultRateCents: 65000 },
    { role: '1st AC',                category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 90000 },
    { role: '2nd AC',                category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 65000 },
    { role: 'Gaffer',                category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 120000 },
    { role: 'Key Grip',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 110000 },
    { role: 'Best Boy',              category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 80000 },
    { role: 'Production Assistant',  category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 45000 },
    { role: 'Art Director',          category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 150000 },
    { role: 'Stylist',               category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 95000 },
    { role: 'Hair & Makeup Artist',  category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 80000 },
    { role: 'Drone Operator',        category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 120000 },
    { role: 'BTS Photographer',      category: 'CREW', defaultUnit: 'DAY', defaultRateCents: 75000 },

    // EQUIPMENT
    { role: 'RED Komodo Package',    category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 185000, isFavorite: true },
    { role: 'ARRI Alexa Mini Package',category:'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 280000 },
    { role: 'Sony FX9 Package',      category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 95000 },
    { role: 'Lens Package (Primes)', category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 75000 },
    { role: 'Lighting Package (HMI)',category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 120000 },
    { role: 'Grip Package',          category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 80000 },
    { role: 'Sound Package + Mixer', category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 90000 },
    { role: 'DJI Ronin Gimbal',      category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 40000 },
    { role: 'DJI Drone (Mavic 3)',   category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 55000 },
    { role: 'Production Van / Truck',category: 'EQUIPMENT', defaultUnit: 'DAY', defaultRateCents: 45000 },

    // POST
    { role: 'Video Editor',          category: 'POST', defaultUnit: 'DAY', defaultRateCents: 75000, isFavorite: true },
    { role: 'Motion Graphics',       category: 'POST', defaultUnit: 'DAY', defaultRateCents: 85000 },
    { role: 'Color Grade',           category: 'POST', defaultUnit: 'DAY', defaultRateCents: 140000 },
    { role: 'Sound Mix & Master',    category: 'POST', defaultUnit: 'FLAT', defaultRateCents: 150000 },
    { role: 'VFX / Compositing',     category: 'POST', defaultUnit: 'DAY', defaultRateCents: 120000 },
    { role: 'Subtitles / Captions',  category: 'POST', defaultUnit: 'FLAT', defaultRateCents: 35000 },

    // LOCATION
    { role: 'Location Fee',          category: 'LOCATION', defaultUnit: 'DAY', defaultRateCents: 150000 },
    { role: 'Location Scout',        category: 'LOCATION', defaultUnit: 'DAY', defaultRateCents: 80000 },
    { role: 'Studio Rental',         category: 'LOCATION', defaultUnit: 'DAY', defaultRateCents: 200000 },
    { role: 'Permits & Insurance',   category: 'LOCATION', defaultUnit: 'FLAT', defaultRateCents: 120000 },

    // CATERING
    { role: 'Catering & Craft Services', category: 'CATERING', defaultUnit: 'DAY', defaultRateCents: 90000 },
    { role: 'Craft Services (small crew)',category:'CATERING',defaultUnit: 'DAY', defaultRateCents: 40000 },

    // TALENT
    { role: 'Principal Talent',      category: 'TALENT', defaultUnit: 'DAY', defaultRateCents: 200000 },
    { role: 'Background / Extras',   category: 'TALENT', defaultUnit: 'DAY', defaultRateCents: 30000 },

    // TRAVEL
    { role: 'Flights (per person)',   category: 'TRAVEL', defaultUnit: 'FLAT', defaultRateCents: 80000 },
    { role: 'Hotel (per person/night)',category:'TRAVEL', defaultUnit: 'FLAT', defaultRateCents: 25000 },
    { role: 'Ground Transport',      category: 'TRAVEL', defaultUnit: 'DAY',  defaultRateCents: 35000 },

    // PRODUCTION_FEE
    { role: 'Production Fee (20%)',   category: 'PRODUCTION_FEE', defaultUnit: 'FLAT', defaultRateCents: 0 },
    { role: 'Agency Markup (15%)',    category: 'PRODUCTION_FEE', defaultUnit: 'FLAT', defaultRateCents: 0 },
  ] as const

  let rateCount = 0
  for (const r of rates) {
    await db.rateCard.upsert({
      where: {
        // Upsert on role+workspaceId to make seed idempotent
        id: `seed-${r.role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      },
      update: {},
      create: {
        id: `seed-${r.role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        workspaceId: workspace.id,
        role: r.role,
        category: r.category as never,
        defaultUnit: r.defaultUnit as never,
        defaultRateCents: r.defaultRateCents,
        isFavorite: 'isFavorite' in r ? Boolean(r.isFavorite) : false,
        searchTokens: `${r.role} ${r.category}`.toLowerCase(),
      },
    })
    rateCount++
  }
  console.log(`✓  Rate cards: ${rateCount} seeded`)

  // ─── Sample client ─────────────────────────────────────────────────────────
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

  // ─── Sample project ────────────────────────────────────────────────────────
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

  console.log('\n🎉  Seed complete.')
  console.log('\nNext steps:')
  console.log('  1. Run `npx prisma studio` to inspect your data')
  console.log('  2. Set your user role to OWNER in Prisma Studio after first sign-in')
  console.log('  3. npm run dev')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
