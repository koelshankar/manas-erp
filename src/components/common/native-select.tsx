import { cn } from "cn";

/**
 * Plain <select>, styled to match the shadcn Input. Used inside dialogs where
 * a long list of BOQ lines or materials has to work on a phone.
 */
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}
