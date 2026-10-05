export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-elevated p-6 shadow-lg sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
