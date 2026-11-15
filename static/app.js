/**
 * Frontend v2.4 - Papastronomy SPHEREx & Planet X Explorer.
 * Conectado a recortes .FITS reales de NASA/IPAC IRSA (128x128 px),
 * visor multi-época para Flipbook, Resta (ΔI) y mediana,
 * y visor interactivo de Contexto Multi-Catálogo (Gaia DR3 + AllWISE).
 */

const CUTOUT_NPIX = 128.0;
const TILE_STEP_PIX = 96.0;
const TILE_MARGIN_PIX = (CUTOUT_NPIX - TILE_STEP_PIX) / 2;
const DEFAULT_SKY_ZOOM = +(CUTOUT_NPIX / TILE_STEP_PIX).toFixed(4);
const MAX_CONCURRENT_TILE_FETCHES = 1;
const MAX_SURVEY_IMAGES = 6;
const MAX_CACHED_TILES = 32;

const state = {
  ra: 133.795129,
  dec: -7.245147,
  fov: 0.05,
  targets: [],
  exploreData: null,
  currentEpochIdx: 0,
  selectedBand: "auto",
  isPlaying: true,
  fps: 2,
  frameLimit: 10,
  timerId: null,
  viewMode: "blink",
  showAIMarkers: true,
  showFlags: false,
  selectedPixel: { x: 64, y: 64 },
  selectedDetectionId: null,
  epochImages: [],
  flagImages: [],
  coaddImage: null,
  diffImage: null,
  detectorCoaddImages: {},
  rgbCompositeCanvas: null,
  manualOpCanvas: null,
  manualOpMeta: null,
  manualPairIndices: [],
  invertPixels: false,
  stretchLinearity: 0.0,
  contrastGain: 1.0,
  shiftStackCanvas: null,
  shiftStackMeta: null,
  spectrumPlotMode: "spectrum",
  lastSpectrumData: null,
  assistantSpectrum: null,
  contextSurvey: "spherex",
  externalSurveyCache: new Map(),
  exploreController: null,
  spectrumController: null,
  exploreSequence: 0,
  spectrumSequence: 0,
  isLoading: false,
  catalogStatus: {},
  temporalSearch: false,
  showNamedObjects: false,
  selectedNamedObjectId: null,
  hoveredNamedObjectId: null,
  showGaiaCat: true,
  showWiseCat: true,
  showPmVectors: true,
  embed: false,
  crossmatchByDetId: {},
  tileGrid: new Map(),
  tileQueue: [],
  activeTileFetches: 0,
  tileControllers: new Set(),
  prefetchTimerId: null,
  catalogCentersQueried: [],
  infinitePlaneEnabled: false,
  allAiDetections: [],
  nextDetectionId: 100,
  skyView: {
    centerRa: 133.795129,
    centerDec: -7.245147,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastMoveX: 0,
    lastMoveY: 0,
    velX: 0,
    velY: 0,
    moved: false,
    hoverRa: null,
    hoverDec: null,
    gaiaSources: [],
    wiseSources: [],
    namedObjects: [],
    colorSkyCanvas: null,
  },
};

let demoStore = null;
let demoAssistantUI = null;
let demoAppReady = false;
let demoEditing = false;
let demoSelectedId = "principiante";
let resolveDemoEntry = null;
const DEMO_CONTROLS = {
  "input-fov": "fov", "input-max-frames": "maxFrames", "select-fps": "fps",
  "chk-flags": "showFlags", "chk-ai-markers": "showAIMarkers", "chk-invert": "invertPixels",
  "slider-stretch": "stretchLinearity", "slider-contrast": "contrastGain",
  "chk-gaia": "showGaiaCat", "chk-wise": "showWiseCat", "chk-pm-vectors": "showPmVectors",
  "chk-named-objects": "showNamedObjects", "select-context-survey": "contextSurvey",
};

function rememberDemoSettings(patch) {
  demoStore?.remember(patch);
  updateDemoSummary();
}

function updateDemoSummary() {
  if (!demoStore) return;
  const profile = demoStore.get();
  document.querySelectorAll('[data-learn-3d]').forEach(link => {
    const url = new URL(link.href);
    url.searchParams.set('explanation', profile?.explanations === 'tecnica' ? 'technical' : 'simple');
    link.href = url.href;
  });
  document.getElementById("demo-user-label").textContent = profile
    ? `${profile.alias} · ${DemoProfiles.PRESETS[profile.level].label}` : "Exploración como invitado";
  document.getElementById("btn-demo-profile").textContent = profile ? "Mi perfil" : "Entrar con un perfil";
  document.getElementById("btn-demo-logout").hidden = !profile;
  document.getElementById("demo-guide").hidden = !profile;
  document.getElementById("demo-storage-notice").hidden = demoStore.persistent;
  demoAssistantUI?.refresh();
  if (!profile) return;
  document.getElementById("demo-guide-title").textContent = `Tu guía · ${DemoProfiles.INTERESTS[profile.interest]}`;
  const guides = {
    simple: "Elegí un objeto y recorré sus imágenes. Tocá una fuente para ver su espectro. Una diferencia de aspecto entre bandas no demuestra movimiento; el modo temporal comprueba qué observaciones se pueden comparar.",
    equilibrada: "Compará exposiciones, medí espectros y consultá los catálogos. Para estudiar cambios en el tiempo, usá pares del mismo detector y banda. La resta muestra su disponibilidad y las condiciones de calibración.",
    tecnica: "El análisis temporal exige compatibilidad espectral, PSF y referencias fotométricas. Revisá FLAGS, cobertura y diagnósticos de la resta; las detecciones son candidatos pendientes de validación.",
  };
  document.getElementById("demo-guide-text").textContent = guides[profile.explanations];
  document.getElementById("demo-settings-status").textContent = !demoStore.persistent
    ? "Solo durante esta visita" : Object.keys(profile.overrides).length
      ? "Ajustes guardados" : "Valores iniciales del perfil";
}

function applyDemoSettings() {
  const profile = demoStore?.get();
  const settings = profile ? DemoProfiles.effectiveSettings(profile) : DemoProfiles.PRESETS.explorador.settings;
  state.frameLimit = settings.maxFrames;
  for (const [id, key] of Object.entries(DEMO_CONTROLS)) {
    const control = document.getElementById(id);
    if (control.type === "checkbox") control.checked = settings[key];
    else control.value = settings[key];
    // FoV describe los datos actualmente dibujados; solo cambia al completar una consulta.
    if (key !== "fov" && key !== "maxFrames") state[key] = settings[key];
  }
  state.viewMode = settings.viewMode;
  state.spectrumPlotMode = settings.spectrumPlotMode;
  syncFovPresetSelect(settings.fov);
  document.getElementById("chk-pm-vectors").disabled = !state.showGaiaCat;
  const pmLabel = document.getElementById("lbl-pm-vectors");
  pmLabel.classList.toggle("opacity-40", !state.showGaiaCat);
  pmLabel.classList.toggle("cursor-not-allowed", !state.showGaiaCat);
  pmLabel.classList.toggle("cursor-pointer", state.showGaiaCat);
  document.getElementById("lbl-contrast-val").textContent = `${state.contrastGain.toFixed(2)}×`;
  document.getElementById("lbl-stretch-val").textContent = state.stretchLinearity <= .05 ? "Original"
    : state.stretchLinearity >= .95 ? "Contraste" : `${Math.round(state.stretchLinearity * 100)}%`;
  updateDemoSummary();
  if (demoAppReady) {
    rebakeAllOpticalCanvases();
    setViewMode(state.viewMode);
    renderSpectrumOrLightCurve();
    startBlinkTimer();
  }
  return settings;
}

function previewDemoDefaults() {
  const profile = demoStore.get(demoSelectedId);
  profile.level = document.getElementById("demo-level").value;
  const settings = DemoProfiles.effectiveSettings(profile);
  const preview = document.getElementById("demo-defaults-preview");
  preview.replaceChildren();
  for (const [label, value] of [["Recortes", settings.maxFrames], ["Velocidad", `${settings.fps} fps`],
    ["Campo", `${settings.fov}°`], ["FLAGS", settings.showFlags ? "Visibles" : "Ocultas"]]) {
    const item = document.createElement("span");
    item.appendChild(document.createTextNode(label));
    const number = document.createElement("strong");
    number.textContent = String(value);
    item.appendChild(number);
    preview.appendChild(item);
  }
  document.getElementById("demo-defaults-note").textContent = Object.keys(profile.overrides).length
    ? "Tus ajustes manuales tienen prioridad sobre el nivel elegido." : "Son valores iniciales; todos los parámetros se pueden editar.";
}

function openDemoDialog(editing = false, selectedId = null) {
  demoEditing = editing && Boolean(demoStore.get());
  demoSelectedId = selectedId || demoStore.data.activeId || "principiante";
  const profile = demoStore.get(demoSelectedId);
  for (const key of ["alias", "level", "interest", "explanations"]) document.getElementById(`demo-${key}`).value = profile[key];
  document.getElementById("demo-account-choices").hidden = demoEditing;
  document.getElementById("demo-dialog-title").textContent = demoEditing ? "Tu perfil, a tu manera" : "Tu punto de partida en el cielo";
  document.getElementById("demo-dialog-description").textContent = demoEditing
    ? "Elegí cómo querés explorar y recibir las explicaciones. Tus ajustes manuales se conservan."
    : "Elegí un perfil para empezar. Todos los controles estarán disponibles y podés cambiar cualquier parámetro.";
  document.getElementById("demo-save").textContent = demoEditing ? "Guardar perfil" : "Entrar al explorador";
  document.getElementById("demo-cancel").textContent = demoEditing ? "Cancelar" : "Continuar como invitado";
  document.getElementById("demo-reset").hidden = !demoEditing;
  document.querySelectorAll("[data-demo-account]").forEach((button) => {
    const id = button.dataset.demoAccount;
    const saved = demoStore.get(id);
    button.setAttribute("aria-pressed", String(id === demoSelectedId));
    button.querySelector("strong").textContent = demoStore.data.profiles[id] ? saved.alias : DemoProfiles.PRESETS[id].label;
    button.querySelector("span").textContent = demoStore.data.profiles[id]
      ? `${DemoProfiles.PRESETS[saved.level].label} · preferencias guardadas` : DemoProfiles.PRESETS[id].description;
  });
  updateDemoSummary();
  previewDemoDefaults();
  const dialog = document.getElementById("demo-profile-dialog");
  if (!dialog.open) {
    dialog.showModal();
    const focusTarget = demoEditing ? document.getElementById("demo-alias")
      : document.querySelector(`[data-demo-account="${demoSelectedId}"]`);
    focusTarget.focus();
  }
}

async function loadDemoAccount() {
  const settings = applyDemoSettings();
  if (!demoAppReady) { resolveDemoEntry?.(); resolveDemoEntry = null; return; }
  const region = demoStore.get()?.lastRegion || { ra: 133.795129, dec: -7.245147, temporal: false };
  await exploreCoordinates(region.ra, region.dec, settings.fov, Math.min(settings.maxFrames, region.temporal ? 32 : 102), region.temporal);
  setViewMode(state.viewMode);
  startBlinkTimer();
}

async function initDemoProfiles() {
  if (state.embed) return;
  demoStore = new DemoProfiles.Store();
  document.querySelectorAll("[data-demo-account]").forEach((button) => {
    button.addEventListener("click", () => openDemoDialog(false, button.dataset.demoAccount));
  });
  document.getElementById("demo-level").addEventListener("change", previewDemoDefaults);
  document.getElementById("btn-demo-profile").addEventListener("click", () => openDemoDialog(Boolean(demoStore.get())));
  document.getElementById("btn-demo-logout").addEventListener("click", () => {
    demoStore.leave();
    updateDemoSummary();
    openDemoDialog();
  });
  const dialog = document.getElementById("demo-profile-dialog");
  const cancel = () => {
    if (!demoEditing) demoStore.leave(true);
    dialog.close();
    updateDemoSummary();
    if (!demoEditing) void loadDemoAccount();
  };
  document.getElementById("demo-cancel").addEventListener("click", cancel);
  document.getElementById("demo-close").addEventListener("click", cancel);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); cancel(); });
  document.getElementById("demo-profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const previousSettings = demoStore.get() ? JSON.stringify(DemoProfiles.effectiveSettings(demoStore.get())) : null;
    const fields = {};
    for (const key of ["alias", "level", "interest", "explanations"]) fields[key] = document.getElementById(`demo-${key}`).value;
    if (demoEditing) demoStore.update(fields);
    else demoStore.enter(demoSelectedId, fields);
    dialog.close();
    if (demoEditing) {
      if (previousSettings !== JSON.stringify(DemoProfiles.effectiveSettings(demoStore.get()))) applyDemoSettings();
      else updateDemoSummary();
      setExploreProgress("Perfil guardado. Si cambiaste el campo o la cantidad de recortes, pulsá Explorar Cielo para aplicarlos a los datos.");
    } else void loadDemoAccount();
  });
  document.getElementById("demo-reset").addEventListener("click", () => {
    demoStore.reset();
    dialog.close();
    void loadDemoAccount();
  });
  document.addEventListener("change", (event) => {
    const key = DEMO_CONTROLS[event.target.id] || (event.target.id === "select-fov-preset" && event.target.value !== "custom" ? "fov" : null);
    if (!key) return;
    const control = event.target;
    if (control.type === "number" && !control.validity.valid) return;
    const value = control.type === "checkbox" ? control.checked
      : ["fov", "maxFrames", "fps", "stretchLinearity", "contrastGain"].includes(key) ? Number(control.value) : control.value;
    if (key === "maxFrames") state.frameLimit = value;
    rememberDemoSettings({ [key]: value });
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (["mode-blink", "mode-coadd", "mode-rgb", "mode-diff"].includes(button.id)) rememberDemoSettings({ viewMode: state.viewMode });
    if (["btn-plot-spectrum", "btn-plot-lightcurve"].includes(button.id)) rememberDemoSettings({ spectrumPlotMode: state.spectrumPlotMode });
    if (["btn-load-102-bands", "btn-temporal-search", "btn-irsa-sync"].includes(button.id)) rememberDemoSettings({ maxFrames: state.frameLimit });
  });
  updateDemoSummary();
  if (!demoStore.data.entered) await new Promise((resolve) => { resolveDemoEntry = resolve; openDemoDialog(); });
}

function getAssistantContext() {
  const profile = demoStore?.get();
  const level = profile?.level || "explorador";
  const pendingFrames = Number(document.getElementById("input-max-frames").value);
  const settings = { maxFrames: Number.isInteger(pendingFrames) && pendingFrames > 0 ? pendingFrames : state.frameLimit,
    fps: state.fps, showFlags: state.showFlags, showAIMarkers: state.showAIMarkers };
  return {
    profile: profile ? { ...profile, levelLabel: DemoProfiles.PRESETS[level].label } : null,
    defaults: DemoProfiles.PRESETS[level].settings,
    manualOverrides: profile ? profile.overrides : settings,
    target: state.exploreData?.target_info || null,
    detections: state.allAiDetections || [], selectedDetectionId: state.selectedDetectionId,
    analysisFrames: (state.exploreData?.target_info?.analysis_frame_indices || []).map(index => state.exploreData.epochs[index]).filter(Boolean),
    spectrum: !state.isLoading && state.assistantSpectrum?.exploreSequence === state.exploreSequence ? state.assistantSpectrum.data : null,
    conversationKey: JSON.stringify([profile?.id || "guest", state.exploreSequence]),
    answerKey: JSON.stringify([state.exploreSequence, state.selectedDetectionId, state.spectrumSequence, Boolean(state.assistantSpectrum)]),
    temporal: state.temporalSearch, loading: state.isLoading,
    revision: JSON.stringify([profile?.id || "guest", level, profile?.explanations, state.exploreSequence, state.isLoading, settings]),
  };
}

function applyAssistantSettings(patch, revision) {
  const context = getAssistantContext();
  if (context.loading || context.revision !== revision) throw new Error("El contexto cambió. Pedí una propuesta nueva.");
  if (!Number.isInteger(patch.maxFrames) || patch.maxFrames < 1 || patch.maxFrames > (state.temporalSearch ? 32 : 102)
      || ![1, 2, 4, 6].includes(patch.fps) || typeof patch.showFlags !== "boolean" || typeof patch.showAIMarkers !== "boolean") {
    throw new Error("Revisá los valores de la propuesta.");
  }
  const settings = { maxFrames: patch.maxFrames, fps: patch.fps, showFlags: patch.showFlags, showAIMarkers: patch.showAIMarkers };
  state.frameLimit = settings.maxFrames;
  state.fps = settings.fps;
  state.showFlags = settings.showFlags;
  state.showAIMarkers = settings.showAIMarkers;
  document.getElementById("input-max-frames").value = settings.maxFrames;
  document.getElementById("select-fps").value = settings.fps;
  document.getElementById("chk-flags").checked = settings.showFlags;
  document.getElementById("chk-ai-markers").checked = settings.showAIMarkers;
  rememberDemoSettings(settings);
  startBlinkTimer();
  renderCanvas();
}

/**
 * Parsea coordenadas en grados decimales o sexagesimales.
 * RA (horas):  133.795 · 08h55m10.831s · 08:55:10.8 · 08 55 10.8 · 08h55m
 * Dec (grados): -7.245 · -07d14m42.53s · -07:14:42.5 · +04d41m36.11s
 */
function parseCoordinateText(raw, kind) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "vacío" };
  let sign = 1;
  let body = text;
  if (body[0] === "-" || body[0] === "−") { sign = -1; body = body.slice(1).trim(); }
  else if (body[0] === "+") { body = body.slice(1).trim(); }
  if (!body) return { ok: false, error: "formato" };
  if (kind === "ra" && sign < 0) return { ok: false, error: "rango" };

  // Sexagesimal: 08h55m10.831s | 08:55:10.831 | 08 55 10.831 | 07d14m42.5s | 07°14'42.5"
  const sex = body.match(/^(\d{1,3})\s*(?:h|d|m|:|°|\s)\s*(\d{1,2})(?:\s*(?:m|'|′|:|°|\s)\s*(\d{1,2}(?:\.\d+)?))?\s*[sd°"″'′]?\s*$/i);
  if (sex) {
    const a = Number.parseFloat(sex[1]);
    const b = Number.parseFloat(sex[2]);
    const c = sex[3] !== undefined ? Number.parseFloat(sex[3]) : 0;
    const isDegRa = kind === "ra" && /[d°]/i.test(body) && !/h/i.test(body);
    const maxA = kind === "ra" ? (isDegRa ? 360 : 24) : 90;
    if (a > maxA || (a === maxA && (b > 0 || c > 0)) || b >= 60 || c >= 60) {
      return { ok: false, error: "rango" };
    }
    const baseDeg = a + b / 60 + c / 3600;
    const value = kind === "ra"
      ? (isDegRa ? baseDeg : baseDeg * 15) // RA en horas: 1h = 15°
      : sign * baseDeg;
    if (kind === "ra" ? value < 0 || value > 360 : value < -90 || value > 90) {
      return { ok: false, error: "rango" };
    }
    return { ok: true, value };
  }

  if (!/^\d+(?:\.\d+)?$/.test(body)) return { ok: false, error: "formato" };
  const value = sign * Number.parseFloat(body);
  if (!Number.isFinite(value)) return { ok: false, error: "formato" };
  if (kind === "ra" ? value < 0 || value > 360 : value < -90 || value > 90) {
    return { ok: false, error: "rango" };
  }
  return { ok: true, value };
}

function coordinateInputMessage(kind, error) {
  const label = kind === "ra" ? "RA" : "Dec";
  if (error === "rango") return `Revisá ${label}: fuera de rango (RA 0–360°, Dec −90–90°).`;
  return `Revisá ${label}: formato no reconocido. Usá grados decimales (133.795) o sexagesimal (08h55m10.831s).`;
}

function getParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ra = parseFloat(params.get("ra"));
  const dec = parseFloat(params.get("dec"));
  const fov = parseFloat(params.get("fov"));
  return {
    ra: !isNaN(ra) ? ra : 133.795129,
    dec: !isNaN(dec) ? dec : -7.245147,
    fov: !isNaN(fov) ? fov : 0.05,
    temporalSearch: params.get("temporal") === "1",
    embed: params.get("embed") === "1",
    invert: params.get("invert") === "1",
  };
}

