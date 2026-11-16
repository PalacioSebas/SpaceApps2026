export function LogoMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <img
      src="/images/official-logo-mark.png"
      alt=""
      aria-hidden="true"
      className={`object-contain select-none ${className}`}
    />
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src="/images/official-logo.png"
        alt="Find My X · Papastronomy"
        className="h-9 w-auto object-contain select-none"
      />
    </span>
  );
}
