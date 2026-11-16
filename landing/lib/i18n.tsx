"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Locale = "en" | "es";

const STORAGE_KEY = "papastronomy-lang";
const EVENT_NAME = "papastronomy-lang-change";

let memoryLocale: Locale = "en";
let historyLocale: Locale | null = null;

function subscribeLocale(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT_NAME, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT_NAME, onChange);
  };
}

function getClientLocale(): Locale {
  if (historyLocale) return historyLocale;
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (requested === "en" || requested === "es") { memoryLocale = requested; return requested; }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") {
      memoryLocale = saved;
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return memoryLocale;
}

function getServerLocale(): Locale {
  return "en";
}

export const translations = {
  en: {
    pageTitle: "Papastronomy — Exploring SPHEREx observations · NASA Space Apps 2026",
    header: {
      homeAria: "Papastronomy home",
      navAria: "Primary",
      nav: {
        science: "Science",
        platform: "Platform",
        process: "Process",
        explore: "Explore",
        technology: "Technology",
      },
      learn3d: "Learn in 3D",
      opensNewTab: " (opens in a new tab)",
      switchLangAria: "Cambiar idioma a español",
      switchLangTitle: "Cambiar a Español",
    },
    hero: {
      eyebrow: "NASA Space Apps Challenge 2026",
      title: "Exploring the unseen across the infrared sky.",
      description:
        "An interactive platform that turns SPHEREx observations into a clear workspace for finding cold, variable, or moving objects.",
      primaryCta: "Explore Papastronomy",
      secondaryCta: "About the challenge",
      badge: "Powered by SPHEREx data",
      telemetry: [
        { label: "Spectral range", value: "0.75 – 5.00 µm" },
        { label: "Channels", value: "102 bands" },
        { label: "Coverage", value: "All-sky survey" },
        { label: "Format", value: "FITS · WCS" },
      ],
      scrollAria: "Scroll to the scientific challenge",
      scrollLabel: "Scroll",
    },
    challenge: {
      imageAlt: "Infrared visualization of a cold substellar body in the outer reaches of the Solar System",
      captionLeft: "Infrared · cold substellar body",
      captionRight: "Visual concept",
      eyebrow: "The scientific challenge",
      title: "Finding objects that hide from visible light.",
      description:
        "Cold or distant bodies — such as brown dwarfs, trans-Neptunian objects, or a hypothetical Planet X — emit almost no visible light, yet leave a thermal signature and motion across SPHEREx surveys.",
      points: [
        {
          title: "One object, 102 bands",
          body: "Examining the same sky region across infrared wavelengths reveals thermal and molecular signatures invisible in a single band.",
        },
        {
          title: "Motion emerges between epochs",
          body: "Comparing observations captured on different dates separates sources that moved across the sky from stars that changed in brightness.",
        },
        {
          title: "Complex data, direct reading",
          body: "Calibrating raw FITS cutouts, WCS projections and quality masks is demanding; the platform handles it in seconds.",
        },
        {
          title: "From coordinate to candidate",
          body: "A streamlined workflow to go from any sky position directly to spectral and multi-epoch inspection.",
        },
      ],
    },
    showcase: {
      eyebrow: "The platform",
      title: "Every analysis tool in a single view.",
      description:
        "Calibrated FITS imagery, sky coordinates, 102-channel spectra, and multi-epoch comparisons brought together in one workspace.",
      mockupAria:
        "Preview of the Papastronomy Explorer interface showing an infrared sky field with source markers, a FITS header panel, a spectrum chart and an epoch timeline.",
      sampleData: "3-Band IR · WCS",
      targetPanel: "Target",
      frameLabel: "Frame",
      observationsPanel: "Observations",
      projection: "TAN projection",
      fitsHeaderPanel: "FITS header",
      spectrumPanel: "Spectrum · S-02",
      analysisPanel: "Analysis",
      candidates: "Candidates",
      difference: "Difference",
      status: "Status",
      forReview: "Dipole >4σ",
      epochCount: "Epoch 3 / 6",
      previewCaption: "Exploration interface preview",
      features: [
        {
          title: "Native FITS reading",
          body: "Reads headers, physical units (MJy/sr), variance maps, and quality masks without losing astronomical context.",
        },
        {
          title: "WCS coordinate alignment",
          body: "Every pixel maps to exact sky coordinates to cross-match catalogs and align multi-date images accurately.",
        },
        {
          title: "102-channel spectra",
          body: "Extracts the infrared spectral curve at any point to estimate temperature and identify molecular bands.",
        },
        {
          title: "Multi-epoch comparison",
          body: "Blinks and subtracts observations from different dates to highlight motion and flux variations.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "Four steps to explore any patch of sky.",
      description:
        "From coordinate search to spotting motion or brightness changes across epochs.",
      steps: [
        {
          n: "01",
          title: "Query",
          body: "Enter any sky coordinates or select one of the reference SPHEREx targets.",
        },
        {
          n: "02",
          title: "Align",
          body: "The tool retrieves FITS cutouts from NASA/IRSA and reprojects them onto a common sky grid.",
        },
        {
          n: "03",
          title: "Inspect",
          body: "Browse all 102 infrared bands, false-color RGB composites, and the source's spectral profile.",
        },
        {
          n: "04",
          title: "Compare",
          body: "Contrast different epochs using blink comparison, calibrated subtraction, and historical timelines.",
        },
      ],
    },
    explore: {
      eyebrow: "Interactive preview",
      title: "See how a source behaves over time.",
      description:
        "Move across the sky field, switch infrared wavelengths, and step through epochs to track a moving candidate.",
      badge: "Interactive simulator",
      epochPrefix: "Epoch",
      fieldAria: (epochLabel: string, lambda: string) =>
        `Interactive celestial field. Highlighted source shown at ${epochLabel}, observed at ${lambda} micrometres.`,
      candidatePrefix: "Candidate",
      cursorLabel: "Cursor",
      sourceLabel: "Source",
      spectralProfile: "Spectral profile",
      channelsCaption: "102 infrared channels (0.75 – 5.00 µm)",
      wavelengthGroupAria: "Wavelength band",
      observationEpochs: "Observation epochs",
      pauseAria: "Pause epoch playback",
      playAria: "Play epoch playback",
      epochGroupAria: "Observation epoch",
      viewingPrefix: "Viewing",
      viewingSuffix:
        ". Comparing positions across epochs reveals apparent motion against the fixed background stars.",
    },
    techStack: {
      eyebrow: "Science and engineering",
      title: "Built on real astronomical standards.",
      description:
        "Papastronomy combines scientific data processing, multi-mission catalog cross-matching, backend engineering and interactive visualization — each layer chosen for rigor and transparency.",
      layers: {
        Science: "Science",
        Backend: "Backend",
        Interface: "Interface",
      },
      items: [
        {
          name: "NASA SPHEREx (DR1 + QR3)",
          tag: "Mission data",
          layer: "Science" as const,
          body: "All-sky infrared spectral survey across 102 channels (0.75–5.00 µm) queried directly via NASA/IPAC IRSA SIA and TAP.",
          wide: true,
        },
        {
          name: "Gaia DR3 · AllWISE · CDS",
          tag: "Catalogs & surveys",
          layer: "Science" as const,
          body: "Multi-mission cross-matching and sky backgrounds with ESA Gaia DR3 proper motions, AllWISE, 2MASS, DSS2 (hips2fits) and SIMBAD.",
        },
        {
          name: "FITS",
          tag: "Data format",
          layer: "Science" as const,
          body: "Standard astronomical container preserving image cutouts, VARIANCE uncertainty maps and 32-bit FLAGS contamination masks.",
        },
        {
          name: "WCS & WCS-WAVE",
          tag: "Coordinates",
          layer: "Science" as const,
          body: "Gnomonic TAN sky projection and 2D spectral coordinate evaluation across Linear Variable Filters (D1–D6).",
        },
        {
          name: "Astropy · Reproject",
          tag: "Astronomy",
          layer: "Backend" as const,
          body: "Core library for FITS I/O, celestial coordinate frames, WCS reprojection and aperture photometry.",
        },
        {
          name: "NumPy / SciPy",
          tag: "Numerics",
          layer: "Backend" as const,
          body: "PSF Gaussian matching, differential photometry (ΔI), Planck blackbody fitting (Teff) and >4σ dipole/monopole detection.",
        },
        {
          name: "Python",
          tag: "Pipeline",
          layer: "Backend" as const,
          body: "Scientific processing pipeline for multi-epoch calibration, historical timelines and astrometric parallax/motion estimation.",
        },
        {
          name: "FastAPI",
          tag: "API",
          layer: "Backend" as const,
          body: "Typed, fast HTTP layer serving processed observations, detector coadds, spectra and catalog overlays.",
        },
        {
          name: "Plotly.js · WebGL",
          tag: "Instruments",
          layer: "Interface" as const,
          body: "Interactive 102-band spectral curves with molecular bands (H₂O, CH₄, CO) and 3D educational shaders.",
        },
        {
          name: "JavaScript",
          tag: "Visualization",
          layer: "Interface" as const,
          body: "In-browser rendering of 60 FPS Float32Array optics, 3-band infrared RGB composites, Shift & Stack and epoch comparisons.",
          wide: true,
        },
      ],
    },
    finalCta: {
      eyebrow: "NASA Space Apps Challenge 2026",
      title: "Start exploring SPHEREx observations.",
      description:
        "Launch the tool to inspect real FITS cutouts, infrared spectra, and multi-epoch comparisons.",
      button: "Explore Papastronomy",
      disclaimer:
        "A team project created for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA.",
    },
    footer: {
      description:
        "An exploratory platform for SPHEREx observations — processing FITS data, analyzing spectra across 102 infrared bands and comparing epochs to identify candidates for further scientific analysis.",
      navAria: "Footer",
      linksHeading: "Links",
      links: {
        github: "GitHub",
        application: "Application",
        challenge: "Space Apps Challenge",
      },
      creditsHeading: "Credits & Data",
      teamLine: 'Team Papastronomy · NASA Space Apps Challenge 2026 — Challenge: "Planet X and SPHEREx"',
      dataCourtesy:
        "Observational data courtesy of NASA SPHEREx (JPL / Caltech · NASA) via NASA/IPAC IRSA (DR1 DOI: 10.26131/IRSA678 · QR3 DOI: 10.26131/IRSA662), complemented by ESA Gaia DR3, AllWISE, 2MASS and DSS2 via CDS Strasbourg.",
      missionAck:
        "SPHEREx is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, funded by NASA.",
      disclaimer: "Not affiliated with or endorsed by NASA",
    },
  },
  es: {
    pageTitle: "Papastronomy — Explorando observaciones de SPHEREx · NASA Space Apps 2026",
    header: {
      homeAria: "Inicio de Papastronomy",
      navAria: "Principal",
      nav: {
        science: "Ciencia",
        platform: "Plataforma",
        process: "Proceso",
        explore: "Explorar",
        technology: "Tecnología",
      },
      learn3d: "Aprendé en 3D",
      opensNewTab: " (abre en otra pestaña)",
      switchLangAria: "Switch language to English",
      switchLangTitle: "Switch to English",
    },
    hero: {
      eyebrow: "NASA Space Apps Challenge 2026",
      title: "Explorando lo invisible en el cielo infrarrojo.",
      description:
        "Una plataforma interactiva que transforma las observaciones de SPHEREx en un entorno claro para detectar objetos fríos, variables o en movimiento.",
      primaryCta: "Explorar Papastronomy",
      secondaryCta: "Conocer el desafío",
      badge: "Impulsado por datos de SPHEREx",
      telemetry: [
        { label: "Rango espectral", value: "0.75 – 5.00 µm" },
        { label: "Canales", value: "102 bandas" },
        { label: "Cobertura", value: "Relevamiento total" },
        { label: "Formato", value: "FITS · WCS" },
      ],
      scrollAria: "Desplazarse al desafío científico",
      scrollLabel: "Desplazar",
    },
    challenge: {
      imageAlt: "Visualización infrarroja de un cuerpo subestelar frío en los confines del Sistema Solar",
      captionLeft: "Infrarrojo · cuerpo subestelar frío",
      captionRight: "Recreación visual",
      eyebrow: "El desafío científico",
      title: "Buscar objetos que no brillan a simple vista.",
      description:
        "Cuerpos fríos o lejanos —como enanas marrones, objetos transneptunianos o un hipotético Planeta X— apenas emiten luz visible, pero dejan su huella térmica y su movimiento entre las observaciones de SPHEREx.",
      points: [
        {
          title: "Un mismo objeto, 102 bandas",
          body: "Al observar una región en distintas longitudes de onda infrarrojas aparecen firmas térmicas y moleculares invisibles en una sola imagen.",
        },
        {
          title: "El movimiento aparece entre épocas",
          body: "Comparar observaciones tomadas en distintas fechas permite distinguir si una fuente se desplazó en el cielo o varió su brillo.",
        },
        {
          title: "Datos complejos, lectura directa",
          body: "Procesar recortes FITS crudos, coordenadas WCS y calibraciones suele ser complejo; la plataforma lo resuelve en segundos.",
        },
        {
          title: "De la coordenada al candidato",
          body: "Un flujo pensado para pasar rápidamente de una posición en el cielo a la inspección espectral y temporal del objeto.",
        },
      ],
    },
    showcase: {
      eyebrow: "La plataforma",
      title: "Todo el análisis en una sola pantalla.",
      description:
        "Imágenes FITS calibradas, coordenadas celestes, espectros de 102 canales y comparación temporal reunidos en un mismo entorno.",
      mockupAria:
        "Vista previa de la interfaz del explorador Papastronomy mostrando un campo infrarrojo con marcadores de fuentes, cabecera FITS, gráfico espectral y línea de tiempo de épocas.",
      sampleData: "IR 3 Bandas · WCS",
      targetPanel: "Objetivo",
      frameLabel: "Marco",
      observationsPanel: "Observaciones",
      projection: "Proyección TAN",
      fitsHeaderPanel: "Cabecera FITS",
      spectrumPanel: "Espectro · S-02",
      analysisPanel: "Análisis",
      candidates: "Candidatos",
      difference: "Diferencia",
      status: "Estado",
      forReview: "Dipolo >4σ",
      epochCount: "Época 3 / 6",
      previewCaption: "Vista previa de la interfaz de exploración",
      features: [
        {
          title: "Lectura nativa de FITS",
          body: "Interpreta cabeceras, unidades físicas (MJy/sr), mapas de varianza y máscaras de calidad sin perder contexto astronómico.",
        },
        {
          title: "Alineación por coordenadas WCS",
          body: "Cada píxel conserva su posición exacta en el cielo para cruzar catálogos y comparar imágenes con precisión.",
        },
        {
          title: "Espectro en 102 canales",
          body: "Extrae la curva espectral infrarroja de cualquier punto para estimar su temperatura y detectar bandas moleculares.",
        },
        {
          title: "Comparación entre épocas",
          body: "Alterna y resta observaciones de distintas fechas para resaltar desplazamientos y cambios de flujo.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "Cómo funciona",
      title: "Cuatro pasos para explorar una región del cielo.",
      description:
        "Desde la búsqueda por coordenadas hasta la detección de movimiento o variabilidad entre épocas.",
      steps: [
        {
          n: "01",
          title: "Consultar",
          body: "Ingresá cualquier coordenada celeste o elegí uno de los objetivos de referencia de SPHEREx.",
        },
        {
          n: "02",
          title: "Alinear",
          body: "La herramienta recupera los recortes FITS de NASA/IRSA y los proyecta sobre una grilla común.",
        },
        {
          n: "03",
          title: "Inspeccionar",
          body: "Recorré las 102 bandas infrarrojas, el falso color RGB y el espectro del objeto seleccionado.",
        },
        {
          n: "04",
          title: "Comparar",
          body: "Contrastá distintas épocas mediante parpadeo (blink), resta calibrada y línea histórica.",
        },
      ],
    },
    explore: {
      eyebrow: "Demostración interactiva",
      title: "Probá cómo se comporta una fuente en el tiempo.",
      description:
        "Mové el cursor por el campo celeste, cambiá la longitud de onda infrarroja y avanzá entre épocas para seguir el desplazamiento de un candidato.",
      badge: "Simulador interactivo",
      epochPrefix: "Época",
      fieldAria: (epochLabel: string, lambda: string) =>
        `Campo celeste interactivo. Fuente destacada en ${epochLabel}, observada a ${lambda} micrómetros.`,
      candidatePrefix: "Candidato",
      cursorLabel: "Cursor",
      sourceLabel: "Fuente",
      spectralProfile: "Perfil espectral",
      channelsCaption: "102 canales infrarrojos (0.75 – 5.00 µm)",
      wavelengthGroupAria: "Banda de longitud de onda",
      observationEpochs: "Épocas de observación",
      pauseAria: "Pausar reproducción de épocas",
      playAria: "Iniciar reproducción de épocas",
      epochGroupAria: "Época de observación",
      viewingPrefix: "Mostrando",
      viewingSuffix:
        ". Al comparar la posición entre épocas se distingue el desplazamiento aparente sobre el fondo de estrellas fijas.",
    },
    techStack: {
      eyebrow: "Ciencia e ingeniería",
      title: "Construido sobre estándares astronómicos reales.",
      description:
        "Papastronomy combina procesamiento de datos científicos, cruce de catálogos multi-misión, ingeniería de backend y visualización interactiva, con cada capa elegida por su rigor y transparencia.",
      layers: {
        Science: "Ciencia",
        Backend: "Backend",
        Interface: "Interfaz",
      },
      items: [
        {
          name: "NASA SPHEREx (DR1 + QR3)",
          tag: "Datos de misión",
          layer: "Science" as const,
          body: "Relevamiento espectral infrarrojo de todo el cielo en 102 canales (0.75–5.00 µm) consultado en vivo vía NASA/IPAC IRSA SIA y TAP.",
          wide: true,
        },
        {
          name: "Gaia DR3 · AllWISE · CDS",
          tag: "Catálogos y relevamientos",
          layer: "Science" as const,
          body: "Cruce multi-misión y fondos celestes con movimientos propios de ESA Gaia DR3, AllWISE, 2MASS, DSS2 (hips2fits) y SIMBAD.",
        },
        {
          name: "FITS",
          tag: "Formato de datos",
          layer: "Science" as const,
          body: "Contenedor astronómico estándar que preserva recortes de imagen, mapas de incertidumbre VARIANCE y máscaras FLAGS de 32 bits.",
        },
        {
          name: "WCS y WCS-WAVE",
          tag: "Coordenadas",
          layer: "Science" as const,
          body: "Proyección celeste gnomónica TAN y evaluación espectral 2D sobre los Filtros Lineales Variables (detectores D1–D6).",
        },
        {
          name: "Astropy · Reproject",
          tag: "Astronomía",
          layer: "Backend" as const,
          body: "Biblioteca central para lectura/escritura FITS, marcos de coordenadas celestes, reproyección WCS y fotometría de apertura.",
        },
        {
          name: "NumPy / SciPy",
          tag: "Cálculo numérico",
          layer: "Backend" as const,
          body: "Igualación gaussiana de PSF, fotometría diferencial (ΔI), ajuste de cuerpo negro de Planck (Teff) y detección >4σ de dipolos/monopolos.",
        },
        {
          name: "Python",
          tag: "Pipeline",
          layer: "Backend" as const,
          body: "Pipeline científico para calibración multiépoca, línea histórica y estimación astrométrica de paralaje y movimiento propio.",
        },
        {
          name: "FastAPI",
          tag: "API",
          layer: "Backend" as const,
          body: "Capa HTTP rápida y tipada que sirve observaciones procesadas, apilados por detector, espectros y catálogos.",
        },
        {
          name: "Plotly.js · WebGL",
          tag: "Instrumentos",
          layer: "Interface" as const,
          body: "Curvas espectrales interactivas de 102 bandas con detección molecular (H₂O, CH₄, CO) y shaders educativos en 3D.",
        },
        {
          name: "JavaScript",
          tag: "Visualización",
          layer: "Interface" as const,
          body: "Renderizado en el navegador a 60 FPS sobre Float32Array, compuesto infrarrojo RGB de 3 bandas, Shift & Stack y comparación de épocas.",
          wide: true,
        },
      ],
    },
    finalCta: {
      eyebrow: "NASA Space Apps Challenge 2026",
      title: "Empezá a explorar las observaciones de SPHEREx.",
      description:
        "Ingresá a la herramienta para inspeccionar recortes FITS reales, espectros infrarrojos y comparaciones temporales.",
      button: "Explorar Papastronomy",
      disclaimer:
        "Un proyecto en equipo creado para el NASA Space Apps Challenge 2026. No afiliado ni respaldado por la NASA.",
    },
    footer: {
      description:
        "Una plataforma exploratoria para observaciones de SPHEREx: procesa datos FITS, analiza espectros en 102 bandas infrarrojas y compara épocas para identificar candidatos para análisis científico adicional.",
      navAria: "Pie de página",
      linksHeading: "Enlaces",
      links: {
        github: "GitHub",
        application: "Aplicación",
        challenge: "Space Apps Challenge",
      },
      creditsHeading: "Créditos y datos",
      teamLine: 'Equipo Papastronomy · NASA Space Apps Challenge 2026 — Desafío: "Planet X and SPHEREx"',
      dataCourtesy:
        "Datos observacionales cortesía de NASA SPHEREx (JPL / Caltech · NASA) vía NASA/IPAC IRSA (DR1 DOI: 10.26131/IRSA678 · QR3 DOI: 10.26131/IRSA662), complementados con ESA Gaia DR3, AllWISE, 2MASS y DSS2 vía CDS Estrasburgo.",
      missionAck:
        "SPHEREx es un proyecto conjunto del Jet Propulsion Laboratory y el California Institute of Technology, financiado por la NASA.",
      disclaimer: "No afiliado ni respaldado por la NASA",
    },
  },
} as const;

type Translations = (typeof translations)[Locale];

type LanguageContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: Translations;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getClientLocale, getServerLocale);

  const setLocale = useCallback((next: Locale) => {
    memoryLocale = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
    try { const url = new URL(window.location.href); url.searchParams.set("lang", next); window.history.replaceState(window.history.state, "", url); historyLocale = null; } catch { historyLocale = next; /* Keep the selected language when the URL cannot change. */ }
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "es" : "en");
  }, [locale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translations[locale].pageTitle;
  }, [locale]);

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        toggleLocale,
        t: translations[locale],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

export function withLanguage(href: string, locale: Locale): string {
  const url = new URL(href);
  url.searchParams.set("lang", locale);
  return url.href;
}
