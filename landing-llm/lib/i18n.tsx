"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { answers, type QuestionId } from "./copilot-data";

export type Locale = "es" | "en";
const STORAGE_KEY = "papastronomy-lang";
const EVENT_NAME = "papastronomy-lang-change";
let memoryLocale: Locale = "es";
let historyLocale: Locale | null = null;
const isLocale = (value: string | null): value is Locale => value === "es" || value === "en";

const english: Record<string, string> = {
  "Papastronomy inicio": "Papastronomy home",
  "Principal": "Main navigation",
  "Cambiar de módulo": "Switch module",
  "Cambiar a español": "Switch to Spanish",
  "Cambiar a inglés": "Switch to English",
  "Observatorio": "Observatory",
  "Cómo funciona": "How it works",
  "Modos": "Modes",
  "Lanzar": "Launch",
  "Abrí el Explorer y preguntale al cielo.": "Open the Explorer and ask the sky.",
  "El copiloto vive al lado de tus datos SPHEREx: seleccioná una región, hacé una pregunta y seguí explorando.": "The copilot lives alongside your SPHEREx data: select a region, ask a question, and keep exploring.",
  "Lanzar el asistente": "Launch the assistant",
  "NASA Space Apps Challenge 2026 · Datos SPHEREx": "NASA Space Apps Challenge 2026 · SPHEREx data",
  "Pie de página": "Footer navigation",
  "Cómo piensa una IA que mira el cielo con vos.": "How an AI thinks when it explores the sky with you.",
  "Lectura del recorte actual": "Reading the current cutout",
  "Extrae coordenadas WCS, metadatos FITS y fotometría multicanal de la región activa.": "Extracts WCS coordinates, FITS metadata, and multichannel photometry from the active region.",
  "102 canales": "102 channels",
  "Razonamiento astrofísico": "Astrophysical reasoning",
  "Cruza curvas espectrales infrarrojas y movimiento entre épocas con literatura astronómica.": "Compares infrared spectral curves and motion between epochs with astronomical literature.",
  "Respuesta adaptada a tu nivel": "An answer adapted to your level",
  "Explica desde conceptos básicos (“¿Qué es una enana marrón?”) hasta anomalías espectrales para investigadores.": "Explains everything from basic concepts (“What is a brown dwarf?”) to spectral anomalies for researchers.",
  "Divulgación": "Outreach",
  "Estudiante": "Student",
  "Investigación": "Research",
  "Dos modos · Una misma conversación": "Two modes · One conversation",
  "De la curiosidad a la telemetría, sin cambiar de herramienta.": "From curiosity to telemetry, in the same tool.",
  "Modo Divulgación / Explorador": "Outreach / Explorer mode",
  "Para preguntas conceptuales.": "For conceptual questions.",
  "Respuestas claras, con analogías y escalas comparativas, pensadas para estudiantes, docentes y cualquier persona curiosa.": "Clear answers, with analogies and comparative scales, for students, teachers, and anyone who is curious.",
  "¿Qué es el corrimiento al rojo?": "What is redshift?",
  "¿Qué busca la misión SPHEREx?": "What is the SPHEREx mission looking for?",
  "¿Este cambio entre Epoch 1 y Epoch 3 es ruido o un candidato real?": "Is this change between Epoch 1 and Epoch 3 noise or a real candidate?",
  "Modo Observatorio · Context-aware": "Observatory mode · Context-aware",
  "Para preguntas sobre los datos en vivo.": "For questions about live data.",
  "El copiloto lee el recorte, el header y el espectro activos, y cita cada valor que usa para que puedas verificarlo.": "The copilot reads the active cutout, header, and spectrum, and cites every value it uses so you can verify it.",
  "Respuesta · Epoch 1 → 3": "Answer · Epoch 1 → 3",
  "El desplazamiento de ": "The displacement of ",
  " supera 4σ el error de centroide y es coherente en los ": " exceeds the centroid error by 4σ and is consistent across the ",
  " canales con señal. Probablemente no es ruido: lo marco como candidato real.": " channels with a signal. It is probably not noise: I flag it as a real candidate.",
  "Un asistente astronómico que entiende el universo y lo que estás observando.": "An astronomical assistant that understands the universe and what you are observing.",
  "Preguntale en lenguaje natural sobre objetos celestes, espectros infrarrojos de SPHEREx (": "Ask in natural language about celestial objects, SPHEREx infrared spectra (",
  ") o la región exacta del cielo que tenés en pantalla.": ") or the exact region of the sky on your screen.",
  "Probar el copiloto": "Try the copilot",
  "Abrir el Observatorio": "Open the Observatory",
  "Probá preguntar": "Try asking",
  "Preguntas de ejemplo": "Example questions",
  " · leyendo S-02": " · reading S-02",
  "Esta pregunta necesita el contexto del observatorio.": "This question needs the observatory context.",
  "Preguntá sobre cualquier objeto o región del cielo…": "Ask about any object or region of the sky…",
  "Contexto activo": "Active context",
  "Recorte infrarrojo SPHEREx del campo estelar alrededor del candidato S-02": "SPHEREx infrared cutout of the star field around candidate S-02",
  "Espectro SPHEREx": "SPHEREx spectrum",
  "Contexto conectado: FITS + WCS + Espectro SPHEREx": "Context connected: FITS + WCS + SPHEREx spectrum",
  "Contexto desconectado · tocá para reconectar": "Context disconnected · select to reconnect",
  "Telemetría citada": "Cited telemetry",
  "Escala de masa relativa · M♃ = masas de Júpiter": "Relative mass scale · M♃ = Jupiter masses",
  "Demo en vivo · Candidato S-02": "Live demo · Candidate S-02",
  "El copiloto lee lo mismo que vos estás mirando.": "The copilot reads the same thing you are looking at.",
  "Espectro infrarrojo del candidato S-02 entre 0.75 y 5.00 micrones, con absorción cerca de 3.3 micrones y pico en 4.4 micrones": "Infrared spectrum of candidate S-02 from 0.75 to 5.00 microns, with absorption near 3.3 microns and a peak at 4.4 microns",
  "Sin el contexto del recorte no puedo leer las coordenadas, el header FITS ni el espectro de esta región. Reconectá el contexto para que analice los datos que tenés en pantalla, o preguntame algo conceptual.": "Without the cutout context, I cannot read this region’s coordinates, FITS header, or spectrum. Reconnect the context so I can analyze the data on your screen, or ask me a conceptual question.",
  "pico 1 – 5 µm": "peak 1 – 5 µm",
  "λ 4.40 µm · alto": "λ 4.40 µm · high",
  "λ 1.10 µm · débil": "λ 1.10 µm · faint",
};

