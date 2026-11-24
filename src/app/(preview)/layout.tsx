// In-app "how your client will see it" previews (e.g. /invoices/preview/[id],
// shown in the invoice Preview drawer). Signed-in only — middleware requires a
// session and each page checks access — but outside the app shell, so the
// preview looks exactly like the client's link: no sidebar, always light.
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
