'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditProjectModal } from './EditProjectModal'

interface Props {
  project: {
    id: string
    name: string
    status: string
    shootType: string
    shootStartDate: string | null
    shootEndDate: string | null
  }
}

export function ProjectHeaderActions({ project }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="flex-shrink-0"
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit project
      </Button>

      <EditProjectModal
        open={open}
        onOpenChange={setOpen}
        project={project}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
