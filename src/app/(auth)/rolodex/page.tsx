import { getContacts, getCrewRoles } from '@/server/actions/rolodex'
import { RolodexClient } from '@/components/rolodex/RolodexClient'

export const metadata = { title: 'Rolodex' }

export default async function RolodexPage() {
  const [contacts, crewRoles] = await Promise.all([getContacts(), getCrewRoles()])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Rolodex</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your crew and talent directory — build once, use across every project.
        </p>
      </div>

      <RolodexClient contacts={contacts} crewRoles={crewRoles} />
    </div>
  )
}
