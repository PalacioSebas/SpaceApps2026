"use client";

import { useLanguage } from "@/lib/i18n";

import { ArrowUpRight, Sparkles, Telescope } from "lucide-react";
import { Logo } from "./logo";
import { Reveal } from "./reveal";
import { navLinks, site } from "@/lib/site";

export function SiteFooter() {
  const { t, withLanguage } = useLanguage();
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-violet/15 blur-[120px]" />

      <section id="lanzar" aria-labelledby="cta-title" className="relative scroll-mt-20 px-5 py-24 md:px-8 md:py-32">
        <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <p className="font-mono text-[10px] tracking-[0.22em] text-violet uppercase">{t("Copilot + Explorer")}</p>
          <h2 id="cta-title" className="text-gradient text-3xl font-medium tracking-[-0.035em] text-balance md:text-5xl">
            {t("Abrí el Explorer y preguntale al cielo.")}
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-pretty text-muted">
            {t("El copiloto vive al lado de tus datos SPHEREx: seleccioná una región, hacé una pregunta y seguí explorando.")}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a
              href={withLanguage(site.observatoryUrl)}
              className="inline-flex items-center gap-2 rounded-full bg-stellar px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-indigo-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              {t("Lanzar el asistente")}
            </a>
            <a
              href={withLanguage(site.observatoryUrl)}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm text-stellar transition-colors hover:border-cyan/50 hover:bg-cyan/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              <Telescope aria-hidden="true" className="h-4 w-4 text-cyan" />
              {t("Papastronomy Explorer")}
            </a>
          </div>
        </Reveal>
      </section>

      <div className="relative border-t border-line px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <Logo />
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
              {t("NASA Space Apps Challenge 2026 · Datos SPHEREx")}
            </p>
          </div>
          <nav aria-label={t("Pie de página")}>
            <ul className="flex flex-wrap items-center gap-6">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-sm text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan">
                    {t(l.label)}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={site.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
                >
                  {t("GitHub")}
                  <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
