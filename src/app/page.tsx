import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { SlateSuiteHomepage } from '@/components/marketing/SlateSuiteHomepage'

export const metadata = {
  title: 'SLATESUITE — The studio OS for production companies',
  description:
    'Budgets, proposals, invoices, and call sheets — all in one place. Purpose-built for film and video production companies.',
}

export default async function RootPage() {
  const { userId } = await auth()
  if (userId) redirect('/dashboard')
  return <SlateSuiteHomepage />
}
