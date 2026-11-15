import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PapastronomyLogo } from './papastronomy-logo'

export function AuthTopBar() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan"
        >
          <PapastronomyLogo className="size-7" />
          <span className="text-sm font-semibold tracking-tight">Papastronomy</span>
        </Link>
        <span aria-hidden="true" className="hidden h-4 w-px bg-line-strong sm:block" />
        <Link
          href="/"
          className="hidden items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-stellar focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan sm:flex"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al inicio
        </Link>
      </div>
      <p className="tech-label flex items-center gap-2 rounded-full border border-line-strong bg-navy/60 px-3 py-1.5 text-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-cyan shadow-[0_0_8px_var(--cyan)]" />
        <span className="hidden sm:inline">Acceso abierto · Ciencia para todos</span>
        <span className="sm:hidden">Acceso abierto</span>
      </p>
    </header>
  )
}
