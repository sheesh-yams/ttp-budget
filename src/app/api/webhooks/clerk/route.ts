import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

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
  // Each new Clerk user gets their own fresh Workspace. They become OWNER and
  // must complete onboarding before accessing the app.
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

    const workspace = await db.workspace.create({
      data: { name: defaultWorkspaceName },
    })

    await db.user.upsert({
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
  }

  // ── organization.created ────────────────────────────────────────────────────
  // When the owner creates a Clerk org, link it to their workspace so invited
  // members can be routed to the right workspace via organizationMembership.created.
  if (evt.type === 'organization.created') {
    const { id: orgId, created_by: createdByClerkId } = evt.data

    if (createdByClerkId) {
      const owner = await db.user.findUnique({
        where: { clerkId: createdByClerkId },
        select: { workspaceId: true },
      })

      if (owner) {
        // Use update with ignore on unique conflict in case webhook fires twice.
        await db.workspace.update({
          where: { id: owner.workspaceId },
          data: { clerkOrgId: orgId },
        })
      }
    }
  }

  // ── organizationMembership.created ─────────────────────────────────────────
  // A user has been added to a Clerk org (either the creator, or an invited member).
  // If they're the org creator their workspace already matches — skip.
  // Otherwise attach them to the org's workspace as PRODUCER; invited users
  // skip the onboarding wizard (they inherit the owner's workspace settings).
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
      // organization.created hasn't processed yet — nothing to do.
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
      // Invited user who signed up fresh and got a blank workspace — move them.
      await db.user.update({
        where: { clerkId: memberClerkId },
        data: {
          workspaceId: workspace.id,
          role: 'PRODUCER',
          onboarded: true,
        },
      })
    } else {
      // Brand-new user (sign-up + invite completed in one flow).
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
