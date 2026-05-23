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

export type BudgetWithPhases = Budget & {
  phases: PhaseWithAccounts[]
}

export type PhaseWithAccounts = Phase & {
  accounts: AccountWithItems[]
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

export type InvoiceWithRelations = Invoice & {
  client: Client
  project: Project
  workspace: Pick<
    Workspace,
    | 'name'
    | 'logoUrl'
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

export interface ProposalContent {
  totalCents?: number
  cover?: {
    heroImageUrl?: string
    tagline?: string
  }
  sections: ProposalSection[]
}

export type ProposalSection =
  | { type: 'about'; title: string; body: string }
  | { type: 'scope'; title: string; items: { number: string; title: string; description: string }[] }
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
  percentPct: number      // 0–100 (stored as display %, not decimal)
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

// ─── Server action return type ────────────────────────────────────────────────

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