const answerText: Record<QuestionId, {
  question: string; short: string; summary: string;
  verdict?: { label: string; text: string };
  followUps: string[]; comparison?: { name: string; example: string }[]; fits?: string[];
}> = {
  coords: {
    question: "What am I seeing at these coordinates?", short: "What am I seeing?",
    summary: "You are looking at candidate S-02, a faint point source in the active cutout. Its flux rises sharply toward 4.4 µm and almost disappears below 1.5 µm, with a dip near 3.3 µm consistent with methane absorption. Between Epoch 1 and Epoch 3, its centroid shifts by 0.12″, as expected for a nearby object with proper motion.",
    verdict: { label: "Most likely interpretation", text: "A cold brown dwarf (late T type). A high-redshift galaxy is the main alternative; Epoch 4 would help confirm the motion." },
    followUps: ["What is a brown dwarf?", "Why is it bright at 4.4 µm?"],
  },
  "brown-dwarf": {
    question: "What is a brown dwarf and how is it detected?", short: "What is a brown dwarf?",
    summary: "A brown dwarf is an object that formed like a star but did not gather enough mass to sustain hydrogen fusion. It lies between giant planets and the smallest stars: it shines with the heat left over from its formation and slowly cools over billions of years. Since it emits almost all its light in the infrared, missions such as SPHEREx are ideal for finding brown dwarfs.",
    comparison: [{ name: "Star", example: "The Sun" }, { name: "Brown dwarf", example: "Candidate S-02" }, { name: "Planet", example: "Jupiter" }],
    followUps: ["What am I seeing here?", "Why is it bright at 4.4 µm?"],
  },
  wavelength: {
    question: "Why is this source bright at 4.4 µm but not at 1.1 µm?", short: "Why 4.4 µm and not 1.1 µm?",
    summary: "For two reasons that work together. First, temperature: an object at ~650 K emits most strongly near 4.5 µm (Wien’s law), so it produces very little light at 1.1 µm. Second, the atmosphere: methane and water vapor absorb much of the near-infrared light, while the 4 – 5 µm region acts as a window through which internal heat escapes.",
    verdict: { label: "What to rule out", text: "Dust extinction: it would redden the source, but it does not explain the methane dip at 3.3 µm." },
    followUps: ["What is a brown dwarf?", "Explain the FITS header"],
  },
  fits: {
    question: "Explain the FITS header for this observation", short: "Explain the FITS header",
    summary: "The FITS header is the image’s technical record: it tells us where the telescope is pointing, the pixel scale, when the image was taken, and the brightness units. These are the keywords I use to locate candidate S-02 in the sky:",
    fits: ["Gnomonic projection of the sky onto the plane", "Right ascension of the reference pixel (°)", "Declination of the reference pixel (°)", "Pixel size: 6.2 arcseconds", "Central wavelength of the channel (µm)", "Surface-brightness units"],
    followUps: ["What am I seeing here?", "Why is it bright at 4.4 µm?"],
  },
};

