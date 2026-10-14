// Shown the instant a menu item is tapped, while the page loads, so the app
// always answers a tap straight away.
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-full bg-line" />
      <div className="h-4 w-72 max-w-full rounded-full bg-line/70" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-20" />
        ))}
      </div>
      <div className="card h-64" />
    </div>
  );
}
