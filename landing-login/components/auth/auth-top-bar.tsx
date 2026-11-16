'use client'

import { ArrowLeft, Sparkles, Telescope } from 'lucide-react'
import { PapastronomyLogo } from './papastronomy-logo'
import { useLanguage } from '@/lib/i18n'

export function AuthTopBar() {
  const { locale, setLocale, t, withLanguage } = useLanguage()
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-5">
        <a
          href={withLanguage('/')}
          aria-label={t('Volver al inicio')}
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
        >
          <PapastronomyLogo className="h-9 w-auto" />
        </a>
        <span aria-hidden="true" className="hidden h-4 w-px bg-line-strong sm:block" />
        <a
          href={withLanguage('/')}
          className="hidden items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan sm:flex"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('Volver al inicio')}
        </a>
      </div>
      <div className="flex items-center gap-2">
        <nav
          aria-label={locale === 'es' ? 'Ir a módulo' : 'Go to module'}
          className="flex items-center rounded-full border border-line-strong bg-navy/60 p-1"
        >
          <a
            href={withLanguage('/explorer')}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <Telescope className="size-3.5 text-cyan" aria-hidden="true" />
            <span className="hidden sm:inline">{locale === 'es' ? 'Observatorio' : 'Observatory'}</span>
          </a>
          <a
            href={withLanguage('/copilot')}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          >
            <Sparkles className="size-3.5 text-violet" aria-hidden="true" />
            <span className="hidden sm:inline">AI Copilot</span>
          </a>
        </nav>
        <div role="group" aria-label={t('Cambiar idioma')} className="flex items-center gap-2 rounded-full border border-line-strong bg-navy/60 px-3 py-1.5 text-muted">
          <button type="button" lang="es" aria-label={t('Cambiar a español')} aria-pressed={locale === 'es'} onClick={() => setLocale('es')} className="rounded text-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan">ES</button>
          <button type="button" lang="en" aria-label={t('Cambiar a inglés')} aria-pressed={locale === 'en'} onClick={() => setLocale('en')} className="rounded text-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan">EN</button>
        </div>
        <p className="tech-label hidden items-center gap-2 rounded-full border border-line-strong bg-navy/60 px-3 py-1.5 text-muted md:flex">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-cyan shadow-[0_0_8px_var(--cyan)]" />
          <span>{t('Acceso abierto · Ciencia para todos')}</span>
        </p>
      </div>
    </header>
  )
}
