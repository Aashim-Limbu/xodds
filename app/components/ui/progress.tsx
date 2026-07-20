"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // Mount at 0 and fill on the next frame, otherwise the indicator renders already at its
  // final transform and the transition has nothing to animate from.
  const [shown, setShown] = React.useState(0)
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value || 0))
    return () => cancelAnimationFrame(id)
  }, [value])

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-full w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform duration-500"
        style={{
          transform: `translateX(-${100 - shown}%)`,
          transitionTimingFunction: "var(--ease-out)",
        }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
