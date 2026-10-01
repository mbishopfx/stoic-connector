export function StoicMark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
    <rect width="512" height="512" rx="112" fill="#090909" />
    <circle cx="256" cy="256" r="156" fill="#fff" />
    <circle cx="256" cy="256" r="76" fill="none" stroke="#111" strokeWidth="18" />
    <circle cx="256" cy="256" r="15" fill="#111" />
  </svg>;
}
