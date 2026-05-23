import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      variant: {
        default:  'bg-violet-50 text-violet-700',
        lead:     'bg-violet-50 text-violet-700',
        active:   'bg-emerald-50 text-emerald-700',
        wrapped:  'bg-gray-100 text-gray-600',
        draft:    'bg-gray-100 text-gray-600',
        sent:     'bg-blue-50 text-blue-700',
        viewed:   'bg-blue-50 text-blue-700',
        paid:     'bg-emerald-50 text-emerald-700',
        overdue:  'bg-red-50 text-red-700',
        approved: 'bg-emerald-50 text-emerald-700',
        declined: 'bg-red-50 text-red-700',
        void:     'bg-gray-100 text-gray-500',
        primary:  'bg-violet-50 text-violet-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string
  children: React.ReactNode
}

export function Badge({ variant, className, children }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {children}
    </span>
  )
}
