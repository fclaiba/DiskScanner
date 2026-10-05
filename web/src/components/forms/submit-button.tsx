"use client";

import { useFormStatus } from "react-dom";
import { button } from "@/components/ui/styles";

export function SubmitButton({
  children,
  pendingLabel,
  variant,
  className,
  name,
  value,
  size = "lg",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  name?: string;
  value?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={button({ variant, size, className })}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
