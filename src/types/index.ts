import type {
  Project,
  Client,
  Budget,
  Phase,
  Account,
  LineItem,
  RateCard,
  Proposal,
  Invoice,
  CallSheet,
  Workspace,
  User,
  BudgetTemplate,
  RateCategory,
  RateUnit,
  ShootType,
  ProjectStatus,
  ProposalStatus,
  InvoiceStatus,
  InvoiceKind,
  ProposalDetailLevel,
  UserRole,
  CallSheetStatus,
} from '@prisma/client'

// ─── Re-exports ───────────────────────────────────────────────────────────────
export type {
  RateCategory,
  RateUnit,
  ShootType,
  ProjectStatus,
  ProposalStatus,
  InvoiceStatus,
  InvoiceKind,
  ProposalDetailLevel,
  UserRole,
  CallSheetStatus,
  CallSheet,
}

// ─── Enriched types (with relations included) ─────────────────────────────────

export type ProjectWithClient = Project & {
  client: Client
}

export type ProjectFull = Project & {
  client: Client
  budgets: Budget[]
  proposals: Proposal[]
  invoices: Invoice[]
}

export type SectionSummary = {
  id:          string
  title:       string
  description: string | null
  orderIndex:  number
}

export type BudgetWithPhases = Budget & {
  phases: PhaseWithAccounts[]
}

export type PhaseWithAccounts = Phase & {
  sections?: SectionSummary[]
  accounts:  AccountWithItems[]
}

export type AccountWithItems = Account & {
  lineItems: LineItem[]
  children: AccountWithItems[]
}

export type LineItemWithRate = LineItem & {
  rateCard: RateCard | null
}

export type ProposalWithProject = Proposal & {
  project: ProjectWithClient
  budget: Budget
}

export type ProposalFull = Proposal & {
  project: Project & { client: Client }
  budget: Budget & {
    phases: (Phase & {
      accounts: AccountWithItems[]
    })[]
  }
  workspace: Pick<
    Workspace,
    'name' | 'legalName' | 'contactEmail' | 'website' | 'contactPhone' | 'logoUrl'
  >
}

export type InvoiceWithRelations = Invoice & {
  client: Client
  project: Project
  workspace: Pick<
    Workspace,
    | 'name'
    | 'legalName'
    | 'logoUrl'
    | 'logoDarkUrl'
    | 'primaryColor'
    | 'accentColor'
    | 'wireInstructions'
    | 'achInstructions'
    | 'checkPayableTo'
    | 'checkMailingAddress'
    | 'defaultInvoiceTerms'
    | 'contactEmail'
    | 'website'
  >
}

// ─── Budget editor types ───────────────────────────────────────────────────────

/** A row in the budget grid — can be an account header or a line item */
export type BudgetRow =
  | { type: 'account'; data: AccountWithItems; depth: number }
  | { type: 'lineItem'; data: LineItemWithRate; accountId: string; depth: number }
  | { type: 'subtotal'; accountId: string; label: string; totalCents: number; depth: number }

/** Globals map — e.g. { shoot: 2, prep: 1, post: 5 } */
export type GlobalsMap = Record<string, number>

// ─── Proposal content shape ───────────────────────────────────────────────────
// Stored as JSON in Proposal.content

export interface ProposalDiscount {
  type: 'flat' | 'pct'
  label: string
  valueCents?: number    // used when type === 'flat'
  valuePct?: number      // used when type === 'pct', 0–100 display (e.g. 10 = 10%)
}

export interface ProposalContent {
  totalCents?: number
  discount?: ProposalDiscount
  cover?: {
    heroImageUrl?: string
    tagline?: string
  }
  sections: ProposalSection[]
}

export type DeliverableItemType = 'DELIVERABLE' | 'SERVICE' | 'RAW_FOOTAGE' | 'OTHER'

export interface ScopeItem {
  number:     string
  title:      string
  description: string
  sectionIds?: string[]
  type?:       DeliverableItemType
  quantity?:   number
}

export type ProposalSection =
  | { type: 'about'; title: string; overview?: string; body: string }
  | { type: 'scope'; title: string; items: ScopeItem[] }
  | { type: 'budget'; detailLevel: ProposalDetailLevel }
  | { type: 'terms'; title: string; body: string; milestones: PaymentMilestone[] }
  | { type: 'custom'; title: string; body: string }

// ─── Payment terms ────────────────────────────────────────────────────────────

export type MilestoneTrigger =
  | 'on_signing'
  | 'on_shoot_day'
  | 'on_delivery'
  | 'net_30'
  | 'net_60'
  | 'net_90'
  | 'custom_date'

export interface PaymentMilestone {
  id: string
  name: string
  percentPct: number      // 0–1 decimal fraction (0.5 = 50%). Never store display %.
  trigger: MilestoneTrigger
  customDate?: string     // ISO date string if trigger === 'custom_date'
}

// ─── Invoice line items (stored as JSON in Invoice.lineItems) ─────────────────

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unit: RateUnit
  rateCents: number
  lineTotalCents: number
  notes?: string
}

// ─── Rate card autocomplete ───────────────────────────────────────────────────

export interface RateCardOption {
  id: string
  role: string
  category: RateCategory
  defaultUnit: RateUnit
  defaultRateCents: number
  isFavorite: boolean
  usageCount: number
  notes: string | null
}

// ─── Template kind (mirrors the TemplateKind enum in schema) ─────────────────
// Defined locally until `prisma generate` picks up the new schema field.

export type TemplateKind = 'FULL' | 'PACKAGE'

// Extended BudgetTemplate — adds fields that will exist after db push + generate
export type BudgetTemplateExtended = BudgetTemplate & {
  kind:      TemplateKind
  tags:      ShootType[]
  structure: TemplateStructure
}

// ─── Template structure (stored as JSON in BudgetTemplate.structure) ─────────

export interface TemplateItem {
  id: string
  description: string
  rateCardId?: string | null
  qty: number
  unit: RateUnit
  rateCents: number
  markupPct: number   // e.g. 10 = 10%
  notes: string
}

export interface TemplateAccount {
  id: string
  name: string
  code?: string
  items: TemplateItem[]
  children: TemplateAccount[]
}

export interface TemplateStructure {
  accounts: TemplateAccount[]
}

// ─── Call sheet ──────────────────────────────────────────────────────────────

export type CallSheetWithProject = CallSheet & {
  project: Pick<Project, 'id' | 'name'>
}

// ─── Server action return type ────────────────────────────────────────────────

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
