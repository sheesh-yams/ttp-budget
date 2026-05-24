'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getWorkspaceId } from '@/lib/auth'
import { z } from 'zod'
import type { ActionResult } from '@/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const companySchema = z.object({
  name:         z.string().min(1).max(200),
  legalName:    z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(200).optional().nullable().or(z.literal('')),
  contactPhone: z.string().max(50).optional().nullable(),
  website:      z.string().max(300).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city:         z.string().max(100).optional().nullable(),
  region:       z.string().max(100).optional().nullable(),
  postalCode:   z.string().max(20).optional().nullable(),
  country:      z.string().max(10).optional().nullable(),
})

const brandingSchema = z.object({
  logoUrl:      z.string().max(500).optional().nullable(),
  logoDarkUrl:  z.string().max(500).optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

const invoiceDefaultsSchema = z.object({
  invoiceNumberPrefix:     z.string().min(1).max(20),
  defaultPaymentTermsDays: z.number().int().min(0).max(365),
  defaultTaxPct:           z.number().min(0).max(100),
  wireInstructions:        z.string().max(2000).optional().nullable(),
  achInstructions:         z.string().max(2000).optional().nullable(),
  checkPayableTo:          z.string().max(200).optional().nullable(),
  checkMailingAddress:     z.string().max(500).optional().nullable(),
  defaultInvoiceTerms:     z.string().max(5000).optional().nullable(),
})

const proposalDefaultsSchema = z.object({
  defaultProposalTerms: z.string().max(5000).optional().nullable(),
})

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function updateCompanySettings(
  input: z.infer<typeof companySchema>
): Promise<ActionResult> {
  try {
    const workspaceId = await getWorkspaceId()
    const data = companySchema.parse(input)
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        name:         data.name,
        legalName:    data.legalName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        website:      data.website || null,
        addressLine1: data.addressLine1 || null,
        addressLine2: data.addressLine2 || null,
        city:         data.city || null,
        region:       data.region || null,
        postalCode:   data.postalCode || null,
        country:      data.country || null,
      },
    })
    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save company settings' }
  }
}

export async function updateBrandingSettings(
  input: z.infer<typeof brandingSchema>
): Promise<ActionResult> {
  try {
    const workspaceId = await getWorkspaceId()
    const data = brandingSchema.parse(input)
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        logoUrl:      data.logoUrl || null,
        logoDarkUrl:  data.logoDarkUrl || null,
        primaryColor: data.primaryColor ?? '#5D00A4',
        accentColor:  data.accentColor  ?? '#04FFCC',
      },
    })
    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save branding settings' }
  }
}

export async function updateInvoiceDefaults(
  input: z.infer<typeof invoiceDefaultsSchema>
): Promise<ActionResult> {
  try {
    const workspaceId = await getWorkspaceId()
    const data = invoiceDefaultsSchema.parse(input)
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        invoiceNumberPrefix:     data.invoiceNumberPrefix,
        defaultPaymentTermsDays: data.defaultPaymentTermsDays,
        defaultTaxPct:           data.defaultTaxPct / 100, // store as decimal
        wireInstructions:        data.wireInstructions || null,
        achInstructions:         data.achInstructions || null,
        checkPayableTo:          data.checkPayableTo || null,
        checkMailingAddress:     data.checkMailingAddress || null,
        defaultInvoiceTerms:     data.defaultInvoiceTerms || null,
      },
    })
    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save invoice defaults' }
  }
}

export async function updateProposalDefaults(
  input: z.infer<typeof proposalDefaultsSchema>
): Promise<ActionResult> {
  try {
    const workspaceId = await getWorkspaceId()
    const data = proposalDefaultsSchema.parse(input)
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        defaultProposalTerms: data.defaultProposalTerms || null,
      },
    })
    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save proposal defaults' }
  }
}