function syncUrlParams(ra, dec, fov, temporalSearch = false) {
  const url = new URL(window.location);
  url.searchParams.set("ra", Number(ra).toFixed(6));
  url.searchParams.set("dec", Number(dec).toFixed(6));
  url.searchParams.set("fov", Number(fov).toFixed(4));
  if (temporalSearch) url.searchParams.set("temporal", "1");
  else url.searchParams.delete("temporal");
  if (state.embed) url.searchParams.set("embed", "1");
  else url.searchParams.delete("embed");
  if (state.invertPixels) url.searchParams.set("invert", "1");
  else url.searchParams.delete("invert");
  window.history.replaceState({ ...window.history.state, papastronomyManagedUrl: true }, "", url);
}

function pixelToRaDec(xPix, yPix) {
  // Inversa de la proyección TAN usada por Astropy, con origen de píxel 0.
  const radians = Math.PI / 180;
  const center = (CUTOUT_NPIX - 1) / 2;
  const xi = -(xPix - center) * state.fov / CUTOUT_NPIX * radians;
  const eta = (yPix - center) * state.fov / CUTOUT_NPIX * radians;
  const dec0 = state.dec * radians;
  const denominator = Math.cos(dec0) - eta * Math.sin(dec0);
  return {
    ra: ((state.ra + Math.atan2(xi, denominator) / radians) % 360 + 360) % 360,
    dec: Math.atan2(Math.sin(dec0) + eta * Math.cos(dec0), Math.hypot(denominator, xi)) / radians,
  };
}

function raDecToPixel(ra, dec) {
  const radians = Math.PI / 180;
  const delta = (ra - state.ra) * radians;
  const d = dec * radians, d0 = state.dec * radians;
  const denominator = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(delta);
  const xi = Math.cos(d) * Math.sin(delta) / denominator;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(delta)) / denominator;
  const center = (CUTOUT_NPIX - 1) / 2;
  return { x: center - xi / radians * CUTOUT_NPIX / state.fov,
    y: center + eta / radians * CUTOUT_NPIX / state.fov };
}

function angularDistanceDeg(ra1, dec1, ra2, dec2) {
  const rad = Math.PI / 180;
  const dRa = (Number(ra2) - Number(ra1)) * rad;
  const d1 = Number(dec1) * rad;
  const d2 = Number(dec2) * rad;
  const a =
    Math.sin((d2 - d1) / 2) ** 2 +
    Math.cos(d1) * Math.cos(d2) * Math.sin(dRa / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)))) / rad;
}

// ----------------------------------------------------------------------------
// Plano Infinito Sincronizado (Mosaico de Sectores FITS + Precarga Predictiva)
// ----------------------------------------------------------------------------
function getTileCenterCoords(gx, gy) {
  const centerX = gx * TILE_STEP_PIX + (CUTOUT_NPIX - 1) / 2;
  const centerY = gy * TILE_STEP_PIX + (CUTOUT_NPIX - 1) / 2;
  return pixelToRaDec(centerX, centerY);
}

function getDefaultSkyZoom() {
  return state.infinitePlaneEnabled ? DEFAULT_SKY_ZOOM : 1.0;
}

function getTileCanvasRect(gx, gy, canvasSize) {
  const half = canvasSize / 2;
  if (!state.infinitePlaneEnabled && gx === 0 && gy === 0) {
    const fullSize = canvasSize * state.skyView.zoom;
    return {
      x: -half * state.skyView.zoom + half + state.skyView.panX,
      y: -half * state.skyView.zoom + half + state.skyView.panY,
      w: fullSize,
      h: fullSize,
      fullCutout: true,
    };
  }
  const scale = canvasSize / CUTOUT_NPIX;
  const rawX = (gx * TILE_STEP_PIX + TILE_MARGIN_PIX) * scale;
  const rawY = (-gy * TILE_STEP_PIX + TILE_MARGIN_PIX) * scale;
  const coreSize = TILE_STEP_PIX * scale * state.skyView.zoom;
  return {
    x: (rawX - half) * state.skyView.zoom + half + state.skyView.panX,
    y: (rawY - half) * state.skyView.zoom + half + state.skyView.panY,
    w: coreSize + 0.75,
    h: coreSize + 0.75,
    fullCutout: false,
  };
}

