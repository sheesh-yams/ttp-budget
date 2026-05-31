'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUser, useOrganization, useOrganizationList, useClerk } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, FolderOpen, FileText,
  Receipt, List, LayoutGrid, Settings,
  ChevronDown, Check, Plus, LogOut,
} from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createWorkspace } from '@/server/actions/workspace'

const navGroups = [
  {
    section: null,
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'Work',
    items: [
      { label: 'Clients',   href: '/clients',   icon: Users },
      { label: 'Projects',  href: '/projects',  icon: FolderOpen },
      { label: 'Proposals', href: '/proposals', icon: FileText },
      { label: 'Invoices',  href: '/invoices',  icon: Receipt },
    ],
  },
  {
    section: 'Configure',
    items: [
      { label: 'Rate cards', href: '/rates',     icon: List },
      { label: 'Templates',  href: '/templates', icon: LayoutGrid },
      { label: 'Settings',   href: '/settings',  icon: Settings },
    ],
  },
]

export function Sidebar({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname()

  return (
    <aside
      className="flex w-[200px] flex-shrink-0 flex-col"
      style={{ background: '#0A0612' }}
    >
      {/* ── Workspace switcher ── */}
      <div className="border-b border-white/[0.08]">
        <WorkspaceSwitcher fallbackName={workspaceName} />
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 py-3">
        {navGroups.map((group) => (
          <div key={group.section ?? 'main'}>
            {group.section && (
              <p className="px-4 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/25">
                {group.section}
              </p>
            )}
            {group.items.map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== '/dashboard' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 border-l-2 px-3.5 py-[9px] text-[12.5px] font-medium transition-colors',
                    active
                      ? 'border-[#04FFCC] text-white'
                      : 'border-transparent text-white/45 hover:bg-white/[0.035] hover:text-white/75'
                  )}
                  style={active ? { background: 'rgba(4,255,204,0.07)' } : undefined}
                >
                  <Icon
                    className="h-[15px] w-[15px] flex-shrink-0"
                    style={{ color: active ? '#04FFCC' : undefined }}
                  />
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── User footer ── */}
      <div className="border-t border-white/[0.08]">
        <UserFooter />
      </div>
    </aside>
  )
}

// =============================================================================
// WorkspaceSwitcher
// =============================================================================

function WorkspaceSwitcher({ fallbackName }: { fallbackName: string }) {
  const router = useRouter()
  const { organization, isLoaded: orgLoaded } = useOrganization()
  const { userMemberships, setActive, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  })

  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const displayName = organization?.name ?? fallbackName
  const initial = displayName.trim()[0]?.toUpperCase() ?? 'W'

  const nameParts = (() => {
    if (displayName.length <= 18) return [displayName, '']
    const mid = displayName.lastIndexOf(' ', 18)
    if (mid < 1) return [displayName.slice(0, 18), displayName.slice(18)]
    return [displayName.slice(0, mid), displayName.slice(mid + 1)]
  })()

  async function switchOrg(orgId: string) {
    if (!setActive) return
    await setActive({ organization: orgId })
    setOpen(false)
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-[18px] hover:bg-white/[0.035] transition-colors"
      >
        <div
          className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[5px] text-[13px] font-black"
          style={{ background: '#04FFCC', color: '#003D31' }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 leading-none">
            {nameParts[0]}
          </p>
          {nameParts[1] && (
            <p className="truncate text-[9px] font-medium tracking-[0.08em] text-white/35 mt-[3px] leading-none">
              {nameParts[1]}
            </p>
          )}
        </div>
        <ChevronDown
          className="h-3 w-3 flex-shrink-0 text-white/30 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-white/[0.1] py-1 shadow-2xl"
          style={{ background: '#130B22' }}
        >
          {listLoaded && userMemberships?.data?.map((mem) => {
            const isActive = mem.organization.id === organization?.id
            return (
              <button
                key={mem.organization.id}
                onClick={() => switchOrg(mem.organization.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-white/[0.06]"
              >
                <div
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[4px] text-[10px] font-black"
                  style={{ background: '#04FFCC', color: '#003D31' }}
                >
                  {mem.organization.name[0]?.toUpperCase()}
                </div>
                <span className={cn('flex-1 truncate', isActive ? 'text-white' : 'text-white/60')}>
                  {mem.organization.name}
                </span>
                {isActive && <Check className="h-3 w-3 flex-shrink-0 text-[#04FFCC]" />}
              </button>
            )
          })}

          <div className="my-1 border-t border-white/[0.08]" />

          <button
            onClick={() => { setOpen(false); setShowCreate(true) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            <Plus className="h-[14px] w-[14px] flex-shrink-0" />
            New workspace
          </button>
        </div>
      )}

      {/* Create workspace dialog */}
      {showCreate && (
        <CreateWorkspaceDialog
          onClose={() => setShowCreate(false)}
          onCreated={async (clerkOrgId) => {
            setShowCreate(false)
            if (setActive) {
              await setActive({ organization: clerkOrgId })
              router.refresh()
            }
          }}
        />
      )}
    </div>
  )
}

// =============================================================================
// CreateWorkspaceDialog
// =============================================================================

function CreateWorkspaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (clerkOrgId: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await createWorkspace(name)
      if ('error' in result) {
        setError(result.error)
        return
      }
      onCreated(result.data.clerkOrgId)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[340px] rounded-xl border border-white/[0.1] p-6 shadow-2xl"
        style={{ background: '#130B22' }}
      >
        <h2 className="mb-1 text-[15px] font-semibold text-white">New workspace</h2>
        <p className="mb-5 text-[12px] text-white/40">
          Create a separate space for a different company or team.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-white/40">
            Workspace name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Acme Productions"
            autoFocus
            className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/[0.25]"
          />
          {error && (
            <p className="mt-2 text-[12px] text-red-400">{error}</p>
          )}

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/[0.12] py-2 text-[12.5px] font-medium text-white/50 transition-colors hover:text-white/75"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isPending}
              className="flex-1 rounded-lg py-2 text-[12.5px] font-semibold text-[#003D31] transition-opacity disabled:opacity-40"
              style={{ background: '#04FFCC' }}
            >
              {isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =============================================================================
// UserFooter
// =============================================================================

function UserFooter() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const router = useRouter()

  const name      = user?.fullName ?? user?.firstName ?? 'You'
  const email     = user?.primaryEmailAddress?.emailAddress ?? ''
  const initials  = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarUrl = user?.imageUrl

  return (
    <div className="flex items-center gap-2.5 min-w-0 px-4 py-3.5">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: '#5D00A4' }}
        >
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-white/85">{name}</p>
        <p className="truncate text-[10px] text-white/35">{email}</p>
      </div>
      <button
        onClick={() => signOut(() => router.push('/sign-in'))}
        className="flex-shrink-0 text-white/25 transition-colors hover:text-white/60"
        title="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
