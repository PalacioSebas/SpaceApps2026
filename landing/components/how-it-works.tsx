import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";

function ObserveArt() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-full w-full">
      {[46, 34, 22].map((r, i) => (
        <circle key={r} cx="80" cy="60" r={r} stroke="#55D6FF" strokeOpacity={0.18 + i * 0.18} />
      ))}
      <circle cx="80" cy="60" r="8" fill="#55D6FF" fillOpacity="0.85" />
      <g className="animate-spin-slow origin-center" style={{ animationDuration: "14s" }}>
        <path d="M80 60 L80 14" stroke="#55D6FF" strokeOpacity="0.6" />
        <circle cx="80" cy="14" r="2.5" fill="#F3F5FA" />
      </g>
    </svg>
  );
}

function ProcessArt() {
  const cells = Array.from({ length: 48 }, (_, i) => i);
  const lit = new Set([9, 10, 17, 18, 19, 26, 27, 36, 13, 21, 30, 38]);
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-full w-full">
      {cells.map((i) => {
        const x = 20 + (i % 8) * 15.5;
        const y = 14 + Math.floor(i / 8) * 15.5;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="12"
            height="12"
            rx="1.5"
            fill={lit.has(i) ? "#55D6FF" : "#F3F5FA"}
            fillOpacity={lit.has(i) ? 0.25 + ((i * 7) % 5) * 0.14 : 0.05}
          />
        );
      })}
    </svg>
  );
}

function AnalyzeArt() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-full w-full">
      {[30, 60, 90].map((y) => (
        <line key={y} x1="14" x2="146" y1={y} y2={y} stroke="#F3F5FA" strokeOpacity="0.06" />
      ))}
      <path
        d="M14 96 C34 92 40 40 58 36 S74 70 84 54 S100 22 112 44 S132 86 146 80"
        stroke="#9B8CFF"
        strokeWidth="1.6"
        strokeDasharray="4 4"
        className="animate-dash"
      />
      <line x1="84" x2="84" y1="16" y2="104" stroke="#55D6FF" strokeOpacity="0.5" />
      <circle cx="84" cy="54" r="4" fill="#55D6FF" />
    </svg>
  );
}

function CompareArt() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-full w-full">
      <circle cx="66" cy="60" r="28" stroke="#55D6FF" strokeOpacity="0.55" />
      <circle cx="94" cy="60" r="28" stroke="#9B8CFF" strokeOpacity="0.55" />
      <circle cx="66" cy="60" r="3" fill="#55D6FF" />
      <circle cx="94" cy="60" r="3" fill="#9B8CFF" />
      <path d="M70 60 H90" stroke="#F3F5FA" strokeOpacity="0.6" strokeDasharray="2 3" />
      <text x="80" y="104" textAnchor="middle" fill="#8A96AD" fontSize="8" fontFamily="var(--font-geist-mono)">
        t₁ → t₂
      </text>
    </svg>
  );
}

const steps = [
  { n: "01", title: "Observe", body: "Retrieve astronomical observations from SPHEREx.", Art: ObserveArt },
  {
    n: "02",
    title: "Process",
    body: "Inspect and process FITS data while preserving relevant astronomical information.",
    Art: ProcessArt,
  },
  { n: "03", title: "Analyze", body: "Explore wavelengths, sources, and potential anomalies.", Art: AnalyzeArt },
  {
    n: "04",
    title: "Compare",
    body: "Investigate observations across different epochs to identify changes and interesting candidates.",
    Art: CompareArt,
  },
];

export function HowItWorks() {
  return (
    <section id="process" aria-labelledby="process-title" className="relative py-28 md:py-40">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeading
          id="process-title"
          index="03"
          eyebrow="How it works"
          title="A journey through astronomical data."
          description="Four deliberate stages turn a sky coordinate into a well-documented candidate worth a closer look."
        />

        <div className="relative mt-16 md:mt-20">
          <div aria-hidden="true" className="absolute left-0 right-0 top-[7px] hidden h-px bg-line-strong lg:block">
            <span className="animate-travel absolute top-1/2 h-1.5 w-16 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan to-transparent" />
          </div>
          <ol className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {steps.map((step, i) => (
              <Reveal as="li" key={step.n} delay={i * 110} className="group relative">
                <span
                  aria-hidden="true"
                  className="relative hidden h-[15px] w-[15px] items-center justify-center rounded-full border border-cyan/60 bg-void lg:flex"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan transition-transform group-hover:scale-150" />
                </span>
                <div className="mt-0 overflow-hidden rounded-2xl border border-line bg-navy/50 transition-colors duration-500 group-hover:border-cyan/30 group-hover:bg-navy lg:mt-8">
                  <div aria-hidden="true" className="h-40 border-b border-line bg-[radial-gradient(ellipse_at_center,rgba(85,214,255,0.08),transparent_70%)] p-4">
                    <step.Art />
                  </div>
                  <div className="p-6">
                    <p className="font-mono text-xs tracking-[0.2em] text-cyan">
                      {step.n} <span className="text-muted">—</span> {step.title.toUpperCase()}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
