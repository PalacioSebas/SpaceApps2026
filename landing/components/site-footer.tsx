import { Logo } from "./logo";
import { site } from "@/lib/site";

const links = [
  { label: "GitHub", href: site.githubUrl, external: true },
  { label: "Application", href: site.appUrl, external: false },
  { label: "Space Apps Challenge", href: site.challengeUrl, external: true },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-void">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-12 md:px-8">
        <div className="md:col-span-6">
          <Logo />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
            An exploratory platform for SPHEREx observations — processing FITS data, analyzing spectra and comparing
            epochs to identify candidates for further scientific analysis.
          </p>
        </div>
        <nav aria-label="Footer" className="md:col-span-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Links</h2>
          <ul className="mt-4 space-y-2.5">
            {links.map((l) => (
              <li key={l.label}>
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
        <div className="md:col-span-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Credits</h2>
          <p className="mt-4 text-sm leading-relaxed text-stellar/80">
            Team Papastronomy · NASA Space Apps Challenge 2026
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Observational data courtesy of NASA SPHEREx via NASA/IPAC IRSA. Imagery on this page is illustrative.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:flex-row sm:justify-between md:px-8">
          <span>© 2026 Papastronomy</span>
          <span>Not affiliated with or endorsed by NASA</span>
        </div>
      </div>
    </footer>
  );
}
