import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { seedWorkspaceFromGlobals } from '@/lib/workspace-seeder'

export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No webhook secret' }, { status: 500 })
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── user.created ────────────────────────────────────────────────────────────
  // Each new Clerk user gets their own fresh Workspace + a corresponding Clerk
  // org. The org makes them addressable via organizationMembership events (so
  // they can invite teammates) and is the source of truth for auth().orgId.
  if (evt.type === 'user.created') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data
    const email = email_addresses[0]?.email_address

    if (!email) {
      return NextResponse.json({ error: 'No email' }, { status: 400 })
    }

    const displayName = [first_name, last_name].filter(Boolean).join(' ') || null
    const defaultWorkspaceName =
      displayName
        ? `${displayName}'s Workspace`
        : `${email.split('@')[0]}'s Workspace`

    try {
      const clerk = await clerkClient()

      // Create a Clerk org for this user's personal workspace.
      const org = await clerk.organizations.createOrganization({
        name: defaultWorkspaceName,
        createdBy: id,
      })

      // Persist workspace + user in one transaction.
      let newWorkspaceId: string
      await db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { name: defaultWorkspaceName, clerkOrgId: org.id },
        })
        newWorkspaceId = workspace.id

        await tx.user.upsert({
          where: { clerkId: id },
          update: {
            email,
            name: displayName,
            avatarUrl: image_url ?? null,
          },
          create: {
            clerkId: id,
            email,
            name: displayName,
            avatarUrl: image_url ?? null,
            workspaceId: workspace.id,
            role: 'OWNER',
            onboarded: false,
          },
        })
      })

      // Seed global rate cards + templates into the new workspace.
      // Non-blocking: a seeder failure must NOT prevent account creation.
      try {
        await seedWorkspaceFromGlobals(newWorkspaceId!)
      } catch (seedErr) {
        console.error('[workspace-seeder] Failed to seed new workspace (non-fatal):', seedErr)
      }
    } catch (err) {
      console.error('user.created webhook error:', err)
      return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
    }
  }

  // ── organization.created ────────────────────────────────────────────────────
  // Fires when any Clerk org is created — including ones our own code creates.
  // This is the fallback linker for orgs created via the Clerk dashboard or
  // other out-of-band paths. For orgs created by our createWorkspace() action
  // or the user.created handler, the DB workspace already has clerkOrgId set
  // before this event arrives.
  if (evt.type === 'organization.created') {
    const { id: orgId, created_by: createdByClerkId } = evt.data

    // Guard 1: If any workspace already claims this Clerk org (e.g. createWorkspace
    // server action wrote it before this event landed), do nothing. Without this
    // guard there's a race where the webhook overwrites the HOME workspace's
    // clerkOrgId with the new org's ID, corrupting the lookup for all future
    // workspace switches.
    const alreadyLinked = await db.workspace.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    })
    if (alreadyLinked) {
      return NextResponse.json({ received: true })
    }

    if (createdByClerkId) {
      const owner = await db.user.findUnique({
        where: { clerkId: createdByClerkId },
        select: { workspaceId: true },
      })

      if (owner) {
        // Guard 2: Only update home workspace if it has no org yet (idempotent).
        // This handles the "org created via Clerk dashboard" case only.
        await db.workspace.updateMany({
          where: { id: owner.workspaceId, clerkOrgId: null },
          data: { clerkOrgId: orgId },
        })
      }
    }
  }

  // ── organizationMembership.created ─────────────────────────────────────────
  // A user has been added to a Clerk org (either the creator, or an invited
  // member). Attach invited users to the org's workspace as PRODUCER.
  if (evt.type === 'organizationMembership.created') {
    const { organization, public_user_data } = evt.data
    const memberClerkId = public_user_data?.user_id
    if (!memberClerkId || !organization?.id) {
      return NextResponse.json({ received: true })
    }

    const workspace = await db.workspace.findUnique({
      where: { clerkOrgId: organization.id },
    })

    if (!workspace) {
      return NextResponse.json({ received: true })
    }

    const existingUser = await db.user.findUnique({
      where: { clerkId: memberClerkId },
      select: { workspaceId: true },
    })

    if (existingUser?.workspaceId === workspace.id) {
      // Already attached — org creator's own membership event.
      return NextResponse.json({ received: true })
    }

    if (existingUser) {
      // Invited user who signed up fresh — move them to the org's workspace.
      await db.user.update({
        where: { clerkId: memberClerkId },
        data: {
          workspaceId: workspace.id,
          role: 'PRODUCER',
          onboarded: true,
        },
      })
    } else {
      // Brand-new user (sign-up + invite in one flow).
      const memberData = public_user_data as {
        identifier?: string
        first_name?: string | null
        last_name?: string | null
        image_url?: string | null
      }
      const email = memberData.identifier ?? ''
      const name = [memberData.first_name, memberData.last_name].filter(Boolean).join(' ') || null

      await db.user.create({
        data: {
          clerkId: memberClerkId,
          email,
          name,
          avatarUrl: memberData.image_url ?? null,
          workspaceId: workspace.id,
          role: 'PRODUCER',
          onboarded: true,
        },
      })
    }
  }

  return NextResponse.json({ received: true })
}
