"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import { Starfield } from "./starfield";
import { site } from "@/lib/site";
import { useLanguage, withLanguage } from "@/lib/i18n";

export function FinalCta() {
  const { t, locale } = useLanguage();

  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden">
      <Image src="/images/horizon.png" alt="" fill sizes="100vw" className="-z-20 object-cover object-bottom" />
      <Starfield density={0.00008} className="-z-10" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-void via-void/60 to-void/20" />

      <div className="mx-auto flex min-h-[85svh] max-w-5xl flex-col items-center justify-center px-5 py-32 text-center md:px-8">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan">{t.finalCta.eyebrow}</p>
        </Reveal>
        <Reveal delay={100}>
          <h2
            id="cta-title"
            className="text-gradient mt-8 text-balance text-5xl font-medium leading-[1.02] tracking-[-0.03em] md:text-7xl"
          >
            {t.finalCta.title}
          </h2>
        </Reveal>
        <Reveal delay={200}>
          <p className="mx-auto mt-8 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            {t.finalCta.description}
          </p>
        </Reveal>
        <Reveal delay={300}>
          <a
            href={withLanguage(site.appUrl, locale)}
            className="group mt-12 inline-flex items-center gap-2 rounded-full bg-stellar px-7 py-4 text-sm font-medium text-void shadow-[0_0_60px_-10px_rgba(85,214,255,0.7)] transition-all hover:bg-white hover:shadow-[0_0_80px_-6px_rgba(85,214,255,0.85)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
          >
            {t.finalCta.button}
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </Reveal>
        <Reveal delay={400}>
          <p className="mt-10 max-w-md text-xs leading-relaxed text-muted/80">
            {t.finalCta.disclaimer}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
