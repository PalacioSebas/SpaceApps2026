'use client'

import { useId, useRef } from 'react'
import Image from 'next/image'
import {
  Bookmark,
  Satellite,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Telescope,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ExplorerLevel, useExplorerLevel } from '@/lib/explorer-profile'

type Accent = 'amber' | 'cyan' | 'violet'

type Profile = {
  id: ExplorerLevel
  label: string
  description: string
  icon: LucideIcon
  accent: Accent
  hudTitle: string
  hud: { label: string; value: string }[]
  aiTone: string
  ai: string
}

const profiles: Profile[] = [
  {
    id: 'curioso',
    label: 'Curioso / Aprendiz',
    description: 'Quiero aprender desde cero, sin palabras difíciles.',
    icon: Sprout,
    accent: 'amber',
    hudTitle: 'Vista guiada',
    hud: [
      { label: 'Señal', value: 'Calor infrarrojo detectado' },
      { label: 'Guía paso a paso', value: 'Activa' },
      { label: 'Vocabulario', value: 'Simple' },
    ],
    aiTone: 'Explicación amigable',
    ai: '¡Hola! Esta mancha brillante es una candidata a enana marrón: un objeto más grande que Júpiter pero que no llegó a encenderse como el Sol.',
  },
  {
    id: 'aficionado',
    label: 'Aficionado / Ciencia Ciudadana',
    description: 'Quiero explorar el cielo y ayudar a descubrir objetos como enanas marrones.',
    icon: Telescope,
    accent: 'cyan',
    hudTitle: 'Comparador de épocas',
    hud: [
      { label: 'Comparar', value: 'Epoch 1 vs Epoch 3' },
      { label: 'Desplazamiento', value: '0.42″ / 6 meses' },
      { label: 'Tooltips guiados', value: 'Activos' },
    ],
    aiTone: 'Modo verificación',
    ai: 'Alterná entre Epoch 1 y Epoch 3: si el punto se corre respecto de las estrellas de fondo, tiene movimiento propio. Marcalo y lo sumamos a la revisión comunitaria.',
  },
  {
    id: 'investigador',
    label: 'Investigador / Avanzado',
    description: 'Quiero ver datos FITS crudos, coordenadas WCS y las 102 bandas espectrales.',
    icon: Satellite,
    accent: 'violet',
    hudTitle: 'Telemetría FITS',
    hud: [
      { label: 'Banda', value: 'λ 4.40 µm · MJy/sr' },
      { label: 'Coordenadas', value: 'RA 64.2931° · Dec −21.7104° ICRS' },
      { label: 'Canales', value: '102 / 102 · WCS TAN' },
    ],
    aiTone: 'Análisis espectral',
    ai: 'Fotometría: exceso a 4.4 µm con caída en 3.3 µm, compatible con absorción de CH₄. Índice [3.3]−[4.4] ≈ 1.8 mag sugiere T ≤ 900 K (tipo T tardío). SNR 14.2 en apertura de 2 px.',
  },
]

const accentStyles: Record<
  Accent,
  { text: string; border: string; bg: string; dot: string; ring: string }
> = {
  amber: {
    text: 'text-amber',
    border: 'border-amber/60',
    bg: 'bg-amber/10',
    dot: 'bg-amber',
    ring: 'shadow-[0_0_0_1px_var(--amber),0_0_24px_-6px_var(--amber)]',
  },
  cyan: {
    text: 'text-cyan',
    border: 'border-cyan/60',
    bg: 'bg-cyan/10',
    dot: 'bg-cyan',
    ring: 'shadow-[0_0_0_1px_var(--cyan),0_0_24px_-6px_var(--cyan)]',
  },
  violet: {
    text: 'text-violet',
    border: 'border-violet/60',
    bg: 'bg-violet/10',
    dot: 'bg-violet',
    ring: 'shadow-[0_0_0_1px_var(--violet),0_0_24px_-6px_var(--violet)]',
  },
}

const savedItems = [
  {
    icon: SlidersHorizontal,
    title: 'Ajustes del Telescopio',
    body: 'Bandas infrarrojas, filtros de color, contraste y grillas activas.',
  },
  {
    icon: Bookmark,
    title: 'Bitácora de Descubrimientos',
    body: 'Tus coordenadas marcadas y capturas para volver a ellas en cualquier momento.',
  },
  {
    icon: Sparkles,
    title: 'Nivel del Copiloto IA',
    body: 'El asistente recuerda qué temas te interesan y adapta sus explicaciones a tu ritmo.',
  },
]

