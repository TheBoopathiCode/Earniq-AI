import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from './utils'

export function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-gray-200', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-[#06C167] transition-all duration-300"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
