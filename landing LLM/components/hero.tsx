import { ArrowDown, Telescope } from "lucide-react";
import { answers, type QuestionId } from "@/lib/copilot-data";
import { site } from "@/lib/site";

const pillOrder: QuestionId[] = ["coords", "brown-dwarf", "wavelength", "fits"];

export function Hero({ onAsk }: { onAsk: (id: QuestionId) => void }) {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden px-5 pt-36 pb-16 md:px-8 md:pt-44 md:pb-24">
      <div
        aria-hidden="true"
        className="coord-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_30%,black_20%,transparent_70%)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-violet/15 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute top-40 -right-40 h-[360px] w-[480px] rounded-full bg-cyan/10 blur-[120px]" />

      <svg
        aria-hidden="true"
        viewBox="0 0 1200 1200"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[1200px] w-[1200px] -translate-x-1/2 -translate-y-[40%] opacity-60"
      >
        <g className="animate-spin-slow" style={{ transformOrigin: "600px 600px" }}>
          <circle cx="600" cy="600" r="420" fill="none" stroke="var(--line-strong)" strokeDasharray="2 10" />
          <circle cx="1020" cy="600" r="3" fill="var(--cyan)" />
        </g>
        <g className="animate-spin-slower" style={{ transformOrigin: "600px 600px" }}>
          <circle cx="600" cy="600" r="560" fill="none" stroke="var(--line)" />
          <circle cx="600" cy="40" r="2.5" fill="var(--violet)" />
        </g>
        <ellipse cx="600" cy="600" rx="520" ry="180" fill="none" stroke="var(--violet)" strokeOpacity="0.16" transform="rotate(-14 600 600)" />
      </svg>

      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-7 text-center">
        <p className="font-mono text-[10px] tracking-[0.22em] text-violet uppercase">
          NASA Space Apps Challenge 2026 · AI Copilot
        </p>
        <h1
          id="hero-title"
          className="text-gradient text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance sm:text-5xl md:text-7xl"
        >
          Un asistente astronómico que entiende el universo y lo que estás observando.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-pretty text-muted md:text-lg">
          Preguntale en lenguaje natural sobre objetos celestes, espectros infrarrojos de SPHEREx (
          <span className="font-mono text-cyan">0.75 – 5.00 µm</span>) o la región exacta del cielo que tenés en pantalla.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-full bg-stellar px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-indigo-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            Probar el copiloto
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </a>
          <a
            href={site.observatoryUrl}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm text-stellar transition-colors hover:border-cyan/50 hover:bg-cyan/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <Telescope aria-hidden="true" className="h-4 w-4 text-cyan" />
            Abrir el Observatorio
          </a>
        </div>

        <div className="flex flex-col items-center gap-3 pt-4">
          <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">Probá preguntar</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {pillOrder.map((id) => {
              const a = answers.find((x) => x.id === id)!;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onAsk(id)}
                    className="glass rounded-full px-4 py-2 text-sm text-stellar/85 transition-colors hover:border-violet/50 hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                  >
                    {`"${a.question}"`}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