// Localize presentation strings while keeping IDs, measurements, and demo logic intact.
for (const answer of answers) {
  const text = answerText[answer.id];
  for (const key of ["question", "short", "summary"] as const) english[answer[key]] = text[key];
  if (answer.verdict && text.verdict) {
    english[answer.verdict.label] = text.verdict.label;
    english[answer.verdict.text] = text.verdict.text;
  }
  answer.followUps.forEach((item, index) => { english[item.label] = text.followUps[index]; });
  answer.comparison?.forEach((item, index) => {
    const translated = text.comparison![index];
    english[item.name] = translated.name; english[item.example] = translated.example;
  });
  answer.fits?.forEach((item, index) => { english[item.note] = text.fits![index]; });
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT_NAME, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(EVENT_NAME, onChange); };
}
function getClientLocale(): Locale {
  if (historyLocale) return historyLocale;
  const requested = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(requested)) { memoryLocale = requested; return requested; }
  try { const saved = window.localStorage.getItem(STORAGE_KEY); if (isLocale(saved)) { memoryLocale = saved; return saved; } } catch { /* Storage is optional. */ }
  return memoryLocale;
}
const Context = createContext<{ locale: Locale; t: (source: string) => string; setLocale: (value: Locale) => void; withLanguage: (href: string) => string } | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getClientLocale, () => "es" as Locale);
  const setLocale = useCallback((value: Locale) => {
    memoryLocale = value;
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the in-memory choice. */ }
    try { const url = new URL(window.location.href); url.searchParams.set("lang", value); window.history.replaceState(null, "", url); historyLocale = null; } catch { historyLocale = value; /* Keep the selected language when the URL cannot change. */ }
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === "en" ? "Papastronomy Copilot · Astronomical assistant with SPHEREx data" : "Papastronomy Copilot · Asistente astronómico con datos SPHEREx";
    document.querySelector('meta[name="description"]')?.setAttribute("content", locale === "en"
      ? "An astronomical assistant that understands the universe and what you are observing: celestial objects, SPHEREx infrared spectra, and the exact region of the sky on your screen."
      : "Un asistente astronómico que entiende el universo y lo que estás observando: objetos celestes, espectros infrarrojos de SPHEREx y la región exacta del cielo en pantalla.");
  }, [locale]);
  const t = useCallback((source: string) => locale === "en" ? english[source] ?? source : source, [locale]);
  const withLanguage = useCallback((href: string) => {
    if (href.startsWith("#")) return href;
    const url = new URL(href, "https://papastronomy.invalid");
    url.searchParams.set("lang", locale);
    return /^https?:\/\//.test(href) ? url.href : `${url.pathname}${url.search}${url.hash}`;
  }, [locale]);
  return <Context.Provider value={{ locale, t, setLocale, withLanguage }}>{children}</Context.Provider>;
}

export function useLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("useLanguage must be used within LanguageProvider");
  return value;
}
