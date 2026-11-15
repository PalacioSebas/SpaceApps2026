"use client";

import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { useLanguage } from "@/lib/i18n";

const layerColor = {
  Science: "text-cyan",
  Backend: "text-violet",
  Interface: "text-stellar",
} as const;

type LayerKey = keyof typeof layerColor;

export function TechStack() {
  const { t } = useLanguage();

  return (
    <section id="technology" aria-labelledby="technology-title" className="relative py-28 md:py-40">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              id="technology-title"
              index="05"
              eyebrow={t.techStack.eyebrow}
              title={t.techStack.title}
              description={t.techStack.description}
            />
            <Reveal delay={120}>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.2em]">
                {(Object.keys(layerColor) as LayerKey[]).map((layer) => (
                  <li key={layer} className="flex items-center gap-2 text-muted">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-current ${layerColor[layer]}`} />
                    {t.techStack.layers[layer]}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:col-span-7 lg:grid-cols-3">
            {t.techStack.items.map((item, i) => (
              <Reveal
                as="li"
                key={item.name}
                delay={i * 60}
                className={`group relative flex min-h-44 flex-col justify-between bg-void p-6 transition-colors duration-500 hover:bg-navy ${
                  "wide" in item && item.wide ? "lg:col-span-2" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${layerColor[item.layer]}`}>
                    {item.tag}
                  </span>
                  <span className="font-mono text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-medium tracking-tight text-stellar transition-transform duration-500 group-hover:-translate-y-0.5">
                    {item.name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-6 bottom-0 h-px scale-x-0 bg-gradient-to-r from-cyan to-violet transition-transform duration-500 group-hover:scale-x-100"
                />
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
