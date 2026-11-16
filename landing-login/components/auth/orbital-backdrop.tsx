export function OrbitalBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="coord-grid absolute inset-0" />
      <svg
        viewBox="0 0 1000 1000"
        className="absolute -right-[30%] -top-[35%] size-[150vmax] max-w-none opacity-70 lg:-right-[15%]"
        fill="none"
      >
        <circle cx="500" cy="500" r="220" stroke="var(--line-strong)" />
        <circle cx="500" cy="500" r="330" stroke="var(--line)" strokeDasharray="2 10" />
        <circle cx="500" cy="500" r="440" stroke="var(--line)" />
        <circle cx="720" cy="500" r="3" fill="var(--cyan)" />
        <circle cx="500" cy="170" r="2.5" fill="var(--violet)" />
        <circle cx="189" cy="811" r="2" fill="var(--amber)" />
      </svg>
    </div>
  )
}
