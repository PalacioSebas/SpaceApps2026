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

function subscribeLocale(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT_NAME, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT_NAME, onChange);
  };
}

function getClientLocale(): Locale {
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
      title: "Exploring the universe, one observation at a time.",
      description:
        "An astronomical exploration platform that transforms SPHEREx observations into new opportunities for scientific discovery.",
      primaryCta: "Explore Papastronomy",
      secondaryCta: "Discover the science",
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
      imageAlt: "Infrared view of towering columns of interstellar gas and dust scattered with stars",
      captionLeft: "Infrared · star-forming region",
      captionRight: "Illustrative",
      eyebrow: "The scientific challenge",
      title: "The universe holds questions we have yet to answer.",
      description:
        "Faint, cold or distant objects — including any hypothetical body in the outer Solar System — may hide in plain sight within survey data. Finding them requires looking at the sky in new ways.",
      points: [
        {
          title: "Many wavelengths, one object",
          body: "Some phenomena only reveal themselves when the same region of sky is examined across different infrared wavelengths.",
        },
        {
          title: "Change lives between images",
          body: "Comparing observations taken at different times can expose motion or brightness changes that no single image can show.",
        },
        {
          title: "Data is hard to reach",
          body: "Accessing, calibrating and interpreting raw astronomical data is rarely straightforward, even for experienced researchers.",
        },
        {
          title: "A systematic way in",
          body: "Papastronomy aims to make this exploration more accessible, repeatable and systematic — from query to candidate.",
        },
      ],
    },
    showcase: {
      eyebrow: "Introducing Papastronomy",
      title: "From raw observations to scientific insight.",
      description:
        "A focused research interface that brings FITS images, sky coordinates, spectra and multi-epoch comparisons into a single, coherent view.",
      mockupAria:
        "Illustration of the Papastronomy Explorer interface showing a sky image with source markers, a FITS header panel, a spectrum chart and an epoch timeline. All values are placeholders.",
      sampleData: "Sample data",
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
      forReview: "For review",
      epochCount: "Epoch 3 / 6",
      previewCaption: "Interface preview · values shown are illustrative placeholders",
      features: [
        {
          title: "FITS-native",
          body: "Reads observation headers, units and masks without discarding astronomical context.",
        },
        {
          title: "WCS-aware",
          body: "Every pixel maps to sky coordinates, so sources stay anchored across images.",
        },
        {
          title: "Spectral view",
          body: "Inspect how a source behaves across SPHEREx's infrared channels.",
        },
        {
          title: "Epoch comparison",
          body: "Blink and difference observations to look for change over time.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "How it works",
      title: "A journey through astronomical data.",
      description:
        "Four deliberate stages turn a sky coordinate into a well-documented candidate worth a closer look.",
      steps: [
        {
          n: "01",
          title: "Observe",
          body: "Retrieve astronomical observations from SPHEREx.",
        },
        {
          n: "02",
          title: "Process",
          body: "Inspect and process FITS data while preserving relevant astronomical information.",
        },
        {
          n: "03",
          title: "Analyze",
          body: "Explore wavelengths, sources, and potential anomalies.",
        },
        {
          n: "04",
          title: "Compare",
          body: "Investigate observations across different epochs to identify changes and interesting candidates.",
        },
      ],
    },
    explore: {
      eyebrow: "Explore the universe",
      title: "Step inside the observatory.",
      description:
        "Move across the field, switch wavelengths and scrub through epochs. This demonstration uses synthetic placeholder values to show how exploration feels inside Papastronomy.",
      badge: "Interactive demo · simulated data",
      epochPrefix: "Epoch",
      fieldAria: (epochLabel: string, lambda: string) =>
        `Simulated celestial field. Highlighted source shown at ${epochLabel}, observed at ${lambda} micrometres.`,
      candidatePrefix: "Candidate",
      cursorLabel: "Cursor",
      sourceLabel: "Source",
      spectralProfile: "Spectral profile",
      channelsCaption: "102 channels · illustrative flux",
      wavelengthGroupAria: "Wavelength band",
      observationEpochs: "Observation epochs",
      pauseAria: "Pause epoch playback",
      playAria: "Play epoch playback",
      epochGroupAria: "Observation epoch",
      viewingPrefix: "Viewing",
      viewingSuffix:
        ". Comparing positions across epochs helps flag sources whose apparent position or brightness changes — candidates for further analysis, not confirmed detections.",
    },
    techStack: {
      eyebrow: "Built with real science and technology",
      title: "Where astronomy meets engineering.",
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
      title: "The next discovery begins with a question.",
      description: "Explore the data. Investigate the unknown. Look beyond what we already know.",
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
        "SPHEREx is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, funded by NASA. Imagery on this landing page is illustrative.",
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
      title: "Explorando el universo, una observación a la vez.",
      description:
        "Una plataforma de exploración astronómica que transforma las observaciones de SPHEREx en nuevas oportunidades para el descubrimiento científico.",
      primaryCta: "Explorar Papastronomy",
      secondaryCta: "Descubrir la ciencia",
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
      imageAlt: "Vista infrarroja de imponentes columnas de gas y polvo interestelar salpicadas de estrellas",
      captionLeft: "Infrarrojo · región de formación estelar",
      captionRight: "Ilustrativo",
      eyebrow: "El desafío científico",
      title: "El universo guarda preguntas que aún debemos responder.",
      description:
        "Objetos débiles, fríos o distantes —incluido cualquier cuerpo hipotético en el sistema solar exterior— pueden ocultarse a simple vista dentro de los datos de relevamiento. Encontrarlos requiere observar el cielo de nuevas maneras.",
      points: [
        {
          title: "Múltiples longitudes de onda, un objeto",
          body: "Algunos fenómenos solo se revelan cuando la misma región del cielo se examina en diferentes longitudes de onda infrarrojas.",
        },
        {
          title: "El cambio habita entre imágenes",
          body: "Comparar observaciones tomadas en distintos momentos permite exponer movimientos o variaciones de brillo que ninguna imagen individual puede mostrar.",
        },
        {
          title: "Datos difíciles de alcanzar",
          body: "Acceder, calibrar e interpretar datos astronómicos crudos rara vez es sencillo, incluso para investigadores experimentados.",
        },
        {
          title: "Un camino sistemático",
          body: "Papastronomy busca hacer esta exploración más accesible, repetible y sistemática: desde la consulta hasta el candidato.",
        },
      ],
    },
    showcase: {
      eyebrow: "Presentando Papastronomy",
      title: "De observaciones crudas al conocimiento científico.",
      description:
        "Una interfaz de investigación enfocada que reúne imágenes FITS, coordenadas celestes, espectros y comparaciones multiépoca en una vista única y coherente.",
      mockupAria:
        "Ilustración de la interfaz del explorador Papastronomy que muestra una imagen del cielo con marcadores de fuentes, un panel de cabecera FITS, un gráfico espectral y una línea de tiempo de épocas. Todos los valores son ilustrativos.",
      sampleData: "Datos de muestra",
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
      forReview: "En revisión",
      epochCount: "Época 3 / 6",
      previewCaption: "Vista previa de la interfaz · los valores mostrados son marcadores ilustrativos",
      features: [
        {
          title: "Nativo en FITS",
          body: "Lee cabeceras de observación, unidades y máscaras sin descartar el contexto astronómico.",
        },
        {
          title: "Alineado con WCS",
          body: "Cada píxel se proyecta en coordenadas celestes, manteniendo las fuentes ancladas entre imágenes.",
        },
        {
          title: "Vista espectral",
          body: "Inspecciona cómo se comporta una fuente a través de los canales infrarrojos de SPHEREx.",
        },
        {
          title: "Comparación de épocas",
          body: "Alterna y resta observaciones para detectar cambios a lo largo del tiempo.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "Cómo funciona",
      title: "Un recorrido por los datos astronómicos.",
      description:
        "Cuatro etapas definidas convierten una coordenada celeste en un candidato bien documentado que merece un análisis más profundo.",
      steps: [
        {
          n: "01",
          title: "Observar",
          body: "Recupera observaciones astronómicas de SPHEREx.",
        },
        {
          n: "02",
          title: "Procesar",
          body: "Inspecciona y procesa datos FITS preservando la información astronómica relevante.",
        },
        {
          n: "03",
          title: "Analizar",
          body: "Explora longitudes de onda, fuentes y posibles anomalías.",
        },
        {
          n: "04",
          title: "Comparar",
          body: "Investiga observaciones en distintas épocas para identificar cambios y candidatos de interés.",
        },
      ],
    },
    explore: {
      eyebrow: "Explora el universo",
      title: "Adéntrate en el observatorio.",
      description:
        "Desplázate por el campo, cambia de longitud de onda y recorre las épocas. Esta demostración utiliza valores sintéticos ilustrativos para mostrar cómo se siente explorar dentro de Papastronomy.",
      badge: "Demo interactiva · datos simulados",
      epochPrefix: "Época",
      fieldAria: (epochLabel: string, lambda: string) =>
        `Campo celeste simulado. Fuente destacada en ${epochLabel}, observada a ${lambda} micrómetros.`,
      candidatePrefix: "Candidato",
      cursorLabel: "Cursor",
      sourceLabel: "Fuente",
      spectralProfile: "Perfil espectral",
      channelsCaption: "102 canales · flujo ilustrativo",
      wavelengthGroupAria: "Banda de longitud de onda",
      observationEpochs: "Épocas de observación",
      pauseAria: "Pausar reproducción de épocas",
      playAria: "Iniciar reproducción de épocas",
      epochGroupAria: "Época de observación",
      viewingPrefix: "Viendo",
      viewingSuffix:
        ". Comparar posiciones entre épocas ayuda a señalar fuentes cuya posición aparente o brillo cambia: candidatos para análisis adicional, no detecciones confirmadas.",
    },
    techStack: {
      eyebrow: "Construido con ciencia y tecnología real",
      title: "Donde la astronomía se une con la ingeniería.",
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
      title: "El próximo descubrimiento comienza con una pregunta.",
      description: "Explora los datos. Investiga lo desconocido. Mira más allá de lo que ya sabemos.",
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
        "SPHEREx es un proyecto conjunto del Jet Propulsion Laboratory y el California Institute of Technology, financiado por la NASA. Las imágenes de esta portada son ilustrativas.",
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
