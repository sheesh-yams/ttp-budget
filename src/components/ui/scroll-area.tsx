'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Lightweight scroll-area wrapper — uses native scroll with styled scrollbar
// Matches the budget-scroll styles already defined in globals.css

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('relative overflow-auto budget-scroll', className)}
    {...props}
  >
    {children}
  </div>
))
ScrollArea.displayName = 'ScrollArea'

const ScrollBar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex touch-none select-none transition-colors', className)}
    {...props}
  />
)
ScrollBar.displayName = 'ScrollBar'

export { ScrollArea, ScrollBar }
