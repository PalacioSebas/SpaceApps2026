"use client";

import Image from "next/image";
import { Crosshair, FileText, Layers, Play, Search, SkipBack, SkipForward, Waves } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { spectrumPath } from "@/lib/spectrum";
import { useLanguage } from "@/lib/i18n";

const header = [
  ["SIMPLE", "T"],
  ["BITPIX", "-32"],
  ["NAXIS", "2"],
  ["CTYPE1", "'RA---TAN'"],
  ["CTYPE2", "'DEC--TAN'"],
  ["BUNIT", "'MJy/sr'"],
  ["DETECTOR", "3"],
];

const sources = [
  { x: 38, y: 34, label: "S-01", tone: "cyan" },
  { x: 62, y: 58, label: "S-02", tone: "violet", active: true },
  { x: 24, y: 70, label: "S-03", tone: "cyan" },
  { x: 76, y: 22, label: "S-04", tone: "cyan" },
];

const epochs = ["E1", "E2", "E3", "E4", "E5", "E6"];

const featureIcons = [FileText, Crosshair, Waves, Layers] as const;

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-void/60 ${className}`}>
      <p className="border-b border-line px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{title}</p>
      <div className="p-3">{children}</div>
    </div>
  );
}

function AppMockup() {
  const { t } = useLanguage();

  return (
    <div
      role="img"
      aria-label={t.showcase.mockupAria}
      className="relative overflow-hidden rounded-2xl border border-line-strong bg-navy shadow-[0_40px_120px_-40px_rgba(85,214,255,0.35)]"
    >
      <div aria-hidden="true">
        {/* Window chrome */}
        <div className="flex items-center justify-between gap-4 border-b border-line bg-void/70 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-stellar/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-stellar/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-stellar/15" />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-navy px-3 py-1.5 font-mono text-[10px] text-muted sm:max-w-sm">
            <Search className="h-3 w-3 shrink-0" />
            <span className="truncate">RA 133.7951° · Dec −07.2451° · FoV 0.05°</span>
          </div>
          <span className="hidden rounded-full border border-violet/40 bg-violet/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-violet sm:inline">
            {t.showcase.sampleData}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-3 p-3">
          {/* Left sidebar */}
          <div className="col-span-3 hidden flex-col gap-3 lg:flex">
            <Panel title={t.showcase.targetPanel}>
              <div className="space-y-2 font-mono text-[10px]">
                {[
                  ["RA", "133.7951°"],
                  ["Dec", "−07.2451°"],
                  ["FoV", "0.05°"],
                  [t.showcase.frameLabel, "ICRS"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded border border-line bg-navy/80 px-2 py-1.5">
                    <span className="text-muted">{k}</span>
                    <span className="text-stellar">{v}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t.showcase.observationsPanel} className="flex-1">
              <ul className="space-y-1.5 font-mono text-[10px]">
                {epochs.slice(0, 5).map((e, i) => (
                  <li
                    key={e}
                    className={`flex items-center justify-between rounded px-2 py-1.5 ${
                      i === 2 ? "bg-cyan/10 text-cyan" : "text-muted"
                    }`}
                  >
                    <span>{e} · D{(i % 6) + 1}</span>
                    <span>{(1.1 + i * 0.6).toFixed(2)} µm</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Sky viewer */}
          <div className="relative col-span-12 overflow-hidden rounded-lg border border-line md:col-span-8 lg:col-span-6">
            <Image
              src="/images/showcase-field.png"
              alt=""
              width={1024}
              height={1024}
              sizes="(min-width: 1024px) 40vw, 90vw"
              className="aspect-square h-auto w-full object-cover opacity-90"
            />
            <div className="coord-grid absolute inset-0 opacity-60 [background-size:12.5%_12.5%]" />
            <div className="absolute inset-x-0 top-0 flex justify-between px-2 py-1 font-mono text-[8px] text-muted">
              <span>RA ←</span>
              <span>{t.showcase.projection}</span>
              <span>N ↑</span>
            </div>
            {sources.map((s) => (
              <div
                key={s.label}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              >
                {s.active ? (
                  <span className="animate-pulse-ring absolute inset-0 rounded-full border border-violet" />
                ) : null}
                <span
                  className={`relative block h-7 w-7 rounded-full border ${
                    s.tone === "violet" ? "border-violet" : "border-cyan/70"
                  }`}
                />
                <span
                  className={`absolute left-8 top-0 whitespace-nowrap font-mono text-[9px] ${
                    s.tone === "violet" ? "text-violet" : "text-cyan"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
            <div className="absolute bottom-2 left-2 rounded border border-line bg-void/80 px-2 py-1 font-mono text-[9px] text-stellar">
              λ 2.30 µm · MJy/sr
            </div>
          </div>

          {/* Right panels */}
          <div className="col-span-12 grid grid-cols-2 gap-3 md:col-span-4 md:grid-cols-1 lg:col-span-3">
            <Panel title={t.showcase.fitsHeaderPanel}>
              <dl className="space-y-1 font-mono text-[9.5px]">
                {header.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-violet">{k}</dt>
                    <dd className="truncate text-stellar/80">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title={t.showcase.spectrumPanel}>
              <svg viewBox="0 0 200 90" className="h-20 w-full">
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1="0" x2="200" y1={i * 30} y2={i * 30} stroke="rgba(243,245,250,0.06)" />
                ))}
                <path d={spectrumPath(200, 90, 0)} fill="none" stroke="#55D6FF" strokeWidth="1.4" />
              </svg>
              <div className="mt-1 flex justify-between font-mono text-[8px] text-muted">
                <span>0.75 µm</span>
                <span>5.00 µm</span>
              </div>
            </Panel>
            <Panel title={t.showcase.analysisPanel} className="col-span-2 md:col-span-1">
              <ul className="space-y-1.5 font-mono text-[9.5px]">
                <li className="flex justify-between">
                  <span className="text-muted">{t.showcase.candidates}</span>
                  <span className="text-stellar">2</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted">{t.showcase.difference}</span>
                  <span className="text-cyan">E3 − E1</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted">{t.showcase.status}</span>
                  <span className="text-violet">{t.showcase.forReview}</span>
                </li>
              </ul>
            </Panel>
          </div>

          {/* Timeline */}
          <div className="col-span-12 flex items-center gap-4 rounded-lg border border-line bg-void/60 px-3 py-2.5">
            <div className="flex items-center gap-1 text-muted">
              <SkipBack className="h-3.5 w-3.5" />
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan text-void">
                <Play className="h-3 w-3 fill-current" />
              </span>
              <SkipForward className="h-3.5 w-3.5" />
            </div>
            <div className="relative flex flex-1 items-center justify-between">
              <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
              <span className="absolute left-0 top-1/2 h-px w-[42%] bg-cyan" />
              {epochs.map((e, i) => (
                <span key={e} className="relative flex flex-col items-center gap-1">
                  <span
                    className={`h-2 w-2 rounded-full border ${
                      i <= 2 ? "border-cyan bg-cyan" : "border-line-strong bg-navy"
                    } ${i === 2 ? "ring-4 ring-cyan/20" : ""}`}
                  />
                </span>
              ))}
            </div>
            <span className="hidden font-mono text-[9px] text-muted sm:inline">{t.showcase.epochCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductShowcase() {
  const { t } = useLanguage();

  return (
    <section id="platform" aria-labelledby="platform-title" className="relative overflow-hidden py-28 md:py-40">
      <div aria-hidden="true" className="coord-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -z-10 h-[60vmin] w-[90vmin] -translate-x-1/2 -translate-y-1/3 rounded-full bg-cyan/10 blur-[120px]"
      />
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeading
          id="platform-title"
          align="center"
          index="02"
          eyebrow={t.showcase.eyebrow}
          title={t.showcase.title}
          description={t.showcase.description}
        />
        <Reveal className="mt-16 md:mt-20" delay={120}>
          <AppMockup />
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {t.showcase.previewCaption}
          </p>
        </Reveal>
        <ul className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {t.showcase.features.map((f, i) => {
            const Icon = featureIcons[i];
            return (
              <Reveal as="li" key={i} delay={i * 80} className="border-t border-line pt-6">
                <Icon aria-hidden="true" className="h-5 w-5 text-cyan" strokeWidth={1.5} />
                <h3 className="mt-4 text-base font-medium text-stellar">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
