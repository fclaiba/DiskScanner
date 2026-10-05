import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  info: "border-accent/40 bg-accent/10",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  danger: "border-danger/40 bg-danger/10",
};
const iconTone: Record<Tone, string> = {
  info: "text-accent-400",
  success: "text-success-400",
  warning: "text-warning-400",
  danger: "text-danger-400",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  live,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  /** Announce to screen readers (use for results of an action). */
  live?: boolean;
}) {
  const Icon = tone === "success" ? CheckCircleIcon : tone === "info" ? InfoIcon : WarningCircleIcon;
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cn("flex gap-3 rounded-md border p-3.5 text-sm text-fg-secondary", tones[tone], className)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconTone[tone])} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children}
      </div>
    </div>
  );
}
