import { BookOpen, Crosshair } from "lucide-react";
import { Reveal } from "./reveal";

const curiosity = ["¿Qué es el corrimiento al rojo?", "¿Qué es una enana marrón?", "¿Qué busca la misión SPHEREx?"];
const observatory = ["¿Qué estoy viendo acá?", "¿Este cambio entre Epoch 1 y Epoch 3 es ruido o un candidato real?"];

export function ModesBento() {
  return (
    <section id="modos" aria-labelledby="modes-title" className="relative scroll-mt-20 border-t border-line px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mb-12 flex flex-col gap-3 md:mb-16">
          <p className="font-mono text-[10px] tracking-[0.22em] text-violet uppercase">Dos modos · Una misma conversación</p>
          <h2 id="modes-title" className="text-gradient max-w-2xl text-3xl font-medium tracking-[-0.035em] text-balance md:text-5xl">
            De la curiosidad a la telemetría, sin cambiar de herramienta.
          </h2>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <article className="glass flex h-full flex-col gap-6 rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-navy">
                  <BookOpen aria-hidden="true" className="h-4 w-4 text-indigo-soft" />
                </span>
                <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">Modo Divulgación / Explorador</p>
              </div>
              <h3 className="text-2xl font-medium tracking-[-0.03em] text-balance text-stellar">Para preguntas conceptuales.</h3>
              <p className="text-sm leading-relaxed text-muted">
                Respuestas claras, con analogías y escalas comparativas, pensadas para estudiantes, docentes y cualquier persona curiosa.
              </p>
              <ul className="mt-auto flex flex-col gap-2">
                {curiosity.map((q) => (
                  <li key={q} className="rounded-lg border border-line bg-navy/60 px-4 py-3 text-sm text-stellar/90">
                    {q}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-3">
            <article className="glass relative flex h-full flex-col gap-6 overflow-hidden rounded-2xl p-6 md:p-8">
              <div aria-hidden="true" className="coord-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet/40 bg-violet/10">
                    <Crosshair aria-hidden="true" className="h-4 w-4 text-violet" />
                  </span>
                  <p className="font-mono text-[10px] tracking-[0.22em] text-muted uppercase">Modo Observatorio · Context-aware</p>
                </div>
                <span className="hidden font-mono text-[10px] tracking-[0.14em] text-cyan sm:inline">RA 180.0042° · Dec +00.0018°</span>
              </div>
              <h3 className="relative text-2xl font-medium tracking-[-0.03em] text-balance text-stellar">
                Para preguntas sobre los datos en vivo.
              </h3>
              <p className="relative max-w-xl text-sm leading-relaxed text-muted">
                El copiloto lee el recorte, el header y el espectro activos, y cita cada valor que usa para que puedas verificarlo.
              </p>

              <div className="relative mt-auto grid gap-3 md:grid-cols-2">
                {observatory.map((q) => (
                  <div key={q} className="rounded-lg border border-line-strong bg-void/70 px-4 py-3 text-sm text-stellar/90">
                    {q}
                  </div>
                ))}
                <div className="rounded-lg border border-violet/30 bg-violet/10 p-4 md:col-span-2">
                  <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-violet uppercase">Respuesta · Epoch 1 → 3</p>
                  <p className="text-sm leading-relaxed text-stellar">
                    El desplazamiento de <span className="font-mono text-cyan">0.12″</span> supera 4σ el error de centroide y es coherente en
                    los <span className="font-mono text-cyan">6</span> canales con señal. Probablemente no es ruido: lo marco como candidato real.
                  </p>
                </div>
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
