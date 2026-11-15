/* Asistente de demostración: reglas locales, sin LLM ni solicitudes de red. */
(function (root) {
  "use strict";
  const PROMPTS = Object.freeze([
    "Ayudame a empezar", "Configurá la app para mí",
    "¿Por qué no hay detecciones?", "Explicá el candidato seleccionado",
  ]);
  const TOPICS = Object.freeze([
    "¿Qué es SPHEREx?", "¿Qué estoy viendo en este campo?", "¿Puedo usar la resta temporal?",
    "¿Qué significa el espectro?", "¿Por qué las imágenes se ven distintas?", "¿Puede confirmar un planeta?",
    "¿Qué es una enana marrón?",
    "¿Qué es una estrella joven con disco?",
  ]);
  const REFERENCES = Object.freeze({
    mission: { title: "NASA · misión SPHEREx", kind: "Referencia oficial", url: "https://science.nasa.gov/mission/spherex/",
      facts: ["Descripción de la misión y su relevamiento espectral del cielo."] },
    archive: { title: "IRSA · archivo SPHEREx", kind: "Referencia oficial", url: "https://irsa.ipac.caltech.edu/Missions/spherex.html",
      facts: ["Acceso a los productos, documentación y herramientas de SPHEREx."] },
    brownDwarf: { title: "NASA · What Makes Brown Dwarfs Unique?", kind: "Referencia oficial",
      url: "https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-makes-brown-dwarfs-unique/",
      facts: ["Introducción a los objetos subestelares y su estudio en infrarrojo. No identifica al candidato seleccionado."] },
    youngStar: { title: "NASA · Planetary Systems", kind: "Referencia oficial",
      url: "https://science.nasa.gov/universe/stars/planetary-system/",
      facts: ["Discos alrededor de estrellas jóvenes y su contribución infrarroja. No mide el campo actual."] },
    rwAur: { title: "NASA · Estudio de RW Aur A", kind: "Referencia oficial",
      url: "https://www.nasa.gov/universe/chandra-may-have-first-evidence-of-a-young-star-devouring-a-planet/",
      facts: ["Estudio del material circumestelar y oscurecimientos de RW Aur A; no determina la causa de una variación en esta consulta."] },
  });
  const normalize = value => String(value || "").slice(0, 400).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const technical = context => context.profile?.explanations === "tecnica";
  const number = value => Number.isFinite(value) ? Number(value.toFixed(2)).toLocaleString("es-AR") : null;

  function classify(input) {
    const text = normalize(input);
    if (/que (es|significa).*(dipolo|monopolo)|diferencia.*dipolo/.test(text)) return "types";
    if (/pued.*(planeta|planet nine|planeta x)|confirm.*planeta|descubr.*planeta/.test(text)) return "limits";
    if (/que es spherex|que hace spherex|telescopio|mision spherex/.test(text)) return "mission";
    if (/que (estoy viendo|veo|hay en este campo)|campo actual|resumi.*campo/.test(text)) return "view";
    if (/resta temporal|puedo (restar|comparar)|compar.*(dos|estas)|por que.*restar/.test(text)) return "compare";
    if (/cuanto.*brill|brillo.*(tiene|fuente)|medicion.*brillo/.test(text)) return "brightness";
    if (/configur|parametr|ajust|autoconfig/.test(text)) return "configure";
    if (/no (hay|aparecen|veo|tengo|sale).*(detecci|candidato|resultado)|sin detecci/.test(text)) return "detector";
    if (/candidato|dipolo|monopolo|seleccionad|esta deteccion|la deteccion/.test(text)) return "candidate";
    if (/detector|detecciones|resultados/.test(text)) return "detector";
    if (/espectro|fotometr|curva de luz/.test(text)) return "spectrum";
    if (/estrella[s]? joven|disco (de polvo|circumestelar|protoplanetario)|rw aur/.test(text)) return "youngStar";
    if (/que (es|son|significa).*enana[s]? marron|explica.*enana[s]? marron|aprend.*3d|explor.*3d|modelo 3d|ver.*enana.*3d/.test(text)) return "brownDwarf";
    if (/imagen|visor|borros|pixel|damero|rgb|falso color/.test(text)) return "images";
    if (/empez|empiez|empec|comenz|inicio|guiame|ayud|recorrido|ejemplo|hola/.test(text)) return "start";
    return "unknown";
  }

  function propose(context) {
    const fallback = { maxFrames: 10, fps: 2, showFlags: false, showAIMarkers: true };
    const maxFrames = context.temporal ? 32 : 102;
    const settings = {};
    const preserved = [];
    for (const key of Object.keys(fallback)) {
      const manual = context.manualOverrides?.[key];
      const value = manual ?? context.defaults?.[key] ?? fallback[key];
      settings[key] = value;
      if (manual !== undefined) preserved.push(key);
    }
    settings.maxFrames = Math.max(1, Math.min(maxFrames, settings.maxFrames));
    return { settings, maxFrames, preserved };
  }

  function sourcesFor(intent, context) {
    const sources = [];
    const info = context.target;
    const dataAvailable = info && !context.loading;
    const method = (title, facts) => sources.push({ title, kind: "Guía de esta app", facts });
    if (intent === "mission") return [REFERENCES.mission, REFERENCES.archive];
    if (intent === "youngStar") {
      method("Estrella joven en 3D · ilustración educativa", [
        "Escena genérica sin escala física. No reconstruye RW Aurigae ni usa fotometría del explorador.",
        "El disco y su paleta sirven para explicar conceptos; no establecen la causa de un cambio observado.",
      ]);
      return [REFERENCES.youngStar, REFERENCES.rwAur, ...sources];
    }
    if (intent === "brownDwarf") {
      method("Aprendé en 3D · ilustración educativa", [
        "Esfera genérica con colores, nubes y velocidad ilustrativos. No reconstruye un objeto real ni utiliza mediciones del campo.",
        "El acceso al modelo abre otra pestaña y conserva las observaciones y la conversación actuales.",
      ]);
      return [REFERENCES.brownDwarf, ...sources];
    }
    if (dataAvailable && ["view", "compare", "detector", "candidate", "images"].includes(intent)) {
      const facts = [];
      if (Number.isFinite(info.ra) && Number.isFinite(info.dec)) facts.push(`Centro: RA ${info.ra.toFixed(5)}°, Dec ${info.dec.toFixed(5)}°.`);
      if (Number.isFinite(info.fov)) facts.push(`Campo: ${number(info.fov)}°.`);
      if (Number.isInteger(info.total_frames)) facts.push(`${info.total_frames} recortes cargados; ${info.total_epochs ?? "—"} instantes y ${info.total_bands ?? "—"} bandas.`);
      if (info.data_source) facts.push(`Procedencia informada: ${info.data_source}.`);
      if (facts.length) sources.push({ title: info.matched_target_name || "Campo cargado", kind: "Datos de esta consulta", facts });
    }
    if (dataAvailable && ["compare", "detector"].includes(intent)) {
      const facts = [`Resta temporal disponible: ${info.difference_available ? "sí" : "no"}.`];
      if (info.analysis_note) facts.push(info.analysis_note);
      if (info.difference_available) facts.push(`${(context.detections || []).length} candidatos en el mapa.`);
      for (const frame of (context.analysisFrames || []).slice(0, 4)) {
        facts.push(`Recorte #${frame.index + 1}: ${frame.detector}, ${number(frame.wavelength_center_um)} µm; fecha de observación: ${frame.obs_time || "sin fecha"}.`);
      }
      sources.push({ title: "Diagnóstico temporal del campo", kind: "Resultado del análisis", facts });
    }
    const selected = (context.detections || []).find(d => d.id === context.selectedDetectionId);
    if (dataAvailable && intent === "candidate" && selected) {
      const facts = [`Tipo reportado: ${selected.type}.`];
      if (number(selected.snr_score) !== null) facts.push(`Señal: ${number(selected.snr_score)}σ.`);
      if (number(selected.shift_arcsec) !== null) facts.push(`Desplazamiento aparente: ${number(selected.shift_arcsec)}″.`);
      if (Number.isFinite(selected.ra) && Number.isFinite(selected.dec)) facts.push(`RA ${selected.ra.toFixed(5)}°, Dec ${selected.dec.toFixed(5)}°.`);
      sources.push({ title: `Candidato #${selected.id}`, kind: "Datos del detector", facts });
    }
    if (intent === "brightness" && !context.loading && context.spectrum) {
      const spectrum = context.spectrum;
      const facts = [];
      if (Number.isFinite(spectrum.ra) && Number.isFinite(spectrum.dec)) facts.push(`Posición medida: RA ${spectrum.ra.toFixed(5)}°, Dec ${spectrum.dec.toFixed(5)}°.`);
      for (const point of (spectrum.spectrum || []).filter(p => Number.isFinite(p.flux_mjy_sr) && Number.isFinite(p.wavelength_um)).slice(0, 4)) {
        facts.push(`${number(point.wavelength_um)} µm: ${point.flux_mjy_sr.toPrecision(4)} MJy/sr${Number.isFinite(point.flux_uncertainty) ? ` ± ${point.flux_uncertainty.toPrecision(3)}` : ""} · ${point.detector} · ${point.obs_time}.`);
      }
      sources.push({ title: "Fotometría de la selección", kind: "Medición de esta consulta", facts });
    }
    if (["compare", "detector", "candidate", "limits", "types"].includes(intent)) method("Cómo interpretamos los cambios", [
      "La resta científica exige exposiciones comparables y control de PSF, fotometría y cobertura.",
      "Las detecciones son candidatos; un residuo también puede deberse a artefactos. La comparación manual A/B opera sobre PNG de vista previa.",
    ]);
    if (["images", "view"].includes(intent)) method("Cómo se muestran las imágenes", [
      "El visor local conserva los huecos sin datos. El contexto local muestra una mediana; el RGB es falso color de vistas estiradas.",
      "Reproyectar a 128 × 128 píxeles no aumenta la resolución original.",
    ]);
    if (["spectrum", "brightness"].includes(intent)) method("Cómo medimos el brillo", [
      "Fotometría de apertura en FITS calibrados, con máscaras de calidad y corrección de fondo. Unidades: brillo superficial en MJy/sr.",
      "Las franjas moleculares son referencias, y los ajustes espectrales son orientativos.",
    ]);
    if (["start", "configure"].includes(intent)) method("Perfiles y controles", [
      "El nivel define valores iniciales; los ajustes manuales tienen prioridad y todos los controles siguen disponibles.",
      "La propuesta modifica recortes, FPS, FLAGS y marcas. Los recortes se usan en la próxima exploración; el campo y las coordenadas se conservan.",
    ]);
    return sources;
  }

  const selectedCandidate = context => (context.detections || []).find(d => d.id === context.selectedDetectionId);
  const hasData = context => Boolean(context.target) && !context.loading;
  const hasPhotometry = context => hasData(context) && context.spectrum?.spectrum?.some(p => Number.isFinite(p.flux_mjy_sr));
  const conversationScope = context => context.conversationKey || JSON.stringify([
    context.profile?.id || "guest", context.target?.ra, context.target?.dec, context.target?.fov,
  ]);

  function suggestionsFor(context, topic = null) {
    if (topic === "youngStar") return ["¿Qué significa el espectro?", "¿Qué es una enana marrón?"];
    if (topic === "brownDwarf") return ["¿Qué significa el espectro?", "¿Qué es SPHEREx?"];
    if (!hasData(context)) return context.loading
      ? ["¿Qué es SPHEREx?", "¿Qué significa el espectro?"]
      : ["Ayudame a empezar", "Configurá la app para mí", "¿Qué es SPHEREx?"];
    const candidate = selectedCandidate(context) ? "Explicá el candidato seleccionado"
      : context.detections?.length ? "¿Qué resultados tiene el detector?" : "¿Por qué no hay detecciones?";
    const brightness = hasPhotometry(context) ? "¿Cuánto brillo tiene la fuente?" : "¿Qué significa el espectro?";
    const byTopic = {
      start: ["¿Qué estoy viendo en este campo?", "Configurá la app para mí"],
      view: [context.target.difference_available ? "¿Puedo usar la resta temporal?" : "¿Por qué no hay detecciones?", brightness],
      detector: [context.target.difference_available && selectedCandidate(context) ? candidate : "¿Puedo usar la resta temporal?", brightness],
      compare: [candidate, "¿Qué significa el espectro?"],
      candidate: selectedCandidate(context) ? ["¿Y cómo lo compruebo?", "¿Puede confirmar un planeta?"] : [candidate, "¿Qué significa el espectro?"],
      types: [selectedCandidate(context) ? candidate : "¿Puedo usar la resta temporal?", "¿Y cómo lo compruebo?"],
      spectrum: [hasPhotometry(context) ? brightness : "¿Cómo lo compruebo?", "¿Por qué las imágenes se ven distintas?"],
      brightness: ["¿Qué significa el espectro?", "¿Cómo lo compruebo?"],
      mission: ["¿Qué es una enana marrón?", "¿Qué estoy viendo en este campo?"],
      configure: ["¿Qué estoy viendo en este campo?", "¿Qué significa el espectro?"],
    };
    return byTopic[topic] || ["¿Qué estoy viendo en este campo?", candidate, brightness];
  }

  function actionsFor(intent, context) {
    if (intent === "youngStar") return [{ id: "learn3d", label: "Explorar la estrella en 3D ↗", object: "young-star" }, { id: "explorer", label: "Ver observaciones" }];
    if (intent === "brownDwarf") return [{ id: "learn3d", label: "Explorar en 3D ↗", object: "brown-dwarf" }, { id: "explorer", label: "Ver observaciones" }];
    if (["configure", "unknown", "clarify"].includes(intent)) return [];
    if (!hasData(context)) return [{ id: "explorer", label: "Abrir explorador" }];
    if (["candidate", "types", "detector", "compare", "limits"].includes(intent)) return [{ id: "detector", label: "Ir al detector" }];
    if (["spectrum", "brightness"].includes(intent)) return [{ id: "spectrum", label: "Ver el espectro" }];
    return [{ id: "explorer", label: "Ver observaciones" }, { id: "configure", label: "Preparar ajustes" }];
  }

  const questionKey = input => normalize(input).replace(/[¿?¡!.,]/g, "").trim().replace(/^y /, "");
  function followUpsFor(context, intent, lastPrompt = "") {
    const actions = actionsFor(intent, context);
    return suggestionsFor(context, intent).filter(prompt => questionKey(prompt) !== lastPrompt
      && (!actions.some(a => a.id === "configure") || classify(prompt) !== "configure")).slice(0, 2);
  }

  function briefAnswer(intent, text) {
    if (intent === "start") return { summary: "Elegí un objeto, recorré sus imágenes y seleccioná una fuente para medir su espectro.", detail: text };
    const lines = text.split("\n").filter(Boolean);
    let summary = lines[0] || text;
    if (intent === "candidate" && lines[1] && summary.length + lines[1].length < 310) summary += `\n${lines[1]}`;
    if (summary.length > 320) {
      const end = summary.indexOf(". ");
      if (end > 0) summary = summary.slice(0, end + 1);
    }
    return { summary, detail: summary === text ? "" : text };
  }

  function complete(intent, text, context, proposal) {
    const actions = actionsFor(intent, context);
    const followUps = followUpsFor(context, intent);
    return { intent, text, ...briefAnswer(intent, text), sources: sourcesFor(intent, context),
      followUps, actions, ...(proposal ? { proposal } : {}) };
  }

  function answer(intent, context = {}) {
    const info = context.target;
    const detailed = technical(context);
    let text;
    if (intent === "configure") {
      return complete(intent, "Preparé una propuesta según tu perfil y tus preferencias actuales. Revisala o editá los valores antes de aplicar. Todos los controles de la app siguen disponibles.", context, propose(context));
    }
    if (intent === "start") {
      text = detailed
        ? "1. Seleccioná coordenadas y FoV; cargá las exposiciones.\n2. Revisá banda, fecha, cobertura válida y FLAGS.\n3. Para cambios temporales, utilizá un par comparable y revisá el diagnóstico de PSF y calibración fotométrica.\n4. Seleccioná una fuente para medir fotometría sobre los FITS.\nPodés pedirme una configuración o consultar el candidato seleccionado."
        : "1. Elegí uno de los objetos de la cabecera.\n2. Mirá sus imágenes en el visor y usá Pausar para detenerte en una.\n3. Tocá una fuente para ver su espectro, que muestra cómo cambia su brillo entre longitudes de onda.\n4. Para buscar cambios entre fechas, usá Buscar pares temporales.\nPodés pedirme que prepare una configuración para vos.";
    } else if (["detector", "candidate", "view", "compare", "brightness"].includes(intent) && (context.loading || !info)) {
      text = context.loading ? "El campo se está cargando. Volvé a consultarme cuando termine para explicar sus resultados actualizados."
        : "Todavía no hay un campo cargado. Elegí un objeto o ingresá coordenadas y pulsá Explorar Cielo.";
    } else if (intent === "detector") {
      if (!info.difference_available) {
        text = "Este campo todavía no tiene una resta temporal válida para evaluar cambios.";
        if (info.analysis_note) text += `\nMotivo informado por el análisis: ${info.analysis_note}`;
        text += detailed ? "\nRevisá compatibilidad de banda y detector, cobertura común, PSF y referencias fotométricas."
          : "\nPodés buscar otras observaciones con Buscar pares temporales. Un cambio de aspecto entre bandas puede deberse a la longitud de onda.";
      } else {
        const detections = context.detections || [];
        text = detections.length ? `Hay ${detections.length} candidato${detections.length === 1 ? "" : "s"} en el mapa. Seleccioná uno en el detector y pedime que lo explique.`
          : "El análisis temporal está disponible y no encontró candidatos por encima de 4σ en este campo.";
        text += "\nLos resultados son preliminares y requieren revisar las imágenes y la calidad de la resta.";
        if (detailed && info.analysis_note) text += `\nDiagnóstico: ${info.analysis_note}`;
      }
    } else if (intent === "candidate") {
      const selected = (context.detections || []).find(d => d.id === context.selectedDetectionId);
      if (!selected) {
        text = "Seleccioná un candidato en el detector para que pueda explicar sus datos. Si la lista está vacía, preguntame por el estado del análisis.";
      } else {
        const motion = selected.type === "MOVING_DIPOLE";
        text = `Candidato #${selected.id} · ${motion ? "posible movimiento" : "posible variación de brillo"}.\n`;
        text += motion ? "La resta tiene un lóbulo positivo y otro negativo, una señal compatible con un cambio de posición entre las observaciones."
          : "La resta tiene un residuo de brillo, una señal compatible con una fuente que cambió entre las observaciones.";
        const snr = number(selected.snr_score);
        if (snr !== null) text += `\nSeñal reportada por el detector: ${snr}σ.`;
        if (motion && number(selected.shift_arcsec) !== null) text += ` Desplazamiento aparente: ${number(selected.shift_arcsec)}″.`;
        text += "\nCompará las fechas con los botones de su tarjeta. El residuo también puede deberse a artefactos o a diferencias de calibración.";
        if (detailed && selected.description) text += `\nDetalle del detector: ${selected.description}`;
      }
    } else if (intent === "types") {
      text = "Un dipolo es un par de lóbulos, uno positivo y otro negativo, en la resta de imágenes. Puede aparecer cuando una fuente cambió de posición. Un monopolo es un residuo concentrado que puede indicar un cambio de brillo.\nAmbos son candidatos para revisar: una diferencia de PSF, calibración o un artefacto también puede producir residuos.";
    } else if (intent === "mission") {
      text = "SPHEREx es una misión de la NASA que observa el cielo en distintas longitudes de onda para estudiar estrellas y galaxias. Esta app permite explorar sus recortes, comparar observaciones y medir cómo cambia el brillo entre longitudes de onda.\n\nAbajo tenés la descripción oficial de la misión y el archivo de datos que usamos.";
    } else if (intent === "youngStar") {
      text = detailed
        ? "Muchas estrellas jóvenes conservan un disco circumestelar. El polvo puede contribuir al exceso infrarrojo y el material de la línea de visión puede afectar el brillo. RW Aur A es un caso estudiado, pero la guía no diagnostica sus variaciones actuales.\nLa escena educativa 3D muestra una estrella y un disco inclinado, con geometría y paletas ilustrativas. No calcula transferencia radiativa ni reconstruye una fuente. Para interpretar una variación real, revisá bandas, fechas, incertidumbres y calidad de la comparación."
        : "Una estrella joven puede estar rodeada de un disco de gas y polvo. El polvo puede absorber luz y emitir energía en infrarrojo; también puede tapar parte de la estrella según cómo la observemos.\nEn el 3D podés inclinar el disco y conocer estas ideas. Es una ilustración educativa genérica: no es una reconstrucción de RW Aurigae ni explica por sí sola un cambio de brillo en sus observaciones.";
    } else if (intent === "brownDwarf") {
      text = detailed
        ? "Una enana marrón es un objeto subestelar que no mantiene la fusión estable de hidrógeno de una estrella de secuencia principal. Su evolución térmica depende de la masa y la edad, y su atmósfera modifica el espectro que observamos.\nEl visor 3D representa un ejemplo genérico: permite explorar atmósfera, temperatura y emisión infrarroja con paletas conceptuales. No reconstruye WISE 0855 ni Epsilon Indi B; tampoco clasifica el candidato actual ni calcula su temperatura."
        : "Una enana marrón es un objeto que no sostiene la fusión de hidrógeno como una estrella. Las más frías son muy tenues en luz visible y se estudian en infrarrojo.\nPodés explorar una ilustración en 3D, rotarla y conocer su atmósfera. Es un ejemplo educativo, no una imagen de WISE 0855 o Epsilon Indi B ni una explicación de la identidad del candidato seleccionado.";
    } else if (intent === "view") {
      text = `Estás mirando ${info.matched_target_name || "un campo por coordenadas"}.`;
      if (Number.isInteger(info.total_frames)) text += ` Hay ${info.total_frames} recortes cargados`;
      if (Number.isInteger(info.total_epochs)) text += ` de ${info.total_epochs} instantes de observación`;
      text += ".\nLa imagen izquierda depende del modo que elegiste; el fondo local de la derecha es una mediana. Cambiar de banda puede cambiar el aspecto de una fuente.\n";
      text += info.difference_available ? "Hay una resta temporal disponible. Podés revisar el diagnóstico y los candidatos del detector."
        : "Con estos recortes no hay una resta temporal válida. Consultá el diagnóstico antes de interpretar un cambio como movimiento.";
    } else if (intent === "compare") {
      text = info.difference_available ? "El análisis habilitó una resta temporal para un grupo de observaciones comparables de este campo. Revisá el diagnóstico y las exposiciones usadas en las fuentes de abajo."
        : "La resta temporal de este campo no está disponible con el grupo actual de observaciones.";
      if (info.analysis_note) text += `\nDiagnóstico: ${info.analysis_note}`;
      text += "\nLas operaciones manuales A/B comparan vistas PNG. Para interpretar cambios de brillo usá la resta calibrada y sus condiciones de calidad; no alcanza con que dos imágenes se vean diferentes.";
    } else if (intent === "brightness") {
      const spectrum = context.spectrum;
      const points = spectrum?.spectrum?.filter(p => Number.isFinite(p.flux_mjy_sr) && Number.isFinite(p.wavelength_um)) || [];
      text = points.length ? `La selección tiene ${points.length} ${points.length === 1 ? "medición" : "mediciones"} de brillo superficial. No hay un único valor: cada medición corresponde a una longitud de onda y una observación.\nPodés ver hasta cuatro valores con sus incertidumbres y fechas en la fuente de fotometría de abajo; el gráfico muestra el conjunto completo.`
        : "No tengo una medición válida y actualizada de la selección. Seleccioná una fuente y esperá a que termine el espectro. Un punto enmascarado puede no tener mediciones.";
    } else if (intent === "limits") {
      text = "Esta app puede señalar candidatos a movimiento o variación de brillo. Un dipolo no confirma por sí solo un planeta: necesita revisar artefactos, contrastar catálogos y verificar observaciones adicionales.\nEl asistente explica resultados existentes; no descubre ni identifica un objeto nuevo a partir de una conversación.";
    } else if (intent === "spectrum") {
      text = detailed ? "El espectro se calcula por fotometría de apertura en los FITS calibrados, con el fondo y las máscaras de calidad. Revisá incertidumbres, cobertura espectral y fechas antes de interpretar variabilidad o un ajuste de Planck."
        : "El espectro muestra el brillo de la fuente seleccionada en distintas longitudes de onda. Tocá una fuente en el visor para medirlo. Las franjas de colores son referencias de bandas moleculares; por sí solas no demuestran que haya una molécula.";
    } else if (intent === "images") {
      text = "El visor izquierdo muestra la exposición o el producto que elegiste; el contexto local muestra una mediana. El damero indica zonas sin datos válidos. La grilla de 128 × 128 no agrega detalle a los recortes originales.\nEl RGB es falso color de vistas estiradas; no permite medir temperatura. Para medir brillo o cambios usá el espectro y la resta calibrada.";
    } else {
      text = "Esta demo responde consultas predefinidas. Puedo ayudarte a empezar, proponer ajustes o explicar SPHEREx, las enanas marrones, el campo actual, el detector, un candidato, las imágenes y el espectro. Probá las preguntas sugeridas.";
    }
    return complete(intent, text, context);
  }

  function resolveQuestion(input, memory) {
    const text = normalize(input).replace(/[¿?¡!.,]/g, "").trim();
    if (/^(y )?(por que cambia|por que cambia el brillo|por que cambio|por que se ve diferente|por que es diferente|que cambia)$/.test(text)) {
      return { intent: "clarify" };
    }
    if (memory.awaiting === "change") {
      if (/banda|color|longitud|filtro/.test(text)) return { intent: "images" };
      if (/fecha|tiempo|posicion|movimiento|temporal/.test(text)) return { intent: "compare" };
    }
    const followUp = /^(y )?(eso |lo |la )?(como (lo |la )?(compruebo|verifico|confirmo|reviso|hago|aplico)|como sigo|que hago (ahora|despues)|cual es el (proximo|siguiente) paso)$/.test(text) || /^(y )?como (puedo )?(comprobarlo|verificarlo|confirmarlo|revisarlo|aplicarlo)$/.test(text);
    const more = /^(y )?((eso )?que significa|que significa eso|explicame mas|mas detalle|no entiendo|por que)$/.test(text);
    if (followUp || more) return memory.topic ? { intent: memory.topic, continuation: more ? "meaning" : "next" } : { intent: "clarify" };
    return { intent: classify(input) };
  }

  function continueAnswer(topic, context, kind) {
    if (topic === "configure") return answer("configure", context);
    if (topic === "candidate" && !selectedCandidate(context)) return answer("candidate", context);
    if (!hasData(context) && ["candidate", "detector", "compare", "view", "brightness"].includes(topic)) return answer(topic, context);
    const texts = kind === "next" ? {
      candidate: "Para comprobar el candidato, compará las observaciones de su tarjeta y revisá el diagnóstico temporal. Buscá el cambio en los recortes originales; los artefactos y una PSF distinta también producen residuos.",
      types: "Buscá un par comparable y revisá la resta. Un dipolo tiene dos lóbulos opuestos; un monopolo, un residuo concentrado. Compará también las observaciones originales antes de interpretar el resultado.",
      detector: context.target?.difference_available ? "Abrí el detector, seleccioná un candidato y compará sus fechas. Revisá las condiciones de calidad antes de interpretarlo." : "Abrí el detector para revisar el motivo de la resta no disponible. Desde allí podés buscar pares temporales; la nueva búsqueda puede descargar datos y no garantiza un par válido.",
      compare: "Revisá el diagnóstico temporal y las observaciones usadas. Compará banda, detector, fecha y cobertura; las operaciones manuales A/B muestran una vista previa y no sustituyen la resta calibrada.",
      spectrum: "Seleccioná una fuente en el visor y esperá su espectro. Revisá las barras de incertidumbre, las longitudes de onda y las fechas antes de interpretar los puntos.",
      brightness: "Abrí el espectro para revisar las mediciones y sus incertidumbres. Compará observaciones compatibles; dos valores en bandas distintas no demuestran variación temporal.",
      images: "Pausá el visor y revisá la banda y la fecha de cada exposición. Para estudiar cambios entre fechas, consultá si la resta temporal está habilitada.",
      view: "En el explorador, pausá la secuencia y seleccioná una fuente. Después podés medir su espectro o revisar el detector de cambios.",
      mission: "Empezá por un objetivo de la cabecera. Recorré sus imágenes y seleccioná una fuente para medir el brillo en distintas longitudes de onda.",
      brownDwarf: "Abrí Explorar en 3D y recorré los temas de atmósfera, temperatura e infrarrojo. Después volvé a las observaciones para revisar un espectro real. El modelo no comprueba la identidad de una fuente ni mide sus propiedades.",
      youngStar: "Abrí la estrella en 3D, incliná el disco y recorré estrella, disco y variabilidad. Después revisá las observaciones y el espectro real. La ilustración no demuestra qué causó un cambio de brillo.",
      start: "Abrí el explorador, elegí un objeto de la cabecera y pulsá Pausar. Tocá una fuente para ver su espectro.",
      limits: "Contrastá el candidato con las observaciones originales y los catálogos. Una identificación necesita evidencia adicional; el asistente no puede confirmar un planeta.",
    } : {
      candidate: "El detector señaló una diferencia que merece revisión. Es una hipótesis de movimiento o cambio de brillo; su señal por sí sola no identifica el objeto ni descarta un artefacto.",
      types: "Los signos de la resta indican cuánto cambió el brillo respecto de la referencia. Dos lóbulos pueden reflejar un desplazamiento, pero también un desajuste entre observaciones.",
      detector: "Que no haya candidatos y que no pueda calcularse una resta son situaciones distintas. Revisá el estado de este campo: la ausencia de una comparación válida no permite evaluar sus cambios temporales.",
      compare: "Para atribuir una diferencia al tiempo hay que controlar otras causas: banda, detector, PSF, fondo y cobertura. El diagnóstico indica qué pudo comprobar la app.",
      spectrum: "Cada punto representa una medición en una longitud de onda. Sus barras expresan incertidumbre. Las franjas moleculares solo orientan la lectura del gráfico.",
      brightness: "El brillo depende de la longitud de onda y de la observación. Revisar la incertidumbre ayuda a distinguir una diferencia medida de una fluctuación compatible con el ruido.",
      images: "Una fuente puede verse distinta en dos bandas porque emite diferente cantidad de luz en cada una. Eso puede ocurrir aunque no se haya movido ni cambiado con el tiempo.",
      view: "El mapa reúne observaciones del mismo campo, pero pueden tener bandas y fechas diferentes. El contexto local resume un grupo de ellas con una mediana.",
      mission: "Observar distintas longitudes de onda permite estudiar cómo cambia la luz de estrellas y galaxias. En la app podés explorar esa información mediante imágenes y espectros.",
      brownDwarf: "La ilustración ayuda a imaginar un objeto subestelar. Para conocer las propiedades de una fuente real necesitamos observaciones; el aspecto y los colores del modelo no son mediciones de esa fuente.",
      youngStar: "El material alrededor de una estrella puede influir en la luz que recibimos. La escena ilustra esa idea; atribuir una variación concreta al polvo requiere contrastar observaciones y otras explicaciones.",
      start: "Las imágenes sirven para explorar posiciones y aspecto; el espectro mide brillo por longitud de onda y la resta temporal busca cambios entre observaciones comparables.",
      limits: "Un residuo puede tener varias explicaciones. Confirmar un objeto exige contrastar mediciones y observaciones adicionales; una señal aislada no alcanza.",
    };
    const text = texts[topic];
    return text ? complete(topic, text, context) : answer(topic, context);
  }

  function reply(input, context = {}, previous = {}) {
    const scope = conversationScope(context);
    const memory = previous.scope === scope ? previous : {};
    const resolved = resolveQuestion(input, memory);
    let response;
    if (resolved.intent === "clarify") {
      const change = /cambia|cambio|diferente/.test(normalize(input));
      response = complete("clarify", change ? "¿Te referís a un cambio de aspecto entre bandas o a un cambio de posición o brillo entre fechas?"
        : "¿Sobre qué querés continuar? Elegí el análisis temporal o el espectro para seguir con una explicación concreta.", context);
      response.followUps = [];
      response.choices = change ? [{ label: "Entre bandas", prompt: "¿Por qué las imágenes se ven distintas entre bandas?" },
        { label: "Entre fechas", prompt: "¿Puedo usar la resta temporal?" }]
        : [{ label: "Análisis temporal", prompt: "¿Por qué no hay detecciones?" }, { label: "Espectro", prompt: "¿Qué significa el espectro?" }];
      response.memory = { scope, topic: memory.topic || null, awaiting: change ? "change" : null };
    } else {
      response = resolved.continuation ? continueAnswer(resolved.intent, context, resolved.continuation) : answer(resolved.intent, context);
      response.memory = { scope, topic: resolved.intent === "unknown" ? null : resolved.intent, awaiting: null };
    }
    response.memory.lastPrompt = questionKey(input);
    if (response.intent !== "clarify") response.followUps = followUpsFor(context, response.intent, response.memory.lastPrompt);
    return response;
  }

  // El anfitrión decide la ruta del módulo portable. Solo se admiten enlaces
  // HTTP(S) del mismo origen; no se navega automáticamente desde una respuesta.
  function learningLink(href, base, object) {
    if (typeof href !== "string" || !href.trim()) return null;
    try {
      const url = new URL(href, base);
      if (!/^https?:$/.test(url.protocol) || url.origin !== new URL(base).origin) return null;
      if (object === "young-star" || object === "brown-dwarf") url.searchParams.set("object", object);
      return url.href;
    } catch { return null; }
  }

  function createLocalProvider() {
    return Object.freeze({
      id: "local-rules",
      label: "Respuestas integradas · reglas locales",
      async respond({ message, context, conversation, signal }) {
        if (signal?.aborted) throw new DOMException("Respuesta cancelada", "AbortError");
        return reply(message, context, conversation);
      },
    });
  }
  root.PapastronomyAssistantRules = Object.freeze({
    PROMPTS, TOPICS, classify, reply, propose, suggestionsFor, learningLink, createLocalProvider,
  });
})(globalThis);
