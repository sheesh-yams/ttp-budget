'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactModal } from './ContactModal'
import type { ContactDetail, ContactRow } from '@/server/actions/rolodex'

interface Props {
  contact:   ContactDetail
  crewRoles: string[]
}

export function ContactDetailClient({ contact, crewRoles }: Props) {
  const [editing, setEditing] = useState(false)
  const router = useRouter()

  // ContactModal expects ContactRow (projectMembers has { projectId }).
  // ContactDetail has richer projectMembers; ContactModal only reads the scalar fields,
  // so the cast via unknown is safe at runtime.
  const contactForModal = contact as unknown as ContactRow

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>

      {editing && (
        <ContactModal
          contact={contactForModal}
          crewRoles={crewRoles}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
