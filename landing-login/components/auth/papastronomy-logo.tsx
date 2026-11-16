export function PapastronomyLogo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <img
      src="/images/official-logo.png"
      alt="Find My X · Papastronomy"
      className={`object-contain select-none ${className}`}
    />
  )
}
