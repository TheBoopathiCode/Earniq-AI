import * as React from 'react'
import { OTPInput, OTPInputContext } from 'input-otp'
import { cn } from './utils'

export function InputOTP({ className, containerClassName, ...props }: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      containerClassName={cn('flex items-center gap-2', containerClassName)}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

export function InputOTPGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2', className)} {...props} />
}

export function InputOTPSlot({ index, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { index: number }) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index]
  return (
    <div
      className={cn(
        'relative flex h-12 w-12 items-center justify-center rounded-lg border-2 text-lg font-semibold transition-all',
        isActive ? 'border-[#06C167] ring-2 ring-[#06C167]/20' : 'border-gray-200',
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-caret-blink bg-gray-900 duration-1000" />
        </div>
      )}
    </div>
  )
}
