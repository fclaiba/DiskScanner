import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400";

const variants: Record<Variant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent shadow-sm",
  secondary: "bg-surface text-fg border border-line hover:border-line-strong hover:bg-overlay",
  ghost: "text-fg-secondary hover:text-fg hover:bg-surface",
  danger: "bg-danger/15 text-danger-400 border border-danger/40 hover:bg-danger/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-sm",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-12 px-5 text-[15px] rounded-md",
};

export function button(opts: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return cn(base, variants[opts.variant ?? "primary"], sizes[opts.size ?? "md"], opts.className);
}

export const card = "rounded-lg border border-line-subtle bg-elevated";
export const input =
  "block w-full h-11 rounded-md border border-line bg-bg px-3 text-[15px] text-fg placeholder:text-fg-muted/80 transition-colors hover:border-line-strong focus:border-accent-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-400 aria-[invalid=true]:border-danger";
export const label = "block text-sm font-medium text-fg-secondary";
export const link = "text-accent-400 underline-offset-4 hover:underline";
