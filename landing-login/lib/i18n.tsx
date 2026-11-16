'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

export type Locale = 'es' | 'en'

const STORAGE_KEY = 'papastronomy-lang'
const EVENT_NAME = 'papastronomy-lang-change'
let memoryLocale: Locale = 'es'
let historyLocale: Locale | null = null

const english: Record<string, string> = {
  'Acceso · Papastronomy': 'Sign in · Papastronomy',
  'Iniciá sesión en Papastronomy para guardar tu calibración del telescopio, tus coordenadas favoritas y el nivel de tu copiloto IA. Datos de SPHEREx para todos.': 'Sign in to Papastronomy to save your telescope settings, favorite coordinates, and AI copilot level. SPHEREx data for everyone.',
  'Volver al inicio': 'Back to home',
  'Acceso abierto · Ciencia para todos': 'Open access · Science for everyone',
  'Acceso abierto': 'Open access',
  'Idioma': 'Language',
  'Cambiar idioma': 'Change language',
  'Cambiar a español': 'Switch to Spanish',
  'Cambiar a inglés': 'Switch to English',
  'Portal de acceso · Papastronomy ID': 'Access portal · Papastronomy ID',
  'Tu propio observatorio espacial, calibrado a tu medida.': 'Your own space observatory, calibrated for you.',
  'Iniciá sesión para sincronizar tus preferencias visuales, tus objetos celestes guardados y el nivel de explicación de tu asistente IA.': 'Sign in to sync your visual preferences, saved celestial objects, and the explanation level of your AI assistant.',
  'Tipo de acceso': 'Access type',
  'Iniciar sesión': 'Sign in',
  'Crear cuenta gratis': 'Create a free account',
  'Correo electrónico': 'Email address',
  'vos@ejemplo.com': 'you@example.com',
  'Contraseña': 'Password',
  '¿La olvidaste?': 'Forgot your password?',
  'Mínimo 8 caracteres': 'At least 8 characters',
  'Ocultar contraseña': 'Hide password',
  'Mostrar contraseña': 'Show password',
  'Recordar mi configuración en este dispositivo': 'Remember my settings on this device',
  'Entrar al Observatorio': 'Enter the Observatory',
  'Crear mi observatorio': 'Create my observatory',
  'El servicio de cuentas todavía no está conectado. Mientras tanto, podés explorar en Modo Invitado.': 'The account service is not connected yet. In the meantime, you can explore in Guest Mode.',
  'o sin cuenta': 'or without an account',
  '¿Primera vez explorando el espacio?': 'Exploring space for the first time?',
  'Empezá ya, sin registrarte. Tus ajustes se guardan en este navegador y podés pasarlos a una cuenta cuando quieras.': 'Get started without signing up. Your settings are saved in this browser, and you can transfer them to an account whenever you like.',
  'Entrar en Modo Invitado (1-Click)': 'Enter Guest Mode (1-Click)',
  'Modo Invitado activo · perfil {profile} guardado en este dispositivo.': 'Guest Mode active · {profile} profile saved on this device.',
  'Curioso / Aprendiz': 'Curious / Learner',
  'Aficionado / Ciencia Ciudadana': 'Enthusiast / Citizen Scientist',
  'Investigador / Avanzado': 'Researcher / Advanced',
  'Calibración guardada en tu perfil': 'Calibration saved in your profile',
  'Elegí cómo querés que Papastronomy te muestre el universo': 'Choose how you want Papastronomy to show you the universe',
  '(podés cambiarlo cuando quieras y se guarda automáticamente):': '(you can change it anytime, and it is saved automatically):',
  'Nivel de experiencia': 'Experience level',
  'Quiero aprender desde cero, sin palabras difíciles.': 'I want to learn from scratch, without complicated terms.',
  'Quiero explorar el cielo y ayudar a descubrir objetos como enanas marrones.': 'I want to explore the sky and help discover objects such as brown dwarfs.',
  'Quiero ver datos FITS crudos, coordenadas WCS y las 102 bandas espectrales.': 'I want to see raw FITS data, WCS coordinates, and all 102 spectral bands.',
  'Campo estelar infrarrojo de SPHEREx con una fuente candidata en el centro': 'SPHEREx infrared star field with a candidate source at the center',
  'Comparador de épocas: la fuente candidata se desplaza entre Epoch 1 y Epoch 3 respecto de estrellas de referencia fijas': 'Epoch comparator: the candidate source moves between Epoch 1 and Epoch 3 relative to fixed reference stars',
  'Mapa FITS en falso color con isofotas sobre la fuente y espectro de 102 canales con pico en 4.4 µm y caída por metano en 3.3 µm': 'False-color FITS map with isophotes over the source and a 102-channel spectrum with a peak at 4.4 µm and a methane absorption dip at 3.3 µm',
  'Vista guiada': 'Guided view',
  'Señal': 'Signal',
  'Calor infrarrojo detectado': 'Infrared heat detected',
  'Guía paso a paso': 'Step-by-step guide',
  'Activa': 'On',
  'Vocabulario': 'Vocabulary',
  'Simple': 'Simple',
  'Explicación amigable': 'Friendly explanation',
  '¡Hola! Esta mancha brillante es una candidata a enana marrón: un objeto más grande que Júpiter pero que no llegó a encenderse como el Sol.': 'Hi! This bright patch is a brown dwarf candidate: an object larger than Jupiter that never ignited like the Sun.',
  'Comparador de épocas': 'Epoch comparator',
  'Comparar': 'Compare',
  'Desplazamiento': 'Displacement',
  '0.42″ / 6 meses': '0.42″ / 6 months',
  'Tooltips guiados': 'Guided tooltips',
  'Activos': 'On',
  'Modo verificación': 'Verification mode',
  'Alterná entre Epoch 1 y Epoch 3: si el punto se corre respecto de las estrellas de fondo, tiene movimiento propio. Marcalo y lo sumamos a la revisión comunitaria.': 'Switch between Epoch 1 and Epoch 3: if the point moves relative to the background stars, it has proper motion. Mark it so we can add it to the community review.',
  'Telemetría FITS': 'FITS telemetry',
  'Banda': 'Band',
  'Coordenadas': 'Coordinates',
  'Canales': 'Channels',
  'Análisis espectral': 'Spectral analysis',
  'Espectro de 102 canales: el flujo sube en 4.4 µm y cae en 3.3 µm. Esa caída es la huella del metano (CH₄), que solo sobrevive en atmósferas frías. Color [3.3]−[4.4] ≈ 1.8 mag → T ≤ 900 K, unas 6 veces más fría que el Sol: probable enana marrón tipo T tardío. SNR 14.2: detección sólida, no es ruido.': '102-channel spectrum: flux rises at 4.4 µm and dips at 3.3 µm. That dip is the signature of methane (CH₄), which only survives in cold atmospheres. Color [3.3]−[4.4] ≈ 1.8 mag → T ≤ 900 K, about 6 times cooler than the Sun: likely a late T-type brown dwarf. SNR 14.2: a solid detection, not noise.',
  'μ ≈ 0.84″/año · PA 45°': 'μ ≈ 0.84″/year · PA 45°',
  'SED · 102 canales': 'SED · 102 channels',
  'Copiloto IA': 'AI Copilot',
  'Ajustes del Telescopio': 'Telescope Settings',
  'Bandas infrarrojas, filtros de color, contraste y grillas activas.': 'Infrared bands, color filters, contrast, and active grids.',
  'Bitácora de Descubrimientos': 'Discovery Log',
  'Tus coordenadas marcadas y capturas para volver a ellas en cualquier momento.': 'Your bookmarked coordinates and snapshots, ready to revisit anytime.',
  'Nivel del Copiloto IA': 'AI Copilot Level',
  'El asistente recuerda qué temas te interesan y adapta sus explicaciones a tu ritmo.': 'The assistant remembers your interests and adapts its explanations to your pace.',
  'Qué se guarda automáticamente en tu cuenta': 'What is automatically saved in your account',
}

