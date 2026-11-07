// The project someone last opened, per workspace, in this browser — the mobile
// "+" sheet creates deal memos / call sheets / receipts on it by default.
// A per-viewer convenience only: missing or unreadable storage just means no
// default project.

export interface LastProject {
  id:   string
  name: string
  /** What this person may create there (Edit) — the sheet only offers those. */
  can:  { dealMemos: boolean; callSheets: boolean; receipts: boolean }
}

const key = (workspaceId: string) => `ss:lastProject:${workspaceId}`

export function readLastProject(workspaceId: string): LastProject | null {
  try {
    const raw = window.localStorage.getItem(key(workspaceId))
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<LastProject>
    if (typeof v.id !== 'string' || typeof v.name !== 'string') return null
    return { id: v.id, name: v.name, can: { dealMemos: !!v.can?.dealMemos, callSheets: !!v.can?.callSheets, receipts: !!v.can?.receipts } }
  } catch {
    return null
  }
}

export function writeLastProject(workspaceId: string, project: LastProject): void {
  try {
    window.localStorage.setItem(key(workspaceId), JSON.stringify(project))
  } catch {
    // Private mode / blocked storage — no default, nothing else breaks.
  }
}

/** A project was deleted: drop it as the default wherever it's remembered. */
export function forgetLastProject(projectId: string): void {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (!k?.startsWith('ss:lastProject:')) continue
      try {
        if ((JSON.parse(window.localStorage.getItem(k) ?? '{}') as { id?: unknown }).id === projectId) window.localStorage.removeItem(k)
      } catch { /* unreadable entry — leave it */ }
    }
  } catch {
    // Blocked storage — nothing remembered, nothing to forget.
  }
}
