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

type Visual = 'field' | 'blink' | 'fits'

type Profile = {
  id: ExplorerLevel
  label: string
  description: string
  icon: LucideIcon
  accent: Accent
  visual: Visual
  visualAlt: string
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
    visual: 'field',
    visualAlt: 'Campo estelar infrarrojo de SPHEREx con una fuente candidata en el centro',
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
    visual: 'blink',
    visualAlt:
      'Comparador de épocas: la fuente candidata se desplaza entre Epoch 1 y Epoch 3 respecto de estrellas de referencia fijas',
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
    visual: 'fits',
    visualAlt:
      'Mapa FITS en falso color con isofotas sobre la fuente y espectro de 102 canales con pico en 4.4 µm y caída por metano en 3.3 µm',
    hudTitle: 'Telemetría FITS',
    hud: [
      { label: 'Banda', value: 'λ 4.40 µm · MJy/sr' },
      { label: 'Coordenadas', value: 'RA 64.2931° · Dec −21.7104° ICRS' },
      { label: 'Canales', value: '102 / 102 · WCS TAN' },
    ],
    aiTone: 'Análisis espectral',
    ai: 'Espectro de 102 canales: el flujo sube en 4.4 µm y cae en 3.3 µm. Esa caída es la huella del metano (CH₄), que solo sobrevive en atmósferas frías. Color [3.3]−[4.4] ≈ 1.8 mag → T ≤ 900 K, unas 6 veces más fría que el Sol: probable enana marrón tipo T tardío. SNR 14.2: detección sólida, no es ruido.',
  },
]

// SPHEREx cubre 0.75–5.0 µm en 102 canales. Perfil sintético de una enana T tardía:
// picos en J/H, absorción fuerte de CH₄ en ~2.2 y ~3.3 µm, y máximo de emisión cerca de 4.4 µm.
const SPEC_MIN = 0.75
const SPEC_MAX = 5.0
const specX = (lambda: number) => ((lambda - SPEC_MIN) / (SPEC_MAX - SPEC_MIN)) * 100

const spectrum = (() => {
  const gauss = (x: number, mu: number, sigma: number, amp: number) =>
    amp * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))
  const raw = Array.from({ length: 102 }, (_, i) => {
    const lambda = SPEC_MIN + (i * (SPEC_MAX - SPEC_MIN)) / 101
    const flux =
      0.04 +
      gauss(lambda, 1.08, 0.05, 0.5) +
      gauss(lambda, 1.27, 0.08, 0.85) +
      gauss(lambda, 1.58, 0.07, 0.42) +
      gauss(lambda, 2.08, 0.08, 0.16) +
      gauss(lambda, 4.35, 0.3, 1) +
      0.025 * Math.sin(i * 12.9898)
    return { lambda, flux: Math.max(flux, 0.01) }
  })
  const peak = Math.max(...raw.map((point) => point.flux))
  return raw.map((point) => ({
    x: specX(point.lambda),
    y: 38 - (point.flux / peak) * 33,
  }))
})()

const spectrumLine = spectrum.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')

function BlinkOverlay() {
  const referenceStars = [
    [20, 24],
    [80, 70],
    [72, 18],
    [26, 78],
  ]
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <marker
            id="blink-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--cyan)" />
          </marker>
        </defs>
        {referenceStars.map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x - 2.5}
            y={y - 2.5}
            width="5"
            height="5"
            fill="none"
            stroke="white"
            strokeOpacity="0.45"
            strokeWidth="0.35"
            strokeDasharray="1 0.8"
          />
        ))}
        <circle
          cx="40"
          cy="60"
          r="3"
          fill="none"
          stroke="var(--cyan)"
          strokeOpacity="0.7"
          strokeWidth="0.4"
          strokeDasharray="1 0.8"
        />
        <line
          x1="42.4"
          y1="57.6"
          x2="55.2"
          y2="44.8"
          stroke="var(--cyan)"
          strokeWidth="0.45"
          markerEnd="url(#blink-arrow)"
        />
        <circle cx="58" cy="42" r="3" fill="none" stroke="var(--cyan)" strokeWidth="0.5" />
        <circle cx="58" cy="42" r="1.3" fill="var(--cyan)" className="motion-safe:animate-pulse" />
      </svg>
      <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-stellar">
        <span className="rounded bg-void/80 px-2 py-1">
          <span className="text-cyan/70">◌ Epoch 1</span> → <span className="text-cyan">● Epoch 3</span>
        </span>
        <span className="rounded bg-void/80 px-2 py-1">μ ≈ 0.84″/año · PA 45°</span>
      </div>
    </>
  )
}

