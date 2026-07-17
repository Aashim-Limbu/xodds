import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border-[3px] border-border font-sans text-[13px] font-extrabold uppercase tracking-[0.04em] shadow-brut-sm transition-[transform,box-shadow,background] duration-[120ms] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--ink)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-brut-sm motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-white",
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-card text-foreground hover:bg-secondary",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-secondary hover:translate-x-0 hover:translate-y-0 hover:shadow-none",
        link: "border-transparent bg-transparent shadow-none underline-offset-4 hover:underline hover:translate-x-0 hover:translate-y-0 hover:shadow-none",
      },
      size: {
        default: "px-4 py-[10px]",
        sm: "px-3 py-2 text-[12px]",
        lg: "px-6 py-3 text-[15px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
