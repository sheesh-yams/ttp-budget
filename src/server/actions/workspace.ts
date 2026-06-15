'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentUser, getWorkspaceId } from '@/lib/auth'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import type { ActionResult } from '@/types'
import { seedWorkspaceFromGlobals, reseedWorkspaceFromGlobals } from '@/lib/workspace-seeder'
import { put, del } from '@vercel/blob'
import { logAuditEvent } from '@/lib/audit'

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

    // Guard: workspace names must be globally unique (case-insensitive).
    // Exclude the current workspace so renaming to the same name is a no-op.
    const duplicate = await db.workspace.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        NOT: { id: workspaceId },
      },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: 'A workspace with that name already exists. Please choose a different name.' }
    }

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

// ─── Create new workspace ─────────────────────────────────────────────────────

export async function createWorkspace(
  name: string
): Promise<ActionResult<{ clerkOrgId: string }>> {
  let clerkOrgId: string | null = null
  try {
    const trimmed = name.trim()
    if (!trimmed) return { success: false, error: 'Workspace name is required' }

    // Guard: workspace names must be globally unique (case-insensitive).
    // Prevents confusion from two workspaces with the same name in the switcher.
    const duplicate = await db.workspace.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: `A workspace named "${trimmed}" already exists. Please choose a different name.` }
    }

    const user = await getCurrentUser()
    const clerk = await clerkClient()

    // Create Clerk org — user automatically becomes OWNER member.
    // NOTE: This triggers an organization.created webhook. We guard against that
    // webhook corrupting the home workspace's clerkOrgId (see route.ts guard).
    const org = await clerk.organizations.createOrganization({
      name: trimmed,
      createdBy: user.clerkId,
    })
    clerkOrgId = org.id

    // Check if the organization.created webhook already claimed this org ID on
    // the home workspace (race condition: webhook can arrive before we write).
    const alreadyClaimed = await db.workspace.findUnique({
      where: { clerkOrgId: org.id },
      select: { id: true, name: true },
    })

    if (alreadyClaimed) {
      // The webhook incorrectly stole this orgId. Release it from the wrong
      // workspace so we can assign it to the new one correctly.
      if (alreadyClaimed.name !== trimmed) {
        await db.workspace.update({
          where: { id: alreadyClaimed.id },
          data: { clerkOrgId: null } as unknown as Parameters<typeof db.workspace.update>[0]['data'],
        })
      } else {
        // Workspace already created correctly (e.g. double-submit) — return it.
        revalidatePath('/', 'layout')
        return { success: true, data: { clerkOrgId: org.id } }
      }
    }

    // Create DB workspace linked to this Clerk org
    const newWorkspace = await db.workspace.create({
      data: {
        name: trimmed,
        clerkOrgId: org.id,
      } as unknown as Parameters<typeof db.workspace.create>[0]['data'],
    })

    // Seed global rate cards + templates. Non-blocking — failure here must NOT
    // prevent the workspace from being returned to the client.
    try {
      await seedWorkspaceFromGlobals(newWorkspace.id)
    } catch (seedErr) {
      console.error('[workspace-seeder] Failed to seed new workspace (non-fatal):', seedErr)
    }

    revalidatePath('/', 'layout')
    return { success: true, data: { clerkOrgId: org.id } }
  } catch (err) {
    console.error('[createWorkspace]', err)
    // If the DB write failed due to a unique constraint race, try to recover
    // by finding any workspace already linked to this org.
    if (clerkOrgId) {
      const recovered = await db.workspace.findUnique({
        where: { clerkOrgId },
        select: { id: true, name: true },
      }).catch(() => null)
      if (recovered) {
        return { success: true, data: { clerkOrgId } }
      }
    }
    return { success: false, error: 'Failed to create workspace' }
  }
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

