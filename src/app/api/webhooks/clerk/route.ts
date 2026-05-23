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

  if (evt.type === 'user.created') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data
    const email = email_addresses[0]?.email_address

    if (!email) {
      return NextResponse.json({ error: 'No email' }, { status: 400 })
    }

    // For a single-tenant app, every user belongs to the one workspace.
    // Find or create workspace (workspace is seeded, but just in case).
    const workspace = await db.workspace.findFirst()
    if (!workspace) {
      return NextResponse.json({ error: 'No workspace found — run seed first' }, { status: 500 })
    }

    await db.user.upsert({
      where: { clerkId: id },
      update: {
        email,
        name: [first_name, last_name].filter(Boolean).join(' ') || null,
        avatarUrl: image_url ?? null,
      },
      create: {
        clerkId: id,
        email,
        name: [first_name, last_name].filter(Boolean).join(' ') || null,
        avatarUrl: image_url ?? null,
        workspaceId: workspace.id,
        role: 'PRODUCER', // owner role is set manually in db:studio
      },
    })
  }

  return NextResponse.json({ received: true })
}
