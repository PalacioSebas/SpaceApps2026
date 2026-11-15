export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="6.5" fill="#0A1020" stroke="#F3F5FA" strokeWidth="1.4" />
      <path d="M11 12.5a6.5 6.5 0 0 1 9.5-1.8" stroke="#55D6FF" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse
        cx="16"
        cy="16"
        rx="14"
        ry="5.2"
        transform="rotate(-24 16 16)"
        stroke="#9B8CFF"
        strokeOpacity="0.8"
        strokeWidth="1"
      />
      <circle cx="28.2" cy="10.6" r="1.6" fill="#55D6FF" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight text-stellar">Papastronomy</span>
    </span>
  );
}
