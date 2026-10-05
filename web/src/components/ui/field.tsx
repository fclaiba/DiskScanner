import { input, label as labelCls } from "./styles";
import { cn } from "@/lib/cn";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Label above, hint/error below, wired with aria-describedby / aria-invalid. */
export function Field({ name, label, error, hint, id, className, ...rest }: FieldProps) {
  const fid = id ?? `f-${name}`;
  const describedBy = [hint ? `${fid}-hint` : null, error ? `${fid}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={fid} className={labelCls}>
        {label}
      </label>
      <input id={fid} name={name} className={input} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && !error && (
        <p id={`${fid}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-err`} className="text-sm text-danger-400">
          {error}
        </p>
      )}
    </div>
  );
}
