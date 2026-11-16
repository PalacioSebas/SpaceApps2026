"use client";

import { useLanguage } from "@/lib/i18n";

import { Reveal } from "./reveal";

const steps = [
  {
    n: "01",
    title: "Lectura del recorte actual",
    body: "Extrae coordenadas WCS, metadatos FITS y fotometría multicanal de la región activa.",
    data: ["CRVAL1 180.0042", "BUNIT MJy/sr", "102 canales"],
  },
  {
    n: "02",
    title: "Razonamiento astrofísico",
    body: "Cruza curvas espectrales infrarrojas y movimiento entre épocas con literatura astronómica.",
    data: ["λ 3.30 µm · CH₄", 'ΔEpoch +0.12"', "T_eff ≈ 650 K"],
  },
  {
    n: "03",
    title: "Respuesta adaptada a tu nivel",
    body: "Explica desde conceptos básicos (“¿Qué es una enana marrón?”) hasta anomalías espectrales para investigadores.",
    data: ["Divulgación", "Estudiante", "Investigación"],
  },
];

export function HowItWorks() {
  const { t } = useLanguage();
  return (
    <section id="como-funciona" aria-labelledby="how-title" className="relative scroll-mt-20 border-t border-line px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mb-12 flex flex-col gap-3 md:mb-16">
          <p className="font-mono text-[10px] tracking-[0.22em] text-cyan uppercase">{t("Pipeline · Context-aware")}</p>
          <h2 id="how-title" className="text-gradient max-w-2xl text-3xl font-medium tracking-[-0.035em] text-balance md:text-5xl">
            {t("Cómo piensa una IA que mira el cielo con vos.")}
          </h2>
        </Reveal>

        <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute top-6 right-[16%] left-[16%] hidden h-px bg-line-strong md:block">
          <span className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-violet shadow-[0_0_12px_var(--violet)] animate-travel" />
        </div>
        <ol className="relative grid gap-4 md:grid-cols-3 md:gap-0">
          {steps.map((s, i) => (
            <li key={s.n}>
              <Reveal delay={i * 120} className="flex h-full flex-col gap-5 md:px-6 md:first:pl-0">
                <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-void font-mono text-xs text-violet md:mx-auto">
                  {s.n}
                </span>
                <div className="glass flex flex-1 flex-col gap-4 rounded-xl p-5">
                  <h3 className="text-lg font-medium tracking-[-0.02em] text-stellar">{t(s.title)}</h3>
                  <p className="text-sm leading-relaxed text-muted">{t(s.body)}</p>
                  <ul className="mt-auto flex flex-wrap gap-1.5">
                    {s.data.map((d) => (
                      <li key={d} className="rounded border border-line px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-cyan">
                        {t(d)}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        </div>
      </div>
    </section>
  );
}
