import { WarningIcon } from "@phosphor-icons/react/ssr";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-14 sm:px-6 md:pt-20">
      <div role="note" className="mb-10 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-fg-secondary">
        <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning-400" aria-hidden />
        <p>
          <strong className="text-fg">Template — requires legal review.</strong> Placeholders in [BRACKETS] must be
          completed and the full text reviewed by a qualified lawyer for your jurisdiction before launch.
        </p>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-fg-muted">Last updated: {updated}</p>
      <div className="mt-10 space-y-8 leading-relaxed text-fg-secondary [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2 [&_strong]:text-fg">
        {children}
      </div>
    </article>
  );
}
