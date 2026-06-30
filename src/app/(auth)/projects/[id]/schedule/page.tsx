import { Clapperboard } from 'lucide-react'

export default function SchedulePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
        <Clapperboard className="w-7 h-7 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Build your stripboard, manage shoot days, and sync the schedule to call sheets. Coming soon.
        </p>
      </div>
    </div>
  )
}