export function ProfilePreview() {
  const [level, setLevel] = useExplorerLevel()
  const id = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeIndex = profiles.findIndex((profile) => profile.id === level)
  const active = profiles[activeIndex]
  const accent = accentStyles[active.accent]

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    }
    let next: number | null = null
    if (event.key in keys) next = (activeIndex + keys[event.key] + profiles.length) % profiles.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = profiles.length - 1
    if (next === null) return
    event.preventDefault()
    setLevel(profiles[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="glass flex h-full flex-col gap-6 rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="tech-label text-violet">Calibración guardada en tu perfil</p>
        <h2 id="preview-title" className="text-pretty text-lg leading-relaxed text-stellar">
          Elegí cómo querés que Papastronomy te muestre el universo{' '}
          <span className="text-muted">
            (podés cambiarlo cuando quieras y se guarda automáticamente):
          </span>
        </h2>
      </div>

      <div
        role="tablist"
        aria-label="Nivel de experiencia"
        onKeyDown={handleKeyDown}
        className="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        {profiles.map((profile, index) => {
          const selected = profile.id === level
          const styles = accentStyles[profile.accent]
          const Icon = profile.icon
          return (
            <button
              key={profile.id}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${profile.id}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setLevel(profile.id)}
              className={cn(
                'flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan',
                selected
                  ? cn('border-transparent bg-midnight/80', styles.ring)
                  : 'border-line bg-void/40 hover:border-line-strong hover:bg-navy/70',
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg',
                    styles.bg,
                    styles.text,
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full transition-opacity',
                    styles.dot,
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-stellar">{profile.label}</span>
                <span className="text-sm leading-relaxed text-muted">{profile.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active.id}`}
        aria-live="polite"
        className="grid grid-cols-1 overflow-hidden rounded-xl border border-line-strong bg-void/70 sm:grid-cols-5"
      >
        <div className="relative aspect-square sm:col-span-2 sm:aspect-auto">
          <Image
            src="/images/spherex-field.png"
            alt="Campo estelar infrarrojo de SPHEREx con una fuente candidata en el centro"
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 40vw, 100vw"
            className="object-cover"
            priority
          />
          <div aria-hidden="true" className="coord-grid absolute inset-0 opacity-60" />
          <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className={cn('relative size-14 rounded-full border-2', accent.border)}>
              <span className={cn('absolute -left-4 top-1/2 h-px w-3', accent.dot)} />
              <span className={cn('absolute -right-4 top-1/2 h-px w-3', accent.dot)} />
              <span className={cn('absolute -top-4 left-1/2 h-3 w-px', accent.dot)} />
              <span className={cn('absolute -bottom-4 left-1/2 h-3 w-px', accent.dot)} />
            </span>
          </div>
          <p className="tech-label absolute left-3 top-3 rounded bg-void/80 px-2 py-1 text-stellar">
            HUD · {active.hudTitle}
          </p>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:col-span-3">
          <dl className="flex flex-col divide-y divide-line">
            {active.hud.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1 py-2.5 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <dt className="tech-label text-muted">{row.label}</dt>
                <dd
                  className={cn(
                    'text-sm text-stellar sm:text-right',
                    active.id === 'investigador' && 'font-mono text-xs',
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className={cn('flex flex-col gap-2 rounded-lg border p-4', accent.border, accent.bg)}>
            <p className={cn('tech-label flex items-center gap-2', accent.text)}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              Copiloto IA · {active.aiTone}
            </p>
            <p
              className={cn(
                'text-pretty leading-relaxed text-stellar',
                active.id === 'investigador' ? 'font-mono text-xs leading-relaxed' : 'text-sm',
              )}
            >
              {active.ai}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="tech-label text-muted">Qué se guarda automáticamente en tu cuenta</h3>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {savedItems.map((item) => {
            const Icon = item.icon
            return (
              <li
                key={item.title}
                className="flex flex-col gap-2 rounded-xl border border-line bg-navy/50 p-4"
              >
                <Icon className="size-4 text-cyan" aria-hidden="true" />
                <p className="text-sm font-semibold text-stellar">{item.title}</p>
                <p className="text-sm leading-relaxed text-muted">{item.body}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
