export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-6">
      <span className="sr-only">Loading…</span>
      <div className="skeleton h-9 w-48" />
      <div className="skeleton h-24 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
      </div>
      <div className="skeleton h-64 w-full" />
    </div>
  );
}
