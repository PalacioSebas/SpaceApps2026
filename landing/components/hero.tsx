"use client";

import Image from "next/image";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Parallax } from "./parallax";
import { Starfield } from "./starfield";
import { site } from "@/lib/site";
import { useLanguage } from "@/lib/i18n";

export function Hero() {
  const { t } = useLanguage();

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden"
    >
      <Parallax speed={0.3} className="absolute inset-0 -z-20">
        <Image
          src="/images/hero-ir.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-110 object-cover object-[70%_50%] opacity-90"
        />
      </Parallax>
      <Starfield className="-z-10 opacity-70" />

      {/* Orbital paths tracing around the planetary object */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 1000"
        className="pointer-events-none absolute -right-[30%] top-1/2 -z-10 h-[150vmin] w-[150vmin] -translate-y-1/2 opacity-60 md:-right-[12%]"
      >
        <g className="animate-spin-slow origin-center">
          <ellipse cx="500" cy="500" rx="470" ry="160" fill="none" stroke="#55D6FF" strokeOpacity="0.18" strokeDasharray="2 10" transform="rotate(-18 500 500)" />
        </g>
        <g className="animate-spin-slower origin-center">
          <ellipse cx="500" cy="500" rx="400" ry="250" fill="none" stroke="#9B8CFF" strokeOpacity="0.14" transform="rotate(24 500 500)" />
          <circle cx="900" cy="500" r="4" fill="#55D6FF" transform="rotate(24 500 500)" />
        </g>
      </svg>

      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-void via-void/70 to-transparent" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-void to-transparent" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pb-28 pt-32 md:px-8">
        <div className="max-w-3xl">
          <p className="mb-8 inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            <span aria-hidden="true" className="h-px w-10 bg-gradient-to-r from-transparent to-cyan" />
            {t.hero.eyebrow}
          </p>

          <h1
            id="hero-title"
            className="text-gradient text-balance text-5xl font-medium leading-[0.98] tracking-[-0.035em] sm:text-6xl md:text-7xl lg:text-[5.5rem]"
          >
            {t.hero.title}
          </h1>

          <p className="mt-8 max-w-xl text-pretty text-lg leading-relaxed text-muted md:text-xl">
            {t.hero.description}
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={site.appUrl}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-stellar px-6 py-3.5 text-sm font-medium text-void shadow-[0_0_40px_-8px_rgba(85,214,255,0.55)] transition-all hover:bg-white hover:shadow-[0_0_56px_-6px_rgba(85,214,255,0.75)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
            >
              {t.hero.primaryCta}
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#challenge"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line-strong bg-void/30 px-6 py-3.5 text-sm font-medium text-stellar backdrop-blur-md transition-colors hover:border-stellar/30 hover:bg-stellar/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
            >
              {t.hero.secondaryCta}
            </a>
          </div>

          <div className="glass mt-12 inline-flex items-center gap-3 rounded-full px-4 py-2">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-cyan" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-stellar">
              {t.hero.badge}
            </span>
          </div>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-5 pb-8 md:px-8">
        <dl className="hidden grid-cols-4 gap-6 border-t border-line pt-6 md:grid">
          {t.hero.telemetry.map((item) => (
            <div key={item.label}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{item.label}</dt>
              <dd className="mt-1.5 font-mono text-sm text-stellar">{item.value}</dd>
            </div>
          ))}
        </dl>
        <a
          href="#challenge"
          aria-label={t.hero.scrollAria}
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-muted transition-colors hover:text-stellar md:bottom-24"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em]">{t.hero.scrollLabel}</span>
          <ChevronDown aria-hidden="true" className="animate-float h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
