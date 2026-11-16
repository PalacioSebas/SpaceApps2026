'use client'

import { useId, useState } from 'react'
import { ArrowRight, Check, Compass, Eye, EyeOff, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useExplorerLevel } from '@/lib/explorer-profile'
import { useLanguage } from '@/lib/i18n'
import { GitHubIcon, GoogleIcon } from './brand-icons'

type Mode = 'login' | 'signup'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan'

const levelNames = {
  curioso: 'Curioso / Aprendiz',
  aficionado: 'Aficionado / Ciencia Ciudadana',
  investigador: 'Investigador / Avanzado',
} as const

export function AuthCard() {
  const { t } = useLanguage()
  const [mode, setMode] = useState<Mode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [guestReady, setGuestReady] = useState(false)
  const [level] = useExplorerLevel()
  const id = useId()

  const pendingAuthNotice =
    'El servicio de cuentas todavía no está conectado. Mientras tanto, podés explorar en Modo Invitado.'

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(pendingAuthNotice)
  }

  function enterGuestMode() {
    try {
      window.localStorage.setItem('papastronomy:guest', 'true')
    } catch {
      // Ignore storage failures; the guest session still works for this visit.
    }
    setGuestReady(true)
    window.location.href = '/explorer'
  }

  return (
    <div className="glass flex flex-col gap-7 rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <p className="tech-label text-cyan">{t('Portal de acceso · Papastronomy ID')}</p>
        <h1
          id="auth-title"
          className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl"
        >
          {t('Tu propio observatorio espacial, calibrado a tu medida.')}
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          {t('Iniciá sesión para sincronizar tus preferencias visuales, tus objetos celestes guardados y el nivel de explicación de tu asistente IA.')}
        </p>
      </div>

      <div
        role="tablist"
        aria-label={t('Tipo de acceso')}
        className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-void/60 p-1"
      >
        {(
          [
            ['login', 'Iniciar sesión'],
            ['signup', 'Crear cuenta gratis'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-tab-${value}`}
            aria-selected={mode === value}
            aria-controls={`${id}-panel`}
            onClick={() => {
              setMode(value)
              setNotice(null)
            }}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              focusRing,
              mode === value ? 'bg-midnight text-stellar' : 'text-muted hover:text-stellar',
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <form
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${mode}`}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-email`} className="tech-label text-muted">
            {t('Correo electrónico')}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t('vos@ejemplo.com')}
            className="h-11 rounded-lg border border-line-strong bg-void/70 px-3.5 text-sm text-stellar placeholder:text-muted/70 transition-colors focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/25"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor={`${id}-password`} className="tech-label text-muted">
              {t('Contraseña')}
            </label>
            {mode === 'login' && (
              <a
                href="#"
                className={cn('rounded text-xs text-muted hover:text-cyan', focusRing)}
              >
                {t('¿La olvidaste?')}
              </a>
            )}
          </div>
          <div className="relative">
            <input
              id={`${id}-password`}
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? '••••••••' : t('Mínimo 8 caracteres')}
              className="h-11 w-full rounded-lg border border-line-strong bg-void/70 pl-3.5 pr-11 text-sm text-stellar placeholder:text-muted/70 transition-colors focus-visible:border-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/25"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={t(showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña')}
              aria-pressed={showPassword}
              className={cn(
                'absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-md text-muted hover:text-stellar',
                focusRing,
              )}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="flex size-4.5 shrink-0 items-center justify-center rounded border border-line-strong bg-void/70 text-void transition-colors peer-checked:border-cyan peer-checked:bg-cyan peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
          {t('Recordar mi configuración en este dispositivo')}
        </label>

        <button
          type="submit"
          className={cn(
            'group mt-1 flex h-12 items-center justify-center gap-2 rounded-lg bg-stellar text-sm font-semibold text-void shadow-[0_0_32px_-6px_var(--cyan)] transition-shadow hover:shadow-[0_0_44px_-4px_var(--cyan)]',
            focusRing,
          )}
        >
          {t(mode === 'login' ? 'Entrar al Observatorio' : 'Crear mi observatorio')}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setNotice(pendingAuthNotice)}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-navy/60 text-sm font-medium transition-colors hover:bg-midnight',
              focusRing,
            )}
          >
            <GoogleIcon className="size-4" />
            Google
          </button>
          <button
            type="button"
            onClick={() => setNotice(pendingAuthNotice)}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-navy/60 text-sm font-medium transition-colors hover:bg-midnight',
              focusRing,
            )}
          >
            <GitHubIcon className="size-4" />
            GitHub
          </button>
        </div>

        <p role="status" aria-live="polite" className="empty:hidden">
          {notice && (
            <span className="flex items-start gap-2 rounded-lg border border-line-strong bg-midnight/60 p-3 text-sm leading-relaxed text-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden="true" />
              {t(notice)}
            </span>
          )}
        </p>
      </form>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber/40" />
        <span className="tech-label text-amber">{t('o sin cuenta')}</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber/40" />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-amber/30 bg-amber/[0.06] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber">
            <Compass className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-stellar">{t('¿Primera vez explorando el espacio?')}</p>
            <p className="text-sm leading-relaxed text-muted">
              {t('Empezá ya, sin registrarte. Tus ajustes se guardan en este navegador y podés pasarlos a una cuenta cuando quieras.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={enterGuestMode}
          className={cn(
            'flex h-11 items-center justify-center gap-2 rounded-lg border border-amber/50 bg-amber/10 text-sm font-semibold text-amber transition-colors hover:bg-amber/20',
            focusRing,
          )}
        >
          {t('Entrar en Modo Invitado (1-Click)')}
        </button>
        <p role="status" aria-live="polite" className="empty:hidden">
          {guestReady && (
            <span className="flex items-center gap-2 text-sm text-stellar">
              <Check className="size-4 text-amber" aria-hidden="true" />
              {t('Modo Invitado activo · perfil {profile} guardado en este dispositivo.', { profile: t(levelNames[level]) })}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
