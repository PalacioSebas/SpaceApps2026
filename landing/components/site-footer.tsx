"use client";

import { Logo } from "./logo";
import { site } from "@/lib/site";
import { useLanguage } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useLanguage();

  const links = [
    { label: t.footer.links.github, href: site.githubUrl, external: true },
    { label: t.footer.links.application, href: site.appUrl, external: false },
    { label: t.footer.links.challenge, href: site.challengeUrl, external: true },
  ];

  return (
    <footer className="border-t border-line bg-void">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-12 md:px-8">
        <div className="md:col-span-5">
          <Logo />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
            {t.footer.description}
          </p>
        </div>
        <nav aria-label={t.footer.navAria} className="md:col-span-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{t.footer.linksHeading}</h2>
          <ul className="mt-4 space-y-2.5">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="text-sm text-stellar/80 transition-colors hover:text-cyan"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="md:col-span-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{t.footer.creditsHeading}</h2>
          <p className="mt-4 text-sm leading-relaxed text-stellar/80">
            {t.footer.teamLine}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t.footer.dataCourtesy}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted/80">
            {t.footer.missionAck}
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:flex-row sm:justify-between md:px-8">
          <span>© 2026 Papastronomy</span>
          <span>{t.footer.disclaimer}</span>
        </div>
      </div>
    </footer>
  );
}
