export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" aria-hidden="true" className="h-7 w-7">
        <circle cx="14" cy="14" r="12.5" fill="none" stroke="var(--line-strong)" />
        <ellipse
          cx="14"
          cy="14"
          rx="12.5"
          ry="5"
          fill="none"
          stroke="var(--violet)"
          strokeOpacity="0.7"
          transform="rotate(-24 14 14)"
        />
        <circle cx="14" cy="14" r="3.2" fill="var(--stellar)" />
        <circle cx="24.2" cy="9.6" r="1.4" fill="var(--cyan)" />
      </svg>
      <span className="text-[15px] font-medium tracking-[-0.02em] text-stellar">Papastronomy</span>
    </span>
  );
}