function drawSeamlessTileImage(ctx, img, rect) {
  if (!img) return;
  const sourceWidth = img.naturalWidth || img.width || CUTOUT_NPIX;
  const sourceHeight = img.naturalHeight || img.height || CUTOUT_NPIX;
  if (rect.fullCutout) {
    ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  ctx.drawImage(
    img,
    TILE_MARGIN_PIX / CUTOUT_NPIX * sourceWidth,
    TILE_MARGIN_PIX / CUTOUT_NPIX * sourceHeight,
    TILE_STEP_PIX / CUTOUT_NPIX * sourceWidth,
    TILE_STEP_PIX / CUTOUT_NPIX * sourceHeight,
    rect.x,
    rect.y,
    rect.w,
    rect.h
  );
}

function getVisibleTileBounds(canvasSize = 384) {
  const pTopLeft = skyCanvasToFITS(0, 0, canvasSize);
  const pBotRight = skyCanvasToFITS(canvasSize, canvasSize, canvasSize);
  const xMin = Math.min(pTopLeft.xPix, pBotRight.xPix);
  const xMax = Math.max(pTopLeft.xPix, pBotRight.xPix);
  const yMin = Math.min(pTopLeft.yPix, pBotRight.yPix);
  const yMax = Math.max(pTopLeft.yPix, pBotRight.yPix);
  return {
    gxMin: Math.floor((xMin + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX),
    gxMax: Math.floor((xMax + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX),
    gyMin: Math.floor((yMin + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX),
    gyMax: Math.floor((yMax + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX),
    centerGx: ((xMin + xMax) / 2 - (CUTOUT_NPIX - 1) / 2) / TILE_STEP_PIX,
    centerGy: ((yMin + yMax) / 2 - (CUTOUT_NPIX - 1) / 2) / TILE_STEP_PIX,
  };
}

function updateInfinitePlaneBadge() {
  const badge = document.getElementById("infinite-plane-badge");
  const btn = document.getElementById("btn-toggle-infinite-plane");
  if (btn) {
    btn.setAttribute("aria-pressed", String(state.infinitePlaneEnabled));
    btn.textContent = state.infinitePlaneEnabled
      ? "Mapa Global Continuo: ACTIVO"
      : "Activar Mapa Global Continuo";
    btn.className = state.infinitePlaneEnabled
      ? "px-3 py-1.5 rounded-lg text-xs bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-semibold hover:bg-emerald-900/80 transition"
      : "px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition";
  }
  if (!badge) return;
  if (!state.infinitePlaneEnabled) {
    badge.textContent = "Sección única · Mapa global inactivo";
    badge.className =
      "map-status";
    return;
  }
  badge.className =
    "map-status is-active";
  let readyCount = 0;
  let loadingCount = 0;
  state.tileGrid.forEach((t) => {
    if (t.status === "ready") readyCount++;
    else if (t.status === "loading" || t.status === "queued") loadingCount++;
  });
  if (loadingCount > 0) {
    badge.textContent = `Precargando ${loadingCount} sector${loadingCount === 1 ? "" : "es"} · ${readyCount} activo${readyCount === 1 ? "" : "s"}`;
  } else {
    badge.textContent = `Mapa global activo · ${readyCount} sector${readyCount === 1 ? "" : "es"}`;
  }
}

// Los PNG son vistas estiradas de 8 bits, no matrices de flujo ni SNR.
// Conservar la cobertura y cada exposición; nunca rellenar ni mezclar sus píxeles.
function extractDisplayGrid(rgbaData, w = 128, h = 128) {
  const grid = new Float32Array(w * h);
  for (let idx = 0; idx < grid.length; idx++) {
    grid[idx] = rgbaData[idx * 4 + 3] > 0 ? rgbaData[idx * 4] / 255 : NaN;
  }
  return grid;
}

function displayValueToByte(value) {
  const gain = Number.isFinite(state.contrastGain) ? state.contrastGain : 1;
  const amount = Number.isFinite(state.stretchLinearity) ? state.stretchLinearity : 0;
  // Identidad por defecto; la curva adicional solo modifica el brillo de pantalla.
  const v = Math.max(0, Math.min(1, value * gain));
  const adjusted = (1 - amount) * v + amount * v * v;
  const byte = Math.round(adjusted * 255);
  return state.invertPixels ? 255 - byte : byte;
}

function displayGridToCanvas(grid) {
  const canvas = document.createElement("canvas");
  canvas.width = CUTOUT_NPIX;
  canvas.height = CUTOUT_NPIX;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let idx = 0; idx < grid.length; idx++) {
    if (!Number.isFinite(grid[idx])) continue;
    const byte = displayValueToByte(grid[idx]);
    image.data.set([byte, byte, byte, 255], idx * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function renderTileCanvasesFromGrids(gx, gy, visualGrids) {
  const coaddCanvas = displayGridToCanvas(visualGrids.mid);
  return {
    colorCanvas: coaddCanvas,
    coaddCanvas,
    epochCanvases: visualGrids.epochs.map(displayGridToCanvas),
  };
}

function createTileVisualCanvases(coaddImage, epochImages, gx = 0, gy = 0) {
  if (!coaddImage) {
    return { colorCanvas: null, coaddCanvas: null, epochCanvases: epochImages || [], visualGrids: null };
  }
  const readGrid = (image) => {
    const canvas = document.createElement("canvas");
    canvas.width = CUTOUT_NPIX;
    canvas.height = CUTOUT_NPIX;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return extractDisplayGrid(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  };
  const visualGrids = { mid: readGrid(coaddImage), epochs: (epochImages || []).map(readGrid) };
  return { ...renderTileCanvasesFromGrids(gx, gy, visualGrids), visualGrids };
}

function abortBackgroundTiles() {
  if (state.prefetchTimerId) {
    clearTimeout(state.prefetchTimerId);
    state.prefetchTimerId = null;
  }
  state.tileControllers.forEach((ctrl) => ctrl.abort());
  state.tileControllers.clear();
  state.tileQueue = [];
  state.activeTileFetches = 0;
}

function mapDetectionsToGlobalPlane(detections, isOriginTile = false) {
  return (detections || []).map((det) => {
    const globalPos = raDecToPixel(det.ra, det.dec);
    const dx = det.neg_x_pix !== null && det.neg_x_pix !== undefined ? det.neg_x_pix - det.x_pix : 0;
    const dy = det.neg_y_pix !== null && det.neg_y_pix !== undefined ? det.neg_y_pix - det.y_pix : 0;
    return {
      ...det,
      id: isOriginTile ? det.id : state.nextDetectionId++,
      x_pix: globalPos.x,
      y_pix: globalPos.y,
      neg_x_pix: det.neg_x_pix !== null && det.neg_x_pix !== undefined ? globalPos.x + dx : null,
      neg_y_pix: det.neg_y_pix !== null && det.neg_y_pix !== undefined ? globalPos.y + dy : null,
    };
  });
}

function mergeTileDetections(newDetections) {
  const existing = state.allAiDetections || [];
  let added = false;
  newDetections.forEach((det) => {
    const duplicate = existing.some((ex) => Math.hypot(ex.x_pix - det.x_pix, ex.y_pix - det.y_pix) < 3.5);
    if (!duplicate) {
      existing.push(det);
      added = true;
    }
  });
  if (added) {
    state.allAiDetections = existing;
    renderAIDetectionsList(existing);
  }
}

function releaseImagePayload(data) {
  // Las imágenes decodificadas y los canvas ya viven por separado de los metadatos.
  for (const epoch of data.epochs || []) {
    delete epoch.image_base64;
    delete epoch.flags_base64;
  }
  for (const detector of Object.values(data.detector_coadds || {})) delete detector.image_base64;
  delete data.coadd_image_base64;
  delete data.diff_image_base64;
}

function trimTileCache() {
  if (state.tileGrid.size <= MAX_CACHED_TILES) return;
  const { gxMin, gxMax, gyMin, gyMax, centerGx, centerGy } = getVisibleTileBounds(384);
  const candidates = [...state.tileGrid.values()].filter((tile) =>
    tile.key !== "0,0" && tile.status !== "loading" &&
    !(tile.aiDetections || []).some((det) => det.id === state.selectedDetectionId) &&
    (tile.gx < gxMin - 1 || tile.gx > gxMax + 1 || tile.gy < gyMin - 1 || tile.gy > gyMax + 1)
  ).sort((a, b) => Math.hypot(b.gx - centerGx, b.gy - centerGy) - Math.hypot(a.gx - centerGx, a.gy - centerGy));
  for (const tile of candidates) {
    if (state.tileGrid.size <= MAX_CACHED_TILES) break;
    state.tileGrid.delete(tile.key);
  }
  state.tileQueue = state.tileQueue.filter((tile) => state.tileGrid.has(`${tile.gx},${tile.gy}`));
}

async function fetchSingleBackgroundTile(gx, gy, sequence) {
  const key = `${gx},${gy}`;
  const entry = state.tileGrid.get(key);
  if (!entry || entry.status === "ready" || entry.status === "loading") return;

  entry.status = "loading";
  state.activeTileFetches++;
  updateInfinitePlaneBadge();
  renderCanvas();
  renderContextSkyMap();

  const controller = new AbortController();
  state.tileControllers.add(controller);

  try {
    const res = await fetch(
      `/api/explore?ra=${entry.ra.toFixed(6)}&dec=${entry.dec.toFixed(6)}&fov=${state.fov}&max_epochs=6&temporal_search=false&refresh=false`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (sequence !== state.exploreSequence) return;

    const [images, flags, coadd, diff] = await Promise.all([
      Promise.all((data.epochs || []).map((ep) => loadImagePromise(ep.image_base64))),
      Promise.all((data.epochs || []).map((ep) => loadImagePromise(ep.flags_base64))),
      loadImagePromise(data.coadd_image_base64),
      loadImagePromise(data.diff_image_base64),
    ]);
    if (sequence !== state.exploreSequence) return;
    releaseImagePayload(data);

    const mappedDetections = mapDetectionsToGlobalPlane(data.ai_detections || [], false);
    const visuals = createTileVisualCanvases(coadd, images, gx, gy);
    entry.status = "ready";
    entry.exploreData = data;
    entry.epochImages = visuals.epochCanvases;
    entry.flagImages = flags;
    entry.coaddImage = visuals.coaddCanvas || coadd;
    entry.diffImage = diff;
    entry.colorSkyCanvas = visuals.colorCanvas;
    entry.visualGrids = visuals.visualGrids;
    entry.aiDetections = mappedDetections;

    mergeTileDetections(mappedDetections);
    trimTileCache();
    updateInfinitePlaneBadge();
    renderCanvas();
    renderContextSkyMap();
  } catch (err) {
    if (err.name === "AbortError" || sequence !== state.exploreSequence) return;
    entry.status = "error";
    updateInfinitePlaneBadge();
    renderCanvas();
    renderContextSkyMap();
  } finally {
    state.tileControllers.delete(controller);
    if (sequence === state.exploreSequence) {
      state.activeTileFetches = Math.max(0, state.activeTileFetches - 1);
      processTilePrefetchQueue(sequence);
    }
  }
}

function processTilePrefetchQueue(sequence) {
  if (sequence !== state.exploreSequence) return;
  state.tileQueue.sort((a, b) => a.priority - b.priority);
  while (state.activeTileFetches < MAX_CONCURRENT_TILE_FETCHES && state.tileQueue.length > 0) {
    const next = state.tileQueue.shift();
    const key = `${next.gx},${next.gy}`;
    const existing = state.tileGrid.get(key);
    if (existing && existing.status === "queued") {
      void fetchSingleBackgroundTile(next.gx, next.gy, sequence);
    }
  }
}

function enqueueTileForPrefetch(gx, gy, priority) {
  if (Math.abs(gx) > 12 || Math.abs(gy) > 12) return;
  const key = `${gx},${gy}`;
  const coords = getTileCenterCoords(gx, gy);
  if (!Number.isFinite(coords.ra) || !Number.isFinite(coords.dec) || Math.abs(coords.dec) > 89.8) return;

  const existing = state.tileGrid.get(key);
  if (existing) {
    if (existing.status === "queued") {
      const qItem = state.tileQueue.find((q) => q.gx === gx && q.gy === gy);
      if (qItem && priority < qItem.priority) qItem.priority = priority;
    }
    return;
  }

  state.tileGrid.set(key, {
    key,
    gx,
    gy,
    ra: coords.ra,
    dec: coords.dec,
    status: "queued",
    exploreData: null,
    epochImages: [],
    flagImages: [],
    coaddImage: null,
    diffImage: null,
    colorSkyCanvas: null,
    aiDetections: [],
  });
  state.tileQueue.push({ gx, gy, priority });
}

function scheduleInfinitePrefetch() {
  if (!state.infinitePlaneEnabled || !state.exploreData) {
    updateInfinitePlaneBadge();
    return;
  }
  const sequence = state.exploreSequence;

  // Encolar sectores FITS visibles y catálogos tras una breve pausa de arrastre (260 ms)
  if (state.prefetchTimerId) clearTimeout(state.prefetchTimerId);
  state.prefetchTimerId = setTimeout(() => {
    if (sequence !== state.exploreSequence) return;
    void prefetchWideCatalogsAndStars(state.skyView.centerRa, state.skyView.centerDec, sequence);
    const bounds = getVisibleTileBounds(384);
    const { gxMin, gxMax, gyMin, gyMax, centerGx, centerGy } = bounds;

    // Sectores actualmente en pantalla (prioridad máxima)
    for (let gy = gyMin; gy <= gyMax; gy++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const dist = Math.hypot(gx - centerGx, gy - centerGy);
        enqueueTileForPrefetch(gx, gy, dist);
      }
    }

    // Sectores vecinos anticipados según el vector de arrastre o desplazamiento desde el centro
    const pannedDistance = Math.hypot(state.skyView.panX, state.skyView.panY);
    if (pannedDistance > 8 || state.skyView.isDragging) {
      const roundGx = Math.round(centerGx);
      const roundGy = Math.round(centerGy);
      const stepX = state.skyView.velX < -1 ? 1 : state.skyView.velX > 1 ? -1 : 0;
      const stepY = state.skyView.velY > 1 ? 1 : state.skyView.velY < -1 ? -1 : 0;

      if (stepX !== 0 || stepY !== 0) {
        enqueueTileForPrefetch(roundGx + stepX, roundGy + stepY, 2.0);
        if (stepX !== 0) enqueueTileForPrefetch(roundGx + stepX, roundGy, 2.2);
        if (stepY !== 0) enqueueTileForPrefetch(roundGx, roundGy + stepY, 2.2);
      }

      const neighbors = [
        [roundGx + 1, roundGy],
        [roundGx - 1, roundGy],
        [roundGx, roundGy + 1],
        [roundGx, roundGy - 1],
      ];
      neighbors.forEach(([nx, ny]) => {
        const dist = Math.hypot(nx - centerGx, ny - centerGy);
        enqueueTileForPrefetch(nx, ny, 3.0 + dist);
      });
    }

    updateInfinitePlaneBadge();
    processTilePrefetchQueue(sequence);
  }, 260);
}

let planeRenderFrame = null;
function schedulePlaneRender() {
  if (planeRenderFrame !== null) return;
  planeRenderFrame = requestAnimationFrame(() => {
    planeRenderFrame = null;
    renderContextSkyMap();
    renderCanvas();
  });
}

function bindSynchronizedPlaneEvents(canvas) {
  if (!canvas || canvas.dataset.infiniteBound === "1") return;
  canvas.dataset.infiniteBound = "1";

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const half = canvas.width / 2;
      const prevZoom = state.skyView.zoom;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const nextZoom = Math.min(6.0, Math.max(0.5, +(prevZoom * factor).toFixed(2)));
      if (nextZoom === prevZoom) return;

      const scaleRatio = nextZoom / prevZoom;
      state.skyView.panX = cx - half - (cx - half - state.skyView.panX) * scaleRatio;
      state.skyView.panY = cy - half - (cy - half - state.skyView.panY) * scaleRatio;
      state.skyView.zoom = nextZoom;

      const centerFits = skyCanvasToFITS(half, half, canvas.width);
      const centerCoords = pixelToRaDec(centerFits.xPix, centerFits.yPix);
      state.skyView.centerRa = centerCoords.ra;
      state.skyView.centerDec = centerCoords.dec;

      scheduleInfinitePrefetch();
      schedulePlaneRender();
    },
    { passive: false }
  );

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    state.skyView.isDragging = true;
    state.skyView.moved = false;
    state.skyView.dragStartX = e.clientX - state.skyView.panX;
    state.skyView.dragStartY = e.clientY - state.skyView.panY;
    state.skyView.lastMoveX = e.clientX;
    state.skyView.lastMoveY = e.clientY;
    state.skyView.velX = 0;
    state.skyView.velY = 0;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;

    if (state.skyView.isDragging) {
      const nx = e.clientX - state.skyView.dragStartX;
      const ny = e.clientY - state.skyView.dragStartY;
      state.skyView.velX = e.clientX - state.skyView.lastMoveX;
      state.skyView.velY = e.clientY - state.skyView.lastMoveY;
      state.skyView.lastMoveX = e.clientX;
      state.skyView.lastMoveY = e.clientY;

      if (Math.hypot(nx - state.skyView.panX, ny - state.skyView.panY) > 3) {
        state.skyView.moved = true;
      }
      state.skyView.panX = nx;
      state.skyView.panY = ny;

      const half = canvas.width / 2;
      const centerFits = skyCanvasToFITS(half, half, canvas.width);
      const centerCoords = pixelToRaDec(centerFits.xPix, centerFits.yPix);
      state.skyView.centerRa = centerCoords.ra;
      state.skyView.centerDec = centerCoords.dec;

      const coordsEl = document.getElementById("aladin-hud-coords");
      if (coordsEl) {
        coordsEl.textContent = `Centro RA: ${centerCoords.ra.toFixed(5)}° | Dec: ${centerCoords.dec.toFixed(5)}°`;
      }

      scheduleInfinitePrefetch();
      schedulePlaneRender();
      return;
    }

    const { xPix, yPix } = skyCanvasToFITS(cx, cy, canvas.width);
    const coords = pixelToRaDec(xPix, yPix);
    state.skyView.hoverRa = coords.ra;
    state.skyView.hoverDec = coords.dec;
    const coordsEl = document.getElementById("aladin-hud-coords");
    if (coordsEl) {
      coordsEl.textContent = `Cursor RA: ${coords.ra.toFixed(5)}° | Dec: ${coords.dec.toFixed(5)}°`;
    }

    const hoveredObj = findHoveredNamedObject(xPix, yPix, 5.5 / state.skyView.zoom);
    const prevHoverId = state.hoveredNamedObjectId;
    state.hoveredNamedObjectId = hoveredObj ? hoveredObj.id : null;
    canvas.style.cursor = hoveredObj ? "pointer" : "grab";
    if (state.hoveredNamedObjectId !== prevHoverId) {
      if (hoveredObj) {
        showNamedObjectDetail(hoveredObj);
      } else {
        restoreSelectedNamedObjectDetail();
      }
      renderContextSkyMap();
      renderCanvas();
    }
  });

  canvas.addEventListener("mouseleave", () => {
    const coordsEl = document.getElementById("aladin-hud-coords");
    if (coordsEl) {
      coordsEl.textContent = `Centro RA: ${state.skyView.centerRa.toFixed(5)}° | Dec: ${state.skyView.centerDec.toFixed(5)}°`;
    }
    if (state.hoveredNamedObjectId !== null) {
      state.hoveredNamedObjectId = null;
      canvas.style.cursor = "grab";
      restoreSelectedNamedObjectDetail();
      renderContextSkyMap();
      renderCanvas();
    }
  });

  canvas.addEventListener("click", (e) => {
    if (state.skyView.moved || state.isLoading || !state.exploreData) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const { xPix, yPix } = skyCanvasToFITS(cx, cy, canvas.width);

    // 1. Clic sobre un astro con nombre (estrella, planeta o sistema planetario): queda seleccionado
    const hitNamed = findHoveredNamedObject(xPix, yPix, 6.5 / state.skyView.zoom);
    if (hitNamed) {
      selectNamedObject(hitNamed);
      return;
    }

    // 2. Clic en otro lugar del mapa: se libera la selección del astro con nombre
    clearNamedObjectSelection();

    const hitDet = findNearestAIDetection(xPix, yPix, 5.0 / state.skyView.zoom);
    if (hitDet) {
      state.selectedDetectionId = hitDet.id;
      state.selectedPixel = { x: hitDet.x_pix, y: hitDet.y_pix };
    } else {
      state.selectedDetectionId = null;
      state.selectedPixel = { x: xPix, y: yPix };
    }
    updateAIDetectionCardsSelection(true);
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const coords = pixelToRaDec(xPix, yPix);
    const tileGx = Math.floor((xPix + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
    const tileGy = Math.floor((yPix + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
    const tileCenter = getTileCenterCoords(tileGx, tileGy);
    fetchAndRenderSpectrum(coords.ra, coords.dec, true, tileCenter.ra, tileCenter.dec);
  });
}

function initAladinLite(ra, dec, fov) {
  state.skyView.centerRa = ra;
  state.skyView.centerDec = dec;
  state.skyView.zoom = getDefaultSkyZoom();
  state.skyView.panX = 0;
  state.skyView.panY = 0;

  const skyCanvas = document.getElementById("aladin-canvas");
  const spherexCanvas = document.getElementById("spherex-canvas");
  if (skyCanvas) bindSynchronizedPlaneEvents(skyCanvas);
  if (spherexCanvas) bindSynchronizedPlaneEvents(spherexCanvas);

  window.addEventListener("mouseup", () => {
    state.skyView.isDragging = false;
  });

  const btnZoomIn = document.getElementById("aladin-zoom-in");
  const btnZoomOut = document.getElementById("aladin-zoom-out");

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      const prevZoom = state.skyView.zoom;
      const nextZoom = Math.min(6.0, +(prevZoom * 1.35).toFixed(2));
      const ratio = nextZoom / prevZoom;
      state.skyView.panX *= ratio;
      state.skyView.panY *= ratio;
      state.skyView.zoom = nextZoom;
      scheduleInfinitePrefetch();
      renderContextSkyMap();
      renderCanvas();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      const prevZoom = state.skyView.zoom;
      const nextZoom = Math.max(0.5, +(prevZoom / 1.35).toFixed(2));
      const ratio = nextZoom / prevZoom;
      state.skyView.panX *= ratio;
      state.skyView.panY *= ratio;
      state.skyView.zoom = nextZoom;
      scheduleInfinitePrefetch();
      renderContextSkyMap();
      renderCanvas();
    });
  }

  renderContextSkyMap();
}

function skyCanvasToFITS(cx, cy, canvasSize) {
  const half = canvasSize / 2;
  const zx = (cx - half - state.skyView.panX) / state.skyView.zoom + half;
  const zy = (cy - half - state.skyView.panY) / state.skyView.zoom + half;
  const scale = canvasSize / CUTOUT_NPIX;
  const xPix = zx / scale - 0.5;
  const yPix = CUTOUT_NPIX - 1.0 - (zy / scale - 0.5);
  return { xPix, yPix };
}

function fitsToSkyCanvas(xPix, yPix, canvasSize) {
  const scale = canvasSize / CUTOUT_NPIX;
  const half = canvasSize / 2;
  const rawX = (xPix + 0.5) * scale;
  const rawY = (CUTOUT_NPIX - 1.0 - yPix + 0.5) * scale;
  return {
    cx: (rawX - half) * state.skyView.zoom + half + state.skyView.panX,
    cy: (rawY - half) * state.skyView.zoom + half + state.skyView.panY,
  };
}

function buildThreeBandRgbCanvas() {
  const grids = state.originVisualGrids;
  const epochs = state.exploreData?.epochs || [];
  if (!grids || !grids.epochs || grids.epochs.length === 0) return null;
  const w = 128;
  const h = 128;
  const blueIdxs = [];
  const greenIdxs = [];
  const redIdxs = [];
  epochs.forEach((ep, idx) => {
    const wl = Number(ep.wavelength_center_um || 0);
    if (wl > 0 && wl < 1.65) blueIdxs.push(idx);
    else if (wl >= 1.65 && wl < 3.0) greenIdxs.push(idx);
    else if (wl >= 3.0) redIdxs.push(idx);
  });

  if (!blueIdxs.length || !greenIdxs.length || !redIdxs.length) return null;
  const sampleIndices = (idxs, pIdx) => {
    const values = idxs.map((idx) => grids.epochs[idx]?.[pIdx]).filter(Number.isFinite);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  };

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const imgData = ctx.createImageData(w, h);
  for (let pIdx = 0; pIdx < w * h; pIdx++) {
    const blueValue = sampleIndices(blueIdxs, pIdx);
    const redValue = sampleIndices(redIdxs, pIdx);
    const greenValue = sampleIndices(greenIdxs, pIdx);
    if (![blueValue, redValue, greenValue].every(Number.isFinite)) continue;
    const rByte = displayValueToByte(redValue);
    const gByte = displayValueToByte(greenValue);
    const bByte = displayValueToByte(blueValue);
    const i = pIdx * 4;
    imgData.data[i] = rByte;
    imgData.data[i + 1] = gByte;
    imgData.data[i + 2] = bByte;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function computeManualEpochPairCanvas(idxA, idxB, op = "diff") {
  const grids = state.originVisualGrids;
  if (!grids || !grids.epochs || !grids.epochs[idxA] || !grids.epochs[idxB]) return null;
  const w = 128;
  const h = 128;
  const gridA = grids.epochs[idxA];
  const gridB = grids.epochs[idxB];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const imgData = ctx.createImageData(w, h);

  for (let pIdx = 0; pIdx < w * h; pIdx++) {
    const i = pIdx * 4;
    if (!Number.isFinite(gridA[pIdx]) || !Number.isFinite(gridB[pIdx])) continue;
    if (op === "sum") {
      const avg = 0.5 * (gridA[pIdx] + gridB[pIdx]);
      const g = displayValueToByte(avg);
      imgData.data[i] = g;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = g;
      imgData.data[i + 3] = 255;
    } else {
      const delta = gridB[pIdx] - gridA[pIdx];
      const norm = Math.tanh(delta * 3);
      if (norm >= 0) {
        imgData.data[i] = Math.min(255, Math.round(12 + norm * 243));
        imgData.data[i + 1] = Math.min(255, Math.round(16 + norm * 55));
        imgData.data[i + 2] = Math.min(255, Math.round(28 + norm * 70));
      } else {
        const u = -norm;
        imgData.data[i] = Math.min(255, Math.round(12 + u * 44));
        imgData.data[i + 1] = Math.min(255, Math.round(16 + u * 173));
        imgData.data[i + 2] = Math.min(255, Math.round(28 + u * 220));
      }
      imgData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function computeShiftAndStackCanvas(pmRaMasYr, pmDecMasYr, directPixelDelta = null) {
  const grids = state.originVisualGrids;
  const epochs = state.exploreData?.epochs || [];
  if (!grids || !grids.epochs || grids.epochs.length === 0) return null;
  const nEp = grids.epochs.length;
  const w = 128;
  const h = 128;

  const parseMjd = (obsTime) => {
    const num = Number(obsTime);
    if (Number.isFinite(num) && num > 10000) return num;
    const parsed = Date.parse(String(obsTime || ""));
    return Number.isFinite(parsed) ? parsed / 86400000 + 40587 : NaN;
  };
  const mjds = epochs.map((ep) => parseMjd(ep?.obs_time));
  const validMjds = mjds.filter(Number.isFinite);
  const minMjd = validMjds.length ? Math.min(...validMjds) : 0;
  const maxMjd = validMjds.length ? Math.max(...validMjds) : 0;
  const spanDays = maxMjd - minMjd;
  const arcsecPerPix = Math.max(0.05, (state.fov * 3600.0) / CUTOUT_NPIX);

  const sampleBilinear = (grid, x, y) => {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
    const cx = x;
    const cy = y;
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const fx = cx - x0;
    const fy = cy - y0;
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const samples = [[grid[y0 * w + x0], (1-fx)*(1-fy)],
      [grid[y0 * w + x1], fx*(1-fy)], [grid[y1 * w + x0], (1-fx)*fy],
      [grid[y1 * w + x1], fx*fy]];
    if (samples.some(([v, weight]) => weight > 1e-9 && !Number.isFinite(v))) return NaN;
    return samples.reduce((sum, [v, weight]) => sum + (weight > 1e-9 ? v * weight : 0), 0);
  };

  if (!directPixelDelta && (pmRaMasYr || pmDecMasYr) && validMjds.length !== nEp) return null;
  const shifts = [];
  for (let k = 0; k < nEp; k++) {
    if (directPixelDelta && Number.isFinite(directPixelDelta.dxEarlyToLate) && Number.isFinite(directPixelDelta.dyEarlyToLate)) {
      const fracFromLate = spanDays > 0 && Number.isFinite(mjds[k])
        ? (mjds[k] - maxMjd) / spanDays : 0;
      shifts.push({
        dx: fracFromLate * directPixelDelta.dxEarlyToLate,
        dy: -fracFromLate * directPixelDelta.dyEarlyToLate,
      });
    } else {
      const dtYears =
        Number.isFinite(mjds[k])
          ? (mjds[k] - maxMjd) / 365.25
          : 0;
      const dRaArcsec = (pmRaMasYr / 1000.0) * dtYears;
      const dDecArcsec = (pmDecMasYr / 1000.0) * dtYears;
      shifts.push({
        dx: -dRaArcsec / arcsecPerPix,
        dy: -dDecArcsec / arcsecPerPix,
      });
    }
  }

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const imgData = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let sum = 0;
      let count = 0;
      for (let k = 0; k < nEp; k++) {
        const value = sampleBilinear(grids.epochs[k], px + shifts[k].dx, py + shifts[k].dy);
        if (Number.isFinite(value)) { sum += value; count++; }
      }
      if (!count) continue;
      const g = displayValueToByte(sum / count);
      const i = (py * w + px) * 4;
      imgData.data[i] = g;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = g;
      imgData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function rebakeAllOpticalCanvases() {
  if (state.tileGrid && state.tileGrid.size > 0) {
    state.tileGrid.forEach((tile) => {
      if (!tile || tile.status !== "ready" || !tile.visualGrids) return;
      const baked = renderTileCanvasesFromGrids(tile.gx, tile.gy, tile.visualGrids);
      tile.coaddImage = baked.coaddCanvas;
      tile.epochImages = baked.epochCanvases;
      tile.colorSkyCanvas = baked.colorCanvas;
      if (tile.gx === 0 && tile.gy === 0) {
        state.coaddImage = baked.coaddCanvas;
        state.epochImages = baked.epochCanvases;
        state.skyView.colorSkyCanvas = baked.colorCanvas;
      }
    });
  } else if (state.originVisualGrids) {
    const baked = renderTileCanvasesFromGrids(0, 0, state.originVisualGrids);
    state.coaddImage = baked.coaddCanvas;
    state.epochImages = baked.epochCanvases;
    state.skyView.colorSkyCanvas = baked.colorCanvas;
  }
  state.rgbCompositeCanvas = buildThreeBandRgbCanvas();
  if ((state.viewMode === "manual_diff" || state.viewMode === "manual_sum") && state.manualOpMeta) {
    state.manualOpCanvas = computeManualEpochPairCanvas(
      state.manualOpMeta.idxA,
      state.manualOpMeta.idxB,
      state.manualOpMeta.op
    );
  }
  if (state.viewMode === "shift_stack" && state.shiftStackMeta) {
    state.shiftStackCanvas = computeShiftAndStackCanvas(
      state.shiftStackMeta.pmRaMasYr,
      state.shiftStackMeta.pmDecMasYr,
      state.shiftStackMeta.directPixelDelta || null
    );
  }
  renderCanvas();
  renderContextSkyMap();
}

function buildCatalogSourcesFromField() {
  const visuals = createTileVisualCanvases(state.coaddImage, state.epochImages, 0, 0);
  state.originVisualGrids = visuals.visualGrids || null;
  state.skyView.colorSkyCanvas = visuals.colorCanvas;
  if (visuals.coaddCanvas) state.coaddImage = visuals.coaddCanvas;
  if (visuals.epochCanvases?.length) state.epochImages = visuals.epochCanvases;
  state.rgbCompositeCanvas = buildThreeBandRgbCanvas();
  state.manualOpCanvas = null;
  state.manualOpMeta = null;
  state.shiftStackCanvas = null;
  state.shiftStackMeta = null;
  state.skyView.gaiaSources = [];
  state.skyView.wiseSources = [];
  state.skyView.namedObjects = [];
  state.selectedNamedObjectId = null;
  state.hoveredNamedObjectId = null;
}

function findHoveredNamedObject(xPix, yPix, maxDistFitsPx = 5.5) {
  const objects = state.skyView.namedObjects || [];
  let best = null;
  let bestDist = maxDistFitsPx;
  objects.forEach((obj) => {
    const d = Math.hypot(obj.x - xPix, obj.y - yPix);
    if (d <= bestDist) {
      bestDist = d;
      best = obj;
    }
  });
  return best;
}

function drawTagAbovePoint(ctx, cx, cy, labelText, borderColor, textColor, canvasW) {
  ctx.save();
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(labelText).width;
  const padX = 6;
  const boxW = tw + padX * 2;
  const boxH = 18;
  const boxX = Math.min(canvasW - boxW - 4, Math.max(4, cx - boxW / 2));
  const placeBelow = cy < 32;
  const boxY = placeBelow ? cy + 12 : cy - 11 - boxH;

  ctx.fillStyle = "rgba(6, 9, 17, 0.92)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.1;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.beginPath();
  if (placeBelow) {
    ctx.moveTo(cx, cy + 7);
    ctx.lineTo(cx, boxY);
  } else {
    ctx.moveTo(cx, boxY + boxH);
    ctx.lineTo(cx, cy - 7);
  }
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.fillText(labelText, boxX + padX, boxY + 13);
  ctx.restore();
}

function showNamedObjectDetail(obj) {
  const detailEl = document.getElementById("named-object-detail");
  if (!detailEl) return;
  detailEl.replaceChildren();

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center justify-between gap-1 mb-0.5";
  const title = document.createElement("span");
  title.className = "font-bold text-emerald-300";
  title.textContent = obj.name;
  const cat = document.createElement("span");
  cat.className = "text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700";
  cat.textContent = obj.category;
  header.append(title, cat);
  detailEl.appendChild(header);

  const expl = document.createElement("p");
  expl.className = "text-slate-200 leading-snug";
  expl.textContent = obj.explanation;
  detailEl.appendChild(expl);

  if (!obj.in_fov) {
    const jumpWrap = document.createElement("div");
    jumpWrap.className = "mt-1 flex items-center justify-between gap-2 text-[10px] text-amber-300";
    const note = document.createElement("span");
    note.textContent = `A ${(obj.distance_arcsec / 60).toFixed(1)}′ del centro (mismo sistema).`;
    const btnJump = document.createElement("button");
    btnJump.type = "button";
    btnJump.className = "px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-semibold transition shrink-0";
    btnJump.textContent = "Ir a este astro";
    btnJump.addEventListener("click", () => {
      exploreCoordinates(obj.ra, obj.dec, state.fov);
    });
    jumpWrap.append(note, btnJump);
    detailEl.appendChild(jumpWrap);
  }
}

function renderNamedObjectsPanel() {
  const countEl = document.getElementById("named-objects-count");
  const listEl = document.getElementById("named-objects-list");
  const detailEl = document.getElementById("named-object-detail");
  if (!countEl || !listEl || !detailEl) return;

  const objects = state.skyView.namedObjects || [];
  listEl.replaceChildren();

  if (objects.length === 0) {
    countEl.textContent = "0 con nombre propio";
    detailEl.textContent = "Sin estrellas con nombre propio en este recorte. Tocá cualquier fuente para medir su espectro.";
    return;
  }

  const totalPlanets = objects.reduce((acc, o) => acc + (o.planets ? o.planets.length : 0) + (o.kind === "planet" ? 1 : 0), 0);
  countEl.textContent = totalPlanets > 0
    ? `${objects.length} astro${objects.length === 1 ? "" : "s"} · ${totalPlanets} planeta${totalPlanets === 1 ? "" : "s"}`
    : `${objects.length} identificado${objects.length === 1 ? "" : "s"}`;

  objects.forEach((obj) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSelected = state.selectedNamedObjectId === obj.id;
    const hasPlanets = (obj.planets && obj.planets.length > 0) || obj.kind === "planet";
    btn.className = `px-2 py-0.5 rounded text-[11px] font-medium border transition ${
      isSelected
        ? "bg-emerald-500/25 border-emerald-400 text-white"
        : hasPlanets
        ? "bg-indigo-950/70 hover:bg-indigo-900/80 border-indigo-500/50 text-indigo-200"
        : "bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-200"
    }`;
    const planetBadge = obj.planets && obj.planets.length > 0
      ? ` (${obj.planets.length} planeta${obj.planets.length === 1 ? "" : "s"})`
      : "";
    btn.textContent = `${obj.name}${planetBadge}`;
    btn.dataset.namedId = String(obj.id);
    btn.setAttribute("aria-pressed", String(isSelected));
    btn.addEventListener("mouseenter", () => {
      state.hoveredNamedObjectId = obj.id;
      showNamedObjectDetail(obj);
      renderContextSkyMap();
      renderCanvas();
    });
    btn.addEventListener("mouseleave", () => {
      state.hoveredNamedObjectId = null;
      restoreSelectedNamedObjectDetail();
      renderContextSkyMap();
      renderCanvas();
    });
    btn.addEventListener("click", () => {
      selectNamedObject(obj, { recenter: true, scroll: false });
    });
    listEl.appendChild(btn);
  });

  restoreSelectedNamedObjectDetail();
}

function showNamedObjectsHint() {
  const detailEl = document.getElementById("named-object-detail");
  if (!detailEl) return;
  detailEl.replaceChildren();
  detailEl.textContent =
    "Pasá el cursor por encima de las estrellas del mapa para ver su nombre, o tocá una para fijarla y ver su información y espectro.";
}

function restoreSelectedNamedObjectDetail() {
  const activeObj = (state.skyView.namedObjects || []).find((o) => o.id === state.selectedNamedObjectId);
  if (activeObj) {
    showNamedObjectDetail(activeObj);
  } else {
    if (state.selectedNamedObjectId !== null) state.selectedNamedObjectId = null;
    if ((state.skyView.namedObjects || []).length > 0) showNamedObjectsHint();
  }
}

function selectNamedObject(obj, { recenter = false, scroll = true } = {}) {
  if (!obj) return;
  state.selectedNamedObjectId = obj.id;
  state.hoveredNamedObjectId = null;
  state.selectedDetectionId = null;
  state.selectedPixel = { x: obj.x, y: obj.y };
  renderNamedObjectsPanel();
  showNamedObjectDetail(obj);
  if (scroll) {
    const chip = document.querySelector(`#named-objects-list [data-named-id="${CSS.escape(String(obj.id))}"]`);
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    document.getElementById("named-objects-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  updateAIDetectionCardsSelection();
  updateCatalogSelectionSummary();
  if (recenter) {
    updateAladinView(obj.ra, obj.dec, state.fov);
  } else {
    renderContextSkyMap();
  }
  renderCanvas();
  const tileGx = Math.floor((obj.x + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const tileGy = Math.floor((obj.y + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const tileCenter = getTileCenterCoords(tileGx, tileGy);
  fetchAndRenderSpectrum(obj.ra, obj.dec, true, tileCenter.ra, tileCenter.dec);
}

function clearNamedObjectSelection() {
  if (state.selectedNamedObjectId === null) return;
  state.selectedNamedObjectId = null;
  renderNamedObjectsPanel();
}

function projectNamedObjects() {
  (state.skyView.namedObjects || []).forEach((obj) => {
    obj.ra = obj.catalogRa ?? obj.ra;
    obj.dec = obj.catalogDec ?? obj.dec;
    Object.assign(obj, raDecToPixel(obj.ra, obj.dec));
  });
}

function mergeNamedObjects(newObjects) {
  const map = new Map();
  (state.skyView.namedObjects || []).forEach((obj) => map.set(obj.id, obj));
  (newObjects || []).forEach((obj) => {
    const existing = map.get(obj.id);
    const catalogRa = existing?.catalogRa ?? obj.ra;
    const catalogDec = existing?.catalogDec ?? obj.dec;
    const pos = raDecToPixel(catalogRa, catalogDec);
    const inFov = obj.in_fov !== undefined
      ? Boolean(obj.in_fov)
      : (pos.x >= -2 && pos.x <= CUTOUT_NPIX + 2 && pos.y >= -2 && pos.y <= CUTOUT_NPIX + 2);
    map.set(obj.id, {
      ...obj,
      catalogRa,
      catalogDec,
      ...pos,
      in_fov: state.infinitePlaneEnabled ? true : inFov,
    });
  });
  state.skyView.namedObjects = Array.from(map.values());
  projectNamedObjects();
}

function mergeCatalogSources(key, newSources) {
  const map = new Map();
  (state.skyView[key] || []).forEach((src) => map.set(src.id, src));
  (newSources || []).forEach((src) => {
    const rawPos = raDecToPixel(src.ra, src.dec);
    map.set(src.id, {
      ...src,
      x: rawPos.x,
      y: rawPos.y,
      w1: src.mag,
    });
  });
  state.skyView[key] = Array.from(map.values());
}

async function prefetchWideCatalogsAndStars(centerRa, centerDec, sequence) {
  if (!Number.isFinite(centerRa) || !Number.isFinite(centerDec)) return;
  const cosDec = Math.max(0.05, Math.cos((centerDec * Math.PI) / 180));
  const minStep = state.fov * 1.15;
  const alreadyQueried = state.catalogCentersQueried.some((q) => {
    const dra = (((centerRa - q.ra + 180) % 360 + 360) % 360 - 180) * cosDec;
    const ddec = centerDec - q.dec;
    return Math.hypot(dra, ddec) < minStep;
  });
  if (alreadyQueried) return;

  state.catalogCentersQueried.push({ ra: centerRa, dec: centerDec });
  const wideFov = Number(Math.min(0.45, Math.max(state.fov * 3.0, 0.12)).toFixed(4));
  const controller = new AbortController();
  state.tileControllers.add(controller);

  const refreshBadge = () => {
    const badgeEl = document.getElementById("aladin-catalog-badge");
    if (badgeEl) {
      badgeEl.textContent = `Gaia: ${state.skyView.gaiaSources.length} · WISE: ${state.skyView.wiseSources.length}`;
    }
  };

  try {
    await Promise.all([
      (async () => {
        try {
          const res = await fetch(`/api/objects?ra=${centerRa.toFixed(6)}&dec=${centerDec.toFixed(6)}&fov=${wideFov}`, {
            signal: controller.signal,
          });
          if (!res.ok) return;
          const data = await res.json();
          if (sequence !== state.exploreSequence) return;
          mergeNamedObjects(data.objects || []);
          renderNamedObjectsPanel();
          renderContextSkyMap();
          renderCanvas();
        } catch {
          // Ignorar errores de precarga en segundo plano
        }
      })(),
      ...["gaia", "allwise"].map(async (catalog) => {
        try {
          const res = await fetch(
            `/api/catalog?catalog=${catalog}&ra=${centerRa.toFixed(6)}&dec=${centerDec.toFixed(6)}&fov=${wideFov}`,
            { signal: controller.signal }
          );
          if (!res.ok) return;
          const data = await res.json();
          if (sequence !== state.exploreSequence) return;
          const key = catalog === "gaia" ? "gaiaSources" : "wiseSources";
          mergeCatalogSources(key, data.sources || []);
          state.catalogStatus[catalog] = `${state.skyView[key].length} · ${data.service || "catálogo"}`;
          refreshBadge();
          updateCatalogSelectionSummary();
          renderContextSkyMap();
        } catch {
          // Ignorar errores de precarga en segundo plano
        }
      }),
    ]);
  } finally {
    state.tileControllers.delete(controller);
  }
}

async function loadFieldCatalogs(sequence) {
  state.catalogStatus = { gaia: "consultando", allwise: "consultando" };
  state.catalogCentersQueried = [{ ra: state.ra, dec: state.dec }];
  const refreshBadge = () => {
    document.getElementById("aladin-catalog-badge").textContent =
      `Gaia: ${state.catalogStatus.gaia} · WISE: ${state.catalogStatus.allwise}`;
  };
  refreshBadge();

  const effFov = state.infinitePlaneEnabled
    ? Number(Math.min(0.45, Math.max(state.fov * 3.0, 0.12)).toFixed(4))
    : state.fov;

  const objectsPromise = (async () => {
    try {
      const res = await fetch(`/api/objects?ra=${state.ra}&dec=${state.dec}&fov=${effFov}`,
        { signal: state.exploreController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (sequence !== state.exploreSequence) return;
      mergeNamedObjects(data.objects || []);
      renderNamedObjectsPanel();
      refreshAIDetectionCatalogLabels();
      renderContextSkyMap();
      renderCanvas();
    } catch (error) {
      if (sequence !== state.exploreSequence || error.name === "AbortError") return;
      const countEl = document.getElementById("named-objects-count");
      if (countEl) countEl.textContent = "Sin conexión";
    }
  })();

  await Promise.all([
    objectsPromise,
    ...["gaia", "allwise"].map(async (catalog) => {
      try {
        const res = await fetch(`/api/catalog?catalog=${catalog}&ra=${state.ra}&dec=${state.dec}&fov=${effFov}`,
          { signal: state.exploreController.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (sequence !== state.exploreSequence) return;
        const key = catalog === "gaia" ? "gaiaSources" : "wiseSources";
        mergeCatalogSources(key, data.sources || []);
        state.catalogStatus[catalog] = `${state.skyView[key].length}${data.truncated ? "+" : ""} · ${data.service || "catálogo"}`;
      } catch (error) {
        if (sequence !== state.exploreSequence || error.name === "AbortError") return;
        state.catalogStatus[catalog] = "no disponible";
      }
      refreshBadge();
      updateCatalogSelectionSummary();
      renderContextSkyMap();
    }),
  ]);
}

function updateCatalogSelectionSummary() {
  const selHud = document.getElementById("aladin-hud-selection");
  const summaryEl = document.getElementById("aladin-match-summary");
  if (!selHud || !summaryEl) return;

  const pix = state.selectedPixel || { x: 64, y: 64 };
  const coords = pixelToRaDec(pix.x, pix.y);

  const nearest = (sources) => sources.reduce((best, src) => {
    const distance = Math.hypot(src.x - pix.x, src.y - pix.y);
    return !best || distance < best.distance ? { ...src, distance } : best;
  }, null);
  const describe = (name, sources) => {
    const source = nearest(sources);
    return source ? `${name}: ${source.id} a ${(source.distance * state.fov * 3600 / CUTOUT_NPIX).toFixed(1)}″`
      : `${name}: ${state.catalogStatus[name === "Gaia" ? "gaia" : "allwise"] || "sin consulta"}`;
  };
  selHud.textContent = `Píxel (${pix.x.toFixed(1)}, ${pix.y.toFixed(1)}) · RA ${coords.ra.toFixed(5)}°, Dec ${coords.dec.toFixed(5)}°`;
  const match = state.crossmatchByDetId[state.selectedDetectionId];
  summaryEl.textContent = match || `${describe("Gaia", state.skyView.gaiaSources)} · ${describe("AllWISE", state.skyView.wiseSources)}`;
}

function updateAladinView(ra, dec, fov) {
  state.skyView.centerRa = Number(ra);
  state.skyView.centerDec = Number(dec);

  const targetPix = raDecToPixel(state.skyView.centerRa, state.skyView.centerDec);
  const canvas = document.getElementById("aladin-canvas") || document.getElementById("spherex-canvas");
  if (canvas) {
    const scale = canvas.width / CUTOUT_NPIX;
    const half = canvas.width / 2;
    const rawX = (targetPix.x + 0.5) * scale;
    const rawY = (CUTOUT_NPIX - 1.0 - targetPix.y + 0.5) * scale;
    state.skyView.panX = -((rawX - half) * state.skyView.zoom);
    state.skyView.panY = -((rawY - half) * state.skyView.zoom);
  } else {
    state.skyView.panX = 0;
    state.skyView.panY = 0;
  }

  const coordsEl = document.getElementById("aladin-hud-coords");
  if (coordsEl) {
    coordsEl.textContent = `Centro RA: ${state.skyView.centerRa.toFixed(5)}° | Dec: ${state.skyView.centerDec.toFixed(5)}°`;
  }
  scheduleInfinitePrefetch();
  updateCatalogSelectionSummary();
  renderContextSkyMap();
  renderCanvas();
}

function drawInfiniteTilePlaceholder(ctx, rect, gx, gy, status) {
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);

  if (rect.w >= 90) {
    const center = getTileCenterCoords(gx, gy);
    ctx.fillStyle = "rgba(148, 163, 184, 0.55)";
    ctx.font = "10px ui-monospace, monospace";
    const statusLabel =
      status === "error"
        ? "Sector sin cobertura FITS"
        : status === "loading"
        ? "Descargando paquete FITS..."
        : "Sector en cola de precarga...";
    ctx.fillText(statusLabel, rect.x + 10, rect.y + 18);
    ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
    ctx.fillText(`RA ${center.ra.toFixed(3)}° · Dec ${center.dec.toFixed(3)}°`, rect.x + 10, rect.y + 32);
  }
  ctx.restore();
}

const SURVEY_HIPS_MAP = {
  allwise: { id: "CDS/P/allWISE/color", label: "AllWISE Color (3.4/4.6/12 µm)" },
  "2mass": { id: "CDS/P/2MASS/color", label: "2MASS Color (J/H/Ks)" },
  dss2: { id: "CDS/P/DSS2/color", label: "DSS2 Óptico (Rojo/Azul)" },
};

function externalSurveyKey(survey, ra, dec, fov) {
  return `${survey}|${Number(ra).toFixed(5)}|${Number(dec).toFixed(5)}|${Number(fov).toFixed(4)}`;
}

function ensureExternalSurveyImage(survey, ra, dec, fov) {
  const meta = SURVEY_HIPS_MAP[survey];
  if (!meta) return null;
  const key = externalSurveyKey(survey, ra, dec, fov);
  const cached = state.externalSurveyCache.get(key);
  if (cached) {
    state.externalSurveyCache.delete(key);
    state.externalSurveyCache.set(key, cached);
    return cached.status === "ready" ? cached.img : null;
  }
  while (state.externalSurveyCache.size >= MAX_SURVEY_IMAGES) {
    const oldestKey = state.externalSurveyCache.keys().next().value;
    const oldest = state.externalSurveyCache.get(oldestKey);
    if (oldest.status === "loading" && oldest.img) {
      oldest.img.onload = null;
      oldest.img.onerror = null;
      oldest.img.removeAttribute("src");
    }
    state.externalSurveyCache.delete(oldestKey);
  }
  const entry = { status: "loading", img: null };
  state.externalSurveyCache.set(key, entry);
  const img = new Image();
  entry.img = img;
  img.crossOrigin = "anonymous";
  img.onload = () => {
    entry.status = "ready";
    entry.img = img;
    renderContextSkyMap();
  };
  img.onerror = () => {
    entry.status = "error";
    renderContextSkyMap();
  };
  img.src =
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=${encodeURIComponent(meta.id)}` +
    `&width=384&height=384&fov=${encodeURIComponent(fov)}&projection=TAN&coordsys=icrs` +
    `&ra=${encodeURIComponent(ra)}&dec=${encodeURIComponent(dec)}&format=jpg`;
  return null;
}

function paintCoverageBackground(ctx, width, height) {
  for (let y = 0; y < height; y += 12) {
    for (let x = 0; x < width; x += 12) {
      ctx.fillStyle = ((x / 12 + y / 12) % 2) ? "#172333" : "#101927";
      ctx.fillRect(x, y, 12, 12);
    }
  }
}

function renderContextSkyMap() {
  const canvas = document.getElementById("aladin-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  paintCoverageBackground(ctx, W, H);

  const bounds = state.infinitePlaneEnabled
    ? getVisibleTileBounds(W)
    : { gxMin: 0, gxMax: 0, gyMin: 0, gyMax: 0 };
  const { gxMin, gxMax, gyMin, gyMax } = bounds;

  const surveyHudEl = document.getElementById("aladin-hud-survey");
  if (surveyHudEl) {
    if (state.contextSurvey !== "spherex" && SURVEY_HIPS_MAP[state.contextSurvey]) {
      surveyHudEl.textContent = SURVEY_HIPS_MAP[state.contextSurvey].label;
      surveyHudEl.className = "text-amber-300 font-semibold";
    } else {
      surveyHudEl.textContent = "SPHEREx · mediana de los recortes";
      surveyHudEl.className = "text-sky-300 font-semibold";
    }
  }

  // 1. Dibujar todos los sectores del mosaico continuo infrarrojo visibles en pantalla
  ctx.save();
  ctx.imageSmoothingEnabled = state.contextSurvey !== "spherex";
  for (let gy = gyMin; gy <= gyMax; gy++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const rect = getTileCanvasRect(gx, gy, W);
      const tile = state.tileGrid.get(`${gx},${gy}`);
      const isOrigin = gx === 0 && gy === 0;
      const extSurveyImg =
        isOrigin && state.contextSurvey !== "spherex"
          ? ensureExternalSurveyImage(state.contextSurvey, state.ra, state.dec, state.fov)
          : null;
      const colorImg = state.contextSurvey !== "spherex"
        ? extSurveyImg
        : (tile && tile.status === "ready")
        ? tile.colorSkyCanvas
        : isOrigin
        ? state.skyView.colorSkyCanvas
        : null;
      if (colorImg) {
        drawSeamlessTileImage(ctx, colorImg, rect);
      } else {
        if (state.contextSurvey !== "spherex") {
          const entry = state.externalSurveyCache.get(externalSurveyKey(state.contextSurvey, state.ra, state.dec, state.fov));
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(isOrigin ? (entry?.status === "error" ? "No se pudo cargar el relevamiento" : "Cargando relevamiento…") : "Relevamiento externo: campo central", rect.x + rect.w / 2, rect.y + rect.h / 2);
          ctx.textAlign = "start";
        } else {
          drawInfiniteTilePlaceholder(ctx, rect, gx, gy, tile?.status || "queued");
        }
      }
    }
  }
  ctx.restore();

  // 2. Grilla astrométrica ICRS continua a lo largo de todos los sectores visibles
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.11)";
  ctx.lineWidth = 1;
  const subSteps = [0, 24, 48, 72];
  for (let gx = gxMin; gx <= gxMax + 1; gx++) {
    subSteps.forEach((step) => {
      const xPix = gx * TILE_STEP_PIX + TILE_MARGIN_PIX + step;
      const p = fitsToSkyCanvas(xPix, 0, W);
      if (p.cx >= -2 && p.cx <= W + 2) {
        ctx.beginPath();
        ctx.moveTo(p.cx, 0);
        ctx.lineTo(p.cx, H);
        ctx.stroke();
      }
    });
  }
  for (let gy = gyMin; gy <= gyMax + 1; gy++) {
    subSteps.forEach((step) => {
      const yPix = gy * TILE_STEP_PIX + TILE_MARGIN_PIX + step;
      const q = fitsToSkyCanvas(0, yPix, W);
      if (q.cy >= -2 && q.cy <= H + 2) {
        ctx.beginPath();
        ctx.moveTo(0, q.cy);
        ctx.lineTo(W, q.cy);
        ctx.stroke();
      }
    });
  }
  ctx.restore();

  // 3. Superponer fuentes del catálogo AllWISE (rombos ámbar discretos)
  if (state.showWiseCat && state.skyView.wiseSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.65)";
    ctx.lineWidth = 1.2;
    state.skyView.wiseSources.forEach((src) => {
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      const r = 4.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  // 4. Superponer fuentes del catálogo Gaia DR3 (círculos celestes discretos)
  if (state.showGaiaCat && state.skyView.gaiaSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.70)";
    ctx.lineWidth = 1.2;
    state.skyView.gaiaSources.forEach((src) => {
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      // Flecha de movimiento propio (Gaia pmra/pmdec en mas/año)
      if (state.showPmVectors && Number.isFinite(src.pmra) && Number.isFinite(src.pmdec) && (src.pmra !== 0 || src.pmdec !== 0)) {
        const cosDec = Math.cos(src.dec * Math.PI / 180);
        const endpoint = raDecToPixel(src.ra + src.pmra * 80 / (3600000 * Math.max(1e-6, Math.abs(cosDec))), src.dec + src.pmdec * 80 / 3600000);
        const endScreen = fitsToSkyCanvas(endpoint.x, endpoint.y, W);
        const dx = endScreen.cx - cx;
        const dy = endScreen.cy - cy;
        const mag = Math.hypot(dx, dy);
        if (mag > 0.5) {
          const len = Math.min(30, mag);
          const ux = dx / mag;
          const uy = dy / mag;
          const ex = cx + ux * len;
          const ey = cy + uy * len;
          ctx.strokeStyle = "rgba(125, 211, 252, 0.9)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          const head = 4;
          const ang = Math.atan2(uy, ux);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - head * Math.cos(ang - 0.5), ey - head * Math.sin(ang - 0.5));
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - head * Math.cos(ang + 0.5), ey - head * Math.sin(ang + 0.5));
          ctx.stroke();
        }
      }
    });
    ctx.restore();
  }

  // 5. Retícula del píxel/objeto seleccionado
  if (state.selectedPixel) {
    const { cx, cy } = fitsToSkyCanvas(state.selectedPixel.x, state.selectedPixel.y, W);
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.restore();
  }

  // 6. Astros identificados en el plano continuo: anillo discreto siempre, etiqueta arriba al pasar el cursor (o con "Fijar nombres")
  if (state.skyView.namedObjects && state.skyView.namedObjects.length > 0) {
    state.skyView.namedObjects.forEach((obj) => {
      const { cx, cy } = fitsToSkyCanvas(obj.x, obj.y, W);
      if (cx < -24 || cx > W + 24 || cy < -24 || cy > H + 24) return;
      const isHovered = state.hoveredNamedObjectId === obj.id;
      const isSelected = state.selectedNamedObjectId === obj.id;
      const hasPlanets = (obj.planets && obj.planets.length > 0) || obj.kind === "planet";
      const ringColor = isHovered || isSelected ? "#34d399" : hasPlanets ? "#a78bfa" : "#fde047";

      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = isHovered || isSelected ? 2.4 : 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, isHovered || isSelected ? 9 : 7, 0, Math.PI * 2);
      ctx.stroke();
      if (isSelected) {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (isHovered || isSelected || state.showNamedObjects) {
        const nPlanets = obj.planets ? obj.planets.length : 0;
        const labelText = nPlanets > 0
          ? `${obj.name} · ${nPlanets} planeta${nPlanets === 1 ? "" : "s"}`
          : obj.name;
        drawTagAbovePoint(
          ctx,
          cx,
          cy,
          labelText,
          ringColor,
          isHovered || isSelected ? "#6ee7b7" : hasPlanets ? "#ddd6fe" : "#fef08a",
          W
        );
      }
    });
  }

  // Actualizar HUD de FoV y conteo de fuentes activas
  const fovEl = document.getElementById("aladin-hud-fov");
  if (fovEl) {
    const effFovArcmin = ((state.fov / state.skyView.zoom) * 60).toFixed(2);
    const nGaia = state.showGaiaCat ? state.skyView.gaiaSources.length : 0;
    const nWise = state.showWiseCat ? state.skyView.wiseSources.length : 0;
    fovEl.textContent = `FoV: ${effFovArcmin}' (${state.skyView.zoom.toFixed(1)}x) | Gaia: ${nGaia} | WISE: ${nWise}`;
  }
}

// ----------------------------------------------------------------------------
// Los productos científicos se calculan en el backend, antes del contraste PNG.
// ----------------------------------------------------------------------------
function loadImagePromise(b64Src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo decodificar una imagen FITS"));
    img.src = b64Src;
  });
}

function getAutoEpochIndices(epochs) {
  const indices = epochs.flatMap((ep, idx) => ep.valid_pixels_pct === 0 ? [] : [idx]);
  return indices.length ? indices : epochs.map((_, idx) => idx);
}

function getSelectedBandIndex(epochs) {
  if (!epochs.length) return 0;
  if (state.selectedBand === "auto" || String(state.selectedBand).startsWith("coadd:")) {
    return state.currentEpochIdx % epochs.length;
  }
  if (state.selectedBand === "manual_pair") {
    const indices = state.manualPairIndices || [];
    if (indices.length > 0) {
      return indices.includes(state.currentEpochIdx)
        ? state.currentEpochIdx
        : indices[state.currentEpochIdx % indices.length];
    }
    return state.currentEpochIdx % epochs.length;
  }
  if (state.selectedBand === "pair") {
    const indices = state.exploreData?.target_info?.analysis_frame_indices || [];
    if (indices.length > 0) {
      return indices.includes(state.currentEpochIdx)
        ? state.currentEpochIdx
        : indices[state.currentEpochIdx % indices.length];
    }
    return state.currentEpochIdx % epochs.length;
  }
  const selected = Number.parseInt(state.selectedBand, 10);
  return Number.isInteger(selected) && selected >= 0 && selected < epochs.length
    ? selected
    : state.currentEpochIdx % epochs.length;
}

function renderCanvas() {
  const canvas = document.getElementById("spherex-canvas");
  if (!canvas || !state.exploreData) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.imageSmoothingEnabled = false;
  paintCoverageBackground(ctx, W, H);

  const epochs = state.exploreData.epochs || [];
  const epIdx = getSelectedBandIndex(epochs);
  const note = document.getElementById("image-integrity-note");
  const shape = epochs[epIdx]?.native_shape;
  if (note) note.textContent = `Norte arriba · este a la izquierda. Damero: sin datos válidos.${state.showFlags && state.viewMode === "blink" && !String(state.selectedBand).startsWith("coadd:") ? " Magenta: FLAGS de esta exposición." : " FLAGS se aplica a exposiciones individuales."}${state.viewMode === "blink" && shape?.length === 2 ? ` Recorte original: ${shape[1]} × ${shape[0]} píxeles; reproyectado a 128 × 128.` : ""}`;
  const selectedDetCode = String(state.selectedBand).startsWith("coadd:")
    ? String(state.selectedBand).slice(6)
    : null;
  const detCoaddImg = selectedDetCode ? state.detectorCoaddImages?.[selectedDetCode] : null;
  const detCoaddMeta = selectedDetCode ? state.exploreData?.detector_coadds?.[selectedDetCode] : null;
  const bounds = state.infinitePlaneEnabled
    ? getVisibleTileBounds(W)
    : { gxMin: 0, gxMax: 0, gyMin: 0, gyMax: 0 };
  const { gxMin, gxMax, gyMin, gyMax } = bounds;

  // 1. Dibujar todos los sectores FITS visibles en la cuadrícula sincronizada
  for (let gy = gyMin; gy <= gyMax; gy++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const rect = getTileCanvasRect(gx, gy, W);
      const tile = state.tileGrid.get(`${gx},${gy}`);
      const isOrigin = gx === 0 && gy === 0;

      if ((tile && tile.status === "ready") || isOrigin) {
        const tEpochs = tile?.epochImages || state.epochImages;
        const tFlags = tile?.flagImages || state.flagImages;
        const tCoadd = tile?.coaddImage || state.coaddImage;
        const tDiff = tile?.diffImage || state.diffImage;

        const hasDiff = isOrigin
          ? Boolean(state.exploreData?.target_info?.difference_available)
          : Boolean(tile?.exploreData?.target_info?.difference_available);
        let baseImg = null;
        if (state.viewMode === "diff") {
          baseImg = hasDiff ? tDiff : null;
        } else if (isOrigin && state.viewMode === "shift_stack" && state.shiftStackCanvas) {
          baseImg = state.shiftStackCanvas;
        } else if (isOrigin && (state.viewMode === "manual_diff" || state.viewMode === "manual_sum") && state.manualOpCanvas) {
          baseImg = state.manualOpCanvas;
        } else if (state.viewMode === "rgb") {
          baseImg = isOrigin ? state.rgbCompositeCanvas : null;
        } else if (isOrigin && detCoaddImg) {
          baseImg = detCoaddImg;
        } else if (state.viewMode === "coadd") {
          baseImg = tCoadd;
        } else if (tEpochs && tEpochs.length > 0) {
          const tileEpIdx = isOrigin ? epIdx : state.currentEpochIdx % tEpochs.length;
          baseImg = tEpochs[tileEpIdx];
        }

        if (isOrigin && ((state.viewMode === "blink" && !detCoaddImg && epochs[epIdx]?.valid_pixels_pct === 0) || (!baseImg && state.viewMode === "rgb"))) {
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(state.viewMode === "rgb" ? "Sin cobertura para los tres canales RGB" : "Este recorte no tiene píxeles válidos", W / 2, H / 2);
          ctx.textAlign = "start";
        }
        if (baseImg) {
          if (state.invertPixels && (baseImg === tDiff || baseImg === detCoaddImg)) {
            ctx.save();
            ctx.filter = "invert(1)";
            drawSeamlessTileImage(ctx, baseImg, rect);
            ctx.restore();
          } else {
            drawSeamlessTileImage(ctx, baseImg, rect);
          }
        }

        if (state.showFlags && state.viewMode === "blink" && !detCoaddImg && tFlags && tFlags.length > 0) {
          const flgImg = tFlags[(isOrigin ? epIdx : state.currentEpochIdx) % tFlags.length];
          if (flgImg) {
            drawSeamlessTileImage(ctx, flgImg, rect);
          }
        }
      } else {
        drawInfiniteTilePlaceholder(ctx, rect, gx, gy, tile?.status || "queued");
      }
    }
  }

  // 2. Superponer detecciones IA (Dipolos y Variables) proyectadas en el plano continuo
  const detectionsToDraw = state.allAiDetections?.length
    ? state.allAiDetections
    : state.exploreData.ai_detections || [];
  if (state.showAIMarkers && detectionsToDraw.length > 0) {
    detectionsToDraw.forEach((det) => {
      const { cx, cy } = fitsToSkyCanvas(det.x_pix, det.y_pix, W);
      if (cx < -40 || cx > W + 40 || cy < -40 || cy > H + 40) return;
      const isSelected = state.selectedDetectionId === det.id;

      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, 19, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (det.type === "MOVING_DIPOLE") {
        if (det.neg_x_pix !== null && det.neg_y_pix !== null) {
          const negPt = fitsToSkyCanvas(det.neg_x_pix, det.neg_y_pix, W);
          const nx = negPt.cx;
          const ny = negPt.cy;

          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.8;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(nx, ny, 10, 0, Math.PI * 2);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.strokeStyle = "#fb7185";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }

        ctx.strokeStyle = isSelected ? "#34d399" : "#f43f5e";
        ctx.lineWidth = isSelected ? 3.0 : 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isSelected ? "#6ee7b7" : "#fda4af";
        ctx.font = "bold 11px monospace";
        ctx.fillText(
          `${isSelected ? "[ACTIVO] " : ""}#${det.id} DIPOLO (${det.snr_score}σ)`,
          cx + 15,
          cy - 6
        );
      } else {
        ctx.strokeStyle = isSelected ? "#34d399" : "#f59e0b";
        ctx.lineWidth = isSelected ? 3.0 : 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = isSelected ? "#6ee7b7" : "#fde68a";
        ctx.font = "bold 11px monospace";
        ctx.fillText(
          `${isSelected ? "[ACTIVO] " : ""}#${det.id} VARIABLE (${det.snr_score}σ)`,
          cx + 15,
          cy - 6
        );
      }
      ctx.restore();
    });
  }

  // 3. Retícula del píxel seleccionado en el plano continuo
  if (state.selectedPixel) {
    const { cx: sx, cy: sy } = fitsToSkyCanvas(state.selectedPixel.x, state.selectedPixel.y, W);
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy);
    ctx.lineTo(sx - 3, sy);
    ctx.moveTo(sx + 3, sy);
    ctx.lineTo(sx + 12, sy);
    ctx.moveTo(sx, sy - 12);
    ctx.lineTo(sx, sy - 3);
    ctx.moveTo(sx, sy + 3);
    ctx.lineTo(sx, sy + 12);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Etiquetas de astros nombrados al pasar el cursor, el astro seleccionado (fijo) o con "Fijar nombres" activo
  if ((state.showNamedObjects || state.hoveredNamedObjectId || state.selectedNamedObjectId) && state.skyView.namedObjects && state.skyView.namedObjects.length > 0) {
    state.skyView.namedObjects.forEach((obj) => {
      const isHovered = state.hoveredNamedObjectId === obj.id;
      const isSelected = state.selectedNamedObjectId === obj.id;
      if (!isHovered && !isSelected && !state.showNamedObjects) return;
      const { cx: ox, cy: oy } = fitsToSkyCanvas(obj.x, obj.y, W);
      if (ox < -20 || ox > W + 20 || oy < -20 || oy > H + 20) return;
      const hasPlanets = (obj.planets && obj.planets.length > 0) || obj.kind === "planet";
      const nPlanets = obj.planets ? obj.planets.length : 0;
      const labelText = nPlanets > 0
        ? `${obj.name} · ${nPlanets} planeta${nPlanets === 1 ? "" : "s"}`
        : obj.name;
      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(ox, oy, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawTagAbovePoint(
        ctx,
        ox,
        oy,
        labelText,
        isSelected ? "#34d399" : hasPlanets ? "#a78bfa" : "#34d399",
        isSelected ? "#6ee7b7" : hasPlanets ? "#ddd6fe" : "#a7f3d0",
        W
      );
    });
  }

  if (epochs.length > 0) {
    const ep = epochs[epIdx];
    const totalEpochs = state.exploreData.target_info.total_epochs || epochs.length;
    const pairIndices = state.exploreData.target_info.analysis_frame_indices || [];
    const pairPos = pairIndices.indexOf(epIdx);
    const epochLabel =
      state.selectedBand === "pair" && pairIndices.length >= 2
        ? `Par comparable ${pairPos >= 0 ? pairPos + 1 : 1}/${pairIndices.length}`
        : `Época temporal ${ep.epoch_id + 1}/${totalEpochs}`;
    const bandLabel = `${Number(ep.wavelength_center_um).toFixed(3)} µm · ${ep.detector || "detector"}`;
    if ((state.viewMode === "manual_diff" || state.viewMode === "manual_sum") && state.manualOpMeta) {
      const { op, idxA, idxB } = state.manualOpMeta;
      const epA = epochs[idxA] || ep;
      const epB = epochs[idxB] || ep;
      document.getElementById("frame-counter").textContent =
        op === "diff"
          ? `Resta Manual (Época ${idxB + 1} − Época ${idxA + 1})`
          : `Promedio visual (recortes ${idxA + 1} y ${idxB + 1})`;
      document.getElementById("overlay-date").textContent =
        `A (#${idxA + 1}): ${Number(epA.wavelength_center_um).toFixed(2)}µm (${epA.detector}) vs B (#${idxB + 1}): ${Number(epB.wavelength_center_um).toFixed(2)}µm (${epB.detector})`;
      document.getElementById("overlay-detector").textContent =
        op === "diff"
          ? "Vista PNG: B − A; no es ΔI calibrada"
          : "Vista previa: promedio del brillo PNG de A y B";
      document.getElementById("overlay-clean").textContent =
        `Cobertura A: ${epA.clean_pixels_pct}% · Cobertura B: ${epB.clean_pixels_pct}%`;
    } else if (state.viewMode === "shift_stack" && state.shiftStackMeta) {
      const { pmRaMasYr, pmDecMasYr, label } = state.shiftStackMeta;
      document.getElementById("frame-counter").textContent =
        `Shift & Stack · pmRA ${pmRaMasYr >= 0 ? "+" : ""}${Math.round(pmRaMasYr)}, pmDec ${pmDecMasYr >= 0 ? "+" : ""}${Math.round(pmDecMasYr)} mas/a`;
      document.getElementById("overlay-date").textContent =
        label || `Apilado en movimiento (${epochs.length} épocas co-adicionadas)`;
      document.getElementById("overlay-detector").textContent =
        `Vector: μ_α*=${pmRaMasYr.toFixed(0)} mas/a, μ_δ=${pmDecMasYr.toFixed(0)} mas/a`;
      document.getElementById("overlay-clean").textContent =
        "Apilado visual de PNG · sin medición de SNR";
    } else if (state.viewMode === "rgb") {
      document.getElementById("frame-counter").textContent = state.rgbCompositeCanvas ? "Falso color RGB · tres rangos infrarrojos" : "RGB no disponible: faltan rangos infrarrojos";
      document.getElementById("overlay-date").textContent = `Compuesto tricromático (${epochs.length} recortes combinados)`;
      document.getElementById("overlay-detector").textContent = "Azul: NIR (<1.65µm) · Verde: Mid-NIR (1.65–3µm) · Rojo: MIR (>3µm)";
      document.getElementById("overlay-clean").textContent = state.rgbCompositeCanvas ? "Falso color de vistas estiradas; no mide temperatura" : "Faltan recortes en uno o más de los tres rangos";
    } else if (detCoaddMeta && state.viewMode !== "diff") {
      document.getElementById("frame-counter").textContent =
        `Mediana ${detCoaddMeta.detector} · ${detCoaddMeta.frame_count} exp`;
      document.getElementById("overlay-date").textContent =
        `Apilado mediana por detector (${detCoaddMeta.frame_count} recortes)`;
      document.getElementById("overlay-detector").textContent =
        `Detector: ${detCoaddMeta.detector} | λ: ${Number(detCoaddMeta.wavelength_min_um).toFixed(3)}–${Number(detCoaddMeta.wavelength_max_um).toFixed(3)} µm`;
      document.getElementById("overlay-clean").textContent =
        `Píxeles limpios (mediana): ${detCoaddMeta.clean_pixels_pct}%`;
    } else {
      const manualPos = (state.manualPairIndices || []).indexOf(epIdx);
      const effectiveEpochLabel =
        state.selectedBand === "manual_pair" && (state.manualPairIndices || []).length === 2
          ? `Blink Manual A/B (${manualPos >= 0 ? manualPos + 1 : 1}/2 · Época #${epIdx + 1})`
          : epochLabel;
      document.getElementById("frame-counter").textContent =
        state.viewMode === "blink"
          ? `${effectiveEpochLabel} · ${bandLabel}`
          : state.viewMode === "diff"
          ? "Resta temporal · bandas comparables"
          : "Mediana · bandas comparables";
      if (state.viewMode === "blink") {
        const mjd = Number(ep.obs_time);
        const date = ep.obs_time && Number.isFinite(mjd)
          ? new Date((mjd - 40587) * 86400000).toISOString().replace("T", " ").slice(0, 19) + " UTC"
          : ep.obs_time || "sin fecha";
        document.getElementById("overlay-date").textContent = `Fecha: ${date}`;
        document.getElementById("overlay-clean").textContent = `Cobertura válida: ${ep.valid_pixels_pct ?? ep.clean_pixels_pct}%`;
        document.getElementById("overlay-detector").textContent = `Banda: ${bandLabel} | Δλ: ${Number(ep.bandwidth_um || 0).toFixed(3)} µm`;
      } else {
        const indices = state.exploreData.target_info.analysis_frame_indices;
        const first = epochs[indices[0]], last = epochs[indices[indices.length - 1]];
        document.getElementById("overlay-date").textContent = `${indices.length} exposiciones comparables`;
        document.getElementById("overlay-detector").textContent = `${first.detector} · ${first.wavelength_center_um.toFixed(3)}–${last.wavelength_center_um.toFixed(3)} µm`;
        document.getElementById("overlay-clean").textContent = state.viewMode === "diff" ? "Media tardía − media temprana" : "Mediana de los píxeles válidos";
      }
    }
  }
}

function startBlinkTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  if (!state.isPlaying) return;
  const intervalMs = Math.round(1000 / state.fps);
  state.timerId = setInterval(() => {
    if (!state.isLoading && state.viewMode === "blink" && state.exploreData?.epochs?.length > 0) {
      if (state.selectedBand === "auto") {
        const indices = getAutoEpochIndices(state.exploreData.epochs);
        state.currentEpochIdx = indices[(indices.indexOf(state.currentEpochIdx) + 1) % indices.length];
        document.getElementById("slider-epoch").value = state.currentEpochIdx;
        renderCanvas();
      } else if (state.selectedBand === "pair") {
        const indices = state.exploreData?.target_info?.analysis_frame_indices || [];
        if (indices.length > 0) {
          const curPos = indices.indexOf(state.currentEpochIdx);
          state.currentEpochIdx = indices[(curPos + 1) % indices.length];
          document.getElementById("slider-epoch").value = state.currentEpochIdx;
          renderCanvas();
        }
      } else if (state.selectedBand === "manual_pair") {
        const indices = state.manualPairIndices || [];
        if (indices.length > 0) {
          const curPos = indices.indexOf(state.currentEpochIdx);
          state.currentEpochIdx = indices[(curPos + 1) % indices.length];
          document.getElementById("slider-epoch").value = state.currentEpochIdx;
          renderCanvas();
        }
      }
    }
  }, intervalMs);
}

function findNearestAIDetection(xPix, yPix, maxDistFitsPx = 5.0) {
  const detections = state.allAiDetections?.length
    ? state.allAiDetections
    : state.exploreData?.ai_detections || [];
  let best = null;
  let bestDist = maxDistFitsPx;
  detections.forEach((det) => {
    const dPos = Math.hypot(det.x_pix - xPix, det.y_pix - yPix);
    const dNeg =
      det.neg_x_pix !== null && det.neg_x_pix !== undefined
        ? Math.hypot(det.neg_x_pix - xPix, det.neg_y_pix - yPix)
        : Infinity;
    const d = Math.min(dPos, dNeg);
    if (d <= bestDist) {
      bestDist = d;
      best = det;
    }
  });
  return best;
}

function resolveLocalNamedMatchForDetection(det) {
  const named = state.skyView.namedObjects || [];
  let bestObj = null;
  let bestArcsec = 16.0;
  named.forEach((obj) => {
    const distArcsec = angularDistanceDeg(det.ra, det.dec, obj.ra, obj.dec) * 3600.0;
    if (distArcsec <= bestArcsec) {
      bestArcsec = distArcsec;
      bestObj = obj;
    }
  });
  if (bestObj) {
    return `Identificado como: ${bestObj.name} (${bestObj.category}) a ${bestArcsec.toFixed(1)}″`;
  }
  return null;
}

function refreshAIDetectionCatalogLabels() {
  const detections = state.allAiDetections?.length
    ? state.allAiDetections
    : state.exploreData?.ai_detections || [];
  detections.forEach((det) => {
    const localMatch = resolveLocalNamedMatchForDetection(det);
    if (!localMatch) return;
    if (!state.crossmatchByDetId[det.id] || state.crossmatchByDetId[det.id].startsWith("Sin coincidencia")) {
      state.crossmatchByDetId[det.id] = localMatch;
    }
    const card = document.querySelector(`[data-detection-id="${det.id}"]`);
    const line = card?.querySelector(".detection-crossmatch-line");
    if (line && (line.dataset.pending === "1" || line.textContent.startsWith("Sin coincidencia"))) {
      line.textContent = localMatch;
      line.className = "detection-crossmatch-line text-[11px] text-emerald-300 leading-snug mt-1 font-medium";
      line.dataset.pending = "0";
    }
  });
  updateCatalogSelectionSummary();
}

function selectAndFocusAIDetection(det, preferredViewMode = null) {
  state.selectedDetectionId = det.id;
  state.selectedPixel = { x: det.x_pix, y: det.y_pix };
  if (!state.showAIMarkers) {
    state.showAIMarkers = true;
    const chk = document.getElementById("chk-ai-markers");
    if (chk) chk.checked = true;
  }
  if (preferredViewMode === "diff" && state.exploreData?.target_info?.difference_available) {
    setViewMode("diff");
  } else if (preferredViewMode === "blink") {
    setViewMode("blink");
    const indices = state.exploreData?.target_info?.analysis_frame_indices || [];
    if (indices.length >= 2) {
      state.selectedBand = "pair";
      const bandSelect = document.getElementById("select-band");
      if (bandSelect) bandSelect.value = "pair";
      state.currentEpochIdx = indices[0];
      const slider = document.getElementById("slider-epoch");
      if (slider) slider.value = state.currentEpochIdx;
      state.isPlaying = true;
      const playBtn = document.getElementById("btn-play-pause");
      if (playBtn) playBtn.textContent = "Pausar";
      startBlinkTimer();
    } else if (indices.length > 0 && !indices.includes(state.currentEpochIdx)) {
      state.currentEpochIdx = indices[0];
      const slider = document.getElementById("slider-epoch");
      if (slider) slider.value = state.currentEpochIdx;
    }
  }
  updateAIDetectionCardsSelection(false);
  updateAladinView(det.ra, det.dec, state.fov);
  const tileGx = Math.floor((det.x_pix + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const tileGy = Math.floor((det.y_pix + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const tileCenter = getTileCenterCoords(tileGx, tileGy);
  fetchAndRenderSpectrum(det.ra, det.dec, true, tileCenter.ra, tileCenter.dec);
}

function updateAIDetectionCardsSelection(scrollIntoView = false) {
  document.querySelectorAll("[data-detection-id]").forEach((card) => {
    const detId = parseInt(card.dataset.detectionId, 10);
    const isSelected = detId === state.selectedDetectionId;
    const badgeEl = card.querySelector(".selected-det-badge");
    if (isSelected) {
      card.classList.add("is-selected");
      card.querySelector(".detection-select")?.setAttribute("aria-pressed", "true");
      if (badgeEl) badgeEl.classList.remove("hidden");
      if (scrollIntoView) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      card.classList.remove("is-selected");
      card.querySelector(".detection-select")?.setAttribute("aria-pressed", "false");
      if (badgeEl) badgeEl.classList.add("hidden");
    }
  });
}

function renderAIDetectionsList(detections) {
  const container = document.getElementById("ai-detections-list");
  const badge = document.getElementById("ai-count-badge");
  container.innerHTML = "";
  const available = Boolean(state.exploreData?.target_info?.difference_available);
  badge.textContent = detections.length ? `${detections.length} candidato${detections.length === 1 ? "" : "s"}` : available ? "Análisis completo" : "Sin análisis";
  badge.dataset.status = available || detections.length ? "ready" : "pending";
  const summary = document.getElementById("detector-summary");
  if (summary) {
    summary.hidden = detections.length === 0;
    document.getElementById("detector-motion-count").textContent = detections.filter(d => d.type === "MOVING_DIPOLE").length;
    document.getElementById("detector-variable-count").textContent = detections.filter(d => d.type !== "MOVING_DIPOLE").length;
  }

  if (detections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "detector-empty";
    empty.innerHTML = `<span class="detector-empty-icon" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="5" y="5" width="22" height="22" rx="4" opacity=".45"/><rect x="13" y="13" width="22" height="22" rx="4"/><path d="M19 24h10m-5-5v10"/></svg></span><h3></h3><p class="detector-empty-description"></p>`;
    empty.querySelector("h3").textContent = available ? "Sin cambios detectados" : "Sin comparación válida";
    empty.querySelector(".detector-empty-description").textContent = available
      ? "No se encontraron candidatos por encima de 4σ en este campo. Podés explorar otra región."
      : "Para detectar cambios necesitamos una resta temporal válida. Buscá otras observaciones de este campo.";
    if (!available) {
      const btnTemporal = document.createElement("button");
      btnTemporal.type = "button";
      btnTemporal.className = "detector-search";
      btnTemporal.textContent = "Buscar observaciones →";
      btnTemporal.addEventListener("click", () => {
        exploreCoordinates(state.ra, state.dec, state.fov, 24, true, true);
        rememberDemoSettings({ maxFrames: 24 });
      });
      empty.appendChild(btnTemporal);
    }
    const note = state.exploreData?.target_info?.analysis_note;
    if (note) {
      const details = document.createElement("details");
      details.className = "detector-analysis-details";
      const label = document.createElement("summary");
      label.textContent = "Detalle del análisis";
      const msg = document.createElement("p");
      msg.textContent = note;
      details.append(label, msg);
      empty.appendChild(details);
    }
    container.appendChild(empty);
    return;
  }

  detections.forEach((det, idx) => {
    const isDipole = det.type === "MOVING_DIPOLE";
    const card = document.createElement("div");
    card.dataset.detectionId = String(det.id);
    card.className = "detection-card";
    card.dataset.kind = isDipole ? "motion" : "variable";
    const friendlyTitle =
      det.object_category || (isDipole ? "Astro en Movimiento (Dipolo)" : "Estrella Variable (Monopolo)");
    const iauName = det.iau_designation || `SPHEREx (${det.ra.toFixed(4)}°, ${det.dec.toFixed(4)}°)`;
    card.innerHTML = `
      <div class="detection-card-heading">
        <button type="button" class="detection-kind detection-select" aria-pressed="false">#${det.id} · ${isDipole ? "Movimiento" : "Variación de brillo"}</button>
        <span class="detection-score">${det.snr_score}σ</span>
        <span class="selected-det-badge hidden">Seleccionado</span>
      </div>
      <p class="detection-user-explanation"></p>
      <details class="detection-details">
        <summary>Datos del candidato</summary>
        <div class="detection-details-content">
          <div class="detection-iau"></div>
          <div class="detection-category"></div>
          <div class="detection-astrometry hidden"></div>
          <div>RA ${det.ra.toFixed(5)}° · Dec ${det.dec.toFixed(5)}°<br>Píxel (${det.x_pix.toFixed(1)}, ${det.y_pix.toFixed(1)})</div>
          <p class="detection-description"></p>
        </div>
      </details>
      <div class="detection-actions">
        <button type="button" class="btn-det-diff">Ver resta ΔI</button>
        <button type="button" class="btn-det-blink">Comparar fechas</button>
      </div>
    `;
    card.querySelector(".detection-iau").textContent = `Designación: ${iauName}`;
    card.querySelector(".detection-category").textContent = friendlyTitle;
    card.querySelector(".detection-user-explanation").textContent = det.user_explanation || det.description;
    card.querySelector(".detection-description").textContent = det.description;
    if (isDipole) {
      const astroBox = card.querySelector(".detection-astrometry");
      const shiftArcsec = Number.isFinite(det.shift_arcsec)
        ? det.shift_arcsec
        : +(det.shift_pixels * ((state.fov * 3600) / 128)).toFixed(2);
      const helioAu = Number.isFinite(det.heliocentric_dist_au_est)
        ? det.heliocentric_dist_au_est
        : Math.round(206265 / Math.max(shiftArcsec, 0.1));
      astroBox.classList.remove("hidden");
      astroBox.innerHTML =
        `<div><span class="text-sky-300 font-semibold">Estrella cercana / Enana marrón:</span> μ ≈ ${det.proper_motion_arcsec_yr}″/año (Δθ = ${shiftArcsec}″)</div>` +
        `<div><span class="text-amber-300 font-semibold">Hipótesis Planeta X / TNO (paralaje):</span> d ≈ ${helioAu} UA</div>`;
    }

    const sequence = state.exploreSequence;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `Candidato ${det.id}: ${isDipole ? "movimiento" : "variación de brillo"}`);
    card.querySelector(".detection-select").addEventListener("click", () => selectAndFocusAIDetection(det));

    card.querySelector(".btn-det-diff").addEventListener("click", (event) => {
      event.stopPropagation();
      selectAndFocusAIDetection(det, "diff");
    });
    card.querySelector(".btn-det-blink").addEventListener("click", (event) => {
      event.stopPropagation();
      selectAndFocusAIDetection(det, "blink");
    });

    const cachedMatch = state.crossmatchByDetId[det.id] || resolveLocalNamedMatchForDetection(det);
    if (cachedMatch || idx < 2) {
      const line = document.createElement("p");
      line.className = "detection-crossmatch-line text-[11px] text-slate-400 leading-snug mt-1.5 font-medium";
      card.querySelector(".detection-details-content").appendChild(line);

      if (cachedMatch) {
        state.crossmatchByDetId[det.id] = cachedMatch;
        line.textContent = cachedMatch;
        line.dataset.pending = "0";
        line.className = cachedMatch.startsWith("Identificado")
          ? "detection-crossmatch-line text-[11px] text-emerald-300 leading-snug mt-1.5 font-medium"
          : "detection-crossmatch-line text-[11px] text-amber-300 leading-snug mt-1.5 font-medium";
      } else {
        line.textContent = "Identificando en SIMBAD / Gaia DR3 / AllWISE...";
        line.dataset.pending = "1";
        fetch(`/api/crossmatch?ra=${det.ra}&dec=${det.dec}&radius=14`, { signal: state.exploreController.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((res) => {
            if (sequence !== state.exploreSequence) return;
            line.dataset.pending = "0";
            const localNow = resolveLocalNamedMatchForDetection(det);
            if (res.catalog_match) {
              const matchText = `Identificado como: ${res.catalog_match}`;
              line.textContent = matchText;
              line.className = "detection-crossmatch-line text-[11px] text-emerald-300 leading-snug mt-1.5 font-medium";
              state.crossmatchByDetId[det.id] = matchText;
            } else if (localNow) {
              line.textContent = localNow;
              line.className = "detection-crossmatch-line text-[11px] text-emerald-300 leading-snug mt-1.5 font-medium";
              state.crossmatchByDetId[det.id] = localNow;
            } else {
              const noMatchText = "Sin coincidencia en catálogos (posible objeto no catalogado o alto mov. propio)";
              line.textContent = noMatchText;
              line.className = "detection-crossmatch-line text-[11px] text-amber-300 leading-snug mt-1.5 font-medium";
              state.crossmatchByDetId[det.id] = noMatchText;
            }
            if (state.selectedDetectionId === det.id) {
              updateCatalogSelectionSummary();
            }
          })
          .catch(() => {
            line.dataset.pending = "0";
            const localNow = resolveLocalNamedMatchForDetection(det);
            if (localNow) {
              line.textContent = localNow;
              line.className = "detection-crossmatch-line text-[11px] text-emerald-300 leading-snug mt-1.5 font-medium";
              state.crossmatchByDetId[det.id] = localNow;
            } else {
              line.textContent = "Cruce remoto pendiente; usá los catálogos locales del visor.";
            }
          });
      }
    }

    card.addEventListener("click", (event) => {
      if (event.target.closest("details, button, a")) return;
      selectAndFocusAIDetection(det);
    });
    container.appendChild(card);
  });

  updateAIDetectionCardsSelection();
}

function renderSpectrumOrLightCurve(data = state.lastSpectrumData) {
  if (!data || !window.Plotly) return;
  const titleEl = document.getElementById("spectrum-panel-title");
  const btnSpec = document.getElementById("btn-plot-spectrum");
  const btnLc = document.getElementById("btn-plot-lightcurve");
  const isLc = state.spectrumPlotMode === "lightcurve";
  if (btnSpec && btnLc) {
    btnSpec.className = !isLc
      ? "px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-semibold"
      : "px-2 py-0.5 rounded text-slate-300 hover:text-white";
    btnLc.className = isLc
      ? "px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-semibold"
      : "px-2 py-0.5 rounded text-slate-300 hover:text-white";
  }

  if (isLc) {
    if (titleEl) titleEl.textContent = "Curva de luz temporal · F(t) por detector";
    const palette = ["#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"];
    const byDetector = new Map();
    (data.spectrum || []).forEach((p) => {
      const det = p.detector || "SPHEREx";
      if (!byDetector.has(det)) byDetector.set(det, []);
      const rawT = p.obs_time;
      const mjd = Number(rawT);
      const isoDate = rawT && Number.isFinite(mjd)
        ? new Date((mjd - 40587) * 86400000).toISOString().replace("T", " ").slice(0, 19)
        : String(rawT || "sin-fecha");
      const sortKey = Number.isFinite(mjd) ? mjd : Date.parse(rawT) || 0;
      byDetector.get(det).push({ ...p, isoDate, sortKey });
    });

    const traces = [];
    let colorIdx = 0;
    byDetector.forEach((pts, det) => {
      pts.sort((a, b) => a.sortKey - b.sortKey);
      const c = palette[colorIdx % palette.length];
      colorIdx++;
      traces.push({
        x: pts.map((pt) => pt.isoDate),
        y: pts.map((pt) => pt.flux_mjy_sr),
        error_y: {
          type: "data",
          array: pts.map((pt) => pt.flux_uncertainty),
          visible: true,
          color: "rgba(148, 163, 184, 0.45)",
          thickness: 1,
        },
        mode: "lines+markers",
        name: det,
        line: { color: c, width: 2 },
        marker: { color: c, size: 7 },
        customdata: pts.map((pt) => Number(pt.wavelength_um).toFixed(3)),
        hovertemplate: `<b>${det}</b> · %{x}<br>Flujo = %{y:.3f} MJy/sr (λ = %{customdata} μm)<extra></extra>`,
      });
    });

    const layoutLc = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 52, r: 18, t: 14, b: 48 },
      xaxis: {
        title: { text: "Fecha de Observación (UTC · Exposiciones Reales SPHEREx)", font: { color: "#94a3b8", size: 11 } },
        gridcolor: "rgba(148, 163, 184, 0.12)",
        tickfont: { color: "#cbd5e1", size: 9 },
      },
      yaxis: {
        title: { text: "Brillo superficial (MJy/sr)", font: { color: "#94a3b8", size: 11 } },
        gridcolor: "rgba(148, 163, 184, 0.12)",
        tickfont: { color: "#cbd5e1", size: 10 },
      },
      showlegend: true,
      legend: { orientation: "h", y: 1.14, x: 0, font: { color: "#cbd5e1", size: 10 } },
    };
    Plotly.react("spectrum-plot", traces, layoutLc, { responsive: true, displayModeBar: false });
    return;
  }

  if (titleEl) titleEl.textContent = "Espectro medido · cobertura disponible";
  const wl = data.spectrum.map((p) => p.wavelength_um);
  const fl = data.spectrum.map((p) => p.flux_mjy_sr);
  const err = data.spectrum.map((p) => p.flux_uncertainty);

  const shapes = [];
  (data.reference_molecules || []).forEach((mol) => {
    mol.ranges_um.forEach(([w0, w1]) => {
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: w0,
        x1: w1,
        y0: 0,
        y1: 1,
        fillcolor: mol.color,
        line: { color: mol.border_color, width: 1, dash: "dot" },
      });
    });
  });

  const trace = {
    x: wl,
    y: fl,
    error_y: {
      type: "data",
      array: err,
      visible: true,
      color: "rgba(56, 189, 248, 0.35)",
      thickness: 1,
    },
    mode: "markers",
    name: "Brillo superficial (MJy/sr)",
    line: { color: "#38bdf8", width: 2.2 },
    marker: { color: "#e0f2fe", size: 6, line: { color: "#0284c7", width: 1 } },
    hovertemplate: "<b>λ = %{x:.3f} μm</b><br>Flujo = %{y:.3f}<extra></extra>",
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 52, r: 18, t: 14, b: 42 },
    xaxis: {
      title: { text: "Longitud de Onda Infrarroja λ (micrones · Fotometría Real FITS)", font: { color: "#94a3b8", size: 11 } },
      autorange: true,
      gridcolor: "rgba(148, 163, 184, 0.12)",
      tickfont: { color: "#cbd5e1", size: 10 },
    },
    yaxis: {
      title: { text: "Brillo superficial (MJy/sr)", font: { color: "#94a3b8", size: 11 } },
      gridcolor: "rgba(148, 163, 184, 0.12)",
      tickfont: { color: "#cbd5e1", size: 10 },
    },
    shapes: shapes,
    showlegend: false,
  };

  Plotly.react("spectrum-plot", [trace], layout, { responsive: true, displayModeBar: false });
}

async function fetchAndRenderSpectrum(pointRa, pointDec, keepSelectedPixel = false, centerRaOverride = null, centerDecOverride = null) {
  if (state.isLoading) return;
  const sequence = ++state.spectrumSequence;
  const exploreSequence = state.exploreSequence;
  state.assistantSpectrum = null;
  state.spectrumController?.abort();
  state.spectrumController = new AbortController();
  document.getElementById("spectrum-coord-label").textContent = "Midiendo espectro de la posición seleccionada…";
  const refCenterRa = Number.isFinite(centerRaOverride) ? centerRaOverride : state.ra;
  const refCenterDec = Number.isFinite(centerDecOverride) ? centerDecOverride : state.dec;
  try {
    const url = `/api/spectrum?ra=${pointRa}&dec=${pointDec}&center_ra=${refCenterRa}&center_dec=${refCenterDec}&fov=${state.fov}&max_epochs=${state.exploreData?.epochs?.length || 10}&temporal_search=${state.temporalSearch}`;
    const res = await fetch(url, { signal: state.spectrumController.signal });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (sequence !== state.spectrumSequence || exploreSequence !== state.exploreSequence) return;
    state.lastSpectrumData = data;
    state.assistantSpectrum = { data, exploreSequence };
    demoAssistantUI?.refresh();

    if (!keepSelectedPixel) {
      state.selectedPixel = { x: data.x_pix, y: data.y_pix };
    }
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const dispX = state.selectedPixel ? Math.round(state.selectedPixel.x) : data.x_pix;
    const dispY = state.selectedPixel ? Math.round(state.selectedPixel.y) : data.y_pix;
    const detTag = state.selectedDetectionId ? ` · Anomalía IA #${state.selectedDetectionId}` : "";
    document.getElementById("spectrum-coord-label").textContent =
      `Coordenada seleccionada: RA ${data.ra.toFixed(5)}°, Dec ${data.dec.toFixed(5)}° (Píxel X=${dispX}, Y=${dispY}${detTag})`;

    renderSpectrumOrLightCurve(data);

    const diag = data.ai_diagnosis;
    document.getElementById("diag-confidence").textContent = diag.confidence == null ? "Orientativo" : `Confianza: ${Math.round(diag.confidence * 100)}%`;
    document.getElementById("diag-class").textContent = diag.classification;
    document.getElementById("diag-temp").textContent = diag.effective_temp_k_est ? `~${diag.effective_temp_k_est} K` : "Sin estimar";
    document.getElementById("diag-bands").textContent = `${data.total_bands_sampled} exposiciones`;
    document.getElementById("diag-summary").textContent = diag.summary;

    const molContainer = document.getElementById("diag-molecules");
    molContainer.innerHTML = "";
    diag.detected_molecules.forEach((m) => {
      const span = document.createElement("span");
      span.className = "text-[11px] px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 font-medium";
      span.textContent = m;
      molContainer.appendChild(span);
    });
  } catch (err) {
    if (err.name === "AbortError" || sequence !== state.spectrumSequence || exploreSequence !== state.exploreSequence) return;
    console.error("Error obteniendo espectro real:", err);
    document.getElementById("spectrum-coord-label").textContent = `No se pudo medir el espectro: ${err.message}`;
    document.getElementById("diag-class").textContent = "Espectro no disponible";
    document.getElementById("diag-confidence").textContent = "Sin medición";
    document.getElementById("diag-temp").textContent = "Sin estimar";
    document.getElementById("diag-bands").textContent = "—";
    document.getElementById("diag-summary").textContent = "Reintentá seleccionando una fuente del recorte.";
    document.getElementById("diag-molecules").replaceChildren();
    if (window.Plotly) Plotly.purge("spectrum-plot");
  }
}

function showLoading(message) {
  let box = document.getElementById("loading-banner");
  if (!box) {
    box = document.createElement("div");
    box.id = "loading-banner";
    box.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;" +
      "background:#0b1220;color:#e2e8f0;border:1px solid #38bdf8;border-radius:10px;" +
      "padding:10px 16px;font:600 13px/1.4 ui-monospace,monospace;box-shadow:0 6px 24px rgba(0,0,0,.5);" +
      "max-width:90vw;text-align:center";
    document.body.appendChild(box);
  }
  const t0 = Date.now();
  const token = String(performance.now());
  box.dataset.loadingToken = token;
  const render = () => {
    if (box.dataset.loadingToken !== token) return;
    const s = Math.round((Date.now() - t0) / 1000);
    const hint = s > 20 ? " · una región nueva puede tardar 1–2 min (IRSA está lento)" : "";
    box.textContent = `Cargando: ${message} (${s} s)${hint}`;
  };
  render();
  box.style.display = "block";
  const timer = setInterval(render, 1000);
  return () => {
    clearInterval(timer);
    if (box.dataset.loadingToken === token) box.style.display = "none";
  };
}
function setExploreProgress(message) {
  const status = document.getElementById("target-banner-desc");
  if (status) status.textContent = message;
}

function populateBandSelector(epochs, targetInfo, detectorCoadds = {}) {
  const select = document.getElementById("select-band");
  const summary = document.getElementById("band-summary");
  if (!select) return;
  select.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = `Secuencia automática · recortes con cobertura${targetInfo.best_band_clean_pct != null ? ` (mejor: ${targetInfo.best_band_clean_pct}%)` : ""}`;
  select.appendChild(auto);

  const pairIndices = targetInfo.analysis_frame_indices || [];
  if (pairIndices.length >= 2) {
    const firstEp = epochs[pairIndices[0]];
    const lastEp = epochs[pairIndices[pairIndices.length - 1]];
    const pairOpt = document.createElement("option");
    pairOpt.value = "pair";
    const detName = firstEp?.detector || "detector";
    const wlRange = firstEp && lastEp
      ? `${Number(firstEp.wavelength_center_um).toFixed(3)}–${Number(lastEp.wavelength_center_um).toFixed(3)} µm`
      : "misma banda";
    pairOpt.textContent = `Par temporal comparable (Blink A/B · ${pairIndices.length} épocas · ${detName} ${wlRange})`;
    select.appendChild(pairOpt);
  }

  const detEntries = Object.entries(detectorCoadds || {});
  if (detEntries.length > 0) {
    detEntries.forEach(([detCode, dc]) => {
      const detOpt = document.createElement("option");
      detOpt.value = `coadd:${detCode}`;
      detOpt.textContent =
        `Mediana por detector ${detCode} (${dc.frame_count} exp · ` +
        `${Number(dc.wavelength_min_um).toFixed(2)}–${Number(dc.wavelength_max_um).toFixed(2)} µm · ` +
        `${dc.clean_pixels_pct}% limpios)`;
      select.appendChild(detOpt);
    });
  }

  epochs.forEach((ep, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    const wavelength = Number(ep.wavelength_center_um);
    const wavelengthLabel = wavelength > 0 ? `${wavelength.toFixed(3)} µm` : "λ desconocida";
    const bandwidth = Number(ep.bandwidth_um);
    const bandwidthLabel = bandwidth > 0 ? `Δλ ${bandwidth.toFixed(3)} µm` : "Δλ n/a";
    option.textContent = `${index + 1}. ${wavelengthLabel} · ${bandwidthLabel} · ${ep.detector || "detector"} · ${ep.valid_pixels_pct ?? ep.clean_pixels_pct}% válidos`;
    select.appendChild(option);
  });

  const selA = document.getElementById("select-epoch-a");
  const selB = document.getElementById("select-epoch-b");
  if (selA && selB) {
    selA.innerHTML = "";
    selB.innerHTML = "";
    epochs.forEach((ep, index) => {
      const mjd = Number(ep.obs_time);
      const shortDate = ep.obs_time && Number.isFinite(mjd)
        ? new Date((mjd - 40587) * 86400000).toISOString().slice(0, 10)
        : String(ep.obs_time || "").slice(0, 10);
      const label = `${index + 1}. ${Number(ep.wavelength_center_um).toFixed(2)}µm · ${ep.detector || "D?"} · ${shortDate}`;
      const optA = document.createElement("option");
      optA.value = String(index);
      optA.textContent = `Época A: ${label}`;
      selA.appendChild(optA);
      const optB = document.createElement("option");
      optB.value = String(index);
      optB.textContent = `Época B: ${label}`;
      selB.appendChild(optB);
    });
    const defA = pairIndices.length >= 2 ? pairIndices[0] : 0;
    const defB = pairIndices.length >= 2 ? pairIndices[pairIndices.length - 1] : Math.min(1, Math.max(0, epochs.length - 1));
    selA.value = String(defA);
    selB.value = String(defB);
  }
  select.value = "auto";
  state.selectedBand = "auto";
  state.currentEpochIdx = targetInfo.best_band_index || 0;
  if (summary) {
    const best = targetInfo.best_band_index;
    const bestEp = Number.isInteger(best) ? epochs[best] : null;
    const loadedBands = Number.isInteger(targetInfo.total_bands) && targetInfo.total_bands > 0
      ? targetInfo.total_bands
      : epochs.length;
    const detCount = detEntries.length;
    summary.textContent = bestEp
      ? `Automática: ${Number(bestEp.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(bestEp.bandwidth_um || 0).toFixed(3)} µm) · ${bestEp.detector || "detector"} · ${bestEp.valid_pixels_pct ?? bestEp.clean_pixels_pct}% válidos · ${loadedBands} bandas (${detCount} detectores con mediana).`
      : `Automática: no se pudo determinar una longitud de onda válida · ${loadedBands} bandas cargadas.`;
  }
}

function syncFovPresetSelect(fovValue) {
  const select = document.getElementById("select-fov-preset");
  if (!select) return;
  const presets = [0.03, 0.05, 0.1, 0.2];
  const matched = presets.find((p) => Math.abs(Number(fovValue) - p) < 1e-4);
  select.value = matched != null ? String(matched) : "custom";
}

function setExploreBusy(busy) {
  state.isLoading = busy;
  demoAssistantUI?.refresh();
  document.querySelectorAll("#coord-form input, #coord-form select, #coord-form button[type=submit], .preset-btn, .fov-pill, #btn-load-102-bands, #btn-temporal-search, #btn-irsa-sync, #select-band, #slider-epoch")
    .forEach((el) => { el.disabled = busy; });
  document.getElementById("coord-form").setAttribute("aria-busy", String(busy));
  document.getElementById("coord-form").querySelector("button[type=submit]").textContent = busy ? "Procesando…" : "Explorar Cielo";
}

async function exploreCoordinates(ra, dec, fov, maxEpochs = state.frameLimit, temporalSearch = false, refresh = false) {
  ra = Number(ra); dec = Number(dec); fov = Number(fov);
  if (![ra, dec, fov].every(Number.isFinite) || ra < 0 || ra > 360 || dec < -90 || dec > 90 || fov <= 0.005 || fov > 1) {
    setExploreProgress("Revisá las coordenadas: RA 0–360°, Dec −90–90°, FoV entre 0.005° y 1°.");
    return;
  }
  maxEpochs = Number(maxEpochs);
  if (!Number.isInteger(maxEpochs) || maxEpochs < 1 || maxEpochs > (temporalSearch ? 32 : 102)) {
    setExploreProgress(`Elegí entre 1 y ${temporalSearch ? 32 : 102} recortes para este modo.`);
    return;
  }
  state.frameLimit = maxEpochs;
  document.getElementById("input-max-frames").value = maxEpochs;
  const sequence = ++state.exploreSequence;
  abortBackgroundTiles();
  state.exploreController?.abort();
  state.spectrumController?.abort();
  state.spectrumSequence++;
  state.exploreController = new AbortController();
  const controller = state.exploreController;
  const timeout = setTimeout(() => controller.abort(), 240000);
  const sameRegion = Math.abs(state.ra - ra) < 1e-4 && Math.abs(state.dec - dec) < 1e-4;
  const epKey = (ep) => ep?.cutout_url || `${ep?.obs_time || ""}|${ep?.detector || ""}|${ep?.wavelength_center_um || ""}`;
  const prevKeys = new Set(
    sameRegion ? (state.exploreData?.epochs || []).map(epKey).filter(Boolean) : []
  );
  setExploreBusy(true);
  const stopLoading = showLoading(
    refresh
      ? "Sincronizando entregas de IRSA y actualizando recortes FITS…"
      : "Consultando IRSA y procesando recortes FITS…"
  );
  try {
    const res = await fetch(`/api/explore?ra=${ra}&dec=${dec}&fov=${fov}&max_epochs=${maxEpochs}&temporal_search=${temporalSearch}&refresh=${refresh}`, { signal: state.exploreController.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    const detEntries = Object.entries(data.detector_coadds || {});
    const [images, flags, coadd, diff, detImgs] = await Promise.all([
      Promise.all(data.epochs.map((ep) => loadImagePromise(ep.image_base64))),
      Promise.all(data.epochs.map((ep) => loadImagePromise(ep.flags_base64))),
      loadImagePromise(data.coadd_image_base64),
      loadImagePromise(data.diff_image_base64),
      Promise.all(detEntries.map(([, dc]) => loadImagePromise(dc.image_base64))),
    ]);
    if (sequence !== state.exploreSequence) return;
    const detectorCoaddImages = {};
    detEntries.forEach(([detCode], idx) => {
      detectorCoaddImages[detCode] = detImgs[idx];
    });
    releaseImagePayload(data);
    Object.assign(state, { ra, dec, fov, exploreData: data, epochImages: images, flagImages: flags,
      coaddImage: coadd, diffImage: diff, detectorCoaddImages, crossmatchByDetId: {}, temporalSearch });
    demoStore?.rememberRegion(ra, dec, temporalSearch);
    document.getElementById("input-ra").value = ra.toFixed(6);
    document.getElementById("input-dec").value = dec.toFixed(6);
    document.getElementById("input-fov").value = fov.toFixed(4);
    syncFovPresetSelect(fov);
    syncUrlParams(ra, dec, fov, temporalSearch);
    populateBandSelector(data.epochs, data.target_info, data.detector_coadds);
    const slider = document.getElementById("slider-epoch");
    slider.max = Math.max(0, data.epochs.length - 1);
    const newEpochsList = refresh
      ? (data.epochs || []).filter((ep) => !prevKeys.has(epKey(ep)))
      : [];
    if (refresh && newEpochsList.length > 0) {
      const firstNewIdx = data.epochs.findIndex((ep) => !prevKeys.has(epKey(ep)));
      if (firstNewIdx >= 0) {
        state.currentEpochIdx = firstNewIdx;
      }
    }
    slider.value = state.currentEpochIdx;
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.classList.toggle("target-btn-active", btn.dataset.target === data.target_info.matched_target_id);
    });
    const sourceBadge = document.getElementById("badge-datasource");
    sourceBadge.textContent = `${data.target_info.data_source.startsWith("CACHE") ? "Caché local" : "Datos de IRSA"} · ${data.target_info.total_frames} recortes`;
    sourceBadge.title = data.target_info.data_source;
    document.getElementById("analysis-note").textContent = data.target_info.analysis_note;
    document.getElementById("mode-diff").disabled = !data.target_info.difference_available;
    if (state.viewMode === "diff" && !data.target_info.difference_available) setViewMode("blink");
    buildCatalogSourcesFromField();
    state.tileGrid = new Map();
    state.nextDetectionId = 100;
    const originDetections = mapDetectionsToGlobalPlane(data.ai_detections || [], true);
    state.allAiDetections = [...originDetections];
    state.tileGrid.set("0,0", {
      key: "0,0",
      gx: 0,
      gy: 0,
      ra,
      dec,
      status: "ready",
      exploreData: data,
      epochImages: state.epochImages,
      flagImages: flags,
      coaddImage: state.coaddImage,
      diffImage: diff,
      colorSkyCanvas: state.skyView.colorSkyCanvas,
      visualGrids: state.originVisualGrids || null,
      aiDetections: originDetections,
    });
    updateInfinitePlaneBadge();
    const top = originDetections[0];
    state.selectedDetectionId = top?.id || null;
    state.selectedPixel = top ? { x: top.x_pix, y: top.y_pix } : { x: 63.5, y: 63.5 };
    renderAIDetectionsList(state.allAiDetections);
    state.skyView.zoom = getDefaultSkyZoom();
    updateAladinView(ra, dec, fov);
    renderCanvas();
    stopLoading();
    setExploreBusy(false);
    if (refresh) {
      setExploreProgress(
        newEpochsList.length > 0
          ? `Sincronización IRSA completada: ${data.target_info.total_frames} recortes activos (+${newEpochsList.length} nuevas exposiciones · ${data.target_info.total_epochs} fechas / ${data.target_info.total_bands} bandas).`
          : `Sincronización IRSA al día: ${data.target_info.total_frames} recortes verificados (${data.target_info.data_source}).`
      );
    } else {
      setExploreProgress(data.target_info.matched_description || `Región RA=${ra.toFixed(4)}°, Dec=${dec.toFixed(4)}° lista.`);
    }
    void loadFieldCatalogs(sequence);
    void fetchAndRenderSpectrum(top?.ra ?? ra, top?.dec ?? dec, Boolean(top), ra, dec);
  } catch (err) {
    if (sequence !== state.exploreSequence) return;
    setExploreProgress(err.name === "AbortError" ? "La consulta agotó el tiempo de espera. Reintentá." : `No se pudo cargar la región: ${err.message}`);
  } finally {
    clearTimeout(timeout);
    stopLoading();
    if (sequence === state.exploreSequence) setExploreBusy(false);
  }
}

function setViewMode(mode) {
  state.viewMode = mode;
  ["blink", "diff", "coadd", "rgb"].forEach((m) => {
    const btn = document.getElementById(`mode-${m}`);
    if (!btn) return;
    btn.className =
      m === mode
        ? "px-2.5 py-1 rounded-md bg-sky-500 text-slate-950 font-semibold"
        : "px-2.5 py-1 rounded-md text-slate-300 hover:text-white";
  });
  const diffLegend = document.getElementById("diff-legend");
  if (diffLegend) {
    mode === "diff"
      ? diffLegend.classList.remove("hidden")
      : diffLegend.classList.add("hidden");
  }
  renderCanvas();
}

document.addEventListener("DOMContentLoaded", async () => {
  const plot = document.getElementById("spectrum-plot");
  new ResizeObserver(() => {
    if (window.Plotly && plot.data && plot.getClientRects().length) Plotly.Plots.resize(plot);
  }).observe(plot);
  const initial = getParamsFromUrl();
  state.embed = Boolean(initial.embed);
  await initDemoProfiles();
  const settings = applyDemoSettings();
  const region = demoStore?.get()?.lastRegion;
  const urlParams = new URLSearchParams(window.location.search);
  state.ra = urlParams.has("ra") ? initial.ra : region?.ra ?? initial.ra;
  state.dec = urlParams.has("dec") ? initial.dec : region?.dec ?? initial.dec;
  const useUrlFov = urlParams.has("fov") && (!window.history.state?.papastronomyManagedUrl || demoStore?.get()?.overrides.fov == null);
  state.fov = useUrlFov ? initial.fov : settings.fov;
  state.temporalSearch = urlParams.has("temporal") ? initial.temporalSearch : region?.temporal ?? false;
  const customFrames = demoStore?.get()?.overrides.maxFrames;
  state.frameLimit = state.temporalSearch ? Math.min(customFrames ?? 24, 32) : settings.maxFrames;
  state.invertPixels = urlParams.has("invert") ? Boolean(initial.invert) : settings.invertPixels;
  document.getElementById("input-ra").value = state.ra;
  document.getElementById("input-dec").value = state.dec;
  document.getElementById("input-fov").value = state.fov;
  document.getElementById("input-max-frames").value = state.frameLimit;
  syncFovPresetSelect(state.fov);
  if (state.embed) document.body.classList.add("embedded");
  const chkInvertInit = document.getElementById("chk-invert");
  if (chkInvertInit) chkInvertInit.checked = state.invertPixels;

  initAladinLite(state.ra, state.dec, state.fov);

  try {
    const tRes = await fetch("/api/targets");
    const tJson = await tRes.json();
    state.targets = tJson.MANDATORY_TARGETS || [];
  } catch (e) {
    console.warn("No se pudo cargar /api/targets:", e);
  }

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const found = state.targets.find((t) => t.id === targetId);
      if (found) {
        const configuredFov = Number(document.getElementById("input-fov").value);
        exploreCoordinates(found.ra_deg, found.dec_deg, configuredFov || found.default_fov);
      }
    });
  });

  document.getElementById("coord-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raParsed = parseCoordinateText(document.getElementById("input-ra").value, "ra");
    if (!raParsed.ok) { setExploreProgress(coordinateInputMessage("ra", raParsed.error)); return; }
    const decParsed = parseCoordinateText(document.getElementById("input-dec").value, "dec");
    if (!decParsed.ok) { setExploreProgress(coordinateInputMessage("dec", decParsed.error)); return; }
    const fov = parseFloat(document.getElementById("input-fov").value);
    exploreCoordinates(raParsed.value, decParsed.value, fov);
  });

  const selectFovPreset = document.getElementById("select-fov-preset");
  if (selectFovPreset) {
    selectFovPreset.addEventListener("change", (e) => {
      if (e.target.value === "custom") return;
      document.getElementById("input-fov").value = e.target.value;
      const form = document.getElementById("coord-form");
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }

  document.getElementById("input-fov").addEventListener("input", (e) => {
    syncFovPresetSelect(parseFloat(e.target.value));
  });

  document.getElementById("btn-share-url").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(window.location.href); }
    catch { setExploreProgress("No se pudo copiar. Copiá el enlace desde la barra de direcciones."); return; }
    const btn = document.getElementById("btn-share-url");
    const orig = btn.innerHTML;
    btn.innerHTML = "<span>URL Copiada</span>";
    setTimeout(() => (btn.innerHTML = orig), 1800);
  });

  document.getElementById("btn-copy-iframe").addEventListener("click", async () => {
    const params = new URLSearchParams(window.location.search);
    params.set("embed", "1");
    const src = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const snippet = `<iframe src="${src}" width="100%" height="620" loading="lazy" title="Papastronomy SPHEREx" style="border:1px solid #1e293b;border-radius:12px;"></iframe>`;
    try { await navigator.clipboard.writeText(snippet); }
    catch { setExploreProgress("No se pudo copiar el código <iframe>. Usá «Copiar URL Embebible»."); return; }
    const btn = document.getElementById("btn-copy-iframe");
    const orig = btn.innerHTML;
    btn.innerHTML = "<span>Código &lt;iframe&gt; Copiado</span>";
    setTimeout(() => (btn.innerHTML = orig), 1800);
  });

  document.getElementById("btn-open-wiseview")?.addEventListener("click", () => {
    const ra = Number(state.skyView?.centerRa ?? state.ra).toFixed(6);
    const dec = Number(state.skyView?.centerDec ?? state.dec).toFixed(6);
    const sizeArcsec = Math.max(60, Math.min(1200, Math.round((state.fov / (state.skyView?.zoom || 1)) * 3600)));
    const invertFlag = state.invertPixels ? 1 : 1;
    const pmra = parseFloat(document.getElementById("input-shift-pmra")?.value || "0") || 0;
    const pmdec = parseFloat(document.getElementById("input-shift-pmdec")?.value || "0") || 0;
    const shiftFlag = pmra !== 0 || pmdec !== 0 ? 1 : 0;
    const wiseviewUrl =
      `http://byw.tools/wiseview#ra=${ra}&dec=${dec}&size=${sizeArcsec}&band=2&speed=500` +
      `&minbright=-50.0000&maxbright=500.0000&window=13.3803&diff_window=1&linear=1` +
      `&color=&zoom=9&border=0&gaia=0&invert=${invertFlag}&maxdyr=0&scandir=0&neowise=0&diff=0` +
      `&outer_epochs=0&unique_window=1&smooth_scan=0&shift=${shiftFlag}&pmra=${Math.round(pmra)}&pmdec=${Math.round(pmdec)}`;
    window.open(wiseviewUrl, "_blank", "noopener,noreferrer");
  });

  document.getElementById("chk-invert")?.addEventListener("change", (e) => {
    state.invertPixels = Boolean(e.target.checked);
    syncUrlParams(state.ra, state.dec, state.fov, state.temporalSearch);
    rebakeAllOpticalCanvases();
  });

  document.getElementById("slider-stretch")?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.stretchLinearity = Number.isFinite(val) ? val : 0.0;
    const lbl = document.getElementById("lbl-stretch-val");
    if (lbl) {
      lbl.textContent =
        state.stretchLinearity <= 0.05
          ? "Original"
          : state.stretchLinearity >= 0.95
          ? "Contraste"
          : `${Math.round(state.stretchLinearity * 100)}%`;
    }
    rebakeAllOpticalCanvases();
  });

  document.getElementById("slider-contrast")?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    state.contrastGain = Number.isFinite(val) ? val : 1.0;
    const lbl = document.getElementById("lbl-contrast-val");
    if (lbl) lbl.textContent = `${state.contrastGain.toFixed(2)}×`;
    rebakeAllOpticalCanvases();
  });

  const applyShiftAndStack = (pmRaMasYr, pmDecMasYr, directPixelDelta = null, customLabel = null) => {
    const nEp = state.exploreData?.epochs?.length || 1;
    const canvas = computeShiftAndStackCanvas(pmRaMasYr, pmDecMasYr, directPixelDelta);
    if (!canvas) {
      setExploreProgress("El apilado necesita recortes cargados y fechas válidas para aplicar movimiento propio.");
      return;
    }
    state.shiftStackCanvas = canvas;
    state.shiftStackMeta = {
      pmRaMasYr,
      pmDecMasYr,
      directPixelDelta,
      label: customLabel || `Shift & Stack activo (${nEp} épocas alineadas en movimiento)`,
    };
    setViewMode("shift_stack");
    setExploreProgress(
      `Shift & Stack completado: μ_α*=${Math.round(pmRaMasYr)} mas/a, μ_δ=${Math.round(pmDecMasYr)} mas/a · Apilado visual de PNG; no mide SNR.`
    );
  };

  document.getElementById("btn-shift-stack")?.addEventListener("click", () => {
    const pmRa = parseFloat(document.getElementById("input-shift-pmra")?.value || "0") || 0;
    const pmDec = parseFloat(document.getElementById("input-shift-pmdec")?.value || "0") || 0;
    applyShiftAndStack(pmRa, pmDec, null);
  });

  document.getElementById("btn-autotrack-dipole")?.addEventListener("click", () => {
    const detections = state.allAiDetections?.length
      ? state.allAiDetections
      : state.exploreData?.ai_detections || [];
    const selectedDet = detections.find((d) => d.id === state.selectedDetectionId && d.type === "MOVING_DIPOLE");
    const dipole = selectedDet || detections.find((d) => d.type === "MOVING_DIPOLE" && d.neg_x_pix != null && d.neg_y_pix != null);
    const inputPmRa = document.getElementById("input-shift-pmra");
    const inputPmDec = document.getElementById("input-shift-pmdec");

    if (dipole && dipole.neg_x_pix != null && dipole.neg_y_pix != null) {
      const dxEarlyToLate = dipole.x_pix - dipole.neg_x_pix;
      const dyEarlyToLate = dipole.y_pix - dipole.neg_y_pix;
      const arcsecPerPix = Math.max(0.05, (state.fov * 3600.0) / CUTOUT_NPIX);
      const baseline = state.exploreData?.target_info?.difference_quality?.baseline_years;
      let pmRaMasYr = baseline > 0 ? Math.round((-dxEarlyToLate * arcsecPerPix * 1000.0) / baseline) : 0;
      let pmDecMasYr = baseline > 0 ? Math.round((dyEarlyToLate * arcsecPerPix * 1000.0) / baseline) : 0;

      // Si hay una estrella Gaia cercana con movimiento propio medido, usar su vector exacto en la etiqueta
      const nearGaia = (state.skyView.gaiaSources || []).find(
        (g) =>
          Number.isFinite(g.pmra) &&
          Number.isFinite(g.pmdec) &&
          Math.hypot(g.pmra, g.pmdec) > 80 &&
          angularDistanceDeg(dipole.ra, dipole.dec, g.ra, g.dec) * 3600.0 <= 20.0
      );
      if (nearGaia) {
        pmRaMasYr = Math.round(nearGaia.pmra);
        pmDecMasYr = Math.round(nearGaia.pmdec);
      }

      if (inputPmRa) inputPmRa.value = String(pmRaMasYr);
      if (inputPmDec) inputPmDec.value = String(pmDecMasYr);
      state.selectedDetectionId = dipole.id;
      state.selectedPixel = { x: dipole.x_pix, y: dipole.y_pix };
      updateAIDetectionCardsSelection(false);
      applyShiftAndStack(
        pmRaMasYr,
        pmDecMasYr,
        { dxEarlyToLate, dyEarlyToLate },
        `Auto-Track Dipolo IA #${dipole.id} (${dipole.snr_score}σ) · Trayectoria compensada`
      );
      return;
    }

    // Respaldo: estrella Gaia con mayor movimiento propio en el campo actual
    const fastestGaia = [...(state.skyView.gaiaSources || [])]
      .filter((g) => Number.isFinite(g.pmra) && Number.isFinite(g.pmdec))
      .sort((a, b) => Math.hypot(b.pmra, b.pmdec) - Math.hypot(a.pmra, a.pmdec))[0];
    if (fastestGaia && Math.hypot(fastestGaia.pmra, fastestGaia.pmdec) > 10) {
      const pmRa = Math.round(fastestGaia.pmra);
      const pmDec = Math.round(fastestGaia.pmdec);
      if (inputPmRa) inputPmRa.value = String(pmRa);
      if (inputPmDec) inputPmDec.value = String(pmDec);
      state.selectedPixel = { x: fastestGaia.x, y: fastestGaia.y };
      applyShiftAndStack(pmRa, pmDec, null, `Auto-Track Gaia DR3 (${fastestGaia.id})`);
      return;
    }

    setExploreProgress("No hay dipolos móviles ni vectores Gaia en este campo; ingresá pmRA/pmDec manualmente.");
  });

  document.getElementById("mode-blink").addEventListener("click", () => setViewMode("blink"));
  document.getElementById("mode-diff").addEventListener("click", () => setViewMode("diff"));
  document.getElementById("mode-coadd").addEventListener("click", () => setViewMode("coadd"));
  const btnModeRgb = document.getElementById("mode-rgb");
  if (btnModeRgb) {
    btnModeRgb.addEventListener("click", () => setViewMode("rgb"));
  }

  const runManualPairOperation = (op) => {
    const selA = document.getElementById("select-epoch-a");
    const selB = document.getElementById("select-epoch-b");
    if (!selA || !selB) return;
    const idxA = parseInt(selA.value, 10);
    const idxB = parseInt(selB.value, 10);
    if (!Number.isInteger(idxA) || !Number.isInteger(idxB)) return;
    if (op === "blink") {
      state.manualPairIndices = [idxA, idxB];
      state.selectedBand = "manual_pair";
      state.currentEpochIdx = idxA;
      const slider = document.getElementById("slider-epoch");
      if (slider) slider.value = idxA;
      setViewMode("blink");
      state.isPlaying = true;
      const playBtn = document.getElementById("btn-play-pause");
      if (playBtn) playBtn.textContent = "Pausar";
      startBlinkTimer();
      return;
    }
    const manualCanvas = computeManualEpochPairCanvas(idxA, idxB, op);
    if (!manualCanvas) return;
    state.manualOpCanvas = manualCanvas;
    state.manualOpMeta = { op, idxA, idxB };
    setViewMode(op === "diff" ? "manual_diff" : "manual_sum");
  };

  document.getElementById("btn-manual-diff")?.addEventListener("click", () => runManualPairOperation("diff"));
  document.getElementById("btn-manual-sum")?.addEventListener("click", () => runManualPairOperation("sum"));
  document.getElementById("btn-manual-blink")?.addEventListener("click", () => runManualPairOperation("blink"));

  document.getElementById("btn-export-png")?.addEventListener("click", () => {
    const canvas = document.getElementById("spherex-canvas");
    if (!canvas || !state.exploreData) {
      setExploreProgress("Cargá una región primero para exportar la imagen PNG.");
      return;
    }
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `papastronomy_${state.ra.toFixed(4)}_${state.dec.toFixed(4)}_${state.viewMode}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setExploreProgress(`Imagen exportada: ${a.download}`);
  });

  document.getElementById("btn-plot-spectrum")?.addEventListener("click", () => {
    state.spectrumPlotMode = "spectrum";
    renderSpectrumOrLightCurve();
  });

  document.getElementById("btn-plot-lightcurve")?.addEventListener("click", () => {
    state.spectrumPlotMode = "lightcurve";
    renderSpectrumOrLightCurve();
  });

  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    const data = state.lastSpectrumData;
    if (!data || !data.spectrum || data.spectrum.length === 0) {
      setExploreProgress("Seleccioná una fuente con espectro medido antes de exportar CSV.");
      return;
    }
    const rows = [
      "ra_deg,dec_deg,wavelength_um,bandwidth_um,flux_mjy_sr,flux_uncertainty_mjy_sr,obs_time,detector",
      ...data.spectrum.map((p) =>
        [
          Number(data.ra).toFixed(6),
          Number(data.dec).toFixed(6),
          Number(p.wavelength_um).toFixed(4),
          Number(p.bandwidth_um || 0).toFixed(4),
          Number(p.flux_mjy_sr).toFixed(4),
          Number(p.flux_uncertainty || 0).toFixed(4),
          `"${String(p.obs_time || "").replace(/"/g, '""')}"`,
          `"${String(p.detector || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `papastronomy_spectrum_${Number(data.ra).toFixed(4)}_${Number(data.dec).toFixed(4)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setExploreProgress(`Fotometría exportada (${data.spectrum.length} mediciones): ${a.download}`);
  });

  document.getElementById("btn-play-pause").addEventListener("click", (e) => {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying && state.selectedBand !== "pair" && state.selectedBand !== "manual_pair") {
      state.selectedBand = "auto";
      document.getElementById("select-band").value = "auto";
    }
    e.currentTarget.textContent = state.isPlaying ? "Pausar" : "Reproducir";
    startBlinkTimer();
  });

  document.getElementById("slider-epoch").addEventListener("input", (e) => {
    state.currentEpochIdx = parseInt(e.target.value, 10);
    state.selectedBand = String(state.currentEpochIdx);
    const bandSelect = document.getElementById("select-band");
    if (bandSelect) bandSelect.value = state.selectedBand;
    renderCanvas();
  });

  document.getElementById("select-band").addEventListener("change", (e) => {
    state.selectedBand = e.target.value;
    const epochs = state.exploreData?.epochs || [];
    const selectedIndex = getSelectedBandIndex(epochs);
    state.currentEpochIdx = selectedIndex;
    document.getElementById("slider-epoch").value = selectedIndex;
    const ep = epochs[selectedIndex];
    const summary = document.getElementById("band-summary");
    if (summary) {
      if (String(state.selectedBand).startsWith("coadd:")) {
        const detCode = String(state.selectedBand).slice(6);
        const dc = state.exploreData?.detector_coadds?.[detCode];
        if (dc) {
          summary.textContent =
            `Mediana ${dc.detector}: mediana de ${dc.frame_count} exposiciones ` +
            `(${Number(dc.wavelength_min_um).toFixed(3)}–${Number(dc.wavelength_max_um).toFixed(3)} µm) · ${dc.clean_pixels_pct}% de píxeles limpios.`;
        }
      } else if (state.selectedBand === "pair") {
        const pairIndices = state.exploreData?.target_info?.analysis_frame_indices || [];
        summary.textContent =
          `Par comparable activo: ciclando solo las ${pairIndices.length} exposiciones de igual detector y banda usadas en la resta temporal.`;
      } else if (ep) {
        summary.textContent = state.selectedBand === "auto"
          ? `Automática: ${Number(ep.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(ep.bandwidth_um || 0).toFixed(3)} µm) · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% de píxeles limpios.`
          : `Manual: ${Number(ep.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(ep.bandwidth_um || 0).toFixed(3)} µm) · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% de píxeles limpios.`;
      }
    }
    renderCanvas();
  });

  const selectContextSurvey = document.getElementById("select-context-survey");
  if (selectContextSurvey) {
    selectContextSurvey.addEventListener("change", (e) => {
      state.contextSurvey = e.target.value;
      renderContextSkyMap();
    });
  }

  document.getElementById("btn-temporal-search").addEventListener("click", () => {
    const raParsed = parseCoordinateText(document.getElementById("input-ra").value, "ra");
    if (!raParsed.ok) { setExploreProgress(coordinateInputMessage("ra", raParsed.error)); return; }
    const decParsed = parseCoordinateText(document.getElementById("input-dec").value, "dec");
    if (!decParsed.ok) { setExploreProgress(coordinateInputMessage("dec", decParsed.error)); return; }
    const fov = Number(document.getElementById("input-fov").value);
    exploreCoordinates(raParsed.value, decParsed.value, fov, 24, true, true);
  });

  document.getElementById("btn-irsa-sync").addEventListener("click", () => {
    const currentEpochs = state.exploreData?.epochs?.length || 10;
    const nextEpochs = Math.min(state.temporalSearch ? 32 : 102, Math.max(currentEpochs + 6, state.temporalSearch ? 24 : 16));
    setExploreProgress("Sincronizando nuevas entregas de IRSA para esta región…");
    exploreCoordinates(state.ra, state.dec, state.fov, nextEpochs, state.temporalSearch, true);
  });

  document.getElementById("btn-load-102-bands").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Cargando…";
    try {
      await exploreCoordinates(state.ra, state.dec, state.fov, 102);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  document.getElementById("select-fps").addEventListener("change", (e) => {
    state.fps = parseInt(e.target.value, 10);
    startBlinkTimer();
  });

  document.getElementById("btn-export-webm").addEventListener("click", async () => {
    const canvas = document.getElementById("spherex-canvas");
    const epochs = state.exploreData?.epochs || [];
    if (!canvas || epochs.length === 0) { setExploreProgress("Cargá una región primero para exportar."); return; }
    if (typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      setExploreProgress("Este navegador no soporta exportación a WebM. Probá Chrome o Edge."); return;
    }
    const btn = document.getElementById("btn-export-webm");
    const originalText = btn.textContent;
    btn.disabled = true;
    const savedMode = state.viewMode;
    const savedBand = state.selectedBand;
    const savedEpochIdx = state.currentEpochIdx;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    state.viewMode = "blink";
    let stream = null;
    try {
      stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      const frameMs = Math.max(120, 1000 / Math.max(1, state.fps));
      recorder.start(250);
      for (let i = 0; i < epochs.length; i++) {
        state.currentEpochIdx = i;
        state.selectedBand = String(i);
        renderCanvas();
        if (track && typeof track.requestFrame === "function") track.requestFrame();
        btn.textContent = `Exportando ${i + 1}/${epochs.length}…`;
        await new Promise((r) => setTimeout(r, frameMs));
      }
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `papastronomy_${state.ra.toFixed(4)}_${state.dec.toFixed(4)}_flipbook.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExploreProgress(`Flipbook exportado: ${epochs.length} épocas a ${state.fps} fps (WebM).`);
    } catch (err) {
      setExploreProgress(`No se pudo exportar el WebM: ${err.message}`);
    } finally {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      state.viewMode = savedMode;
      state.selectedBand = savedBand;
      state.currentEpochIdx = savedEpochIdx;
      const selBand = document.getElementById("select-band");
      if (selBand) selBand.value = savedBand;
      const slider = document.getElementById("slider-epoch");
      if (slider) slider.value = savedEpochIdx;
      renderCanvas();
      startBlinkTimer();
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  document.getElementById("chk-ai-markers").addEventListener("change", (e) => {
    state.showAIMarkers = e.target.checked;
    renderCanvas();
  });

  document.getElementById("chk-flags").addEventListener("change", (e) => {
    state.showFlags = e.target.checked;
    renderCanvas();
  });

  const chkNamed = document.getElementById("chk-named-objects");
  if (chkNamed) {
    chkNamed.addEventListener("change", (e) => {
      state.showNamedObjects = e.target.checked;
      renderContextSkyMap();
      renderCanvas();
    });
  }

  const chkGaia = document.getElementById("chk-gaia");
  const chkPm = document.getElementById("chk-pm-vectors");
  const lblPm = document.getElementById("lbl-pm-vectors");
  const syncGaiaPmState = () => {
    const gaiaEnabled = Boolean(chkGaia?.checked);
    state.showGaiaCat = gaiaEnabled;
    if (chkPm) {
      chkPm.disabled = !gaiaEnabled;
    }
    if (lblPm) {
      lblPm.classList.toggle("opacity-40", !gaiaEnabled);
      lblPm.classList.toggle("cursor-not-allowed", !gaiaEnabled);
      lblPm.classList.toggle("cursor-pointer", gaiaEnabled);
    }
  };
  chkGaia.addEventListener("change", () => {
    syncGaiaPmState();
    renderContextSkyMap();
  });
  syncGaiaPmState();

  if (chkPm) {
    chkPm.addEventListener("change", (e) => {
      state.showPmVectors = e.target.checked;
      renderContextSkyMap();
    });
  }

  document.getElementById("chk-wise").addEventListener("change", (e) => {
    state.showWiseCat = e.target.checked;
    renderContextSkyMap();
  });

  const btnToggleInfinite = document.getElementById("btn-toggle-infinite-plane");
  if (btnToggleInfinite) {
    btnToggleInfinite.addEventListener("click", () => {
      state.infinitePlaneEnabled = !state.infinitePlaneEnabled;
      if (state.infinitePlaneEnabled) {
        if (state.skyView.zoom < DEFAULT_SKY_ZOOM) {
          state.skyView.zoom = DEFAULT_SKY_ZOOM;
        }
        updateInfinitePlaneBadge();
        scheduleInfinitePrefetch();
        renderContextSkyMap();
        renderCanvas();
      } else {
        abortBackgroundTiles();
        const originTile = state.tileGrid.get("0,0");
        state.tileGrid = new Map();
        if (originTile) {
          state.tileGrid.set("0,0", originTile);
          state.allAiDetections = [...(originTile.aiDetections || [])];
          renderAIDetectionsList(state.allAiDetections);
        }
        state.skyView.zoom = 1.0;
        state.skyView.panX = 0;
        state.skyView.panY = 0;
        updateInfinitePlaneBadge();
        updateAladinView(state.ra, state.dec, state.fov);
      }
    });
  }

  document.getElementById("btn-recenter-aladin").addEventListener("click", (e) => {
    state.skyView.zoom = getDefaultSkyZoom();
    state.skyView.panX = 0;
    state.skyView.panY = 0;
    updateAladinView(state.ra, state.dec, state.fov);
    const btn = e.currentTarget;
    const origText = btn.textContent;
    btn.textContent = "Centro Sincronizado";
    setTimeout(() => {
      btn.textContent = origText;
    }, 1200);
  });

  demoAppReady = true;
  if (!state.embed) demoAssistantUI = DemoAssistant.mount({
    getContext: getAssistantContext, applySettings: applyAssistantSettings,
    getLearning3DUrl: () => document.querySelector('[data-learn-3d]')?.href,
    onNavigate: target => {
      const destinations = { explorer: "input-ra", detector: "detector-title", spectrum: "spectrum-panel-title" };
      const id = destinations[target];
      if (!id) return;
      const element = document.getElementById(id);
      if (element.tagName !== "INPUT") element.setAttribute("tabindex", "-1");
      element.scrollIntoView({ block: "start" });
      element.focus({ preventScroll: true });
    },
    onExplore: () => {
      renderCanvas();
      renderContextSkyMap();
      if (window.Plotly && plot.data && plot.getClientRects().length) Plotly.Plots.resize(plot);
    },
  });
  await exploreCoordinates(state.ra, state.dec, state.fov, state.frameLimit, state.temporalSearch);
  setViewMode(state.viewMode);
  startBlinkTimer();
});