function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}

function getClientLocale(): Locale {
  if (historyLocale) return historyLocale
  const requested = new URLSearchParams(window.location.search).get('lang')
  if (isLocale(requested)) return requested
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) memoryLocale = saved
  } catch {
    // Language selection remains available when browser storage is blocked.
  }
  return memoryLocale
}

function subscribeLocale(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(EVENT_NAME, onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(EVENT_NAME, onChange)
    window.removeEventListener('popstate', onChange)
  }
}

type LanguageContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (source: string, values?: Record<string, string | number>) => string
  withLanguage: (href: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getClientLocale, () => 'es' as const)
  const t = useCallback((source: string, values: Record<string, string | number> = {}) => {
    const text = locale === 'en' ? english[source] ?? source : source
    return text.replace(/\{(\w+)\}/g, (match, key: string) =>
      Object.hasOwn(values, key) ? String(values[key]) : match,
    )
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return
    memoryLocale = next
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* Optional storage. */ }
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('lang', next)
      window.history.replaceState(window.history.state, '', url)
      historyLocale = null
    } catch { historyLocale = next /* Keep the selected language when the URL cannot change. */ }
    window.dispatchEvent(new Event(EVENT_NAME))
  }, [])

  const withLanguage = useCallback((href: string) => {
    const hashIndex = href.indexOf('#')
    const hash = hashIndex < 0 ? '' : href.slice(hashIndex)
    const target = hashIndex < 0 ? href : href.slice(0, hashIndex)
    const queryIndex = target.indexOf('?')
    const path = queryIndex < 0 ? target : target.slice(0, queryIndex)
    const query = new URLSearchParams(queryIndex < 0 ? '' : target.slice(queryIndex + 1))
    query.set('lang', locale)
    return `${path}?${query.toString()}${hash}`
  }, [locale])

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = t('Acceso · Papastronomy')
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('Iniciá sesión en Papastronomy para guardar tu calibración del telescopio, tus coordenadas favoritas y el nivel de tu copiloto IA. Datos de SPHEREx para todos.'))
  }, [locale, t])

  return <LanguageContext.Provider value={{ locale, setLocale, t, withLanguage }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('LanguageProvider is required')
  return context
}