const onboardingSchema = z.object({
  name:         z.string().min(1).max(200),
  contactEmail: z.string().email().max(200).optional().nullable().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export async function completeOnboarding(
  input: z.infer<typeof onboardingSchema>
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    const data = onboardingSchema.parse(input)

    // Guard: workspace names must be globally unique (case-insensitive).
    // Exclude the user's own workspace so submitting without changing the name works.
    const duplicate = await db.workspace.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        NOT: { id: user.workspaceId },
      },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: 'A workspace with that name already exists. Please choose a different name.' }
    }

    await db.workspace.update({
      where: { id: user.workspaceId },
      data: {
        name:         data.name,
        contactEmail: data.contactEmail || null,
        primaryColor: data.primaryColor ?? '#000000',
        accentColor:  data.accentColor  ?? '#FFD400',
      },
    })

    await db.user.update({
      where: { id: user.id },
      data: { onboarded: true },
    })

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (err) {
    // redirect() throws — let it propagate
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
    return { success: false, error: 'Failed to complete onboarding' }
  }
}

// ─── Danger zone ──────────────────────────────────────────────────────────────

/** PRODUCER: leave the active workspace (removes Clerk org membership). */
export async function leaveWorkspace(): Promise<ActionResult> {
  try {
    const { orgId, userId } = await auth()
    if (!orgId || !userId) return { success: false, error: 'No active workspace' }

    const clerk = await clerkClient()
    // Clerk deleteOrganizationMembership requires the membership ID, so find it first
    const memberships = await clerk.organizations.getOrganizationMembershipList({ organizationId: orgId })
    const membership = memberships.data.find(m => m.publicUserData?.userId === userId)
    if (!membership) return { success: false, error: 'Membership not found' }

    await clerk.organizations.deleteOrganizationMembership({ organizationId: orgId, userId })
    redirect('/sign-in')
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
    console.error('[leaveWorkspace]', err)
    return { success: false, error: 'Failed to leave workspace' }
  }
}

/**
 * OWNER ONLY: soft-delete the active workspace.
 *
 * What happens immediately:
 *   1. Clerk org is deleted → all members lose access (auth().orgId → null).
 *   2. DB workspace gets `deletedAt = now()` — invisible to getScopedDb() and
 *      getWorkspaceId() (which now filters `deletedAt: null`).
 *
 * Hard purge: a Vercel Cron job (`/api/cron/purge-workspaces`) deletes workspaces
 * where `deletedAt < now() - 30 days`. Data is fully restorable during grace.
 *
 * Producers are blocked at both the UI layer (DangerZone hides the button) and
 * here at the server action layer so it can never be bypassed.
 */
export async function deleteWorkspace(confirmName: string): Promise<ActionResult> {
  try {
    const { orgId } = await auth()
    if (!orgId) return { success: false, error: 'No active workspace' }

    const user = await getCurrentUser()
    // Server-side role guard — this is the authoritative check.
    if (user.role !== 'OWNER') return { success: false, error: 'Only workspace owners can delete a workspace.' }

    const workspace = await db.workspace.findFirst({
      where: { clerkOrgId: orgId, deletedAt: null } as Parameters<typeof db.workspace.findFirst>[0]['where'],
      select: { id: true, name: true },
    })
    if (!workspace) return { success: false, error: 'Workspace not found' }
    if (workspace.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
      return { success: false, error: 'Workspace name does not match' }
    }

    const clerk = await clerkClient()
    // 1. Delete the Clerk org — all members lose access immediately.
    await clerk.organizations.deleteOrganization(orgId)

    // 2. Soft-delete the DB record. Hard-purge happens after 30 days via cron.
    await db.workspace.update({
      where: { id: workspace.id },
      data:  { deletedAt: new Date(), clerkOrgId: null } as Parameters<typeof db.workspace.update>[0]['data'],
    })

    // 3. Write audit event (best-effort — after the main operation).
    await logAuditEvent({
      workspaceId: workspace.id,
      actorId:     user.id,
      action:      'workspace.delete_requested',
      entityType:  'Workspace',
      entityId:    workspace.id,
      metadata:    { workspaceName: workspace.name },
    })

    redirect('/sign-in')
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
    console.error('[deleteWorkspace]', err)
    return { success: false, error: 'Failed to delete workspace' }
  }
}

// ─── Logo upload ──────────────────────────────────────────────────────────────

/**
 * Upload a logo image to Vercel Blob and save the URL to the workspace.
 * variant: 'light' → logoUrl, 'dark' → logoDarkUrl
 */
