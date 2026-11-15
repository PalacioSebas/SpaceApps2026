export function PapastronomyLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="6" fill="var(--stellar)" />
      <ellipse
        cx="16"
        cy="16"
        rx="14"
        ry="5.5"
        stroke="var(--cyan)"
        strokeWidth="1.5"
        transform="rotate(-24 16 16)"
      />
      <circle cx="28" cy="10.5" r="1.8" fill="var(--cyan)" />
    </svg>
  )
}
