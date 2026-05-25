'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RateCardModal } from './RateCardModal'
import { useRouter } from 'next/navigation'

export function AddRateButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add rate
      </Button>
      <RateCardModal
        open={open}
        onOpenChange={setOpen}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
