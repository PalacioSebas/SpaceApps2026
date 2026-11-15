"use client";

import Image from "next/image";
import { useEffect, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import { LAMBDA_MAX, LAMBDA_MIN, spectrumPath } from "@/lib/spectrum";

// Illustrative field: centre and span are placeholder values, not a real pointing.
const FIELD = { ra: 180, dec: 0, span: 0.1 };

const EPOCHS = [
  { id: "E1", label: "Epoch 1", x: 46, y: 52 },
  { id: "E2", label: "Epoch 2", x: 49, y: 50.5 },
  { id: "E3", label: "Epoch 3", x: 52, y: 49 },
  { id: "E4", label: "Epoch 4", x: 55, y: 47.5 },
];

const BANDS = [1.1, 2.3, 3.4, 4.4];

function toSky(px: number, py: number) {
  const ra = FIELD.ra + FIELD.span / 2 - (px / 100) * FIELD.span;
  const dec = FIELD.dec + FIELD.span / 2 - (py / 100) * FIELD.span;
  return { ra, dec };
}

function formatDeg(v: number, sign = false) {
  const s = sign && v >= 0 ? "+" : "";
  return `${s}${v.toFixed(4)}°`;
}

export function Explore() {
  const [epoch, setEpoch] = useState(0);
  const [band, setBand] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setEpoch((e) => (e + 1) % EPOCHS.length), 1800);
    return () => window.clearInterval(id);
  }, [playing]);

  const current = EPOCHS[epoch];
  const sky = toSky(cursor?.x ?? current.x, cursor?.y ?? current.y);
  const lambda = BANDS[band];
  const bandX = 4 + (392 * (lambda - LAMBDA_MIN)) / (LAMBDA_MAX - LAMBDA_MIN);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section id="explore" aria-labelledby="explore-title" className="relative overflow-hidden bg-navy/40 py-28 md:py-40">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute -right-40 top-20 h-[50vmin] w-[50vmin] rounded-full bg-violet/10 blur-[120px]"
      />
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            id="explore-title"
            index="04"
            eyebrow="Explore the universe"
            title="Step inside the observatory."
            description="Move across the field, switch wavelengths and scrub through epochs. This demonstration uses synthetic placeholder values to show how exploration feels inside Papastronomy."
          />
          <Reveal className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" aria-hidden="true" />
            Interactive demo · simulated data
          </Reveal>
        </div>

        <Reveal className="mt-14 grid gap-4 lg:grid-cols-12" delay={100}>
          {/* Celestial field */}
          <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-void lg:col-span-7">
            <div
              className="relative aspect-square cursor-crosshair touch-none sm:aspect-[4/3]"
              onPointerMove={onMove}
              onPointerLeave={() => setCursor(null)}
              role="img"
              aria-label={`Simulated celestial field. Highlighted source shown at ${current.label}, observed at ${lambda.toFixed(2)} micrometres.`}
            >
              <Image
                src="/images/field.png"
                alt=""
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover opacity-80 transition-[filter] duration-700"
                style={{ filter: `hue-rotate(${band * 18}deg) brightness(${0.85 + band * 0.06})` }}
              />
              <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {Array.from({ length: 9 }, (_, i) => (
                  <g key={i}>
                    <line x1={i * 12.5} x2={i * 12.5} y1="0" y2="100" stroke="rgba(85,214,255,0.12)" strokeWidth="0.15" />
                    <line y1={i * 12.5} y2={i * 12.5} x1="0" x2="100" stroke="rgba(85,214,255,0.12)" strokeWidth="0.15" />
                  </g>
                ))}
                <polyline
                  points={EPOCHS.slice(0, epoch + 1).map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#9B8CFF"
                  strokeWidth="0.3"
                  strokeDasharray="0.8 0.8"
                />
                {EPOCHS.slice(0, epoch).map((p) => (
                  <circle key={p.id} cx={p.x} cy={p.y} r="0.6" fill="#9B8CFF" fillOpacity="0.6" />
                ))}
              </svg>

              {/* Axis labels */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 font-mono text-[9px] text-cyan/70">
                {[0, 25, 50, 75].map((p) => (
                  <span key={`ra-${p}`} className="absolute bottom-1.5" style={{ left: `calc(${p}% + 4px)` }}>
                    {toSky(p, 0).ra.toFixed(3)}°
                  </span>
                ))}
                {[25, 50, 75].map((p) => (
                  <span key={`dec-${p}`} className="absolute left-1.5" style={{ top: `calc(${p}% - 12px)` }}>
                    {formatDeg(toSky(0, p).dec, true)}
                  </span>
                ))}
              </div>

              {/* Highlighted source */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-700 ease-out"
                style={{ left: `${current.x}%`, top: `${current.y}%` }}
              >
                <span className="animate-pulse-ring absolute inset-0 rounded-full border border-cyan" />
                <span className="relative block h-12 w-12 rounded-full border border-cyan/90 shadow-[0_0_30px_rgba(85,214,255,0.45)]" />
                <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stellar" />
                <span className="absolute -top-2 left-14 whitespace-nowrap rounded border border-cyan/40 bg-void/80 px-2 py-1 font-mono text-[10px] text-cyan backdrop-blur">
                  Candidate · {current.id}
                </span>
              </div>

              {/* Cursor crosshair */}
              {cursor ? (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                  <span className="absolute top-0 h-full w-px bg-stellar/25" style={{ left: `${cursor.x}%` }} />
                  <span className="absolute left-0 h-px w-full bg-stellar/25" style={{ top: `${cursor.y}%` }} />
                </div>
              ) : null}

              <div className="glass absolute right-3 top-3 rounded-lg px-3 py-2 font-mono text-[10px] leading-relaxed">
                <p className="text-muted">{cursor ? "Cursor" : "Source"}</p>
                <p className="text-stellar">RA {formatDeg(sky.ra)}</p>
                <p className="text-stellar">Dec {formatDeg(sky.dec, true)}</p>
              </div>
            </div>
          </div>

          {/* Instruments */}
          <div className="flex flex-col gap-4 lg:col-span-5">
            <div className="rounded-2xl border border-line-strong bg-void/70 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Spectral profile</h3>
                <span className="font-mono text-xs text-cyan">λ {lambda.toFixed(2)} µm</span>
              </div>
              <svg viewBox="0 0 400 150" className="mt-4 h-40 w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="spec-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#55D6FF" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#55D6FF" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3, 4].map((i) => (
                  <line key={i} x1="0" x2="400" y1={4 + i * 35.5} y2={4 + i * 35.5} stroke="rgba(243,245,250,0.06)" />
                ))}
                <path d={`${spectrumPath(400, 150, epoch * 0.15)} L396,146 L4,146 Z`} fill="url(#spec-fill)" />
                <path
                  d={spectrumPath(400, 150, epoch * 0.15)}
                  fill="none"
                  stroke="#55D6FF"
                  strokeWidth="1.6"
                  className="transition-all duration-700"
                />
                <line
                  x1={bandX}
                  x2={bandX}
                  y1="0"
                  y2="150"
                  stroke="#9B8CFF"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  className="transition-all duration-500"
                />
              </svg>
              <div className="mt-2 flex justify-between font-mono text-[9px] text-muted">
                <span>0.75 µm</span>
                <span>102 channels · illustrative flux</span>
                <span>5.00 µm</span>
              </div>
              <div role="radiogroup" aria-label="Wavelength band" className="mt-5 grid grid-cols-4 gap-2">
                {BANDS.map((b, i) => (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={band === i}
                    onClick={() => setBand(i)}
                    className={`rounded-md border px-2 py-2 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${
                      band === i
                        ? "border-violet/60 bg-violet/15 text-stellar"
                        : "border-line text-muted hover:border-line-strong hover:text-stellar"
                    }`}
                  >
                    {b.toFixed(1)} µm
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 rounded-2xl border border-line-strong bg-void/70 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Observation epochs</h3>
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? "Pause epoch playback" : "Play epoch playback"}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-stellar transition-colors hover:border-cyan/50 hover:text-cyan focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                >
                  {playing ? <Pause aria-hidden="true" className="h-3.5 w-3.5" /> : <Play aria-hidden="true" className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="relative mt-6">
                <span aria-hidden="true" className="absolute left-4 right-4 top-4 h-px bg-line-strong" />
                <span
                  aria-hidden="true"
                  className="absolute left-4 top-4 h-px bg-cyan transition-[width] duration-700"
                  style={{ width: `calc(${(epoch / (EPOCHS.length - 1)) * 100}% - ${(epoch / (EPOCHS.length - 1)) * 2}rem)` }}
                />
                <div role="radiogroup" aria-label="Observation epoch" className="relative flex justify-between">
                  {EPOCHS.map((e, i) => (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={epoch === i}
                      onClick={() => {
                        setPlaying(false);
                        setEpoch(i);
                      }}
                      className="group flex flex-col items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[10px] transition-all ${
                          epoch === i
                            ? "border-cyan bg-cyan text-void shadow-[0_0_20px_rgba(85,214,255,0.5)]"
                            : i < epoch
                              ? "border-cyan/60 bg-navy text-cyan"
                              : "border-line-strong bg-navy text-muted group-hover:text-stellar"
                        }`}
                      >
                        {e.id}
                      </span>
                      <span className="font-mono text-[10px] text-muted">{e.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-6 text-sm leading-relaxed text-muted" aria-live="polite">
                Viewing <span className="text-stellar">{current.label}</span>. Comparing positions across epochs
                helps flag sources whose apparent position or brightness changes — candidates for further analysis,
                not confirmed detections.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
