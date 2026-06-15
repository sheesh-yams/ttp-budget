import { auth } from '@clerk/nextjs/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getInvitationByToken } from '@/server/actions/team'
import { InviteAcceptClient } from '@/components/team/InviteAcceptClient'

export const metadata = { title: 'Accept invitation — TTP Budget' }

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invitation = await getInvitationByToken(token)

  if (!invitation) notFound()

  // Already accepted
  if (invitation.acceptedAt) {
    return <InviteStatus status="accepted" workspaceName={invitation.workspace.name} />
  }

  // Expired
  if (invitation.expiresAt < new Date()) {
    return <InviteStatus status="expired" workspaceName={invitation.workspace.name} />
  }

  const { userId } = await auth()
  const isAuthed = !!userId

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://budget.thethirdplace.co'
  const inviteUrl = `${appUrl}/invite/${token}`

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: '#0A0612' }}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-white/10 p-8 shadow-2xl"
        style={{ background: '#130B22' }}
      >
        {/* Header */}
        <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">
          TTP Budget
        </p>

        {/* Workspace logo placeholder */}
        <div
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black"
          style={{ background: 'var(--brand-accent,#04FFCC)', color: '#003D31' }}
        >
          {invitation.workspace.name[0]?.toUpperCase()}
        </div>

        <h1 className="mb-2 text-[22px] font-bold text-white">
          You&rsquo;ve been invited
        </h1>
        <p className="mb-1 text-[14px] text-white/60">
          {invitation.invitedByName
            ? <><strong className="text-white/80">{invitation.invitedByName}</strong> invited you to join</>
            : 'You&rsquo;ve been invited to join'
          }
        </p>
        <p className="mb-6 text-[18px] font-semibold text-white">
          {invitation.workspace.name}
        </p>

        {/* Role + email */}
        <div className="mb-6 rounded-xl border border-white/[0.08] p-3.5 text-[13px]">
          <div className="flex justify-between py-1 text-white/50">
            <span>Your email</span>
            <span className="text-white/80">{invitation.email}</span>
          </div>
          <div className="flex justify-between border-t border-white/[0.06] py-1 text-white/50">
            <span>Role</span>
            <span className="text-white/80">{invitation.role === 'OWNER' ? 'Owner' : 'Producer'}</span>
          </div>
        </div>

        {isAuthed ? (
          /* ── Already signed in: show Accept button ── */
          <InviteAcceptClient token={token} />
        ) : (
          /* ── Not signed in: prompt to sign in / sign up ── */
          <div className="space-y-2.5">
            {/*
              Use force_redirect_url so Clerk honours the destination through
              Google / social OAuth flows. redirect_url is best-effort and is
              often dropped after the OAuth callback round-trip.
            */}
            <Link
              href={`/sign-up?force_redirect_url=${encodeURIComponent(inviteUrl)}`}
              className="flex w-full items-center justify-center rounded-xl py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: '#04FFCC', color: '#003D31' }}
            >
              Create account to accept
            </Link>
            <Link
              href={`/sign-in?force_redirect_url=${encodeURIComponent(inviteUrl)}`}
              className="flex w-full items-center justify-center rounded-xl border border-white/[0.12] py-3 text-[14px] font-medium text-white/70 transition-colors hover:text-white"
            >
              Sign in instead
            </Link>
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-white/25">
          Invitation expires {invitation.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

// ─── Status pages ─────────────────────────────────────────────────────────────

function InviteStatus({ status, workspaceName }: { status: 'accepted' | 'expired'; workspaceName: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: '#0A0612' }}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-white/10 p-8 shadow-2xl text-center"
        style={{ background: '#130B22' }}
      >
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/30">TTP Budget</p>
        {status === 'accepted' ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-900/40 text-green-400 text-2xl">✓</div>
            <h1 className="mb-2 text-[20px] font-bold text-white">Already accepted</h1>
            <p className="mb-6 text-sm text-white/50">You&rsquo;ve already joined <strong className="text-white/80">{workspaceName}</strong>.</p>
            <Link
              href="/dashboard"
              className="inline-block rounded-xl px-6 py-3 text-[13px] font-semibold"
              style={{ background: '#04FFCC', color: '#003D31' }}
            >
              Go to dashboard →
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30 text-red-400 text-2xl">✕</div>
            <h1 className="mb-2 text-[20px] font-bold text-white">Invitation expired</h1>
            <p className="text-sm text-white/50">This invitation to <strong className="text-white/80">{workspaceName}</strong> is no longer valid. Ask the workspace owner to send a new one.</p>
          </>
        )}
      </div>
    </div>
  )
}
