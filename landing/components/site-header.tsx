"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";
import { navLinks, site } from "@/lib/site";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        scrolled
          ? "border-b border-line bg-void/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <a href="#top" aria-label="Papastronomy home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan">
          <Logo />
        </a>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {navLinks.map((link) => (
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
        <a
          href={site.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm text-stellar transition-colors hover:border-cyan/50 hover:bg-cyan/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        >
          GitHub
          <ArrowUpRight
            aria-hidden="true"
            className="h-3.5 w-3.5 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cyan"
          />
        </a>
      </div>
    </header>
  );
}