export async function uploadWorkspaceLogo(
  formData: FormData,
  variant: 'light' | 'dark',
): Promise<ActionResult<{ url: string }>> {
  try {
    const workspaceId = await getWorkspaceId()

    const file = formData.get('file')
    if (!(file instanceof File)) return { success: false, error: 'No file provided' }
    if (!file.type.startsWith('image/')) return { success: false, error: 'File must be an image' }
    if (file.size > 5 * 1024 * 1024) return { success: false, error: 'File must be under 5 MB' }

    // Fetch the current logo URL so we can delete the old blob (best-effort)
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { logoUrl: true, logoDarkUrl: true },
    })
    const oldUrl = variant === 'light' ? workspace?.logoUrl : workspace?.logoDarkUrl

    // Upload to Vercel Blob
    const ext      = file.name.split('.').pop() ?? 'png'
    const blobPath = `logos/${workspaceId}/${variant}.${ext}`
    const { url }  = await put(blobPath, file, { access: 'public', addRandomSuffix: false })

    // Persist URL to workspace
    await db.workspace.update({
      where: { id: workspaceId },
      data:  variant === 'light' ? { logoUrl: url } : { logoDarkUrl: url },
    })

    // Delete old blob (best-effort — don't fail the action if this errors)
    if (oldUrl && oldUrl !== url) {
      del(oldUrl).catch(() => undefined)
    }

    revalidatePath('/settings')
    revalidatePath('/', 'layout')
    return { success: true, data: { url } }
  } catch {
    return { success: false, error: 'Failed to upload logo' }
  }
}

/**
 * Remove a logo — deletes the blob and clears the DB field.
 */
export async function removeWorkspaceLogo(
  variant: 'light' | 'dark',
): Promise<ActionResult> {
  try {
    const workspaceId = await getWorkspaceId()

    const workspace = await db.workspace.findUnique({
      where:  { id: workspaceId },
      select: { logoUrl: true, logoDarkUrl: true },
    })
    const url = variant === 'light' ? workspace?.logoUrl : workspace?.logoDarkUrl

    await db.workspace.update({
      where: { id: workspaceId },
      data:  variant === 'light' ? { logoUrl: null } : { logoDarkUrl: null },
    })

    if (url) del(url).catch(() => undefined)

    revalidatePath('/settings')
    revalidatePath('/', 'layout')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to remove logo' }
  }
}

// ─── Re-seed workspace library ────────────────────────────────────────────────

/** Additive re-seed: adds any missing featured globals. Never modifies existing rows. */
export async function reseedWorkspace(): Promise<ActionResult<{ ratesAdded: number; templatesAdded: number }>> {
  try {
    const workspaceId = await getWorkspaceId()
    const result = await reseedWorkspaceFromGlobals(workspaceId)
    revalidatePath('/rates')
    revalidatePath('/templates')
    return { success: true, data: result }
  } catch {
    return { success: false, error: 'Failed to re-seed workspace library' }
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

// ─── Production settings ──────────────────────────────────────────────────────

const productionSchema = z.object({
  callTimeFormat: z.enum(['12H', '24H']),
})

export async function updateProductionSettings(
  input: z.infer<typeof productionSchema>
): Promise<ActionResult> {
  try {
    const workspaceId = await getWorkspaceId()
    const data = productionSchema.parse(input)
    await db.workspace.update({
      where: { id: workspaceId },
      data: { callTimeFormat: data.callTimeFormat },
    })
    revalidatePath('/settings')
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Failed to save production settings' }
  }
}

// ─── User profile ─────────────────────────────────────────────────────────────

/**
 * Persist a new avatar URL (already uploaded to R2) to the authenticated user's
 * DB record. Passing an empty string clears the custom avatar, falling back to
 * the Clerk imageUrl on next login.
 */
export async function updateUserAvatar(
  avatarUrl: string,
): Promise<ActionResult<{ avatarUrl: string | null }>> {
  try {
    const user = await getCurrentUser()
    const url  = avatarUrl.trim() || null

    await db.user.update({
      where: { id: user.id },
      data:  { avatarUrl: url },
    })

    revalidatePath('/settings')
    revalidatePath('/', 'layout')
    return { success: true, data: { avatarUrl: url } }
  } catch {
    return { success: false, error: 'Failed to update avatar.' }
  }
}
