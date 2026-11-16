"use client";

import { useLanguage } from "@/lib/i18n";

const WIDTH = 320;
const HEIGHT = 120;
const MIN_L = 0.75;
const MAX_L = 5.0;
const PAD = { top: 12, bottom: 22, left: 4, right: 4 };

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-(((x - mu) / sigma) ** 2));

function flux(l: number) {
  const value =
    0.04 +
    0.2 * gauss(l, 1.27, 0.1) +
    0.12 * gauss(l, 1.62, 0.09) +
    0.05 * gauss(l, 2.1, 0.12) +
    0.95 * gauss(l, 4.4, 0.42) -
    0.14 * gauss(l, 3.3, 0.16);
  return Math.max(value, 0.015);
}

const x = (l: number) => PAD.left + ((l - MIN_L) / (MAX_L - MIN_L)) * (WIDTH - PAD.left - PAD.right);
const y = (f: number) => PAD.top + (1 - f) * (HEIGHT - PAD.top - PAD.bottom);

const points = Array.from({ length: 140 }, (_, i) => {
  const l = MIN_L + (i / 139) * (MAX_L - MIN_L);
  return [x(l), y(flux(l))] as const;
});

const linePath = points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
const areaPath = `${linePath} L${x(MAX_L).toFixed(1)},${y(0).toFixed(1)} L${x(MIN_L).toFixed(1)},${y(0).toFixed(1)} Z`;

const ticks = [1, 2, 3, 4, 5];

export function Spectrum({ highlight }: { highlight: boolean }) {
  const { t } = useLanguage();
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={t("Espectro infrarrojo del candidato S-02 entre 0.75 y 5.00 micrones, con absorción cerca de 3.3 micrones y pico en 4.4 micrones")}
      className="h-auto w-full"
    >
      <defs>
        <linearGradient id="spectrum-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={y(0)} stroke="var(--line)" />
          <text x={x(t)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted font-mono text-[8px]">
            {t}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />

      <rect
        x={x(3.12)}
        y={PAD.top}
        width={x(3.48) - x(3.12)}
        height={y(0) - PAD.top}
        fill="var(--cyan)"
        opacity={highlight ? 0.08 : 0.04}
      />
      <text x={x(3.3)} y={PAD.top + 8} textAnchor="middle" className="fill-cyan font-mono text-[7px]">
        {t("CH₄")}
      </text>

      <path d={areaPath} fill="url(#spectrum-fill)" />
      <path d={linePath} fill="none" stroke="var(--indigo-soft)" strokeWidth="1.4" />

      <line
        x1={x(4.4)}
        x2={x(4.4)}
        y1={y(flux(4.4)) - 4}
        y2={y(0)}
        stroke="var(--violet)"
        strokeDasharray="2 3"
        className={highlight ? "animate-dash" : undefined}
      />
      <circle cx={x(4.4)} cy={y(flux(4.4))} r="3" fill="var(--violet)" />
      <text x={x(4.4) - 6} y={y(flux(4.4)) + 2} textAnchor="end" className="fill-stellar font-mono text-[8px]">
        {t("4.40 µm")}
      </text>

      <circle cx={x(1.1)} cy={y(flux(1.1))} r="2.2" fill="none" stroke="var(--cyan)" />
      <text x={x(1.1)} y={y(flux(1.1)) - 14} textAnchor="middle" className="fill-cyan font-mono text-[7px]">
        1.10
      </text>
    </svg>
  );
}
