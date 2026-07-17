import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-sm border-2 border-border bg-secondary motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
