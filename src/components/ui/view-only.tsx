// Read-only wrapper for workspace pages a role can VIEW but not EDIT (roles 2b).
// A disabled fieldset turns off every button and input inside it; links still
// navigate. The server refuses writes regardless — this keeps the UI honest.

export function ViewOnly({ readOnly, what, children }: { readOnly: boolean; what: string; children: React.ReactNode }) {
  if (!readOnly) return <>{children}</>
  return (
    <>
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        View only — your role can see {what} but not change them.
      </p>
      <fieldset disabled className="contents">{children}</fieldset>
    </>
  )
}
