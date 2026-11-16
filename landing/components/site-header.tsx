"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Globe, Sparkles, Telescope, UserCircle2 } from "lucide-react";
import { Logo } from "./logo";
import { site } from "@/lib/site";
import { useLanguage, withLanguage } from "@/lib/i18n";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const { locale, toggleLocale, t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems = [
    { href: "#challenge", label: t.header.nav.science },
    { href: "#platform", label: t.header.nav.platform },
    { href: "#process", label: t.header.nav.process },
    { href: "#explore", label: t.header.nav.explore },
    { href: "#technology", label: t.header.nav.technology },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        scrolled
          ? "border-b border-line bg-void/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 md:px-8">
        <a
          href="#top"
          aria-label={t.header.homeAria}
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
        >
          <Logo />
        </a>
        <nav aria-label={t.header.navAria} className="hidden xl:block">
          <ul className="flex items-center gap-6">
            {navItems.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-muted transition-colors hover:text-stellar focus-visible:text-stellar focus-visible:outline-none"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 sm:gap-2.5">
          <nav
            aria-label={locale === "es" ? "Módulos de la plataforma" : "Platform modules"}
            className="flex items-center rounded-full border border-line-strong bg-navy/60 p-1"
          >
            <a
              href={withLanguage(site.appUrl, locale)}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan/15 px-3 py-1.5 text-xs font-medium text-cyan ring-1 ring-cyan/40 transition-colors hover:bg-cyan/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              <Telescope aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{locale === "es" ? "Observatorio" : "Observatory"}</span>
            </a>
            <a
              href={withLanguage(site.copilotUrl, locale)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-violet" />
              <span className="hidden sm:inline">AI Copilot</span>
            </a>
            <a
              href={withLanguage(site.loginUrl, locale)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              <UserCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-amber" />
              <span className="hidden md:inline">{locale === "es" ? "Acceder" : "Sign In"}</span>
            </a>
          </nav>

          <a
            href={`${site.learning3dUrl}?lang=${locale}`}
            className="hidden items-center gap-1.5 rounded-full border border-cyan/30 bg-cyan/5 px-3.5 py-1.5 text-xs text-cyan transition-colors hover:border-cyan/60 hover:bg-cyan/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan lg:inline-flex"
          >
            {t.header.learn3d}
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={toggleLocale}
            aria-label={t.header.switchLangAria}
            title={t.header.switchLangTitle}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-void/50 px-2.5 py-1.5 font-mono text-xs text-stellar backdrop-blur-md transition-colors hover:border-cyan/50 hover:bg-cyan/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <Globe aria-hidden="true" className="h-3.5 w-3.5 text-cyan" />
            <span
              className={`rounded-full px-1.5 py-0.5 transition-colors ${
                locale === "en" ? "bg-cyan/20 font-semibold text-cyan" : "text-muted"
              }`}
            >
              EN
            </span>
            <span aria-hidden="true" className="text-line-strong">
              /
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 transition-colors ${
                locale === "es" ? "bg-cyan/20 font-semibold text-cyan" : "text-muted"
              }`}
            >
              ES
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