function FitsOverlay() {
  const falseColor = 'linear-gradient(to top, #10002b, #5a189a, #c9184a, #f77f00, #ffd166, #fffbe6)'
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <radialGradient id="fits-source">
            <stop offset="0" stopColor="#fffbe6" />
            <stop offset="0.12" stopColor="#ffd166" />
            <stop offset="0.3" stopColor="#f77f00" />
            <stop offset="0.5" stopColor="#c9184a" stopOpacity="0.9" />
            <stop offset="0.75" stopColor="#5a189a" stopOpacity="0.6" />
            <stop offset="1" stopColor="#10002b" stopOpacity="0" />
          </radialGradient>
          <pattern id="fits-pixels" width="2.5" height="2.5" patternUnits="userSpaceOnUse">
            <path d="M2.5 0 L0 0 0 2.5" fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="0.15" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="#05030f" fillOpacity="0.55" />
        <ellipse cx="50" cy="40" rx="20" ry="16" fill="url(#fits-source)" transform="rotate(-18 50 40)" />
        <circle cx="18" cy="18" r="6" fill="url(#fits-source)" opacity="0.7" />
        <circle cx="82" cy="58" r="5" fill="url(#fits-source)" opacity="0.6" />
        <circle cx="24" cy="58" r="3.5" fill="url(#fits-source)" opacity="0.5" />
        <g transform="rotate(-18 50 40)" fill="none" stroke="white" strokeWidth="0.3">
          {[16, 12, 8, 4.5].map((rx, index) => (
            <ellipse
              key={rx}
              cx="50"
              cy="40"
              rx={rx}
              ry={rx * 0.8}
              strokeOpacity={0.25 + index * 0.15}
              strokeDasharray={index === 0 ? '1 1' : undefined}
            />
          ))}
        </g>
        <circle cx="50" cy="40" r="2" fill="none" stroke="var(--violet)" strokeWidth="0.45" />
        <rect width="100" height="100" fill="url(#fits-pixels)" />
      </svg>

      <div className="absolute right-3 top-12 bottom-[38%] flex items-stretch gap-1 font-mono text-[9px] text-muted">
        <div className="flex flex-col justify-between text-right">
          <span>5.0</span>
          <span>2.5</span>
          <span>0.0</span>
        </div>
        <div className="w-1.5 rounded-full" style={{ backgroundImage: falseColor }} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-[34%] flex-col gap-1 border-t border-line bg-void/85 px-3 pb-2 pt-1.5">
        <p className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
          <span>SED · 102 canales</span>
          <span className="text-violet">F_ν (norm.)</span>
        </p>
        <div className="relative min-h-0 flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {spectrum.map((point, index) => (
              <rect
                key={index}
                x={point.x - 0.25}
                y={point.y}
                width="0.5"
                height={40 - point.y}
                fill="var(--violet)"
                fillOpacity="0.25"
              />
            ))}
            {[3.3, 4.4].map((lambda) => (
              <line
                key={lambda}
                x1={specX(lambda)}
                x2={specX(lambda)}
                y1="0"
                y2="40"
                stroke={lambda === 3.3 ? 'var(--amber)' : 'var(--cyan)'}
                strokeWidth="1"
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polyline
              points={spectrumLine}
              fill="none"
              stroke="var(--violet)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            className="absolute top-0 -translate-x-full pr-1 font-mono text-[9px] text-amber"
            style={{ left: `${specX(3.3)}%` }}
          >
            CH₄ 3.3
          </span>
          <span
            className="absolute top-0 -translate-x-full pr-1 font-mono text-[9px] text-cyan"
            style={{ left: `${specX(4.4)}%` }}
          >
            4.4
          </span>
        </div>
        <p className="flex justify-between font-mono text-[9px] text-muted">
          <span>0.75 µm</span>
          <span>5.0 µm</span>
        </p>
      </div>
    </>
  )
}

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
            alt={active.visualAlt}
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 40vw, 100vw"
            className={cn(
              'object-cover transition-[filter,opacity]',
              active.visual === 'fits' && 'opacity-60 grayscale contrast-125',
            )}
            priority
          />
          <div aria-hidden="true" className="coord-grid absolute inset-0 opacity-60" />
          {active.visual === 'field' && (
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
              <span className={cn('relative size-14 rounded-full border-2', accent.border)}>
                <span className={cn('absolute -left-4 top-1/2 h-px w-3', accent.dot)} />
                <span className={cn('absolute -right-4 top-1/2 h-px w-3', accent.dot)} />
                <span className={cn('absolute -top-4 left-1/2 h-3 w-px', accent.dot)} />
                <span className={cn('absolute -bottom-4 left-1/2 h-3 w-px', accent.dot)} />
              </span>
            </div>
          )}
          {active.visual === 'blink' && <BlinkOverlay />}
          {active.visual === 'fits' && <FitsOverlay />}
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
