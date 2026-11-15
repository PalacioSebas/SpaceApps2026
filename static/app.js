/**
 * Frontend v2.4 - Papastronomy SPHEREx & Planet X Explorer.
 * Conectado a recortes .FITS reales de NASA/IPAC IRSA (128x128 px),
 * visor multi-época en loop (fechas SPHEREx comparables), panel «Objetos que cambian»
 * (seguimiento de cada estrella en todas las fechas: movimiento y brillo), herramientas
 * avanzadas (Resta ΔI, Mediana, RGB, Shift & Stack) y Contexto Multi-Catálogo (Gaia DR3 + AllWISE).
 */

const CUTOUT_NPIX = 128.0;
const TILE_STEP_PIX = 96.0;
const TILE_MARGIN_PIX = (CUTOUT_NPIX - TILE_STEP_PIX) / 2;
const DEFAULT_SKY_ZOOM = +(CUTOUT_NPIX / TILE_STEP_PIX).toFixed(4);
const MAX_CONCURRENT_TILE_FETCHES = 1;

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
  timerId: null,
  viewMode: "blink",
  showAIMarkers: false, // marcas de la resta ΔI (herramienta avanzada)
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
  pairBlinkPhase: 0,
  viewerStep: 0, // paso de la animación del visor (solo fechas SPHEREx comparables)
  changesData: null, // respuesta de /api/changes (objetos que cambian)
  changesLoading: false,
  changesError: null,
  changesSequence: 0,
  changesController: null,
  selectedChangeId: null,
  exploreSpectrumSeq: -1,
  viewerArrowScale: 1,
  pairMeta: null,
  spectrumPlotMode: "timeline",
  lastSpectrumData: null,
  timelineData: null,
  timelineLoading: false,
  timelineError: null,
  timelineDetector: null,
  timelineSelectedVisit: null,
  timelinePoint: null,
  timelineController: null,
  timelineSequence: 0,
  timelineBlinkMode: "all",
  timelineSelectedKeys: null,
  timelineBlinkPlaying: true,
  timelineBlinkFps: 2,
  timelineBlinkTimerId: null,
  timelineBlinkStep: 0,
  timelineBlinkFrames: [],
  timelineEnhancedStamps: new Map(),
  forceCenterSelection: false,
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
    timeline: params.get("timeline") !== "0",
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
  if (state.spectrumPlotMode === "timeline") url.searchParams.set("timeline", "1");
  else url.searchParams.delete("timeline");
  window.history.replaceState({}, "", url);
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
  // Las grillas propias miden 128 px, pero las imágenes de hips2fits miden 384 px: el recorte de
  // origen se escala al tamaño real (antes solo se veía el cuadrante superior izquierdo ampliado).
  const k = (img.naturalWidth || img.width || CUTOUT_NPIX) / CUTOUT_NPIX;
  if (rect.fullCutout) {
    ctx.drawImage(img, 0, 0, CUTOUT_NPIX * k, CUTOUT_NPIX * k, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  ctx.drawImage(
    img,
    TILE_MARGIN_PIX * k,
    TILE_MARGIN_PIX * k,
    TILE_STEP_PIX * k,
    TILE_STEP_PIX * k,
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
      "absolute top-2.5 right-2.5 bg-slate-950/85 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-300 pointer-events-none";
    return;
  }
  badge.className =
    "absolute top-2.5 right-2.5 bg-slate-950/85 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-sky-300 pointer-events-none";
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

function extractNormalizedSnrGrid(rgbaData, w = 128, h = 128) {
  const vals = [];
  for (let y = TILE_MARGIN_PIX; y < h - TILE_MARGIN_PIX; y++) {
    for (let x = TILE_MARGIN_PIX; x < w - TILE_MARGIN_PIX; x++) {
      const i = (y * w + x) * 4;
      if (rgbaData[i + 3] > 16) vals.push(rgbaData[i]);
    }
  }
  if (vals.length === 0) {
    for (let i = 0; i < rgbaData.length; i += 4) {
      if (rgbaData[i + 3] > 16) vals.push(rgbaData[i]);
    }
  }
  vals.sort((a, b) => a - b);
  const p12 = vals.length ? vals[Math.floor(vals.length * 0.12)] : 14;
  const p25 = vals.length ? vals[Math.floor(vals.length * 0.25)] : 20;
  const p50 = vals.length ? vals[Math.floor(vals.length * 0.50)] : 26;
  const absDevs = vals.map((v) => Math.abs(v - p50)).sort((a, b) => a - b);
  const mad = absDevs.length ? absDevs[Math.floor(absDevs.length * 0.5)] : 6;
  const lowerSigma = Math.max((p50 - p12) * 1.35, 6.0);
  const sigma = Math.max(lowerSigma, Math.min(1.4826 * mad, lowerSigma * 2.2));
  const sky = p25;

  const grid = new Float32Array(w * h);
  grid.fill(NaN);
  for (let idx = 0; idx < w * h; idx++) {
    const i = idx * 4;
    if (rgbaData[i + 3] > 16) {
      grid[idx] = (rgbaData[i] - sky) / sigma;
    }
  }
  return grid;
}

function inpaintMissingPixels(grid, w = 128, h = 128, passes = 14) {
  let current = Float32Array.from(grid);
  for (let p = 0; p < passes; p++) {
    const next = Float32Array.from(current);
    let remaining = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (Number.isFinite(current[idx])) continue;
        let sum = 0;
        let cnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const v = current[ny * w + nx];
            if (Number.isFinite(v)) {
              sum += v;
              cnt++;
            }
          }
        }
        if (cnt > 0) next[idx] = sum / cnt;
        else remaining++;
      }
    }
    current = next;
    if (remaining === 0) break;
  }
  for (let i = 0; i < current.length; i++) {
    if (!Number.isFinite(current[i])) current[i] = 0.0;
  }
  return current;
}

function snrToGrayscaleByte(snr) {
  const gain = Number.isFinite(state.contrastGain) ? state.contrastGain : 1.0;
  const lin = Number.isFinite(state.stretchLinearity) ? state.stretchLinearity : 0.0;
  const z = Math.max(0.0, (snr + 0.55) * gain);
  const asinhNorm = Math.min(1.0, Math.asinh(z / 2.2) / Math.asinh(14.0));
  const linNorm = Math.min(1.0, z / 14.0);
  const norm = (1.0 - lin) * asinhNorm + lin * linNorm;
  const rawByte = Math.min(255, Math.max(0, Math.round(norm * 255)));
  return state.invertPixels ? 255 - rawByte : rawByte;
}

function overlapTaper1D(u) {
  const overlap = TILE_MARGIN_PIX * 2; // 32 px
  if (u < overlap) {
    return 0.5 * (1.0 - Math.cos((Math.PI * (u + 0.5)) / overlap));
  }
  if (u >= CUTOUT_NPIX - overlap) {
    return 0.5 * (1.0 - Math.cos((Math.PI * (CUTOUT_NPIX - 0.5 - u)) / overlap));
  }
  return 1.0;
}

function calibrateTileGridsToNeighbors(gx, gy, visualGrids) {
  if ((gx === 0 && gy === 0) || !state.tileGrid) return;
  const selfPairs = [];
  const refPairs = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = gx + dx;
      const ny = gy + dy;
      const neighbor = state.tileGrid.get(`${nx},${ny}`);
      const nGrids = neighbor?.visualGrids;
      if (!neighbor || neighbor.status !== "ready" || !nGrids) continue;

      const shiftX = (gx - nx) * TILE_STEP_PIX;
      const shiftY = -(gy - ny) * TILE_STEP_PIX;
      const xStart = Math.max(0, -shiftX);
      const xEnd = Math.min(CUTOUT_NPIX, CUTOUT_NPIX - shiftX);
      const yStart = Math.max(0, -shiftY);
      const yEnd = Math.min(CUTOUT_NPIX, CUTOUT_NPIX - shiftY);

      for (let py = yStart; py < yEnd; py += 2) {
        const npy = py + shiftY;
        for (let px = xStart; px < xEnd; px += 2) {
          const npx = px + shiftX;
          const vSelf = visualGrids.mid[py * CUTOUT_NPIX + px];
          const vRef = nGrids.mid[npy * CUTOUT_NPIX + npx];
          if (Number.isFinite(vSelf) && Number.isFinite(vRef)) {
            selfPairs.push(vSelf);
            refPairs.push(vRef);
          }
        }
      }
    }
  }

  if (selfPairs.length < 24) return;
  const sortedSelf = [...selfPairs].sort((a, b) => a - b);
  const sortedRef = [...refPairs].sort((a, b) => a - b);
  const q25Idx = Math.floor(sortedSelf.length * 0.25);
  const q50Idx = Math.floor(sortedSelf.length * 0.50);
  const q75Idx = Math.floor(sortedSelf.length * 0.75);

  const medSelf = sortedSelf[q50Idx];
  const medRef = sortedRef[q50Idx];
  const iqrSelf = Math.max(sortedSelf[q75Idx] - sortedSelf[q25Idx], 0.45);
  const iqrRef = Math.max(sortedRef[q75Idx] - sortedRef[q25Idx], 0.45);

  const scale = Math.min(1.85, Math.max(0.42, iqrRef / iqrSelf));
  const offset = Math.min(3.2, Math.max(-3.2, medRef - medSelf * scale));

  const applyTransform = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = arr[i] * scale + offset;
    }
  };
  applyTransform(visualGrids.mid);
  applyTransform(visualGrids.early);
  applyTransform(visualGrids.late);
  visualGrids.epochs.forEach(applyTransform);
}

/**
 * Estiramiento de brillo del compuesto en color del mapa de contexto (solo visual, no cambia datos).
 * El tono (rojizo / azulado) compara el primer y el último tercio de las exposiciones cargadas, que pueden
 * ser de detectores y longitudes de onda distintos: es una guía visual, no una medición de cambio.
 * lum = asinh(max(0, S − black) / soft) / asinh(cap / soft), con S = señal combinada de todas las fechas
 * en unidades de ruido. Antes: black = −0,55, soft = 2, cap = 13,5 (fondo gris con ruido); ahora el
 * fondo queda oscuro y las estrellas débiles se distinguen mejor.
 */
const CONTEXT_LUM = { black: 0.0, soft: 1.0, cap: 12.0 };

function renderTileCanvasesFromGrids(gx, gy, visualGrids) {
  const w = CUTOUT_NPIX;
  const h = CUTOUT_NPIX;
  const overlap = TILE_MARGIN_PIX * 2; // 32 px

  const neighbors = [];
  if (state.tileGrid) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        const nTile = state.tileGrid.get(`${nx},${ny}`);
        if (nTile && nTile.status === "ready" && nTile.visualGrids) {
          neighbors.push({
            shiftX: (gx - nx) * TILE_STEP_PIX,
            shiftY: -(gy - ny) * TILE_STEP_PIX,
            grids: nTile.visualGrids,
          });
        }
      }
    }
  }

  const blendMid = new Float32Array(w * h);
  const blendEarly = new Float32Array(w * h);
  const blendLate = new Float32Array(w * h);
  const nEp = visualGrids.epochs.length;
  const blendEpochs = visualGrids.epochs.map(() => new Float32Array(w * h));

  for (let py = 0; py < h; py++) {
    const wy = overlapTaper1D(py);
    const inBorderY = py < overlap || py >= h - overlap;
    for (let px = 0; px < w; px++) {
      const idx = py * w + px;
      const inBorderX = px < overlap || px >= w - overlap;
      if (!inBorderX && !inBorderY || neighbors.length === 0) {
        blendMid[idx] = visualGrids.mid[idx];
        blendEarly[idx] = visualGrids.early[idx];
        blendLate[idx] = visualGrids.late[idx];
        for (let k = 0; k < nEp; k++) {
          blendEpochs[k][idx] = visualGrids.epochs[k][idx];
        }
        continue;
      }

      const wSelf = Math.max(1e-4, overlapTaper1D(px) * wy);
      let wSum = wSelf;
      let mSum = wSelf * visualGrids.mid[idx];
      let eSum = wSelf * visualGrids.early[idx];
      let lSum = wSelf * visualGrids.late[idx];

      for (let nIdx = 0; nIdx < neighbors.length; nIdx++) {
        const nb = neighbors[nIdx];
        const npx = px + nb.shiftX;
        const npy = py + nb.shiftY;
        if (npx < 0 || npx >= w || npy < 0 || npy >= h) continue;
        const nWeight = overlapTaper1D(npx) * overlapTaper1D(npy);
        if (nWeight <= 0) continue;
        const nFlat = npy * w + npx;
        wSum += nWeight;
        mSum += nWeight * nb.grids.mid[nFlat];
        eSum += nWeight * nb.grids.early[nFlat];
        lSum += nWeight * nb.grids.late[nFlat];
      }

      const mVal = mSum / wSum;
      blendMid[idx] = mVal;
      blendEarly[idx] = eSum / wSum;
      blendLate[idx] = lSum / wSum;

      const deltaMid = mVal - visualGrids.mid[idx];
      for (let k = 0; k < nEp; k++) {
        blendEpochs[k][idx] = visualGrids.epochs[k][idx] + deltaMid;
      }
    }
  }

  // 1. Canvas de Mediana en escala de grises continua sin costuras entre bordes
  const healedCoaddCanvas = document.createElement("canvas");
  healedCoaddCanvas.width = w;
  healedCoaddCanvas.height = h;
  const hcCtx = healedCoaddCanvas.getContext("2d");
  const hcImg = hcCtx.createImageData(w, h);
  for (let idx = 0; idx < w * h; idx++) {
    const g = snrToGrayscaleByte(blendMid[idx]);
    const i = idx * 4;
    hcImg.data[i] = g;
    hcImg.data[i + 1] = g;
    hcImg.data[i + 2] = g;
    hcImg.data[i + 3] = 255;
  }
  hcCtx.putImageData(hcImg, 0, 0);

  // 2. Épocas individuales alineadas radiométricamente al mosaico continuo
  const normalizedEpochs = blendEpochs.map((epGrid) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cctx = c.getContext("2d");
    const cImg = cctx.createImageData(w, h);
    for (let idx = 0; idx < w * h; idx++) {
      const g = snrToGrayscaleByte(epGrid[idx]);
      const i = idx * 4;
      cImg.data[i] = g;
      cImg.data[i + 1] = g;
      cImg.data[i + 2] = g;
      cImg.data[i + 3] = 255;
    }
    cctx.putImageData(cImg, 0, 0);
    return c;
  });

  // 3. Compuesto infrarrojo continuo sin saltos de brillo ni color entre sectores
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = w;
  colorCanvas.height = h;
  const colorCtx = colorCanvas.getContext("2d");
  const colorImg = colorCtx.createImageData(w, h);
  const gain = Number.isFinite(state.contrastGain) ? state.contrastGain : 1.0;
  const lin = Number.isFinite(state.stretchLinearity) ? state.stretchLinearity : 0.0;
  for (let idx = 0; idx < w * h; idx++) {
    const sMid = blendMid[idx];
    const sEarly = blendEarly[idx];
    const sLate = blendLate[idx];
    const sLum = Math.max(0.0, (0.25 * sEarly + 0.50 * sMid + 0.25 * sLate - CONTEXT_LUM.black) * gain);
    const asinhLum = Math.min(1.0, Math.asinh(sLum / CONTEXT_LUM.soft) / Math.asinh(CONTEXT_LUM.cap / CONTEXT_LUM.soft));
    const linLum = Math.min(1.0, sLum / CONTEXT_LUM.cap);
    const lum = (1.0 - lin) * asinhLum + lin * linLum;

    const sourceWeight = Math.min(1.0, Math.max(0.0, (sLum - 1.1) / 2.6));
    const colorIndex = Math.max(-1.0, Math.min(1.0, (sLate - sEarly) * 0.22)) * sourceWeight;

    const baseR = 7 + lum * 242;
    const baseG = 11 + lum * 236;
    const baseB = 22 + lum * 233;

    const i = idx * 4;
    const rByte = Math.min(255, Math.max(0, Math.round(baseR + colorIndex * 46)));
    const gByte = Math.min(255, Math.max(0, Math.round(baseG - Math.abs(colorIndex) * 10)));
    const bByte = Math.min(255, Math.max(0, Math.round(baseB - colorIndex * 46)));
    colorImg.data[i] = state.invertPixels ? 255 - rByte : rByte;
    colorImg.data[i + 1] = state.invertPixels ? 255 - gByte : gByte;
    colorImg.data[i + 2] = state.invertPixels ? 255 - bByte : bByte;
    colorImg.data[i + 3] = 255;
  }
  colorCtx.putImageData(colorImg, 0, 0);

  return { colorCanvas, healedCoaddCanvas, normalizedEpochs };
}

function rebakeTileNeighborhood(centerGx, centerGy) {
  if (!state.tileGrid) return;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = centerGx + dx;
      const ty = centerGy + dy;
      const tile = state.tileGrid.get(`${tx},${ty}`);
      if (!tile || tile.status !== "ready" || !tile.visualGrids) continue;
      const baked = renderTileCanvasesFromGrids(tx, ty, tile.visualGrids);
      tile.coaddImage = baked.healedCoaddCanvas;
      tile.epochImages = baked.normalizedEpochs;
      tile.colorSkyCanvas = baked.colorCanvas;
      if (tx === 0 && ty === 0) {
        state.coaddImage = baked.healedCoaddCanvas;
        state.epochImages = baked.normalizedEpochs;
        state.skyView.colorSkyCanvas = baked.colorCanvas;
      }
    }
  }
  snapNamedObjectsToTilePeaks();
}

function createTileVisualCanvases(coaddImage, epochImages, gx = 0, gy = 0) {
  if (!coaddImage) {
    return {
      colorCanvas: null,
      healedCoaddCanvas: null,
      normalizedEpochs: epochImages || [],
      visualGrids: null,
    };
  }
  const w = 128;
  const h = 128;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  ctx.drawImage(coaddImage, 0, 0, w, h);
  const coaddGrid = extractNormalizedSnrGrid(ctx.getImageData(0, 0, w, h).data, w, h);

  const epochGrids = (epochImages || []).map((img) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cctx = c.getContext("2d");
    cctx.drawImage(img, 0, 0, w, h);
    return extractNormalizedSnrGrid(cctx.getImageData(0, 0, w, h).data, w, h);
  });

  const nEp = epochGrids.length;
  const third = Math.max(1, Math.floor(nEp / 3));
  const sampleEpochRange = (startIdx, endIdx, idx) => {
    let sum = 0;
    let cnt = 0;
    for (let k = startIdx; k < endIdx; k++) {
      const v = epochGrids[k][idx];
      if (Number.isFinite(v)) {
        sum += v;
        cnt++;
      }
    }
    return cnt > 0 ? sum / cnt : NaN;
  };

  const midRaw = new Float32Array(w * h);
  const earlyRaw = new Float32Array(w * h);
  const lateRaw = new Float32Array(w * h);
  for (let idx = 0; idx < w * h; idx++) {
    const vAll = nEp > 0 ? sampleEpochRange(0, nEp, idx) : NaN;
    const vCoadd = coaddGrid[idx];
    const m = Number.isFinite(vCoadd) && Number.isFinite(vAll)
      ? 0.55 * vCoadd + 0.45 * vAll
      : Number.isFinite(vCoadd)
      ? vCoadd
      : vAll;
    midRaw[idx] = m;
    const e = nEp >= 2 ? sampleEpochRange(0, third, idx) : m;
    const l = nEp >= 2 ? sampleEpochRange(Math.max(1, nEp - third), nEp, idx) : m;
    earlyRaw[idx] = Number.isFinite(e) ? e : m;
    lateRaw[idx] = Number.isFinite(l) ? l : m;
  }

  const midHealed = inpaintMissingPixels(midRaw, w, h, 14);
  const earlyHealed = inpaintMissingPixels(earlyRaw, w, h, 14);
  const lateHealed = inpaintMissingPixels(lateRaw, w, h, 14);
  const healedEpochs = epochGrids.map((epGrid) => {
    const out = new Float32Array(w * h);
    for (let idx = 0; idx < w * h; idx++) {
      out[idx] = Number.isFinite(epGrid[idx]) ? epGrid[idx] : midHealed[idx];
    }
    return out;
  });

  const visualGrids = {
    mid: midHealed,
    early: earlyHealed,
    late: lateHealed,
    epochs: healedEpochs,
  };

  calibrateTileGridsToNeighbors(gx, gy, visualGrids);
  const baked = renderTileCanvasesFromGrids(gx, gy, visualGrids);
  return { ...baked, visualGrids };
}

function createColorCompositeCanvas(coaddImage, epochImages) {
  return createTileVisualCanvases(coaddImage, epochImages, 0, 0).colorCanvas;
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

// Dos marcas a menos de ~2 píxeles de SPHEREx (6,15″ c/u) son la misma estrella (mismo valor que el backend).
const SAME_SOURCE_RADIUS_ARCSEC = 12.0;

function isSameSourceDetection(a, b) {
  const arcsecPerPix = (state.fov * 3600.0) / CUTOUT_NPIX;
  const limitPx = SAME_SOURCE_RADIUS_ARCSEC / Math.max(1e-6, arcsecPerPix);
  const pts = (d) => {
    const out = [[d.x_pix, d.y_pix]];
    if (d.neg_x_pix !== null && d.neg_x_pix !== undefined && d.neg_y_pix !== null && d.neg_y_pix !== undefined) {
      out.push([d.neg_x_pix, d.neg_y_pix]);
    }
    return out;
  };
  if (Number.isFinite(a.ra) && Number.isFinite(b.ra) &&
      angularDistanceDeg(a.ra, a.dec, b.ra, b.dec) * 3600.0 <= SAME_SOURCE_RADIUS_ARCSEC) {
    return true;
  }
  return pts(a).some(([xa, ya]) => pts(b).some(([xb, yb]) => Math.hypot(xa - xb, ya - yb) <= limitPx));
}

function mergeTileDetections(newDetections) {
  const existing = state.allAiDetections || [];
  let added = false;
  newDetections.forEach((det) => {
    // Los sectores vecinos se solapan: la misma estrella puede venir detectada en dos sectores.
    const duplicate = existing.some((ex) => isSameSourceDetection(ex, det));
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

    const mappedDetections = mapDetectionsToGlobalPlane(data.ai_detections || [], false);
    const visuals = createTileVisualCanvases(coadd, images, gx, gy);
    entry.status = "ready";
    entry.exploreData = data;
    entry.epochImages = visuals.normalizedEpochs;
    entry.flagImages = flags;
    entry.coaddImage = visuals.healedCoaddCanvas || coadd;
    entry.diffImage = diff;
    entry.colorSkyCanvas = visuals.colorCanvas;
    entry.visualGrids = visuals.visualGrids;
    entry.aiDetections = mappedDetections;

    rebakeTileNeighborhood(gx, gy);
    mergeTileDetections(mappedDetections);
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
      renderContextSkyMap();
      renderCanvas();
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
      renderContextSkyMap();
      renderCanvas();
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

    // 0. Clic sobre un objeto que cambia: se abre su tarjeta
    const hitChange = findNearestChangeObject(xPix, yPix, 6.0 / state.skyView.zoom);
    if (hitChange) {
      selectChangeObject(hitChange);
      return;
    }

    // 1. Clic sobre un astro con nombre (estrella, planeta o sistema planetario): queda seleccionado
    const hitNamed = findHoveredNamedObject(xPix, yPix, 6.5 / state.skyView.zoom);
    if (hitNamed) {
      selectNamedObject(hitNamed);
      return;
    }

    // 2. Clic en otro lugar del mapa: se libera la selección del astro con nombre
    clearNamedObjectSelection();

    state.selectedChangeId = null;
    updateChangeCardsSelection(false);
    const hitDet = state.showAIMarkers ? findNearestAIDetection(xPix, yPix, 5.0 / state.skyView.zoom) : null;
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

  const sampleIndices = (idxs, fallbackGrid, pIdx) => {
    if (!idxs.length) return fallbackGrid ? fallbackGrid[pIdx] : 0;
    let sum = 0;
    for (let i = 0; i < idxs.length; i++) {
      sum += grids.epochs[idxs[i]][pIdx];
    }
    return sum / idxs.length;
  };

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const imgData = ctx.createImageData(w, h);
  for (let pIdx = 0; pIdx < w * h; pIdx++) {
    const bSnr = sampleIndices(blueIdxs, grids.early, pIdx);
    const rSnr = sampleIndices(redIdxs, grids.late, pIdx);
    const gSnr = greenIdxs.length
      ? sampleIndices(greenIdxs, grids.mid, pIdx)
      : 0.5 * (bSnr + rSnr);
    const rByte = snrToGrayscaleByte(rSnr);
    const gByte = snrToGrayscaleByte(gSnr);
    const bByte = snrToGrayscaleByte(bSnr);
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
    if (op === "sum") {
      const avg = 0.5 * (gridA[pIdx] + gridB[pIdx]);
      const g = snrToGrayscaleByte(avg);
      imgData.data[i] = g;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = g;
      imgData.data[i + 3] = 255;
    } else {
      const delta = gridB[pIdx] - gridA[pIdx];
      const norm = Math.tanh(delta / 2.8);
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
    const cx = Math.max(0, Math.min(w - 1.001, x));
    const cy = Math.max(0, Math.min(h - 1.001, y));
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const fx = cx - x0;
    const fy = cy - y0;
    const v00 = grid[y0 * w + x0];
    const v10 = grid[y0 * w + (x0 + 1)];
    const v01 = grid[(y0 + 1) * w + x0];
    const v11 = grid[(y0 + 1) * w + (x0 + 1)];
    return (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 + (1 - fx) * fy * v01 + fx * fy * v11;
  };

  const shifts = [];
  for (let k = 0; k < nEp; k++) {
    if (directPixelDelta && Number.isFinite(directPixelDelta.dxEarlyToLate) && Number.isFinite(directPixelDelta.dyEarlyToLate)) {
      const fracFromLate = nEp > 1 ? k / (nEp - 1) - 1.0 : 0.0;
      shifts.push({
        dx: fracFromLate * directPixelDelta.dxEarlyToLate,
        dy: -fracFromLate * directPixelDelta.dyEarlyToLate,
      });
    } else {
      const dtYears =
        spanDays >= 7.0 && Number.isFinite(mjds[k])
          ? (mjds[k] - maxMjd) / 365.25
          : (nEp > 1 ? k / (nEp - 1) - 1.0 : 0.0) * 0.5;
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
      for (let k = 0; k < nEp; k++) {
        sum += sampleBilinear(grids.epochs[k], px + shifts[k].dx, py + shifts[k].dy);
      }
      const stackedSnr = (sum / nEp) * Math.min(1.45, Math.pow(nEp, 0.18));
      const g = snrToGrayscaleByte(stackedSnr);
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

/**
 * Construye dos lienzos co-adicionados ("ANTES" vs "DESPUÉS") a partir de las exposiciones
 * comparables de la misma banda (analysis_frame_indices) para que el parpadeo intermitente
 * alterne estrictamente 1 a 1 sin quedarse más tiempo en una fecha que en otra.
 * Además refuerza suavemente los píxeles con diferencia temporal significativa (dipolos o variables)
 * mientras mantiene las estrellas de fondo completamente estáticas.
 */
function buildComparablePairCanvases() {
  const grids = state.originVisualGrids;
  const epochs = state.exploreData?.epochs || [];
  const pairIndices = state.exploreData?.target_info?.analysis_frame_indices || [];
  if (!grids || !grids.epochs || pairIndices.length < 2) return null;

  const parseMjd = (obsTime) => {
    const num = Number(obsTime);
    if (obsTime !== "" && obsTime != null && Number.isFinite(num) && num > 10000) return num;
    const parsed = Date.parse(String(obsTime || ""));
    return Number.isFinite(parsed) ? parsed / 86400000 + 40587 : NaN;
  };

  const validIndices = pairIndices.filter((i) => i >= 0 && i < grids.epochs.length);
  if (validIndices.length < 2) return null;

  const mjds = validIndices.map((i) => parseMjd(epochs[i]?.obs_time));
  const finiteMjds = mjds.filter(Number.isFinite);
  let earlyIndices = [];
  let lateIndices = [];

  if (finiteMjds.length >= 2 && Math.max(...finiteMjds) - Math.min(...finiteMjds) > 1e-4) {
    const midMjd = 0.5 * (Math.min(...finiteMjds) + Math.max(...finiteMjds));
    earlyIndices = validIndices.filter((idx) => {
      const m = parseMjd(epochs[idx]?.obs_time);
      return Number.isFinite(m) && m <= midMjd;
    });
    lateIndices = validIndices.filter((idx) => {
      const m = parseMjd(epochs[idx]?.obs_time);
      return Number.isFinite(m) && m > midMjd;
    });
  }
  if (!earlyIndices.length || !lateIndices.length) {
    const half = Math.max(1, Math.floor(validIndices.length / 2));
    earlyIndices = validIndices.slice(0, half);
    lateIndices = validIndices.slice(half);
  }

  const w = 128;
  const h = 128;
  const earlyGrid = new Float32Array(w * h);
  const lateGrid = new Float32Array(w * h);

  for (let pIdx = 0; pIdx < w * h; pIdx++) {
    let eSum = 0;
    for (let i = 0; i < earlyIndices.length; i++) {
      eSum += grids.epochs[earlyIndices[i]][pIdx];
    }
    let lSum = 0;
    for (let i = 0; i < lateIndices.length; i++) {
      lSum += grids.epochs[lateIndices[i]][pIdx];
    }
    earlyGrid[pIdx] = eSum / earlyIndices.length;
    lateGrid[pIdx] = lSum / lateIndices.length;
  }

  const makePhaseCanvas = (isLate) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const imgData = ctx.createImageData(w, h);
    for (let pIdx = 0; pIdx < w * h; pIdx++) {
      const eVal = earlyGrid[pIdx];
      const lVal = lateGrid[pIdx];
      const diff = lVal - eVal;
      const absDiff = Math.abs(diff);
      // Refuerzo diferencial suave solo donde hay cambio real (|ΔSNR| > 0.65);
      // las estrellas fijas tienen diff ≈ 0 y permanecen 100% inmóviles.
      const boost = absDiff > 0.65 ? Math.tanh((absDiff - 0.65) / 2.0) * 2.3 : 0.0;
      let val = isLate ? lVal : eVal;
      if (isLate) {
        val += diff > 0 ? boost * 1.45 : -boost * 0.45;
      } else {
        val += diff < 0 ? boost * 1.45 : -boost * 0.45;
      }
      const g = snrToGrayscaleByte(val);
      const i = pIdx * 4;
      imgData.data[i] = g;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = g;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  };

  const earlyIdx = earlyIndices[0];
  const lateIdx = lateIndices[lateIndices.length - 1];
  const earlyEp = epochs[earlyIdx] || {};
  const lateEp = epochs[lateIdx] || {};
  const fmtShortDate = (obsTime) => {
    const m = parseMjd(obsTime);
    if (Number.isFinite(m)) {
      return new Date((m - 40587) * 86400000).toISOString().slice(0, 10);
    }
    return String(obsTime || "").slice(0, 10) || "sin fecha";
  };

  return {
    earlyCanvas: makePhaseCanvas(false),
    lateCanvas: makePhaseCanvas(true),
    earlyGrid,
    lateGrid,
    validIndices,
    stepCache: new Map(),
    earlyIndices,
    lateIndices,
    earlyIdx,
    lateIdx,
    earlyDate: fmtShortDate(earlyEp.obs_time),
    lateDate: fmtShortDate(lateEp.obs_time),
    detector: earlyEp.detector || lateEp.detector || "detector",
    wlUm: Number(earlyEp.wavelength_center_um || lateEp.wavelength_center_um || 0),
  };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** '6 may 2025' a partir de un MJD (UTC). */
function fmtMjdLabel(mjd) {
  if (!Number.isFinite(mjd)) return "sin fecha";
  const d = new Date((mjd - 40587) * 86400000);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function isSequenceBand() {
  return state.selectedBand === "pair" || state.selectedBand === "manual_pair";
}

/**
 * Exposiciones que recorre la animación del visor: las comparables (mismo detector y color
 * infrarrojo casi igual), una por día y en orden temporal. Las imágenes de décadas anteriores
 * (DSS2 / 2MASS / AllWISE) se ven únicamente en el panel «Línea histórica».
 */
const VIEWER_APPROX_WAVELENGTH_TOLERANCE = 0.10; // mismo criterio que el respaldo aproximado del backend

function viewerOnePerDay(indices, epochs) {
  const mjdOf = (i) => tlParseMjd(epochs[i]?.obs_time);
  const sorted = [...indices].sort((a, b) => (mjdOf(a) || 0) - (mjdOf(b) || 0));
  const seenDays = new Set();
  const perDay = [];
  sorted.forEach((i) => {
    const mjd = mjdOf(i);
    const key = Number.isFinite(mjd) ? Math.floor(mjd) : `i${i}`;
    if (seenDays.has(key)) return;
    seenDays.add(key);
    perDay.push(i);
  });
  return perDay.length >= 2 ? perDay : sorted;
}

function viewerSpanDays(indices, epochs) {
  const mjds = indices.map((i) => tlParseMjd(epochs[i]?.obs_time)).filter(Number.isFinite);
  return mjds.length >= 2 ? Math.max(...mjds) - Math.min(...mjds) : 0;
}

/**
 * Mejor grupo del mismo detector con color infrarrojo parecido (Δλ/λ ≤ 10 %) que cubra más fechas.
 * Solo se usa para MIRAR posiciones: el brillo se mide siempre con la comparación estricta.
 */
function bestApproxViewerGroup(epochs) {
  let best = null;
  let bestScore = [0, 0];
  epochs.forEach((anchor) => {
    const ref = Number(anchor.wavelength_center_um);
    if (!(ref > 0)) return;
    const det = tlDetCode(anchor.detector);
    const group = epochs
      .map((ep, i) => ({ ep, i }))
      .filter(({ ep }) => {
        const wl = Number(ep.wavelength_center_um);
        return tlDetCode(ep.detector) === det && wl > 0 && (wl - ref) / ref >= 0 && (wl - ref) / ref <= VIEWER_APPROX_WAVELENGTH_TOLERANCE;
      })
      .map(({ i }) => i);
    const perDay = viewerOnePerDay(group, epochs);
    const score = [perDay.length, viewerSpanDays(perDay, epochs)];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      bestScore = score;
      best = perDay;
    }
  });
  return best;
}

/** Devuelve { indices, mode } de la animación: 'strict' (misma banda), 'approx' (color parecido) o 'manual'/'all'. */
function getViewerSequence() {
  const epochs = state.exploreData?.epochs || [];
  const valid = (arr) => (arr || []).filter((i) => Number.isInteger(i) && i >= 0 && i < epochs.length);
  if (state.selectedBand === "manual_pair" && (state.manualPairIndices || []).length >= 2) {
    return { indices: viewerOnePerDay(valid(state.manualPairIndices), epochs), mode: "manual" };
  }
  const pairIndices = valid(state.exploreData?.target_info?.analysis_frame_indices);
  if (pairIndices.length < 2) {
    return { indices: viewerOnePerDay(epochs.map((_, i) => i), epochs), mode: "all" };
  }
  const strict = viewerOnePerDay(pairIndices, epochs);
  const approx = bestApproxViewerGroup(epochs);
  const strictSpan = viewerSpanDays(strict, epochs);
  // Si la misma banda cubre poco tiempo y un color parecido del mismo detector cubre mucho más,
  // la animación usa ese grupo (rotulado): así se ve el movimiento a lo largo de todas las fechas.
  if (approx && approx.length >= 3 && viewerSpanDays(approx, epochs) > Math.max(1.5 * strictSpan, strictSpan + 30)) {
    return { indices: approx, mode: "approx" };
  }
  return { indices: strict, mode: "strict" };
}

function getViewerSequenceIndices() {
  return getViewerSequence().indices;
}

/**
 * Estado temporal del visor principal (#spherex-canvas) y del sector central del mapa de contexto.
 * Cada paso es una fecha real de SPHEREx; no hay pasos sintéticos ni de otros telescopios.
 */
function getSynchronizedTemporalState() {
  const epochs = state.exploreData?.epochs || [];
  const indices = getViewerSequenceIndices();
  const seqFrames = indices.map((epIdx) => {
    const ep = epochs[epIdx] || {};
    const mjd = tlParseMjd(ep.obs_time);
    return {
      kind: "spherex",
      frameKey: `spx:${epIdx}`,
      epochIdx: epIdx,
      mjd,
      label: fmtMjdLabel(mjd),
      detector: ep.detector || "SPHEREx",
      wavelength: Number(ep.wavelength_center_um || 0),
    };
  });
  const K = Math.max(1, seqFrames.length);
  const activeStep = (((state.viewerStep || 0) % K) + K) % K;
  const stepFrac = K > 1 ? activeStep / (K - 1) : 1;
  const activeFrame = seqFrames[activeStep] || null;
  return {
    seqFrames,
    K,
    activeStep,
    stepFrac,
    activeFrame,
    correspondingEpochIdx: activeFrame ? activeFrame.epochIdx : Math.max(0, state.currentEpochIdx || 0),
  };
}

/** Explicación en lenguaje claro de qué fechas recorre la animación. */
function describeViewerSequence() {
  const epochs = state.exploreData?.epochs || [];
  const { indices, mode } = getViewerSequence();
  if (!indices.length) return "";
  const wls = indices.map((i) => Number(epochs[i]?.wavelength_center_um || 0)).filter((v) => v > 0);
  const det = epochs[indices[0]]?.detector || "detector";
  const wlText = wls.length ? `${Math.min(...wls).toFixed(2)}–${Math.max(...wls).toFixed(2)} µm` : "λ sin dato";
  const first = fmtMjdLabel(tlParseMjd(epochs[indices[0]]?.obs_time));
  const last = fmtMjdLabel(tlParseMjd(epochs[indices[indices.length - 1]]?.obs_time));
  if (mode === "approx") {
    return `Animación de ${indices.length} fechas (${first} → ${last}) con el mismo detector (${det}) y colores infrarrojos parecidos ` +
      `(${wlText}): sirve para ver posiciones. El brillo puede variar algo entre colores; los cambios de brillo se miden aparte, con la misma banda.`;
  }
  if (mode === "strict") {
    return `Animación de ${indices.length} fechas (${first} → ${last}) con el mismo detector (${det}) y color infrarrojo casi igual (${wlText}): lo que cambia es el cielo, no el filtro.`;
  }
  return `Animación de ${indices.length} fechas (${first} → ${last}).`;
}

/** El deslizador recorre los pasos de la animación (fechas) o, en una banda fija, las exposiciones. */
function syncViewerSlider() {
  const slider = document.getElementById("slider-epoch");
  if (!slider) return;
  if (isSequenceBand()) {
    const sync = getSynchronizedTemporalState();
    slider.max = String(Math.max(0, sync.K - 1));
    slider.value = String(sync.activeStep);
  } else {
    slider.max = String(Math.max(0, (state.exploreData?.epochs?.length || 1) - 1));
    slider.value = String(state.currentEpochIdx || 0);
  }
}

/** Fecha (MJD) que muestra ahora el visor. */
function viewerCurrentMjd(syncState = getSynchronizedTemporalState()) {
  const epochs = state.exploreData?.epochs || [];
  const idx = isSequenceBand() ? syncState.correspondingEpochIdx : state.currentEpochIdx;
  return tlParseMjd(epochs[idx]?.obs_time);
}

function rebakeAllOpticalCanvases() {
  if (state.tileGrid && state.tileGrid.size > 0) {
    state.tileGrid.forEach((tile) => {
      if (!tile || tile.status !== "ready" || !tile.visualGrids) return;
      const baked = renderTileCanvasesFromGrids(tile.gx, tile.gy, tile.visualGrids);
      tile.coaddImage = baked.healedCoaddCanvas;
      tile.epochImages = baked.normalizedEpochs;
      tile.colorSkyCanvas = baked.colorCanvas;
      if (tile.gx === 0 && tile.gy === 0) {
        state.coaddImage = baked.healedCoaddCanvas;
        state.epochImages = baked.normalizedEpochs;
        state.skyView.colorSkyCanvas = baked.colorCanvas;
      }
    });
  } else if (state.originVisualGrids) {
    const baked = renderTileCanvasesFromGrids(0, 0, state.originVisualGrids);
    state.coaddImage = baked.healedCoaddCanvas;
    state.epochImages = baked.normalizedEpochs;
    state.skyView.colorSkyCanvas = baked.colorCanvas;
  }
  state.rgbCompositeCanvas = buildThreeBandRgbCanvas();
  state.pairMeta = buildComparablePairCanvases();
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
  if (visuals.healedCoaddCanvas) state.coaddImage = visuals.healedCoaddCanvas;
  if (visuals.normalizedEpochs?.length) state.epochImages = visuals.normalizedEpochs;
  state.rgbCompositeCanvas = buildThreeBandRgbCanvas();
  state.pairMeta = buildComparablePairCanvases();
  state.pairBlinkPhase = 0;
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

function isFitsPixelInReadyTile(xPix, yPix) {
  if (!Number.isFinite(xPix) || !Number.isFinite(yPix)) return false;
  if (xPix >= 0 && xPix <= CUTOUT_NPIX && yPix >= 0 && yPix <= CUTOUT_NPIX) {
    return true;
  }
  if (!state.infinitePlaneEnabled || !state.tileGrid) return false;
  const prefGx = Math.floor((xPix + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const prefGy = Math.floor((yPix + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const prefTile = state.tileGrid.get(`${prefGx},${prefGy}`);
  if (prefTile && prefTile.status === "ready") return true;
  for (const tile of state.tileGrid.values()) {
    if (tile.status === "ready") {
      const lx = xPix - tile.gx * TILE_STEP_PIX;
      const ly = yPix - tile.gy * TILE_STEP_PIX;
      if (lx >= 0 && lx <= CUTOUT_NPIX && ly >= 0 && ly <= CUTOUT_NPIX) {
        return true;
      }
    }
  }
  return false;
}

function findBestTileForGlobalPixel(rawX, rawY) {
  if (!state.tileGrid) return null;
  const prefGx = Math.floor((rawX + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const prefGy = Math.floor((rawY + 0.5 - TILE_MARGIN_PIX) / TILE_STEP_PIX);
  const prefTile = state.tileGrid.get(`${prefGx},${prefGy}`);
  if (prefTile && prefTile.status === "ready" && prefTile.visualGrids) {
    return prefTile;
  }

  let bestTile = null;
  let bestDist = Infinity;
  state.tileGrid.forEach((tile) => {
    if (tile.status !== "ready" || !tile.visualGrids) return;
    const lx = rawX - tile.gx * TILE_STEP_PIX;
    const ly = rawY - tile.gy * TILE_STEP_PIX;
    if (lx >= 2 && lx < CUTOUT_NPIX - 2 && ly >= 2 && ly < CUTOUT_NPIX - 2) {
      const d = Math.hypot(lx - 63.5, ly - 63.5);
      if (d < bestDist) {
        bestDist = d;
        bestTile = tile;
      }
    }
  });
  return bestTile;
}

function snapGlobalPixelToTilePeak(rawX, rawY, maxRadius = 22, minExcess = 0.65) {
  const tile = findBestTileForGlobalPixel(rawX, rawY);
  if (!tile || !tile.visualGrids) return null;

  const w = CUTOUT_NPIX;
  const h = CUTOUT_NPIX;
  const px0 = rawX - tile.gx * TILE_STEP_PIX;
  const py0 = h - 1 - (rawY - tile.gy * TILE_STEP_PIX);
  const ix = Math.round(px0);
  const iy = Math.round(py0);
  if (ix < 2 || ix >= w - 2 || iy < 2 || iy >= h - 2) return null;

  const { mid, early, late } = tile.visualGrids;
  const x0 = Math.max(1, ix - maxRadius);
  const x1 = Math.min(w - 2, ix + maxRadius);
  const y0 = Math.max(1, iy - maxRadius);
  const y1 = Math.min(h - 2, iy + maxRadius);

  const sampleSmooth = (cx, cy) => {
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const row = (cy + dy) * w;
      for (let dx = -1; dx <= 1; dx++) {
        const idx = row + (cx + dx);
        sum += Math.max(mid[idx], early[idx], late[idx]);
      }
    }
    return sum / 9.0;
  };

  const centerVal = sampleSmooth(ix, iy);
  // Si ya está en la cúpula de una estrella saturada gigante (como R Draconis), mantener el centro
  if (centerVal > 6.5) {
    return { x: rawX, y: rawY, snapped: false };
  }

  const samples = [];
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      samples.push(sampleSmooth(x, y));
    }
  }
  samples.sort((a, b) => a - b);
  const bgFloor = Math.min(0.20, samples.length ? samples[Math.floor(samples.length * 0.2)] : 0.0);

  let bestScore = -1.0;
  let peakX = ix;
  let peakY = iy;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - px0, y - py0);
      if (d > maxRadius) continue;
      const valC = sampleSmooth(x, y);
      const exc = valC - bgFloor;
      if (exc < minExcess) continue;

      let isLocalMax = true;
      for (let ny = y - 1; ny <= y + 1 && isLocalMax; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx === x && ny === y) continue;
          if (sampleSmooth(nx, ny) > valC + 1e-5) {
            isLocalMax = false;
            break;
          }
        }
      }
      if (!isLocalMax) continue;

      const score = Math.pow(exc, 2.2) / (1.0 + 0.06 * d);
      if (score > bestScore) {
        bestScore = score;
        peakX = x;
        peakY = y;
      }
    }
  }

  if (bestScore < 0) return null;

  let wSum = 0;
  let wxSum = 0;
  let wySum = 0;
  for (let y = Math.max(0, peakY - 2); y <= Math.min(h - 1, peakY + 2); y++) {
    for (let x = Math.max(0, peakX - 2); x <= Math.min(w - 1, peakX + 2); x++) {
      const idx = y * w + x;
      const rawV = Math.max(mid[idx], early[idx], late[idx]);
      const exc = Math.max(0.0, rawV - bgFloor);
      const wt = exc * exc;
      wSum += wt;
      wxSum += x * wt;
      wySum += y * wt;
    }
  }

  const cenPx = wSum > 1e-6 ? wxSum / wSum : peakX;
  const cenPy = wSum > 1e-6 ? wySum / wSum : peakY;
  const snappedX = tile.gx * TILE_STEP_PIX + cenPx;
  const snappedY = tile.gy * TILE_STEP_PIX + (h - 1 - cenPy);
  return { x: snappedX, y: snappedY, snapped: true };
}

function snapNamedObjectsToTilePeaks() {
  const objects = state.skyView.namedObjects || [];
  objects.forEach((obj) => {
    const baseRa = obj.catalogRa ?? obj.ra;
    const baseDec = obj.catalogDec ?? obj.dec;
    const rawPos = raDecToPixel(baseRa, baseDec);
    if (obj.in_fov === false && !state.infinitePlaneEnabled) {
      obj.x = rawPos.x;
      obj.y = rawPos.y;
      return;
    }
    const isPrimaryOrHighPm =
      (Number.isFinite(obj.distance_arcsec) && obj.distance_arcsec <= 15) ||
      (Number.isFinite(obj.proper_motion_mas_yr) && obj.proper_motion_mas_yr >= 500);
    const snapRadius = isPrimaryOrHighPm ? 20 : 5;
    const minExcess = isPrimaryOrHighPm ? 0.85 : 1.15;
    const snapped = snapGlobalPixelToTilePeak(rawPos.x, rawPos.y, snapRadius, minExcess);
    if (snapped && snapped.snapped) {
      obj.x = snapped.x;
      obj.y = snapped.y;
      const coords = pixelToRaDec(snapped.x, snapped.y);
      obj.ra = coords.ra;
      obj.dec = coords.dec;
    } else {
      obj.x = rawPos.x;
      obj.y = rawPos.y;
    }
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
  snapNamedObjectsToTilePeaks();
}

function mergeCatalogSources(key, newSources) {
  const map = new Map();
  (state.skyView[key] || []).forEach((src) => map.set(src.id, src));
  (newSources || []).forEach((src) => {
    const rawPos = raDecToPixel(src.ra, src.dec);
    const snapped = snapGlobalPixelToTilePeak(rawPos.x, rawPos.y, 3, 1.15);
    map.set(src.id, {
      ...src,
      x: snapped?.snapped ? snapped.x : rawPos.x,
      y: snapped?.snapped ? snapped.y : rawPos.y,
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

function ensureExternalSurveyImage(survey, ra, dec, fov) {
  const meta = SURVEY_HIPS_MAP[survey];
  if (!meta) return null;
  const key = `${survey}|${Number(ra).toFixed(5)}|${Number(dec).toFixed(5)}|${Number(fov).toFixed(4)}`;
  const cached = state.externalSurveyCache.get(key);
  if (cached) {
    return cached.status === "ready" ? cached.img : null;
  }
  const entry = { status: "loading", img: null };
  state.externalSurveyCache.set(key, entry);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    entry.status = "ready";
    entry.img = img;
    renderContextSkyMap();
  };
  img.onerror = () => {
    entry.status = "error";
  };
  img.src =
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=${encodeURIComponent(meta.id)}` +
    `&width=384&height=384&fov=${encodeURIComponent(fov)}&projection=TAN&coordsys=icrs` +
    `&ra=${encodeURIComponent(ra)}&dec=${encodeURIComponent(dec)}&format=jpg`;
  return null;
}

function renderContextSkyMap() {
  const canvas = document.getElementById("aladin-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, W, H);

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
      surveyHudEl.textContent = "Compuesto visual SPHEREx";
      surveyHudEl.className = "hidden";
    }
  }
  // La leyenda de colores solo aplica al compuesto SPHEREx (no a DSS2 / 2MASS / AllWISE).
  document.getElementById("context-color-legend")?.classList.toggle("hidden", state.contextSurvey !== "spherex");

  // 1. Sectores del mosaico: compuesto en color FIJO (todas las fechas combinadas), como referencia
  //    para comparar contra el visor, que recorre las fechas una por una.
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
      const colorImg = extSurveyImg
        ? extSurveyImg
        : (tile && tile.status === "ready")
        ? tile.colorSkyCanvas
        : isOrigin
        ? state.skyView.colorSkyCanvas
        : null;
      if (colorImg) {
        drawSeamlessTileImage(ctx, colorImg, rect);
      } else {
        drawInfiniteTilePlaceholder(ctx, rect, gx, gy, tile?.status || "queued");
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

  // 3. Superponer fuentes del catálogo AllWISE (rombos ámbar discretos, solo en sectores ya cargados)
  if (state.showWiseCat && state.skyView.wiseSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.65)";
    ctx.lineWidth = 1.2;
    state.skyView.wiseSources.forEach((src) => {
      if (!isFitsPixelInReadyTile(src.x, src.y)) return;
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

  // 4. Superponer fuentes del catálogo Gaia DR3 (círculos celestes discretos, solo en sectores ya cargados)
  if (state.showGaiaCat && state.skyView.gaiaSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.70)";
    ctx.lineWidth = 1.2;
    const pxPerArcsec = W / ((state.fov / (state.skyView.zoom || 1)) * 3600);
    state.skyView.gaiaSources.forEach((src) => {
      if (!isFitsPixelInReadyTile(src.x, src.y)) return;
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      // Línea de desplazamiento (movimiento propio Gaia pmra/pmdec en mas/año)
      if (
        state.showPmVectors &&
        Number.isFinite(src.pmra) &&
        Number.isFinite(src.pmdec) &&
        (src.pmra !== 0 || src.pmdec !== 0)
      ) {
        const dRa = (src.pmra / 1000) * Math.cos((src.dec * Math.PI) / 180);
        const dDec = src.pmdec / 1000;
        const mag = Math.hypot(dRa, dDec);
        if (mag > 0) {
          const isFast = mag >= 0.18;
          const len = Math.min(54, Math.max(9, mag * pxPerArcsec * 35));
          const ux = -dRa / mag;
          const uy = -dDec / mag;
          const ox = cx - ux * len;
          const oy = cy - uy * len;

          ctx.save();
          ctx.strokeStyle = isFast ? "rgba(251, 113, 133, 0.92)" : "rgba(125, 211, 252, 0.85)";
          ctx.lineWidth = isFast ? 1.9 : 1.4;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(cx, cy);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(ox, oy, isFast ? 2.6 : 2.0, 0, Math.PI * 2);
          ctx.stroke();

          const head = isFast ? 5.5 : 4.2;
          const ang = Math.atan2(cy - oy, cx - ox);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - head * Math.cos(ang - 0.5), cy - head * Math.sin(ang - 0.5));
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - head * Math.cos(ang + 0.5), cy - head * Math.sin(ang + 0.5));
          ctx.stroke();
          ctx.restore();
        }
      }
    });
    ctx.restore();
  }

  // 5. Retícula del píxel/objeto seleccionado (solo si está dentro de un sector cargado y en pantalla)
  if (state.selectedPixel && isFitsPixelInReadyTile(state.selectedPixel.x, state.selectedPixel.y)) {
    const { cx, cy } = fitsToSkyCanvas(state.selectedPixel.x, state.selectedPixel.y, W);
    if (cx >= -12 && cx <= W + 12 && cy >= -12 && cy <= H + 12) {
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
  }

  // 6. Astros identificados en el plano continuo (solo en sectores cargados y dentro del rango de visión)
  if (state.skyView.namedObjects && state.skyView.namedObjects.length > 0) {
    state.skyView.namedObjects.forEach((obj) => {
      if (!isFitsPixelInReadyTile(obj.x, obj.y)) return;
      const { cx, cy } = fitsToSkyCanvas(obj.x, obj.y, W);
      if (cx < -16 || cx > W + 16 || cy < -16 || cy > H + 16) return;
      const isHovered = state.hoveredNamedObjectId === obj.id;
      const isSelected = state.selectedNamedObjectId === obj.id;
      const hasPlanets = (obj.planets && obj.planets.length > 0) || obj.kind === "planet";
      const ringColor = isHovered || isSelected ? "#34d399" : hasPlanets ? "#a78bfa" : "#fde047";

      ctx.save();
      if (state.showPmVectors && obj.catalogRa != null && obj.catalogDec != null) {
        const catPix = raDecToPixel(obj.catalogRa, obj.catalogDec);
        const pCat = fitsToSkyCanvas(catPix.x, catPix.y, W);
        if (Math.hypot(cx - pCat.cx, cy - pCat.cy) >= 3.5) {
          ctx.strokeStyle = "rgba(251, 113, 133, 0.85)";
          ctx.lineWidth = 1.7;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(pCat.cx, pCat.cy);
          ctx.lineTo(cx, cy);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(pCat.cx, pCat.cy, 3.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
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
    if (state.pairMeta) {
      return state.pairBlinkPhase === 0 ? state.pairMeta.earlyIdx : state.pairMeta.lateIdx;
    }
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
  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, W, H);

  const epochs = state.exploreData.epochs || [];
  const syncState = getSynchronizedTemporalState();
  const epIdx =
    state.selectedBand === "pair" || state.selectedBand === "manual_pair"
      ? syncState.correspondingEpochIdx
      : getSelectedBandIndex(epochs);
  const isEarlyBlinkPhase = syncState.stepFrac < 0.5;
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
          baseImg = hasDiff && tDiff ? tDiff : tCoadd;
        } else if (isOrigin && state.viewMode === "shift_stack" && state.shiftStackCanvas) {
          baseImg = state.shiftStackCanvas;
        } else if (isOrigin && (state.viewMode === "manual_diff" || state.viewMode === "manual_sum") && state.manualOpCanvas) {
          baseImg = state.manualOpCanvas;
        } else if (state.viewMode === "rgb") {
          baseImg = isOrigin && state.rgbCompositeCanvas ? state.rgbCompositeCanvas : (tile?.colorSkyCanvas || tCoadd);
        } else if (isOrigin && detCoaddImg) {
          baseImg = detCoaddImg;
        } else if (state.viewMode === "coadd") {
          baseImg = tCoadd;
        } else if (
          isOrigin &&
          state.viewMode === "blink" &&
          (state.selectedBand === "pair" || state.selectedBand === "manual_pair")
        ) {
          // Imagen REAL de la fecha que corresponde al paso actual (siempre SPHEREx).
          baseImg =
            (tEpochs && tEpochs.length > 0 ? tEpochs[epIdx % tEpochs.length] : null) ||
            (isEarlyBlinkPhase ? state.pairMeta?.earlyCanvas : state.pairMeta?.lateCanvas) ||
            tCoadd;
        } else if (tEpochs && tEpochs.length > 0) {
          const tileEpIdx = isOrigin ? epIdx : syncState.activeStep % tEpochs.length;
          baseImg = tEpochs[tileEpIdx];
        }

        if (state.viewMode === "blink" && !detCoaddImg && tCoadd && baseImg !== tCoadd) {
          drawSeamlessTileImage(ctx, tCoadd, rect);
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

        if (state.showFlags && tFlags && tFlags.length > 0) {
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

  // 2. Objetos que cambian (flecha de movimiento / anillo de brillo + número de su tarjeta)
  drawChangeObjectsOverlay(ctx, W, H, syncState);

  // 2b. Marcas de la resta ΔI (método anterior, solo si se activan en «Herramientas avanzadas»)
  if (state.showAIMarkers) {
    drawDeltaIMarkers(ctx, W, H);
  }

  // 3. Retícula del píxel seleccionado en el plano continuo (solo si su sector está cargado y visible)
  if (state.selectedPixel && isFitsPixelInReadyTile(state.selectedPixel.x, state.selectedPixel.y)) {
    const { cx: sx, cy: sy } = fitsToSkyCanvas(state.selectedPixel.x, state.selectedPixel.y, W);
    if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) {
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
  }

  // 4. Etiquetas de astros nombrados al pasar el cursor, el astro seleccionado (fijo) o con "Fijar nombres" activo
  if ((state.showNamedObjects || state.hoveredNamedObjectId || state.selectedNamedObjectId) && state.skyView.namedObjects && state.skyView.namedObjects.length > 0) {
    state.skyView.namedObjects.forEach((obj) => {
      if (!isFitsPixelInReadyTile(obj.x, obj.y)) return;
      const isHovered = state.hoveredNamedObjectId === obj.id;
      const isSelected = state.selectedNamedObjectId === obj.id;
      if (!isHovered && !isSelected && !state.showNamedObjects) return;
      const { cx: ox, cy: oy } = fitsToSkyCanvas(obj.x, obj.y, W);
      if (ox < 6 || ox > W - 6 || oy < 6 || oy > H - 6) return;
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
    const ep = epochs[epIdx] || epochs[0];
    const totalEpochs = state.exploreData.target_info.total_epochs || epochs.length;
    const pairIndices = state.exploreData.target_info.analysis_frame_indices || [];
    const activeTag = "";
    const epochLabel =
      isSequenceBand() && pairIndices.length >= 2
        ? `Animación · fecha ${syncState.activeStep + 1}/${syncState.K}${activeTag}`
        : `Época temporal ${ep.epoch_id + 1}/${totalEpochs}`;
    const bandLabel = `${Number(ep.wavelength_center_um).toFixed(3)} µm · ${ep.detector || "detector"}`;

    if ((state.viewMode === "manual_diff" || state.viewMode === "manual_sum") && state.manualOpMeta) {
      const { op, idxA, idxB, count } = state.manualOpMeta;
      const epA = epochs[idxA] || ep;
      const epB = epochs[idxB] || ep;
      const nUsed = count || pairIndices.length || 2;
      setViewerHudCompact();
      document.getElementById("frame-counter").textContent =
        op === "diff"
          ? `Contraste ΔI Secuencia (${nUsed} puntos temporales)`
          : `Apilado Secuencia SNR (${nUsed} puntos temporales)`;
      document.getElementById("overlay-date").textContent =
        `Inicio (#${idxA + 1}): ${Number(epA.wavelength_center_um).toFixed(2)}µm (${epA.detector}) → Fin (#${idxB + 1}): ${Number(epB.wavelength_center_um).toFixed(2)}µm (${epB.detector})`;
      document.getElementById("overlay-detector").textContent =
        op === "diff"
          ? "Operación: ΔI de la secuencia multi-época completa"
          : "Operación: Promedio SNR de la secuencia multi-época";
      document.getElementById("overlay-clean").textContent =
        `Cobertura inicial: ${epA.clean_pixels_pct}% · Cobertura final: ${epB.clean_pixels_pct}%`;
    } else if (state.viewMode === "shift_stack" && state.shiftStackMeta) {
      const { pmRaMasYr, pmDecMasYr, label, snrBoost } = state.shiftStackMeta;
      setViewerHudCompact();
      document.getElementById("frame-counter").textContent =
        `Shift & Stack · pmRA ${pmRaMasYr >= 0 ? "+" : ""}${Math.round(pmRaMasYr)}, pmDec ${pmDecMasYr >= 0 ? "+" : ""}${Math.round(pmDecMasYr)} mas/a`;
      document.getElementById("overlay-date").textContent =
        label || `Apilado en movimiento (${epochs.length} épocas co-adicionadas)`;
      document.getElementById("overlay-detector").textContent =
        `Vector: μ_α*=${pmRaMasYr.toFixed(0)} mas/a, μ_δ=${pmDecMasYr.toFixed(0)} mas/a`;
      document.getElementById("overlay-clean").textContent =
        `Ganancia SNR teórica: ~${snrBoost}× (estrellas fijas elongadas, móvil puntual)`;
    } else if (state.viewMode === "rgb") {
      setViewerHudCompact();
      document.getElementById("frame-counter").textContent = "Falso Color Infrarrojo RGB (3 Bandas)";
      document.getElementById("overlay-date").textContent = `Compuesto tricromático (${epochs.length} recortes combinados)`;
      document.getElementById("overlay-detector").textContent = "Azul: NIR (<1.65µm) · Verde: Mid-NIR (1.65–3µm) · Rojo: MIR (>3µm)";
      document.getElementById("overlay-clean").textContent = "Rojizo = fuente fría (enana marrón / polvo) · Azulado = estelar";
    } else if (detCoaddMeta && state.viewMode !== "diff") {
      setViewerHudCompact();
      document.getElementById("frame-counter").textContent =
        `Suma SNR ${detCoaddMeta.detector} · ${detCoaddMeta.frame_count} exp`;
      document.getElementById("overlay-date").textContent =
        `Apilado mediana por detector (${detCoaddMeta.frame_count} recortes)`;
      document.getElementById("overlay-detector").textContent =
        `Detector: ${detCoaddMeta.detector} | λ: ${Number(detCoaddMeta.wavelength_min_um).toFixed(3)}–${Number(detCoaddMeta.wavelength_max_um).toFixed(3)} µm`;
      document.getElementById("overlay-clean").textContent =
        `Píxeles limpios (mediana): ${detCoaddMeta.clean_pixels_pct}%`;
    } else {
      document.getElementById("frame-counter").textContent =
        state.viewMode === "blink"
          ? `${epochLabel} · ${bandLabel}`
          : state.viewMode === "diff"
          ? "Resta temporal · bandas comparables"
          : "Mediana · bandas comparables";
      if (state.viewMode === "blink") {
        // Fecha grande y legible; el detalle técnico queda en letra chica.
        const mjd = tlParseMjd(ep.obs_time);
        const utc = Number.isFinite(mjd)
          ? new Date((mjd - 40587) * 86400000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
          : "sin fecha";
        const seqMode = isSequenceBand() ? getViewerSequence().mode : null;
        const stepText = isSequenceBand()
          ? `Fecha ${syncState.activeStep + 1} de ${syncState.K} · ` +
            (seqMode === "approx" ? "mismo detector, color parecido" : seqMode === "strict" ? "misma banda" : "fechas elegidas")
          : `Exposición ${epIdx + 1} de ${epochs.length}`;
        setViewerHud({
          big: true,
          date: fmtMjdLabel(mjd),
          step: stepText,
          detector: `${ep.detector || "SPHEREx"} · ${Number(ep.wavelength_center_um).toFixed(3)} µm · ${utc}`,
          clean: `Píxeles limpios: ${ep.clean_pixels_pct}%`,
        });
      } else {
        setViewerHudCompact();
        const indices = state.exploreData.target_info.analysis_frame_indices;
        const first = epochs[indices[0]], last = epochs[indices[indices.length - 1]];
        document.getElementById("overlay-date").textContent = `${indices.length} exposiciones comparables`;
        document.getElementById("overlay-detector").textContent = `${first.detector} · ${first.wavelength_center_um.toFixed(3)}–${last.wavelength_center_um.toFixed(3)} µm`;
        document.getElementById("overlay-clean").textContent = state.viewMode === "diff" ? "Media tardía − media temprana" : "Mediana de los píxeles válidos";
      }
    }
  }
  updateViewerLegend();
}

/** HUD del visor: fecha grande en la animación; texto compacto en las otras vistas. */
function setViewerHud({ big = false, date = "", step = "", detector = "", clean = "" } = {}) {
  const dateEl = document.getElementById("overlay-date");
  const stepEl = document.getElementById("overlay-step");
  if (dateEl) {
    dateEl.className = big ? "text-lg font-bold text-white leading-tight" : "text-[11px] font-mono text-sky-300";
    dateEl.textContent = date;
  }
  if (stepEl) {
    stepEl.textContent = step;
    stepEl.classList.toggle("hidden", !step);
  }
  const detEl = document.getElementById("overlay-detector");
  if (detEl) detEl.textContent = detector;
  const cleanEl = document.getElementById("overlay-clean");
  if (cleanEl) cleanEl.textContent = clean;
}

function setViewerHudCompact() {
  const dateEl = document.getElementById("overlay-date");
  if (dateEl) dateEl.className = "text-[11px] font-mono text-sky-300";
  document.getElementById("overlay-step")?.classList.add("hidden");
}

function syncPlayPauseButtonsUI() {
  const mainBtn = document.getElementById("btn-play-pause");
  if (mainBtn) {
    mainBtn.textContent = state.isPlaying ? "Pausar" : "Reproducir";
  }
  const tlBtn = document.getElementById("btn-tl-play");
  if (tlBtn) {
    tlBtn.textContent = state.isPlaying ? "⏸ Pausar" : "▶ Reproducir";
  }
}

function setUnifiedPlaybackState(playing) {
  const nextPlaying = Boolean(playing);
  state.isPlaying = nextPlaying;
  state.timelineBlinkPlaying = nextPlaying;
  syncPlayPauseButtonsUI();
  startBlinkTimer();
}

function startBlinkTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  if (state.timelineBlinkTimerId) {
    clearInterval(state.timelineBlinkTimerId);
    state.timelineBlinkTimerId = null;
  }
  state.timelineBlinkPlaying = state.isPlaying;
  syncPlayPauseButtonsUI();
  if (!state.isPlaying) return;

  const intervalMs = Math.round(1000 / Math.max(0.5, state.fps || 2));
  state.timerId = setInterval(() => {
    if (state.isLoading || !state.exploreData?.epochs?.length) return;

    const sync = getSynchronizedTemporalState();
    state.viewerStep = (sync.activeStep + 1) % sync.K;
    const nextSync = getSynchronizedTemporalState();
    state.pairBlinkPhase = nextSync.stepFrac < 0.5 ? 0 : 1;

    if (state.viewMode === "blink") {
      if (state.selectedBand === "auto") {
        state.currentEpochIdx = (state.currentEpochIdx + 1) % state.exploreData.epochs.length;
      } else if (isSequenceBand()) {
        state.currentEpochIdx = nextSync.correspondingEpochIdx;
      }
      syncViewerSlider();
      renderCanvas(); // el mapa de contexto es fijo (compuesto en color): no hace falta redibujarlo
    }

    // La Línea histórica (décadas + visitas) tiene su propia secuencia, al mismo ritmo.
    const tlFrames = state.timelineBlinkFrames || [];
    if (state.timelineData && tlFrames.length >= 2 && state.spectrumPlotMode === "timeline") {
      state.timelineBlinkStep = (state.timelineBlinkStep + 1) % tlFrames.length;
      renderTimelineBlinkFrame(false);
    }
  }, intervalMs);
}

// ============================================================================
// OBJETOS QUE CAMBIAN (/api/changes): seguimiento de cada estrella en todas las fechas
//   · Una tarjeta por objeto que se movió o cambió de brillo (lenguaje claro primero).
//   · Sobre el visor: solo una flecha (de dónde estaba a dónde está) o un anillo, y su número.
//   · Los datos técnicos quedan en «Detalles».
// ============================================================================
const CHANGE_KIND_STYLE = {
  moving: { chip: "Se mueve", chipClass: "bg-rose-500/20 text-rose-100 border-rose-400/50", card: "border-rose-500/40 bg-rose-950/20", color: "#fb7185" },
  brightness: { chip: "Cambió de brillo", chipClass: "bg-amber-500/20 text-amber-100 border-amber-400/50", card: "border-amber-500/40 bg-amber-950/20", color: "#fbbf24" },
  both: { chip: "Se mueve y cambió de brillo", chipClass: "bg-rose-500/20 text-rose-100 border-rose-400/50", card: "border-rose-500/40 bg-rose-950/20", color: "#fb7185" },
};

const CONFIDENCE_STYLE = {
  alta: {
    text: "Confianza alta",
    cls: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40",
    tip: "Señal fuerte y coherente: supera con holgura el ruido y se repite en 3 fechas o más.",
  },
  media: {
    text: "Confianza media",
    cls: "bg-sky-500/20 text-sky-200 border-sky-400/40",
    tip: "Señal clara (al menos 4 veces el ruido en movimiento, ~3σ en brillo), pero con pocas fechas o algo de dispersión. Conviene sumar fechas para confirmarla.",
  },
  baja: {
    text: "Confianza baja",
    cls: "bg-slate-700/60 text-slate-200 border-slate-500/50",
    tip: "Estimación aproximada: compara colores infrarrojos parecidos, no idénticos. Es una pista, no una medición firme.",
  },
};

function fmtNum(value, decimals = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(decimals).replace(".", ",") : "—";
}

function isChangesForCurrentField(data = state.changesData) {
  return Boolean(
    data && Math.abs(Number(data.ra) - state.ra) < 1e-4 && Math.abs(Number(data.dec) - state.dec) < 1e-4
  );
}

function changeObjectById(id) {
  const data = state.changesData;
  if (!data || id == null) return null;
  return [...(data.objects || []), ...(data.steady || [])].find((o) => o.id === id) || null;
}

function skyToCanvasPoint(ra, dec, W) {
  const p = raDecToPixel(ra, dec);
  const c = fitsToSkyCanvas(p.x, p.y, W);
  return { x: p.x, y: p.y, cx: c.cx, cy: c.cy };
}

function findNearestChangeObject(xPix, yPix, maxDistFitsPx = 6.0) {
  if (!isChangesForCurrentField()) return null;
  let best = null;
  let bestDist = maxDistFitsPx;
  (state.changesData.objects || []).forEach((obj) => {
    const p = raDecToPixel(obj.ra, obj.dec);
    const d = Math.hypot(p.x - xPix, p.y - yPix);
    if (d <= bestDist) {
      bestDist = d;
      best = obj;
    }
  });
  return best;
}

function drawArrow(ctx, x0, y0, x1, y1, color, width = 2.2) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = 7.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(ang) * head * 0.6, y1 - Math.sin(ang) * head * 0.6);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - Math.PI / 7), y1 - head * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(x1 - head * Math.cos(ang + Math.PI / 7), y1 - head * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function drawNumberBadge(ctx, x, y, label, color, selected) {
  const r = 7.5;
  ctx.fillStyle = selected ? "#10b981" : "rgba(2, 6, 23, 0.92)";
  ctx.strokeStyle = selected ? "#6ee7b7" : color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = selected ? "#022c22" : "#f8fafc";
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(label), x, y + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/**
 * Capa del visor: para cada objeto que se mueve, un círculo celeste donde estaba (primera fecha),
 * uno rosa donde está (última fecha), la flecha entre ambos y un punto que avanza con la fecha que
 * se está mostrando. Los que cambiaron de brillo llevan un anillo ámbar. Nada más: sin textos largos.
 */
function drawChangeObjectsOverlay(ctx, W, H, syncState) {
  state.viewerArrowScale = 1;
  const data = state.changesData;
  if (!isChangesForCurrentField(data) || !(data.objects || []).length) return;
  if (!["blink", "coadd", "diff", "rgb"].includes(state.viewMode)) return;
  const visits = data.visits || [];
  const mjd0 = visits.length ? visits[0].mjd : NaN;
  const mjd1 = visits.length ? visits[visits.length - 1].mjd : NaN;
  const curMjd = state.viewMode === "blink" ? viewerCurrentMjd(syncState) : NaN;
  const MIN_ARROW_PX = 22;

  data.objects.forEach((obj) => {
    const p = skyToCanvasPoint(obj.ra, obj.dec, W);
    if (!isFitsPixelInReadyTile(p.x, p.y)) return;
    if (p.cx < -24 || p.cx > W + 24 || p.cy < -24 || p.cy > H + 24) return;
    const selected = state.selectedChangeId === obj.id;
    const style = CHANGE_KIND_STYLE[obj.kind] || CHANGE_KIND_STYLE.moving;
    const m = obj.motion || {};
    ctx.save();

    if ((obj.kind === "moving" || obj.kind === "both") && Number.isFinite(m.start_ra) && Number.isFinite(m.end_ra)) {
      const a = skyToCanvasPoint(m.start_ra, m.start_dec, W);
      const b = skyToCanvasPoint(m.end_ra, m.end_dec, W);
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const len = Math.hypot(dx, dy) || 1;
      // El corrimiento real suele medir 1–2 píxeles de SPHEREx: si la flecha quedaría muy corta, se
      // amplía alrededor del centro y la leyenda lo aclara (×N). La dirección no cambia.
      const scale = len < MIN_ARROW_PX ? Math.min(8, MIN_ARROW_PX / len) : 1;
      state.viewerArrowScale = Math.max(state.viewerArrowScale, scale);
      const mx = (a.cx + b.cx) / 2;
      const my = (a.cy + b.cy) / 2;
      const ax = mx - (dx * scale) / 2;
      const ay = my - (dy * scale) / 2;
      const bx = mx + (dx * scale) / 2;
      const by = my + (dy * scale) / 2;

      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ax, ay, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.stroke();
      drawArrow(ctx, ax, ay, bx, by, style.color, selected ? 2.8 : 2.2);

      if (Number.isFinite(curMjd) && Number.isFinite(mjd0) && mjd1 > mjd0) {
        const f = Math.min(1, Math.max(0, (curMjd - mjd0) / (mjd1 - mjd0)));
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ax + (bx - ax) * f, ay + (by - ay) * f, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (obj.kind === "brightness" || obj.kind === "both") {
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = selected ? 2.8 : 2.2;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (selected) {
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawNumberBadge(ctx, p.cx + 15, p.cy - 15, obj.id, style.color, selected);
    ctx.restore();
  });
}

/** Leyenda bajo el visor (cambia solo si hay flechas ampliadas o no hay objetos). */
function updateViewerLegend() {
  const el = document.getElementById("viewer-legend-scale");
  if (!el) return;
  const data = state.changesData;
  const hasObjects = isChangesForCurrentField(data) && (data.objects || []).length > 0;
  if (!hasObjects) {
    el.textContent = state.changesLoading ? "Buscando objetos que cambian…" : "";
    return;
  }
  el.textContent =
    state.viewerArrowScale > 1.05
      ? `Flechas ampliadas ×${fmtNum(state.viewerArrowScale, 1)} para que se vean (la dirección es la medida).`
      : "Flechas en escala real.";
}

/** Marcas del método anterior (resta ΔI), solo como herramienta avanzada. */
function drawDeltaIMarkers(ctx, W, H) {
  const detections = state.allAiDetections?.length ? state.allAiDetections : state.exploreData?.ai_detections || [];
  detections.forEach((det) => {
    if (!isFitsPixelInReadyTile(det.x_pix, det.y_pix)) return;
    const { cx, cy } = fitsToSkyCanvas(det.x_pix, det.y_pix, W);
    if (cx < -32 || cx > W + 32 || cy < -32 || cy > H + 32) return;
    const isSelected = state.selectedDetectionId === det.id;
    const isDipole = det.type === "MOVING_DIPOLE";
    const color = isSelected ? "#34d399" : isDipole ? "#f43f5e" : "#f59e0b";
    ctx.save();
    if (isDipole && det.neg_x_pix != null && det.neg_y_pix != null) {
      const neg = fitsToSkyCanvas(det.neg_x_pix, det.neg_y_pix, W);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(neg.cx, neg.cy, 9, 0, Math.PI * 2);
      ctx.moveTo(neg.cx, neg.cy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2.8 : 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 10px monospace";
    ctx.fillText(`ΔI #${det.id}`, cx + 13, cy - 6);
    ctx.restore();
  });
}

function changeStampSvg(stamps, which, kind) {
  const fov = Number(stamps.fov_arcsec) || 54;
  const toPct = (e, n) => ({ x: 50 - (e / fov) * 100, y: 50 - (n / fov) * 100 });
  const before = toPct(stamps.before.east_arcsec, stamps.before.north_arcsec);
  const after = toPct(stamps.after.east_arcsec, stamps.after.north_arcsec);
  const ringR = Math.max(5, (6.15 / fov) * 100 * 0.9);
  if (kind === "brightness") {
    return `<circle cx="50" cy="50" r="${ringR + 2}" fill="none" stroke="#fbbf24" stroke-width="1.4" />`;
  }
  let svg = `<circle cx="${before.x}" cy="${before.y}" r="${ringR}" fill="none" stroke="#7dd3fc" stroke-width="1.3" stroke-dasharray="2.5 2" />`;
  if (which === "after") {
    svg += `<circle cx="${after.x}" cy="${after.y}" r="${ringR}" fill="none" stroke="#fb7185" stroke-width="1.6" />`;
  }
  return svg;
}

function buildChangeCatalogLine(obj) {
  const c = obj.catalog || {};
  const moving = obj.kind === "moving" || obj.kind === "both";
  const parts = [];
  if (c.known) {
    const agree = c.known_agrees === true ? "coincide con lo medido" : c.known_agrees === false ? "no coincide con lo medido" : "";
    parts.push(
      `Es ${c.known.name}: según el catálogo se mueve ${fmtNum(c.known.pm_total_arcsec_yr, 1)}″ por año (${c.known.source})` +
        (moving && agree ? `, ${agree}.` : ".")
    );
    return parts.join(" "); // el detalle de Gaia queda en «Detalles»
  }
  if (c.gaia_status === "unavailable") {
    parts.push("No se pudo consultar Gaia DR3 ahora.");
  } else if (c.gaia) {
    if (moving && Number.isFinite(c.gaia.pm_total_arcsec_yr)) {
      parts.push(
        c.gaia_agrees
          ? `Coincide con Gaia DR3, que mide ${fmtNum(c.gaia.pm_total_arcsec_yr, 2)}″ por año.`
          : `Gaia DR3 mide ${fmtNum(c.gaia.pm_total_arcsec_yr, 2)}″ por año: no coincide con lo medido; revisá Detalles.`
      );
    } else if (!c.known) {
      parts.push(`Estrella catalogada en Gaia DR3${Number.isFinite(c.gaia.g_mag) ? ` (brillo G = ${fmtNum(c.gaia.g_mag, 1)})` : ""}.`);
    }
  } else if (c.gaia_status === "no_match" && !c.known) {
    parts.push("No figura en Gaia DR3 a menos de 6″: posible objeto no catalogado (o demasiado rojo para Gaia).");
  }
  return parts.join(" ");
}

function buildChangeDetailsHtml(obj, data) {
  const m = obj.motion || {};
  const b = obj.brightness || {};
  const c = obj.catalog || {};
  const rows = [];
  const row = (k, v) => rows.push(`<div class="flex justify-between gap-2"><span class="text-slate-400">${k}</span><span class="text-right text-slate-200">${v}</span></div>`);
  const sec = (title) => rows.push(`<div class="pt-1.5 mt-1 border-t border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-400">${title}</div>`);

  sec("Posición (medida por SPHEREx)");
  row("RA, Dec", `${Number(obj.ra).toFixed(5)}°, ${Number(obj.dec).toFixed(5)}°`);
  row("Fechas con posición", `${m.n_visits || 0} visitas · ${obj.n_exposures} exposiciones`);
  if (Number.isFinite(m.baseline_days)) row("Lapso", `${fmtNum(m.baseline_days, 0)} días`);
  if (Number.isFinite(m.pm_total_arcsec_yr)) {
    row("Movimiento medido", `${fmtNum(m.pm_total_arcsec_yr, 2)} ± ${fmtNum(m.pm_uncertainty_arcsec_yr, 2)} ″/año`);
    row("μα* · μδ", `${fmtNum(m.pm_ra_mas_yr, 0)} · ${fmtNum(m.pm_dec_mas_yr, 0)} mas/año`);
    row("Significancia (2D)", `${fmtNum(m.significance, 1)}σ`);
    if (Number.isFinite(m.chi2_reduced)) row("χ² reducido de la recta", fmtNum(m.chi2_reduced, 2));
    if (Number.isFinite(m.position_angle_deg)) row("Ángulo de posición", `${fmtNum(m.position_angle_deg, 0)}° (N→E)`);
  }
  row("Astrometría relativa", data?.astrometry?.reference_stars
    ? `${data.astrometry.reference_stars} estrellas fijas de referencia`
    : "sin referencias suficientes (WCS de cada imagen)");

  sec("Brillo (mismo detector y color)");
  if (b.detector) {
    row("Detector · λ", `${b.detector} · ${fmtNum(b.reference_wavelength_um, 3)} µm (Δλ/λ ${fmtNum(b.wavelength_span_pct, 1)} %)`);
    row("Comparación", b.mode === "strict" ? "estricta (λ casi idéntica)" : "aproximada (λ cercanas)");
    row("Fotometría", b.photometry === "halo" ? "resplandor (núcleo saturado)" : "apertura recentrada");
    row("Fechas comparadas", `${b.n_visits} (${tlEscape(b.first_label || "")} → ${tlEscape(b.last_label || "")})`);
    if (Number.isFinite(b.change_pct)) row("Primera → última", `${b.change_pct > 0 ? "+" : ""}${fmtNum(b.change_pct, 1)} % (${fmtNum(b.change_sigma, 1)}σ)`);
    if (Number.isFinite(b.amplitude_pct)) row("Amplitud", `${fmtNum(b.amplitude_pct, 1)} %`);
    if (Number.isFinite(b.p_value)) row("p-valor (χ², brillo constante)", b.p_value < 1e-4 ? b.p_value.toExponential(1) : fmtNum(b.p_value, 4));
    if (Number.isFinite(b.median_snr)) row("SNR mediana", fmtNum(b.median_snr, 0));
  } else {
    row("Serie de brillo", "sin fechas comparables en el mismo color");
  }

  sec("Catálogos (valores publicados, no medidos acá)");
  if (c.gaia) {
    row("Gaia DR3", `${tlEscape(c.gaia.source_id)} · a ${fmtNum(c.gaia.separation_arcsec, 1)}″`);
    if (Number.isFinite(c.gaia.g_mag)) row("Brillo G", fmtNum(c.gaia.g_mag, 2));
    if (Number.isFinite(c.gaia.pm_ra_mas_yr)) row("μ Gaia (α*, δ)", `${fmtNum(c.gaia.pm_ra_mas_yr, 0)}, ${fmtNum(c.gaia.pm_dec_mas_yr, 0)} mas/año`);
  } else {
    row("Gaia DR3", c.gaia_status === "unavailable" ? "no se pudo consultar" : "sin coincidencia a < 6″ (posiciones llevadas a la época SPHEREx)");
  }
  if (c.known) row(tlEscape(c.known.name), `${fmtNum(c.known.pm_total_arcsec_yr, 2)} ″/año · ${tlEscape(c.known.source)}`);

  let planet = "";
  if (obj.planet_x) {
    planet =
      `<div class="mt-2 p-2 rounded border border-amber-500/50 bg-amber-950/40 text-amber-100 space-y-1">` +
      `<div class="text-[10px] font-bold uppercase tracking-wider text-amber-300">Hipótesis exploratoria · no es una detección</div>` +
      `<div>Si todo su movimiento aparente fuera el reflejo de la órbita de la Tierra (como en un objeto del Sistema Solar), estaría a unas ~${Number(obj.planet_x.distance_au).toLocaleString("es-AR")} UA.</div>` +
      `<div class="font-semibold">${tlEscape(obj.planet_x.note)}</div>` +
      `</div>`;
  }
  const note = b.note ? `<p class="mt-1.5 text-slate-400">${tlEscape(b.note)}.</p>` : "";
  return `<div class="space-y-0.5 text-[10px] font-mono">${rows.join("")}</div>${note}${planet}`;
}

function buildChangeCard(obj, data) {
  const style = CHANGE_KIND_STYLE[obj.kind] || CHANGE_KIND_STYLE.moving;
  const conf = CONFIDENCE_STYLE[obj.confidence] || null;
  const name = obj.name || (obj.catalog?.gaia ? "Estrella de Gaia DR3" : "Objeto sin catalogar");
  const sentences = [];
  if (obj.kind === "moving" || obj.kind === "both") sentences.push(obj.motion.sentence);
  if (obj.kind === "brightness" || obj.kind === "both") sentences.push(obj.brightness.sentence);
  const card = document.createElement("div");
  card.dataset.changeId = String(obj.id);
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.className = `p-2.5 rounded-lg border transition cursor-pointer hover:bg-slate-800/60 ${style.card}`;

  let stampsHtml = "";
  if (obj.stamps) {
    const kindForSvg = obj.kind === "brightness" ? "brightness" : "moving";
    const one = (which, title) => {
      const st = obj.stamps[which];
      return (
        `<figure class="flex-1 min-w-0">` +
        `<div class="relative aspect-square rounded border border-slate-700 overflow-hidden bg-black">` +
        `<img src="${st.image_base64}" alt="${title} · ${tlEscape(st.label)}" class="absolute inset-0 w-full h-full" style="image-rendering:pixelated" />` +
        `<svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">${changeStampSvg(obj.stamps, which, kindForSvg)}</svg>` +
        `</div>` +
        `<figcaption class="mt-0.5 text-[10px] text-center text-slate-300"><span class="font-semibold">${title}</span> · ${tlEscape(st.label)}</figcaption>` +
        `</figure>`
      );
    };
    stampsHtml =
      `<div class="flex items-center gap-1.5 mt-2" title="Misma escala de brillo y mismo color infrarrojo (${tlEscape(obj.stamps.before.detector)}, ${fmtNum(obj.stamps.before.wavelength_um, 2)} µm). Campo de ${fmtNum(obj.stamps.fov_arcsec, 0)}″, norte arriba.">` +
      one("before", "Antes") +
      `<span class="text-slate-500 text-sm shrink-0" aria-hidden="true">→</span>` +
      one("after", "Después") +
      `</div>`;
  }
  const catalogLine = buildChangeCatalogLine(obj);
  card.innerHTML =
    `<div class="flex items-start justify-between gap-2">` +
    `<div class="flex items-center gap-1.5 min-w-0">` +
    `<span class="shrink-0 w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center bg-slate-950 text-white" style="border-color:${style.color}">${obj.id}</span>` +
    `<span class="text-xs font-bold text-white truncate">${tlEscape(name)}</span>` +
    `</div>` +
    `<span class="shrink-0 px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${style.chipClass}">${tlEscape(style.chip)}</span>` +
    `</div>` +
    `<p class="mt-1.5 text-[12px] text-slate-100 leading-snug">${sentences.map(tlEscape).join(" ")}</p>` +
    stampsHtml +
    (catalogLine ? `<p class="mt-1.5 text-[11px] text-slate-300 leading-snug">${tlEscape(catalogLine)}</p>` : "") +
    `<div class="flex flex-wrap items-center justify-between gap-1.5 mt-2">` +
    (conf ? `<span class="px-1.5 py-0.5 rounded border text-[10px] font-semibold cursor-help ${conf.cls}" title="${tlEscape(conf.tip)}">${conf.text}</span>` : "<span></span>") +
    `<div class="flex items-center gap-1">` +
    `<button type="button" class="btn-change-view text-[10px] px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 text-sky-100 border border-sky-400/40 font-semibold transition">Ver en el visor</button>` +
    `<button type="button" class="btn-change-history text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition" title="Abre su línea histórica: todas las fechas y la curva de brillo">Su historia</button>` +
    `</div>` +
    `</div>` +
    `<details class="change-details mt-1.5 text-[11px]">` +
    `<summary class="cursor-pointer select-none text-slate-400 hover:text-slate-200">Detalles</summary>` +
    `<div class="mt-1.5 p-2 rounded bg-slate-950/70 border border-slate-800">${buildChangeDetailsHtml(obj, data)}</div>` +
    `</details>`;

  card.addEventListener("click", (event) => {
    if (event.target.closest("details, button")) return;
    selectChangeObject(obj);
  });
  card.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target === card) {
      event.preventDefault();
      selectChangeObject(obj);
    }
  });
  card.querySelector(".btn-change-view").addEventListener("click", () => selectChangeObject(obj));
  card.querySelector(".btn-change-history").addEventListener("click", () => {
    selectChangeObject(obj);
    setSpectrumPlotMode("timeline");
    document.getElementById("timeline-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return card;
}

function renderChangesPanel() {
  const list = document.getElementById("changes-list");
  const badge = document.getElementById("changes-count-badge");
  const summary = document.getElementById("changes-summary");
  const steadyBox = document.getElementById("changes-steady");
  const steadyList = document.getElementById("changes-steady-list");
  const steadyTitle = document.getElementById("changes-steady-title");
  if (!list || !badge || !summary) return;
  list.replaceChildren();
  steadyList?.replaceChildren();
  steadyBox?.classList.add("hidden");

  if (state.changesLoading) {
    badge.textContent = "Analizando…";
    badge.className = "text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700";
    summary.innerHTML =
      `<div class="text-xs text-slate-300 p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center gap-2">` +
      `<span class="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"></span>` +
      `Siguiendo cada estrella en todas las fechas de SPHEREx…</div>`;
    return;
  }
  if (state.changesError) {
    badge.textContent = "Sin datos";
    badge.className = "text-xs font-mono px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40";
    summary.innerHTML = `<div class="text-xs text-rose-200 p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30">No se pudo analizar el campo: ${tlEscape(state.changesError)}</div>`;
    return;
  }
  const data = state.changesData;
  if (!data) {
    badge.textContent = "—";
    summary.innerHTML = `<div class="text-xs text-slate-400 p-2.5">Elegí una región para ver qué cambió.</div>`;
    return;
  }
  const objects = data.objects || [];
  badge.textContent = `${objects.length} ${objects.length === 1 ? "objeto" : "objetos"}`;
  badge.className = objects.length
    ? "text-xs font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-200 border border-rose-500/40"
    : "text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/40";

  const sm = data.summary || {};
  const notes = (sm.notes || []).map((n) => `<li>${tlEscape(n)}</li>`).join("");
  const needsDates = (data.n_visits || 0) < 2 || (data.baseline_days || 0) < 30;
  summary.innerHTML =
    `<div class="p-2.5 rounded-lg border ${objects.length ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5"}">` +
    `<div class="text-sm font-bold text-white leading-snug">${tlEscape(sm.title || "")}</div>` +
    `<p class="text-[11px] text-slate-300 mt-0.5 leading-snug">${tlEscape(sm.detail || "")}</p>` +
    (notes ? `<ul class="mt-1 text-[11px] text-amber-200/90 list-disc list-inside space-y-0.5 leading-snug">${notes}</ul>` : "") +
    (needsDates
      ? `<button type="button" id="btn-changes-more-dates" class="mt-2 w-full text-[11px] bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-100 px-2 py-1 rounded font-semibold transition">Buscar más fechas en IRSA</button>`
      : "") +
    `</div>`;
  document.getElementById("btn-changes-more-dates")?.addEventListener("click", () => {
    exploreCoordinates(state.ra, state.dec, state.fov, 24, true, true);
  });

  objects.forEach((obj) => list.appendChild(buildChangeCard(obj, data)));

  const steady = data.steady || [];
  if (steady.length && steadyBox && steadyList) {
    steadyBox.classList.remove("hidden");
    if (steadyTitle) steadyTitle.textContent = `${steady.length} ${steady.length === 1 ? "estrella" : "estrellas"} sin cambios medibles`;
    steady.forEach((obj) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.changeId = String(obj.id);
      btn.className = "w-full text-left px-2 py-1 rounded bg-slate-900/70 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition";
      const label = obj.name || (obj.catalog?.gaia && Number.isFinite(obj.catalog.gaia.g_mag) ? `Gaia G = ${fmtNum(obj.catalog.gaia.g_mag, 1)}` : "Estrella");
      const why = obj.motion?.status === "blended" || obj.brightness?.status === "blended" ? "vecina muy cerca" : "fija y estable";
      btn.textContent = `#${obj.id} · ${label} · ${why}`;
      btn.addEventListener("click", () => selectChangeObject(obj));
      steadyList.appendChild(btn);
    });
  }
  updateChangeCardsSelection(false);
}

function updateChangeCardsSelection(scrollIntoView = false) {
  document.querySelectorAll("[data-change-id]").forEach((el) => {
    const selected = Number(el.dataset.changeId) === state.selectedChangeId;
    el.classList.toggle("ring-2", selected);
    el.classList.toggle("ring-emerald-400", selected);
    if (selected && scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/** Selecciona un objeto: lo resalta en el visor, en su tarjeta y abre su espectro e historia. */
function selectChangeObject(obj, { scroll = true, fetchDetails = true } = {}) {
  if (!obj) return;
  state.selectedChangeId = obj.id;
  state.selectedDetectionId = null;
  const p = raDecToPixel(obj.ra, obj.dec);
  state.selectedPixel = { x: p.x, y: p.y };
  clearNamedObjectSelection();
  if (state.viewMode !== "blink") setViewMode("blink");
  const pairIndices = state.exploreData?.target_info?.analysis_frame_indices || [];
  if (!isSequenceBand() && pairIndices.length >= 2) {
    state.selectedBand = "pair";
    const bandSelect = document.getElementById("select-band");
    if (bandSelect) bandSelect.value = "pair";
    syncViewerSlider();
  }
  updateChangeCardsSelection(scroll);
  renderCanvas();
  renderContextSkyMap();
  updateCatalogSelectionSummary();
  if (fetchDetails) fetchAndRenderSpectrum(obj.ra, obj.dec, true, state.ra, state.dec);
}

async function fetchAndRenderChanges(autoSelect = true) {
  const sequence = ++state.changesSequence;
  state.changesController?.abort();
  state.changesController = new AbortController();
  Object.assign(state, { changesData: null, changesLoading: true, changesError: null, selectedChangeId: null });
  renderChangesPanel();
  updateViewerLegend();
  const field = { ra: state.ra, dec: state.dec };
  try {
    const url =
      `/api/changes?ra=${state.ra}&dec=${state.dec}&fov=${state.fov}` +
      `&max_epochs=${state.exploreData?.epochs?.length || 20}&temporal_search=${state.temporalSearch}`;
    const res = await fetch(url, { signal: state.changesController.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    if (sequence !== state.changesSequence) return;
    state.changesData = data;
  } catch (err) {
    if (sequence !== state.changesSequence || err.name === "AbortError") return;
    state.changesError = err.message;
  } finally {
    if (sequence === state.changesSequence) {
      state.changesLoading = false;
      renderChangesPanel();
      renderCanvas();
      // Si el usuario todavía no eligió otro punto, se abre el objeto principal del campo.
      const first = state.changesData?.objects?.[0];
      const untouched = state.spectrumSequence === state.exploreSpectrumSeq;
      if (autoSelect && first && untouched && field.ra === state.ra && field.dec === state.dec) {
        selectChangeObject(first, { scroll: false });
      }
    }
  }
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
  state.selectedChangeId = null;
  updateChangeCardsSelection(false);
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
      state.viewerStep = 0;
      state.currentEpochIdx = getSynchronizedTemporalState().correspondingEpochIdx;
      syncViewerSlider();
      setUnifiedPlaybackState(true);
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
      card.classList.add("ring-2", "ring-emerald-400", "bg-slate-800/90");
      if (badgeEl) badgeEl.classList.remove("hidden");
      if (scrollIntoView) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      card.classList.remove("ring-2", "ring-emerald-400", "bg-slate-800/90");
      if (badgeEl) badgeEl.classList.add("hidden");
    }
  });
}

function renderAIDetectionsList(detections) {
  const container = document.getElementById("ai-detections-list");
  const badge = document.getElementById("ai-count-badge");
  container.innerHTML = "";
  badge.textContent = `${detections.length} marca${detections.length === 1 ? "" : "s"} ΔI`;
  badge.className =
    detections.length > 0
      ? "text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
      : "text-xs font-mono px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300";

  if (detections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-xs text-slate-300 p-3 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2";
    const msg = document.createElement("p");
    msg.textContent = state.exploreData?.target_info?.difference_available
      ? "No se detectaron anomalías > 4σ en la resta temporal calibrada de este sector."
      : state.exploreData?.target_info?.analysis_note || "Resta temporal no disponible con los recortes iniciales.";
    empty.appendChild(msg);

    if (!state.exploreData?.target_info?.difference_available) {
      const btnTemporal = document.createElement("button");
      btnTemporal.type = "button";
      btnTemporal.className =
        "w-full text-xs bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 px-2.5 py-1.5 rounded font-semibold transition";
      btnTemporal.textContent = "Buscar pares temporales en IRSA";
      btnTemporal.addEventListener("click", () => {
        exploreCoordinates(state.ra, state.dec, state.fov, 24, true, true);
      });
      empty.appendChild(btnTemporal);
    }
    container.appendChild(empty);
    return;
  }

  detections.forEach((det, idx) => {
    const isDipole = det.type === "MOVING_DIPOLE";
    const card = document.createElement("div");
    card.dataset.detectionId = String(det.id);
    card.className = `p-2.5 rounded-lg border transition cursor-pointer ${
      isDipole
        ? "bg-rose-950/25 border-rose-500/40 hover:bg-rose-900/30"
        : "bg-amber-950/25 border-amber-500/40 hover:bg-amber-900/30"
    }`;
    const friendlyTitle =
      det.object_category || (isDipole ? "Astro en Movimiento (Dipolo)" : "Estrella Variable (Monopolo)");
    const iauName = det.iau_designation || `SPHEREx (${det.ra.toFixed(4)}°, ${det.dec.toFixed(4)}°)`;
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs font-bold mb-1 gap-1">
        <span class="${isDipole ? "text-rose-300" : "text-amber-300"}">
          #${det.id} · ${isDipole ? "ASTRO EN MOVIMIENTO" : "ESTRELLA VARIABLE"}
        </span>
        <div class="flex items-center gap-1">
          <span class="selected-det-badge hidden text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-400/40">
            ACTIVO
          </span>
          <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-900 text-white">
            SNR ${det.snr_score}σ
          </span>
        </div>
      </div>
      <div class="text-[11px] font-semibold text-sky-300 mb-0.5 detection-iau"></div>
      <div class="text-[10px] text-slate-300 mb-1 detection-category"></div>
      <p class="detection-user-explanation text-[11px] text-slate-100 leading-snug mb-1.5 bg-slate-950/60 p-1.5 rounded border border-slate-800/80"></p>
      <div class="detection-astrometry hidden text-[10px] font-mono bg-indigo-950/40 border border-indigo-500/30 rounded p-1.5 mb-1.5 space-y-0.5 text-indigo-200"></div>
      <div class="text-[10px] font-mono text-slate-400 mb-1">
        RA: ${det.ra.toFixed(5)}° | Dec: ${det.dec.toFixed(5)}° · Píxel (${det.x_pix.toFixed(1)}, ${det.y_pix.toFixed(1)})
      </div>
      <p class="detection-description text-[10px] text-slate-400 leading-snug"></p>
      <div class="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-800/80">
        <button type="button" class="btn-det-diff text-[10px] px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/35 font-semibold transition">
          Ver en Resta (ΔI)
        </button>
        <button type="button" class="btn-det-blink text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition">
          Comparar en Flipbook
        </button>
      </div>
    `;
    card.querySelector(".detection-iau").textContent = `Designación IA: ${iauName}`;
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
      // La hipótesis exploratoria de distancia solo se muestra en el panel «Objetos que cambian»,
      // para objetos sin correspondencia en Gaia (ver «Detalles» de cada tarjeta).
      void helioAu;
      astroBox.innerHTML =
        `<div><span class="text-sky-300 font-semibold">Corrimiento entre los dos grupos de fechas:</span> Δθ = ${shiftArcsec}″ (≈ ${det.proper_motion_arcsec_yr}″/año)</div>`;
    }

    const sequence = state.exploreSequence;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectAndFocusAIDetection(det);
      }
    });

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
      card.appendChild(line);

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

    card.addEventListener("click", () => {
      selectAndFocusAIDetection(det);
    });
    container.appendChild(card);
  });

  updateAIDetectionCardsSelection();
}

// ============================================================================
// LÍNEA HISTÓRICA: cómo cambió el lugar elegido con el tiempo
//   · Tira de miniaturas (relevamientos históricos + visitas SPHEREx) con mira fija.
//   · Curva de brillo que solo compara el mismo color infrarrojo (misma banda).
//   · Titular en lenguaje claro calculado por /api/timeline.
// ============================================================================
const TIMELINE_SURVEYS = [
  {
    key: "dss2",
    hips: ["CDS/P/DSS2/red", "CDS/P/DSS2/color"],
    label: "DSS2",
    years: [1984, 2000],
    range: "~1984–2000",
    band: "placas fotográficas en luz visible",
  },
  {
    key: "2mass",
    hips: ["CDS/P/2MASS/color"],
    label: "2MASS",
    years: [1997, 2001],
    range: "1997–2001",
    band: "infrarrojo cercano (J/H/Ks)",
  },
  {
    key: "allwise",
    hips: ["CDS/P/allWISE/color"],
    label: "AllWISE",
    years: [2010, 2011],
    range: "2010–2011",
    band: "infrarrojo medio (3,4–12 µm)",
  },
];

const TIMELINE_STATUS_STYLE = {
  moved: { chip: "Se movió", box: "border-rose-500/50 bg-rose-500/10", pill: "bg-rose-500/25 text-rose-100 border-rose-400/50" },
  moved_away: { chip: "Se mudó de lugar", box: "border-rose-500/50 bg-rose-500/10", pill: "bg-rose-500/25 text-rose-100 border-rose-400/50" },
  brightness_changed: { chip: "Cambió su brillo", box: "border-amber-500/50 bg-amber-500/10", pill: "bg-amber-500/25 text-amber-100 border-amber-400/50" },
  possible_change: { chip: "Posible cambio", box: "border-amber-500/30 bg-amber-500/5", pill: "bg-amber-500/15 text-amber-200 border-amber-400/40" },
  stable: { chip: "Sin cambios", box: "border-emerald-500/40 bg-emerald-500/10", pill: "bg-emerald-500/20 text-emerald-100 border-emerald-400/40" },
  blended: { chip: "Estrella vecina", box: "border-slate-700 bg-slate-900/70", pill: "bg-slate-700/60 text-slate-200 border-slate-600" },
  faint: { chip: "Señal muy débil", box: "border-slate-700 bg-slate-900/70", pill: "bg-slate-700/60 text-slate-200 border-slate-600" },
  insufficient: { chip: "Faltan fechas", box: "border-slate-700 bg-slate-900/70", pill: "bg-slate-700/60 text-slate-200 border-slate-600" },
};

function tlEscape(text) {
  return String(text ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function tlDetCode(raw) {
  const text = String(raw || "");
  const m = /D\s*([1-6])/i.exec(text);
  if (m) return `D${m[1]}`;
  const n = /([1-6])\s*$/.exec(text);
  return n ? `D${n[1]}` : text;
}

function tlParseMjd(obsTime) {
  const num = Number(obsTime);
  if (obsTime !== "" && obsTime != null && Number.isFinite(num) && num > 10000) return num;
  const parsed = Date.parse(String(obsTime || ""));
  return Number.isFinite(parsed) ? parsed / 86400000 + 40587 : NaN;
}

function tlYearFromMjd(mjd) {
  return 2000 + (Number(mjd) - 51544.5) / 365.25;
}

function tlFmt(value, decimals = 1) {
  return Number(value).toFixed(decimals).replace(".", ",");
}

function tlFieldLabel(fovArcsec) {
  return fovArcsec >= 90 ? `${tlFmt(fovArcsec / 60, 1)}′` : `${Math.round(fovArcsec)}″`;
}

/** Stamps y serie del detector elegido en la línea histórica. */
function tlCurrentSelection(data = state.timelineData) {
  if (!data) return { detector: null, series: null, stamps: [] };
  const detectors = [...new Set([...(data.series || []).map((s) => s.detector), ...(data.stamps || []).map((s) => s.detector)])].sort();
  let detector = state.timelineDetector;
  if (!detector || !detectors.includes(detector)) {
    detector = data.default_detector && detectors.includes(data.default_detector) ? data.default_detector : detectors[0] || null;
    state.timelineDetector = detector;
  }
  const series = (data.series || []).find((s) => s.detector === detector) || null;
  // una miniatura por visita para ese detector
  const byVisit = new Map();
  (data.stamps || []).filter((s) => s.detector === detector).forEach((s) => {
    if (!byVisit.has(s.visit_id)) byVisit.set(s.visit_id, s);
  });
  const stamps = [...byVisit.values()].sort((a, b) => a.mjd - b.mjd);
  return { detector, detectors, series, stamps };
}

/**
 * Devuelve las claves de todas las fotos mostradas en la tira histórica
 * (DSS2 ~1990, 2MASS ~1999, AllWISE 2010 y todas las visitas SPHEREx del detector activo).
 */
function tlAllAvailableFrameKeys(data = state.timelineData) {
  const histKeys = TIMELINE_SURVEYS.map((s) => `hist:${s.key}`);
  if (!data) return histKeys;
  const { stamps } = tlCurrentSelection(data);
  const spxKeys = (stamps || []).map((st) => `spherex:${st.visit_id}`);
  return [...histKeys, ...spxKeys];
}

function tlEnsureSelectedKeys(data = state.timelineData) {
  const allKeys = tlAllAvailableFrameKeys(data);
  if (!state.timelineSelectedKeys || !(state.timelineSelectedKeys instanceof Set) || state.timelineSelectedKeys.size === 0) {
    state.timelineSelectedKeys = new Set(allKeys);
  }
  return state.timelineSelectedKeys;
}

function tlToggleFrameKeySelection(frameKey, data = state.timelineData) {
  const selected = tlEnsureSelectedKeys(data);
  if (selected.has(frameKey)) {
    if (selected.size <= 2) {
      setExploreProgress("Mantené al menos 2 puntos temporales seleccionados para comparar la secuencia histórica.");
      return;
    }
    selected.delete(frameKey);
  } else {
    selected.add(frameKey);
  }
  const allKeys = tlAllAvailableFrameKeys(data);
  const histKeys = TIMELINE_SURVEYS.map((s) => `hist:${s.key}`);
  const spxKeys = allKeys.filter((k) => k.startsWith("spherex:"));
  if (allKeys.every((k) => selected.has(k))) {
    state.timelineBlinkMode = "all";
  } else if (spxKeys.length >= 2 && spxKeys.every((k) => selected.has(k)) && selected.size === spxKeys.length) {
    state.timelineBlinkMode = "spherex";
  } else if (histKeys.every((k) => selected.has(k)) && selected.size === histKeys.length) {
    state.timelineBlinkMode = "historic";
  } else {
    state.timelineBlinkMode = "custom";
  }
  state.timelineBlinkStep = 0;
  buildTimelineBlinkFrames(data);
  updateTimelineBlinkModeButtons();
  renderTimelineStrip(data);
  renderTimelineBlinkFrame(false);
  startTimelineBlinkTimer();
}

/**
 * Geometría de las miniaturas históricas. Si el objeto tiene movimiento propio conocido,
 * el campo se agranda y se centra para que entre todo su recorrido desde ~1984 hasta hoy.
 * Devuelve desplazamientos en arcosegundos (Este, Norte) respecto del punto elegido.
 */
function tlHistoryGeometry(data) {
  const lastVisit = data.visits?.[data.visits.length - 1];
  const yearNow = lastVisit ? tlYearFromMjd(lastVisit.mjd_mid) : new Date().getFullYear() + 0.5;
  const cosDec = Math.max(1e-6, Math.cos((data.dec * Math.PI) / 180));
  const wrap = (d) => ((d + 540) % 360) - 180;
  let pm = null;
  const km = data.known_motion;
  if (km) {
    const refE = wrap(km.ref_ra - data.ra) * cosDec * 3600;
    const refN = (km.ref_dec - data.dec) * 3600;
    const vE = km.pm_ra_mas_yr / 1000;
    const vN = km.pm_dec_mas_yr / 1000;
    pm = {
      name: km.name,
      source: km.source,
      speed: Math.hypot(vE, vN),
      vE,
      vN,
      at: (year) => ({ e: refE + vE * (year - km.ref_epoch_year), n: refN + vN * (year - km.ref_epoch_year) }),
    };
  } else {
    // Respaldo 1: estrella Gaia con movimiento propio apreciable pegada al punto elegido.
    let best = null;
    (state.skyView.gaiaSources || []).forEach((g) => {
      if (!Number.isFinite(g.pmra) || !Number.isFinite(g.pmdec)) return;
      const sep = Math.hypot(wrap(g.ra - data.ra) * cosDec * 3600, (g.dec - data.dec) * 3600);
      const speed = Math.hypot(g.pmra, g.pmdec) / 1000;
      if (sep <= 12 && speed >= 0.12 && (!best || sep < best.sep)) best = { sep, g, speed };
    });
    if (best) {
      const vE = best.g.pmra / 1000;
      const vN = best.g.pmdec / 1000;
      pm = {
        name: `Gaia DR3 ${best.g.id || ""}`.trim(),
        source: "Gaia DR3",
        speed: best.speed,
        vE,
        vN,
        at: (year) => ({ e: vE * (year - yearNow), n: vN * (year - yearNow) }),
      };
    } else {
      // Respaldo 2: dipolo móvil detectado por IA en el recorte actual.
      const detections = state.allAiDetections?.length
        ? state.allAiDetections
        : state.exploreData?.ai_detections || [];
      const nearDipole = detections.find(
        (d) =>
          d.type === "MOVING_DIPOLE" &&
          d.neg_x_pix != null &&
          d.neg_y_pix != null &&
          angularDistanceDeg(d.ra, d.dec, data.ra, data.dec) * 3600 <= 20
      );
      if (nearDipole) {
        const earlySky = pixelToRaDec(nearDipole.neg_x_pix, nearDipole.neg_y_pix);
        const lateSky = pixelToRaDec(nearDipole.x_pix, nearDipole.y_pix);
        const dE = wrap(lateSky.ra - earlySky.ra) * cosDec * 3600;
        const dN = (lateSky.dec - earlySky.dec) * 3600;
        const norm = Math.hypot(dE, dN) || 1;
        const estSpeed = Math.min(2.5, Math.max(0.4, Number(nearDipole.proper_motion_arcsec_yr) || norm));
        const vE = (dE / norm) * estSpeed;
        const vN = (dN / norm) * estSpeed;
        pm = {
          name: nearDipole.iau_designation || `Dipolo IA #${nearDipole.id}`,
          source: "Detección IA SPHEREx",
          speed: estSpeed,
          vE,
          vN,
          at: (year) => ({ e: vE * (year - yearNow), n: vN * (year - yearNow) }),
        };
      }
    }
  }
  const stampFovArcsec = (data.stamp_fov_deg || 0.04) * 3600;
  let centerE = 0;
  let centerN = 0;
  let fovArcsec = Math.max(stampFovArcsec, 144);
  if (pm) {
    const pts = [pm.at(TIMELINE_SURVEYS[0].years[0]), pm.at(yearNow), { e: 0, n: 0 }];
    const es = pts.map((p) => p.e);
    const ns = pts.map((p) => p.n);
    const span = Math.max(Math.max(...es) - Math.min(...es), Math.max(...ns) - Math.min(...ns));
    if (span > 0.3 * fovArcsec) {
      centerE = (Math.max(...es) + Math.min(...es)) / 2;
      centerN = (Math.max(...ns) + Math.min(...ns)) / 2;
      fovArcsec = Math.min(3600, span * 1.3 + 50);
    }
  }
  return {
    pm,
    yearNow,
    centerE,
    centerN,
    fovArcsec,
    adaptive: fovArcsec > Math.max(stampFovArcsec, 144) + 1,
    centerRa: (((data.ra + centerE / 3600 / cosDec) % 360) + 360) % 360,
    centerDec: Math.max(-90, Math.min(90, data.dec + centerN / 3600)),
  };
}

function tlCrosshairSvg(x, y, color = "#7dd3fc") {
  const g = 4.5; // hueco central para no tapar la fuente
  const l = 6;
  return (
    `<g stroke="${color}" stroke-width="1.1" stroke-linecap="round" opacity="0.95">` +
    `<line x1="${x - g - l}" y1="${y}" x2="${x - g}" y2="${y}"/><line x1="${x + g}" y1="${y}" x2="${x + g + l}" y2="${y}"/>` +
    `<line x1="${x}" y1="${y - g - l}" x2="${x}" y2="${y - g}"/><line x1="${x}" y1="${y + g}" x2="${x}" y2="${y + g + l}"/></g>`
  );
}

function tlBuildCard({
  imgSrc,
  fallbackSrcs = [],
  svg,
  title,
  subtitle,
  tooltip,
  visitId = null,
  historicKey = null,
  frameKey = null,
  isSelected = true,
  stepOrder = null,
  onToggleSelect = null,
  pixelated = false,
  historic = false,
}) {
  const isButton = visitId != null || historicKey != null;
  const card = document.createElement(isButton ? "button" : "div");
  if (isButton) {
    card.type = "button";
  }
  if (visitId != null) {
    card.dataset.visit = String(visitId);
  }
  if (historicKey != null) {
    card.dataset.historicKey = String(historicKey);
  }
  if (frameKey != null) {
    card.dataset.frameKey = String(frameKey);
  }
  card.className =
    "tl-card shrink-0 w-[118px] text-left rounded-lg border p-1 transition " +
    (historic
      ? "border-slate-800 bg-slate-900/60 hover:border-amber-400/70 cursor-pointer"
      : "border-slate-700 bg-slate-950/80 hover:border-sky-400/70 cursor-pointer") +
    (isSelected ? "" : " opacity-60");
  card.title = tooltip || "";
  const selectBadgeHtml =
    frameKey != null
      ? `<span role="checkbox" aria-checked="${isSelected}" title="${
          isSelected
            ? `Foto seleccionada en la secuencia histórica (paso #${stepOrder || ""}). Tocá para quitarla de la secuencia.`
            : "Foto excluida de la secuencia. Tocá para incluirla."
        }" class="tl-select-pill absolute top-1 right-1 z-10 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border shadow transition ${
          isSelected
            ? historic
              ? "bg-amber-500/90 text-slate-950 border-amber-300 hover:bg-amber-400"
              : "bg-sky-500/90 text-slate-950 border-sky-300 hover:bg-sky-400"
            : "bg-slate-950/85 text-slate-400 border-slate-700 hover:text-white"
        }">${isSelected ? `✓ #${stepOrder || ""}` : "+ Incluir"}</span>`
      : "";
  card.innerHTML =
    `<div class="relative w-full overflow-hidden rounded bg-black" style="aspect-ratio:1/1">` +
    `<img alt="${tlEscape(title)}" class="absolute inset-0 w-full h-full object-cover" style="${pixelated ? "image-rendering:pixelated;" : ""}" crossorigin="anonymous">` +
    `<div class="tl-img-fallback hidden absolute inset-x-0 bottom-1 text-center text-[9px] text-slate-500 px-1">Imagen no disponible ahora</div>` +
    `<svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">${svg}</svg>` +
    selectBadgeHtml +
    `</div>` +
    `<div class="mt-1 text-[11px] font-semibold leading-tight ${historic ? "text-slate-300" : "text-slate-100"}">${tlEscape(title)}</div>` +
    `<div class="text-[9px] leading-tight text-slate-400">${subtitle}</div>`;
  const img = card.querySelector("img");
  const pending = [...fallbackSrcs];
  img.onerror = () => {
    if (pending.length) {
      img.src = pending.shift();
      return;
    }
    img.classList.add("hidden");
    card.querySelector(".tl-img-fallback")?.classList.remove("hidden");
  };
  img.src = imgSrc;
  const pill = card.querySelector(".tl-select-pill");
  if (pill && typeof onToggleSelect === "function") {
    pill.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      onToggleSelect(frameKey);
    });
  }
  return card;
}

function tlHipsUrl(hipsId, geom) {
  return (
    `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=${encodeURIComponent(hipsId)}` +
    `&width=236&height=236&fov=${(geom.fovArcsec / 3600).toFixed(6)}&projection=TAN&coordsys=icrs` +
    `&ra=${geom.centerRa.toFixed(6)}&dec=${geom.centerDec.toFixed(6)}&format=jpg`
  );
}

/**
 * Genera versiones de alto contraste diferencial para el primer y último recorte SPHEREx
 * del detector seleccionado, de modo que las estrellas de fondo queden completamente fijas
 * y el objeto que se mueve o cambia de brillo resalte nítidamente en el Comparador Intermitente.
 */
function enhanceTimelineStampsPair(data, detector, stamps) {
  if (!data || !detector || !stamps || stamps.length < 2) return;
  const firstSt = stamps[0];
  const lastSt = stamps[stamps.length - 1];
  const keyFirst = `${data.ra.toFixed(5)}:${data.dec.toFixed(5)}:${detector}:${firstSt.visit_id}:early`;
  const keyLast = `${data.ra.toFixed(5)}:${data.dec.toFixed(5)}:${detector}:${lastSt.visit_id}:late`;
  if (state.timelineEnhancedStamps.has(keyFirst) && state.timelineEnhancedStamps.has(keyLast)) {
    return;
  }

  Promise.all([loadImagePromise(firstSt.image_base64), loadImagePromise(lastSt.image_base64)])
    .then(([imgA, imgB]) => {
      const w = 128;
      const h = 128;
      const extractGray = (img) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const out = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const j = i * 4;
          out[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
        }
        return out;
      };

      const rawA = extractGray(imgA);
      const rawB = extractGray(imgB);
      const normalizePercentile = (arr) => {
        const sorted = Float32Array.from(arr).sort();
        const p20 = sorted[Math.floor(sorted.length * 0.20)];
        const p995 = Math.max(p20 + 8, sorted[Math.floor(sorted.length * 0.995)]);
        const out = new Float32Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
          const norm = Math.max(0, Math.min(1, (arr[i] - p20) / (p995 - p20)));
          out[i] = Math.pow(norm, 0.82) * 245;
        }
        return out;
      };

      const normA = normalizePercentile(rawA);
      const normB = normalizePercentile(rawB);

      const bakeSide = (isLate) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        const imgData = ctx.createImageData(w, h);
        for (let idx = 0; idx < w * h; idx++) {
          const a = normA[idx];
          const b = normB[idx];
          const diff = b - a;
          const absDiff = Math.abs(diff);
          const mean = 0.5 * (a + b);
          let v = mean;
          if (absDiff > 12) {
            const boost = Math.min(110, (absDiff - 12) * 2.2);
            if (isLate) {
              v = diff > 0 ? Math.min(255, b + boost) : Math.max(6, b - boost * 0.45);
            } else {
              v = diff < 0 ? Math.min(255, a + boost) : Math.max(6, a - boost * 0.45);
            }
          }
          const byte = Math.max(0, Math.min(255, Math.round(v)));
          const j = idx * 4;
          imgData.data[j] = byte;
          imgData.data[j + 1] = byte;
          imgData.data[j + 2] = Math.min(255, byte + 6);
          imgData.data[j + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        return c.toDataURL("image/png");
      };

      state.timelineEnhancedStamps.set(keyFirst, bakeSide(false));
      state.timelineEnhancedStamps.set(keyLast, bakeSide(true));
      if (state.timelineData === data) {
        buildTimelineBlinkFrames(data);
        renderTimelineBlinkFrame(false);
      }
    })
    .catch(() => {});
}

/**
 * Calcula las coordenadas (x, y en 0..100) de ANTES y DESPUÉS dentro del recorte SPHEREx
 * para animar el marcador saltando entre ambas posiciones en el Comparador Intermitente.
 */
function tlResolveComparatorPositions(data, stamps) {
  const stampFovArcsec = (data.stamp_fov_deg || 0.04) * 3600;
  const cosDec = Math.max(1e-6, Math.cos((data.dec * Math.PI) / 180));
  const wrap = (d) => ((d + 540) % 360) - 180;
  const clampPct = (v) => Math.max(8, Math.min(92, v));
  const arcsecToPct = (eastArcsec, northArcsec) => ({
    x: clampPct(50 - (eastArcsec / stampFovArcsec) * 100),
    y: clampPct(50 - (northArcsec / stampFovArcsec) * 100),
  });

  // 1) Si hay un dipolo móvil IA cercano al punto consultado, usar su desplazamiento medido
  const detections = state.allAiDetections?.length
    ? state.allAiDetections
    : state.exploreData?.ai_detections || [];
  const nearDipole = detections.find(
    (d) =>
      d.type === "MOVING_DIPOLE" &&
      d.neg_x_pix != null &&
      d.neg_y_pix != null &&
      angularDistanceDeg(d.ra, d.dec, data.ra, data.dec) * 3600 <= 18
  );
  if (nearDipole) {
    const earlySky = pixelToRaDec(nearDipole.neg_x_pix, nearDipole.neg_y_pix);
    const lateSky = pixelToRaDec(nearDipole.x_pix, nearDipole.y_pix);
    const eEarly = wrap(earlySky.ra - data.ra) * cosDec * 3600;
    const nEarly = (earlySky.dec - data.dec) * 3600;
    const eLate = wrap(lateSky.ra - data.ra) * cosDec * 3600;
    const nLate = (lateSky.dec - data.dec) * 3600;
    const posA = arcsecToPct(eEarly, nEarly);
    const posB = arcsecToPct(eLate, nLate);
    const shiftArcsec = Number.isFinite(nearDipole.shift_arcsec)
      ? nearDipole.shift_arcsec
      : Math.hypot(eLate - eEarly, nLate - nEarly);
    return {
      posA,
      posB,
      isMoving: Math.hypot(posB.x - posA.x, posB.y - posA.y) >= 1.0,
      shiftArcsec,
    };
  }

  // 2) Si /api/timeline midió centroide en varias visitas con corrimiento significativo
  const positions = data.motion?.positions || [];
  if (positions.length >= 2 && (data.motion?.shift_arcsec >= 1.2 || data.headline?.status === "moved")) {
    const firstP = positions[0];
    const lastP = positions[positions.length - 1];
    const posA = arcsecToPct(firstP.east_arcsec, firstP.north_arcsec);
    const posB = arcsecToPct(lastP.east_arcsec, lastP.north_arcsec);
    return {
      posA,
      posB,
      isMoving: Math.hypot(posB.x - posA.x, posB.y - posA.y) >= 1.0,
      shiftArcsec: data.motion.shift_arcsec || 0,
    };
  }

  // 3) Fuente fija o variable en brillo: usar el centroide de cada stamp o (50, 50)
  const firstSt = stamps[0];
  const lastSt = stamps[stamps.length - 1] || firstSt;
  const posA =
    firstSt && Number.isFinite(firstSt.centroid_east_arcsec) && Number.isFinite(firstSt.centroid_north_arcsec)
      ? arcsecToPct(firstSt.centroid_east_arcsec, firstSt.centroid_north_arcsec)
      : { x: 50, y: 50 };
  const posB =
    lastSt && Number.isFinite(lastSt.centroid_east_arcsec) && Number.isFinite(lastSt.centroid_north_arcsec)
      ? arcsecToPct(lastSt.centroid_east_arcsec, lastSt.centroid_north_arcsec)
      : posA;
  return {
    posA,
    posB,
    isMoving: Math.hypot(posB.x - posA.x, posB.y - posA.y) >= 1.6,
    shiftArcsec: data.motion?.shift_arcsec || 0,
  };
}

/**
 * Dibuja tanto en "Contexto infrarrojo y catálogos" (#aladin-canvas) como en el
 * "Visor Multi-Época SPHEREx" (#spherex-canvas) el rastro temporal progresivo de cómo
 * se fue moviendo la estrella foto por foto a lo largo de la secuencia histórica activa.
 * Solo se dibuja cuando la región de la estrella está cargada y dentro del rango de visión actual.
 */
function buildTimelineBlinkFrames(data = state.timelineData) {
  if (!data) {
    state.timelineBlinkFrames = [];
    return [];
  }
  const { detector, series, stamps } = tlCurrentSelection(data);
  const geom = tlHistoryGeometry(data);
  const stampFovArcsec = (data.stamp_fov_deg || 0.04) * 3600;
  const toHistXY = (p) => ({
    x: 50 - ((p.e - geom.centerE) / geom.fovArcsec) * 100,
    y: 50 - ((p.n - geom.centerN) / geom.fovArcsec) * 100,
  });

  if (stamps.length >= 2) {
    enhanceTimelineStampsPair(data, detector, stamps);
  }

  const selectedKeys = tlEnsureSelectedKeys(data);

  const buildHistoricFrames = () => {
    const histPositions = TIMELINE_SURVEYS.map((survey) => {
      const midYear = (survey.years[0] + survey.years[1]) / 2;
      return geom.pm ? toHistXY(geom.pm.at(midYear)) : toHistXY({ e: 0, n: 0 });
    });

    return TIMELINE_SURVEYS.map((survey, idx) => {
      const frameKey = `hist:${survey.key}`;
      const midYear = (survey.years[0] + survey.years[1]) / 2;
      let svg = "";
      const cross = toHistXY({ e: 0, n: 0 });
      svg += tlCrosshairSvg(cross.x, cross.y);
      if (geom.pm) {
        const a = toHistXY(geom.pm.at(TIMELINE_SURVEYS[0].years[0]));
        const b = toHistXY(geom.pm.at(geom.yearNow));
        const mid = histPositions[idx];
        // Corredor completo punteado
        svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fda4af" stroke-width="1.0" stroke-dasharray="2.5 2.5" opacity="0.65"/>`;
        // Rastro acumulado de décadas anteriores hasta la década actual
        for (let j = 0; j <= idx; j++) {
          const pj = histPositions[j];
          if (j > 0) {
            const pPrev = histPositions[j - 1];
            svg += `<line x1="${pPrev.x}" y1="${pPrev.y}" x2="${pj.x}" y2="${pj.y}" stroke="#fbbf24" stroke-width="2.1" stroke-linecap="round"/>`;
          }
          if (j < idx) {
            svg += `<circle cx="${pj.x}" cy="${pj.y}" r="3.2" fill="#fbbf24" stroke="#0f172a" stroke-width="0.9"/>`;
          }
        }
        svg +=
          `<rect x="${b.x - 2.6}" y="${b.y - 2.6}" width="5.2" height="5.2" fill="none" stroke="#fde68a" stroke-width="1.2"/>` +
          `<circle cx="${mid.x}" cy="${mid.y}" r="11" fill="none" stroke="rgba(251, 113, 133, 0.38)" stroke-width="1.8"/>` +
          `<circle cx="${mid.x}" cy="${mid.y}" r="7.2" fill="none" stroke="#fb7185" stroke-width="2.0"/>` +
          `<text x="${Math.min(68, mid.x + 9)}" y="${Math.max(12, mid.y - 5)}" fill="#fecdd3" font-size="7.2" font-family="monospace" font-weight="bold">${survey.label} (${Math.round(midYear)})</text>`;
      }
      const urls = survey.hips.map((id) => tlHipsUrl(id, geom));
      const shortYear = String(Math.round(midYear)).slice(-2);
      return {
        frameKey,
        kind: "historic",
        historicKey: survey.key,
        visitId: null,
        year: midYear,
        shortTag: `${survey.label} ~${shortYear}`,
        imgSrc: urls[0],
        fallbackSrcs: urls.slice(1),
        svg,
        badgeText: `${survey.label} (${survey.range})`,
        badgeClass:
          "px-2 py-0.5 rounded bg-amber-950/90 border border-amber-400/80 text-[10px] font-bold font-mono text-amber-200 shadow",
        stepText: `${idx + 1}/3`,
        caption: geom.pm
          ? `${survey.label} (${survey.range}): rastro histórico de ${geom.pm.name} (${tlFmt(geom.pm.speed, 1)}″/año) sobre un campo fijo de ${tlFieldLabel(geom.fovArcsec)}.`
          : `${survey.label} (${survey.range}) · ${survey.band} · campo de ${tlFieldLabel(geom.fovArcsec)}.`,
      };
    });
  };

  const buildSpherexFrames = () => {
    if (!stamps.length) return [];
    const { posA, posB, isMoving, shiftArcsec } = tlResolveComparatorPositions(data, stamps);
    const ptsByVisit = new Map((series?.points || []).map((p) => [p.visit_id, p]));
    const spxPositions = stamps.map((_, idx) => {
      const tFrac = stamps.length > 1 ? idx / (stamps.length - 1) : 0;
      return {
        x: posA.x + (posB.x - posA.x) * tFrac,
        y: posA.y + (posB.y - posA.y) * tFrac,
      };
    });

    return stamps.map((st, idx) => {
      const frameKey = `spherex:${st.visit_id}`;
      const isFirst = idx === 0;
      const isLast = idx === stamps.length - 1 && stamps.length > 1;
      const enhKey =
        isFirst && stamps.length >= 2
          ? `${data.ra.toFixed(5)}:${data.dec.toFixed(5)}:${detector}:${st.visit_id}:early`
          : isLast && stamps.length >= 2
          ? `${data.ra.toFixed(5)}:${data.dec.toFixed(5)}:${detector}:${st.visit_id}:late`
          : null;
      const imgSrc = (enhKey && state.timelineEnhancedStamps.get(enhKey)) || st.image_base64;

      const activePos = spxPositions[idx];
      const ghostPos = isFirst ? posB : posA;
      const activeColor = isFirst ? "#38bdf8" : "#34d399";
      const haloColor = isFirst ? "rgba(56, 189, 248, 0.42)" : "rgba(52, 211, 153, 0.45)";
      const ghostColor = isFirst ? "rgba(244, 63, 94, 0.42)" : "rgba(56, 189, 248, 0.42)";
      let svg = tlCrosshairSvg(50, 50, "rgba(148, 163, 184, 0.55)");
      if (isMoving) {
        svg += `<line x1="${posA.x}" y1="${posA.y}" x2="${posB.x}" y2="${posB.y}" stroke="#fb7185" stroke-width="1.1" stroke-dasharray="2.5 2" opacity="0.7"/>`;
        for (let j = 0; j <= idx; j++) {
          const pj = spxPositions[j];
          if (j > 0) {
            const pPrev = spxPositions[j - 1];
            svg += `<line x1="${pPrev.x}" y1="${pPrev.y}" x2="${pj.x}" y2="${pj.y}" stroke="#34d399" stroke-width="2.0" stroke-linecap="round"/>`;
          }
          if (j < idx) {
            svg += `<circle cx="${pj.x}" cy="${pj.y}" r="2.8" fill="#38bdf8" stroke="#0f172a" stroke-width="0.8"/>`;
          }
        }
        svg +=
          `<circle cx="${ghostPos.x}" cy="${ghostPos.y}" r="5.2" fill="none" stroke="${ghostColor}" stroke-width="1.1" stroke-dasharray="2 2"/>` +
          `<circle cx="${activePos.x}" cy="${activePos.y}" r="10.5" fill="none" stroke="${haloColor}" stroke-width="1.8"/>` +
          `<circle cx="${activePos.x}" cy="${activePos.y}" r="6.8" fill="none" stroke="${activeColor}" stroke-width="2.1"/>`;
      } else {
        const pulseR = isFirst ? 6.5 : 9.8;
        const ringColor = isFirst ? "#38bdf8" : "#fbbf24";
        svg +=
          (!isFirst
            ? `<circle cx="${activePos.x}" cy="${activePos.y}" r="13.5" fill="none" stroke="rgba(251, 191, 36, 0.4)" stroke-width="1.8"/>`
            : "") +
          `<circle cx="${activePos.x}" cy="${activePos.y}" r="${pulseR}" fill="none" stroke="${ringColor}" stroke-width="2.0" ${isFirst ? 'stroke-dasharray="2.5 2"' : ""}/>`;
      }

      const pt = ptsByVisit.get(st.visit_id);
      const fluxTxt = pt ? ` · Brillo: ${tlFmt(pt.flux_mjy_sr, 2)} MJy/sr` : "";
      const shiftTxt = isMoving && shiftArcsec > 0 ? ` · salto ${tlFmt(shiftArcsec, 1)}″` : "";

      return {
        frameKey,
        kind: "spherex",
        historicKey: null,
        visitId: st.visit_id,
        year: tlYearFromMjd(st.mjd),
        shortTag: `SPX #${idx + 1}`,
        imgSrc,
        fallbackSrcs: [],
        svg,
        badgeText: `SPHEREx · ${st.label}`,
        badgeClass:
          "px-2 py-0.5 rounded bg-slate-950/85 border border-sky-500/60 text-[10px] font-mono text-sky-200 shadow",
        stepText: `${idx + 1}/${stamps.length}`,
        caption: `SPHEREx ${st.detector} (${tlFmt(st.wavelength_um, 2)} µm) · ${st.label}${fluxTxt}${shiftTxt} · campo ${tlFieldLabel(stampFovArcsec)}.`,
      };
    });
  };

  const allCandidates = [...buildHistoricFrames(), ...buildSpherexFrames()];
  let frames = allCandidates.filter((f) => selectedKeys.has(f.frameKey));
  if (frames.length === 0) {
    frames = allCandidates;
  }
  frames.forEach((f, idx) => {
    f.stepText = `${idx + 1}/${frames.length}`;
  });

  state.timelineBlinkFrames = frames;
  if (state.timelineBlinkStep >= frames.length) {
    state.timelineBlinkStep = 0;
  }
  return frames;
}

function updateTimelineBlinkModeButtons() {
  const modes = [
    { id: "btn-tl-mode-all", mode: "all" },
    { id: "btn-tl-mode-spherex", mode: "spherex" },
    { id: "btn-tl-mode-historic", mode: "historic" },
  ];
  modes.forEach(({ id, mode }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.className =
      state.timelineBlinkMode === mode
        ? "px-1.5 py-0.5 rounded bg-sky-500 text-slate-950 font-semibold transition"
        : "px-1.5 py-0.5 rounded text-slate-300 hover:text-white transition";
  });
}

function renderTimelineBlinkFrame(scrollStrip = false) {
  const frames = state.timelineBlinkFrames || [];
  const imgEl = document.getElementById("timeline-blink-img");
  const svgEl = document.getElementById("timeline-blink-svg");
  const badgeEl = document.getElementById("timeline-blink-badge");
  const stepEl = document.getElementById("timeline-blink-step-badge");
  const capEl = document.getElementById("timeline-blink-caption");
  const fallbackEl = document.getElementById("timeline-blink-fallback");
  if (!imgEl || !svgEl || !frames.length) return;

  const frame = frames[state.timelineBlinkStep % frames.length];
  const pending = [...(frame.fallbackSrcs || [])];
  fallbackEl?.classList.add("hidden");
  imgEl.classList.remove("hidden");
  imgEl.onerror = () => {
    if (pending.length) {
      imgEl.src = pending.shift();
      return;
    }
    imgEl.classList.add("hidden");
    fallbackEl?.classList.remove("hidden");
  };
  if (imgEl.getAttribute("src") !== frame.imgSrc) {
    imgEl.src = frame.imgSrc;
  }
  svgEl.innerHTML = frame.svg || "";
  if (badgeEl) {
    badgeEl.className = frame.badgeClass;
    badgeEl.textContent = frame.badgeText;
  }
  if (stepEl) {
    stepEl.textContent = frame.stepText;
  }
  if (capEl) {
    capEl.textContent = frame.caption;
  }

  // Sincronizar el resaltado en la tira de miniaturas y el gráfico sin mover el scroll de la página
  document.querySelectorAll("#timeline-strip .tl-card[data-historic-key]").forEach((card) => {
    const active = frame.historicKey != null && card.dataset.historicKey === String(frame.historicKey);
    card.classList.toggle("ring-2", active);
    card.classList.toggle("ring-amber-400", active);
    if (active && scrollStrip) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  });
  highlightTimelineVisit(frame.visitId, scrollStrip);
}

function startTimelineBlinkTimer() {
  state.timelineBlinkPlaying = Boolean(state.isPlaying);
  startBlinkTimer();
}

function setTimelineBlinkMode(mode) {
  state.timelineBlinkMode = mode;
  const data = state.timelineData;
  const allKeys = tlAllAvailableFrameKeys(data);
  if (mode === "historic") {
    state.timelineSelectedKeys = new Set(TIMELINE_SURVEYS.map((s) => `hist:${s.key}`));
  } else if (mode === "spherex") {
    const spxKeys = allKeys.filter((k) => k.startsWith("spherex:"));
    state.timelineSelectedKeys = new Set(spxKeys.length >= 2 ? spxKeys : allKeys);
  } else {
    state.timelineSelectedKeys = new Set(allKeys);
  }
  state.timelineBlinkStep = 0;
  buildTimelineBlinkFrames(data);
  updateTimelineBlinkModeButtons();
  if (data) renderTimelineStrip(data);
  renderTimelineBlinkFrame(false);
  startTimelineBlinkTimer();
}

function renderTimelineStrip(data) {
  const strip = document.getElementById("timeline-strip");
  if (!strip) return;
  strip.innerHTML = "";
  const { stamps } = tlCurrentSelection(data);
  const geom = tlHistoryGeometry(data);
  const selectedKeys = tlEnsureSelectedKeys(data);
  const orderByKey = new Map();
  let runningOrder = 1;
  tlAllAvailableFrameKeys(data).forEach((k) => {
    if (selectedKeys.has(k)) {
      orderByKey.set(k, runningOrder++);
    }
  });

  const toXY = (p) => ({
    x: 50 - ((p.e - geom.centerE) / geom.fovArcsec) * 100,
    y: 50 - ((p.n - geom.centerN) / geom.fovArcsec) * 100,
  });

  // --- 1) Relevamientos históricos: otros telescopios, para comparar posición y rastro ---
  TIMELINE_SURVEYS.forEach((survey) => {
    const frameKey = `hist:${survey.key}`;
    let svg = "";
    if (geom.pm) {
      const a = toXY(geom.pm.at(TIMELINE_SURVEYS[0].years[0]));
      const b = toXY(geom.pm.at(geom.yearNow));
      const s0 = toXY(geom.pm.at(survey.years[0]));
      const s1 = toXY(geom.pm.at(survey.years[1]));
      const mid = toXY(geom.pm.at((survey.years[0] + survey.years[1]) / 2));
      svg +=
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fda4af" stroke-width="0.8" stroke-dasharray="2.5 2.5" opacity="0.8"/>` +
        `<line x1="${s0.x}" y1="${s0.y}" x2="${s1.x}" y2="${s1.y}" stroke="#fb7185" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="${mid.x}" cy="${mid.y}" r="6.5" fill="none" stroke="#fb7185" stroke-width="1.2"/>` +
        `<rect x="${b.x - 2}" y="${b.y - 2}" width="4" height="4" fill="none" stroke="#fde68a" stroke-width="1"/>`;
    }
    const cross = toXY({ e: 0, n: 0 });
    svg += tlCrosshairSvg(cross.x, cross.y);
    const urls = survey.hips.map((id) => tlHipsUrl(id, geom));
    const tip =
      `${survey.label} (${survey.range}) · ${survey.band}.\n` +
      "Es otro telescopio y otro color: sirve para comparar la POSICIÓN y el rastro histórico.\n" +
      `Campo de ${tlFieldLabel(geom.fovArcsec)} · Norte arriba, Este a la izquierda.` +
      (geom.pm
        ? `\nCírculo rosa: dónde estaba ${geom.pm.name} en esos años (${geom.pm.source}). Cuadrado amarillo: dónde está hoy.`
        : "");
    const hCard = tlBuildCard({
      imgSrc: urls[0],
      fallbackSrcs: urls.slice(1),
      svg,
      title: `${survey.label} · ${survey.range}`,
      subtitle: `histórico · posición · campo ${tlFieldLabel(geom.fovArcsec)}`,
      tooltip: tip,
      historicKey: survey.key,
      frameKey,
      isSelected: selectedKeys.has(frameKey),
      stepOrder: orderByKey.get(frameKey) || null,
      onToggleSelect: (key) => tlToggleFrameKeySelection(key, data),
      historic: true,
    });
    hCard.addEventListener("click", () => {
      if (!selectedKeys.has(frameKey)) {
        selectedKeys.add(frameKey);
        buildTimelineBlinkFrames(data);
        renderTimelineStrip(data);
      }
      const targetIdx = (state.timelineBlinkFrames || []).findIndex((f) => f.frameKey === frameKey);
      if (targetIdx >= 0) {
        state.timelineBlinkStep = targetIdx;
      }
      renderTimelineBlinkFrame(true);
    });
    strip.appendChild(hCard);
  });

  // --- separador ---
  const sep = document.createElement("div");
  sep.className = "shrink-0 flex flex-col items-center justify-center px-1 text-[9px] uppercase tracking-wider text-sky-300/80";
  sep.innerHTML = `<div class="w-px flex-1 bg-sky-500/30"></div><div class="py-1" style="writing-mode:vertical-rl;transform:rotate(180deg)">SPHEREx</div><div class="w-px flex-1 bg-sky-500/30"></div>`;
  strip.appendChild(sep);

  // --- 2) Visitas SPHEREx del detector elegido ---
  const stampFovArcsec = (data.stamp_fov_deg || 0.04) * 3600;
  if (stamps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shrink-0 w-[240px] flex items-center text-[11px] text-slate-400 px-2";
    empty.textContent = "SPHEREx todavía no tiene imágenes utilizables de este punto.";
    strip.appendChild(empty);
  }
  const { series: stripSeries } = tlCurrentSelection(data);
  const visitsInCurve = new Set((stripSeries?.points || []).map((p) => p.visit_id));
  stamps.forEach((st) => {
    const frameKey = `spherex:${st.visit_id}`;
    let svg = tlCrosshairSvg(50, 50);
    if (Number.isFinite(st.centroid_east_arcsec) && Number.isFinite(st.centroid_north_arcsec)) {
      const cx = 50 - (st.centroid_east_arcsec / stampFovArcsec) * 100;
      const cy = 50 - (st.centroid_north_arcsec / stampFovArcsec) * 100;
      svg += `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#fde68a" stroke="#0f172a" stroke-width="0.5"/>`;
    }
    const visit = (data.visits || []).find((v) => v.visit_id === st.visit_id);
    const card = tlBuildCard({
      imgSrc: st.image_base64,
      svg,
      title: st.label,
      subtitle:
        `SPHEREx · ${tlEscape(st.detector)} · ${tlFmt(st.wavelength_um, 2)} µm` +
        (visitsInCurve.has(st.visit_id) ? ` <span class="text-sky-300" title="Esta fecha aporta un punto a la curva de brillo">● curva</span>` : ""),
      tooltip:
        `SPHEREx · ${st.label} (MJD ${Number(st.mjd).toFixed(2)})\n` +
        `Detector ${st.detector} · λ = ${Number(st.wavelength_um).toFixed(3)} µm · campo de ${tlFieldLabel(stampFovArcsec)}\n` +
        (visit ? `${visit.n_exposures} exposiciones en esta fecha.\n` : "") +
        "Punto amarillo: centro medido de la fuente. Clic: ver esta fecha en la secuencia y en el visor principal.",
      visitId: st.visit_id,
      frameKey,
      isSelected: selectedKeys.has(frameKey),
      stepOrder: orderByKey.get(frameKey) || null,
      onToggleSelect: (key) => tlToggleFrameKeySelection(key, data),
      pixelated: false,
    });
    card.addEventListener("click", () => {
      if (!selectedKeys.has(frameKey)) {
        selectedKeys.add(frameKey);
        buildTimelineBlinkFrames(data);
        renderTimelineStrip(data);
      }
      const targetIdx = (state.timelineBlinkFrames || []).findIndex((f) => f.frameKey === frameKey);
      if (targetIdx >= 0) {
        state.timelineBlinkStep = targetIdx;
      }
      renderTimelineBlinkFrame(true);
      selectTimelineVisit(st.visit_id, true);
    });
    card.addEventListener("mouseenter", () => highlightTimelineVisit(st.visit_id));
    card.addEventListener("mouseleave", () => highlightTimelineVisit(state.timelineSelectedVisit));
    strip.appendChild(card);
  });
  highlightTimelineVisit(state.timelineSelectedVisit);
}

/** Resalta la miniatura y el punto del gráfico de una visita (sin cambiar la selección). */
function highlightTimelineVisit(visitId, scrollIntoView = false) {
  document.querySelectorAll("#timeline-strip .tl-card[data-visit]").forEach((card) => {
    const active = visitId != null && card.dataset.visit === String(visitId);
    card.classList.toggle("ring-2", active);
    card.classList.toggle("ring-sky-400", active);
    if (active && scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  const plot = document.getElementById("timeline-plot");
  const { series } = tlCurrentSelection();
  if (plot?.data?.length && series && window.Plotly) {
    const approx = series.mode !== "strict";
    const base = approx ? "#fbbf24" : "#38bdf8";
    Plotly.restyle(plot, {
      "marker.size": [series.points.map((p) => (p.visit_id === visitId ? 15 : 9))],
      "marker.color": [series.points.map((p) => (p.visit_id === visitId ? "#ffffff" : base))],
    }, [0]);
  }
}

/** Selecciona una visita; con jump=true lleva el visor principal a esa fecha. */
function selectTimelineVisit(visitId, jump = false) {
  state.timelineSelectedVisit = visitId;
  highlightTimelineVisit(visitId, true);
  if (!jump) return;
  const data = state.timelineData;
  const visit = (data?.visits || []).find((v) => v.visit_id === visitId);
  if (!visit) return;
  const point = state.timelinePoint;
  const onMainTile = point && Math.abs(point.centerRa - state.ra) < 1e-4 && Math.abs(point.centerDec - state.dec) < 1e-4;
  const epochs = state.exploreData?.epochs || [];
  let bestIdx = -1;
  let bestScore = Infinity;
  if (onMainTile) {
    epochs.forEach((ep, idx) => {
      const mjd = tlParseMjd(ep.obs_time);
      if (!Number.isFinite(mjd) || mjd < visit.mjd_start - 0.6 || mjd > visit.mjd_end + 0.6) return;
      const score = (tlDetCode(ep.detector) === state.timelineDetector ? 0 : 1000) + Math.abs(mjd - visit.mjd_mid);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
  }
  if (bestIdx < 0) {
    setExploreProgress(
      `La fecha ${visit.label} se ve en la miniatura, pero no está cargada en el visor principal. ` +
      "Usá «Buscar pares temporales» o «Sincronizar nuevas entregas IRSA» para cargar más fechas."
    );
    return;
  }
  if (state.viewMode !== "blink") setViewMode("blink");
  state.currentEpochIdx = bestIdx;
  state.selectedBand = String(bestIdx);
  const slider = document.getElementById("slider-epoch");
  if (slider) slider.value = bestIdx;
  const bandSelect = document.getElementById("select-band");
  if (bandSelect) bandSelect.value = state.selectedBand;
  renderCanvas();
  const ep = epochs[bestIdx];
  setExploreProgress(`Visor principal en la fecha ${visit.label} · ${ep.detector || "SPHEREx"} · ${Number(ep.wavelength_center_um).toFixed(3)} µm.`);
}

function renderTimelineHeadline(data) {
  const el = document.getElementById("timeline-headline");
  if (!el) return;
  const h = data.headline;
  const style = TIMELINE_STATUS_STYLE[h.status] || TIMELINE_STATUS_STYLE.insufficient;
  const km = data.known_motion;
  const showGoto = km && km.offset_now_arcsec > 15;
  const notes = (h.notes || []).map((n) => `<li>${tlEscape(n)}</li>`).join("");
  el.innerHTML =
    `<div class="rounded-lg border px-3 py-2 ${style.box}">` +
    `<div class="flex flex-wrap items-center gap-2">` +
    `<span class="px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${style.pill}">${tlEscape(style.chip)}</span>` +
    `<span class="text-sm font-bold text-white">${tlEscape(h.title)}</span>` +
    (h.period ? `<span class="text-[11px] text-slate-400">${tlEscape(h.period)}</span>` : "") +
    (showGoto
      ? `<button type="button" id="btn-timeline-goto" class="ml-auto px-2 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-semibold transition" ` +
        `title="Carga los datos de SPHEREx centrados en RA ${km.current_ra.toFixed(5)}°, Dec ${km.current_dec.toFixed(5)}° (posición prevista para ${km.current_epoch_year.toFixed(1)})">Ir a su posición actual →</button>`
      : "") +
    `</div>` +
    `<p class="text-xs text-slate-200 mt-1 leading-snug">${tlEscape(h.detail)}</p>` +
    (data.field_object_id != null
      ? `<p class="text-[11px] text-sky-300 mt-1">Misma medición que el objeto #${data.field_object_id} del panel «Objetos que cambian».</p>`
      : "") +
    (notes ? `<ul class="mt-1 space-y-0.5 text-[11px] text-slate-400 list-disc list-inside leading-snug">${notes}</ul>` : "") +
    `</div>`;
  document.getElementById("btn-timeline-goto")?.addEventListener("click", () => {
    state.forceCenterSelection = true;
    setExploreProgress(`Buscando a ${km.name} en su posición actual…`);
    exploreCoordinates(km.current_ra, km.current_dec, state.fov, 20);
  });
}

function renderTimelineDetectorSelect(data) {
  const select = document.getElementById("select-timeline-detector");
  if (!select) return;
  const { detector, detectors } = tlCurrentSelection(data);
  select.innerHTML = "";
  (detectors || []).forEach((det) => {
    const series = (data.series || []).find((s) => s.detector === det);
    const stamp = (data.stamps || []).find((s) => s.detector === det);
    const wl = series ? series.reference_wavelength_um : stamp?.wavelength_um;
    const opt = document.createElement("option");
    opt.value = det;
    const tag = !series ? "1 fecha" : `${series.n_visits} fechas${series.mode === "strict" ? "" : " · aprox."}`;
    opt.textContent = `${det} · ${Number.isFinite(wl) ? tlFmt(wl, 2) + " µm" : "—"} · ${tag}`;
    select.appendChild(opt);
  });
  select.value = detector || "";
  select.disabled = (detectors || []).length <= 1;
}

function renderTimelinePlot(data) {
  const el = document.getElementById("timeline-plot");
  if (!el || !window.Plotly) return;
  const { detector, series } = tlCurrentSelection(data);
  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 16, t: 26, b: 38 },
    showlegend: false,
  };
  if (!series) {
    const msg = detector
      ? `SPHEREx midió este color (${detector}) en una sola fecha:<br>todavía no hay con qué comparar el brillo.`
      : "Todavía no hay mediciones de brillo en este punto.";
    Plotly.react(el, [], {
      ...baseLayout,
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [{ text: msg, showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5, font: { color: "#94a3b8", size: 12 } }],
    }, { responsive: true, displayModeBar: false });
    return;
  }
  const pts = series.points;
  const approx = series.mode !== "strict";
  const color = approx ? "#fbbf24" : "#38bdf8";
  const sel = state.timelineSelectedVisit;
  const x = pts.map((p) => new Date((p.mjd - 40587) * 86400000).toISOString());
  const trace = {
    x,
    y: pts.map((p) => p.flux_mjy_sr),
    error_y: { type: "data", array: pts.map((p) => p.flux_uncertainty), visible: true, color: "rgba(148, 163, 184, 0.6)", thickness: 1.2, width: 3 },
    mode: "lines+markers",
    line: { color, width: 2, dash: approx ? "dot" : "solid" },
    marker: {
      color: pts.map((p) => (p.visit_id === sel ? "#ffffff" : color)),
      size: pts.map((p) => (p.visit_id === sel ? 15 : 9)),
      line: { color: "#0f172a", width: 1.5 },
    },
    customdata: pts.map((p) => [p.label, p.n_exposures, p.flux_uncertainty, p.wavelength_um, p.visit_id]),
    hovertemplate:
      "<b>%{customdata[0]}</b><br>Brillo: %{y:.3f} ± %{customdata[2]:.3f} MJy/sr" +
      "<br>%{customdata[1]} exposición(es) · λ %{customdata[3]:.3f} µm<extra></extra>",
  };
  const fluxes = pts.map((p) => p.flux_mjy_sr);
  const spanDays = pts[pts.length - 1].mjd - pts[0].mjd;
  const padDays = Math.max(spanDays * 0.08, 0.05);
  const toIso = (mjd) => new Date((mjd - 40587) * 86400000).toISOString();
  const allPositive = Math.min(...fluxes) > 0;
  const mean = fluxes.reduce((a, b) => a + b, 0) / fluxes.length;
  const subtitle =
    (series.photometry === "halo" ? "Resplandor alrededor del centro saturado · " : "") +
    (approx
      ? "Estimación aproximada: longitudes de onda cercanas en el mismo detector"
      : `Mismo color infrarrojo en todas las fechas (${tlFmt(series.reference_wavelength_um, 2)} µm)`);
  const layout = {
    ...baseLayout,
    xaxis: {
      type: "date",
      tickformat: spanDays < 12 ? "%d/%m %Hh" : "%d/%m/%Y",
      nticks: 6,
      range: [toIso(pts[0].mjd - padDays), toIso(pts[pts.length - 1].mjd + padDays)],
      gridcolor: "rgba(148, 163, 184, 0.12)",
      tickfont: { color: "#cbd5e1", size: 10 },
      title: { text: "Fecha de observación", font: { color: "#94a3b8", size: 11 } },
    },
    yaxis: {
      title: { text: "Brillo (MJy/sr)", font: { color: "#94a3b8", size: 11 } },
      gridcolor: "rgba(148, 163, 184, 0.12)",
      tickfont: { color: "#cbd5e1", size: 10 },
      rangemode: allPositive ? "tozero" : "normal",
      zerolinecolor: "rgba(148, 163, 184, 0.3)",
    },
    shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: mean, y1: mean, line: { color: "rgba(148, 163, 184, 0.45)", width: 1, dash: "dash" } }],
    annotations: [{
      text: subtitle, showarrow: false, xref: "paper", yref: "paper", x: 0, y: 1.16, xanchor: "left",
      font: { color: approx ? "#fbbf24" : "#7dd3fc", size: 11 },
    }],
  };
  Plotly.react(el, [trace], layout, { responsive: true, displayModeBar: false });
  if (!el._timelineBound) {
    el._timelineBound = true;
    el.on("plotly_hover", (ev) => {
      const visitId = ev?.points?.[0]?.customdata?.[4];
      if (visitId != null) highlightTimelineVisit(visitId, true);
    });
    el.on("plotly_unhover", () => highlightTimelineVisit(state.timelineSelectedVisit));
    el.on("plotly_click", (ev) => {
      const visitId = ev?.points?.[0]?.customdata?.[4];
      if (visitId != null) selectTimelineVisit(visitId, true);
    });
  }
}

function renderTimelineBadge() {
  const badge = document.getElementById("btn-timeline-badge");
  if (!badge) return;
  const inTimeline = state.spectrumPlotMode === "timeline";
  const data = state.timelineData;
  if (inTimeline || (!data && !state.timelineLoading)) {
    badge.classList.add("hidden");
    return;
  }
  badge.classList.remove("hidden");
  if (!data) {
    badge.textContent = "Línea histórica: calculando…";
    return;
  }
  const style = TIMELINE_STATUS_STYLE[data.headline.status] || TIMELINE_STATUS_STYLE.insufficient;
  badge.textContent = `Línea histórica · ${style.chip}: ${data.headline.title} →`;
}

function renderTimeline() {
  renderTimelineBadge();
  if (state.spectrumPlotMode !== "timeline") return;
  const headline = document.getElementById("timeline-headline");
  const strip = document.getElementById("timeline-strip");
  const plot = document.getElementById("timeline-plot");
  const tech = document.getElementById("timeline-technical");
  const data = state.timelineData;
  if (!data) {
    const msg = state.timelineLoading
      ? "Calculando la línea histórica de este punto…"
      : state.timelineError
        ? `No se pudo calcular la línea histórica: ${state.timelineError}`
        : "Tocá una estrella o un punto del visor para ver cómo cambió con el tiempo.";
    if (headline) {
      headline.innerHTML = `<div class="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">${tlEscape(msg)}</div>`;
    }
    if (strip) strip.innerHTML = "";
    if (plot && window.Plotly) Plotly.purge(plot);
    if (tech) tech.textContent = "";
    const select = document.getElementById("select-timeline-detector");
    if (select) select.innerHTML = "";
    state.timelineBlinkFrames = [];
    const blinkSvg = document.getElementById("timeline-blink-svg");
    if (blinkSvg) blinkSvg.innerHTML = "";
    const blinkBadge = document.getElementById("timeline-blink-badge");
    if (blinkBadge) blinkBadge.textContent = state.timelineLoading ? "CARGANDO…" : "ESPERANDO…";
    const blinkCap = document.getElementById("timeline-blink-caption");
    if (blinkCap) blinkCap.textContent = msg;
    return;
  }
  renderTimelineHeadline(data);
  renderTimelineDetectorSelect(data);
  buildTimelineBlinkFrames(data);
  renderTimelineStrip(data);
  renderTimelinePlot(data);
  updateTimelineBlinkModeButtons();
  renderTimelineBlinkFrame(false);
  startTimelineBlinkTimer();
  if (tech) {
    const m = data.motion || {};
    const motionTxt = m.shift_arcsec != null
      ? ` · corrimiento medido ${Number(m.shift_arcsec).toFixed(1)}″ (${Number(m.shift_sigma).toFixed(1)}σ)`
      : "";
    tech.textContent =
      `${data.headline.technical || "Sin serie comparable"}${motionTxt} · ${data.total_exposures} exposiciones SPHEREx en ${data.visits.length} fecha(s)` +
      (data.tracking_applied
        ? data.motion?.source === "field"
          ? " · apertura siguiendo el movimiento medido por SPHEREx"
          : " · apertura siguiendo el movimiento propio de catálogo"
        : "");
  }
}

async function fetchAndRenderTimeline(pointRa, pointDec, centerRa, centerDec) {
  const sequence = ++state.timelineSequence;
  state.timelineController?.abort();
  state.timelineController = new AbortController();
  Object.assign(state, {
    timelineData: null,
    timelineError: null,
    timelineLoading: true,
    timelineSelectedVisit: null,
    timelineSelectedKeys: null,
    timelinePoint: { ra: pointRa, dec: pointDec, centerRa, centerDec },
  });
  renderTimeline();
  try {
    const url =
      `/api/timeline?ra=${pointRa}&dec=${pointDec}&center_ra=${centerRa}&center_dec=${centerDec}&fov=${state.fov}` +
      `&max_epochs=${state.exploreData?.epochs?.length || 20}&temporal_search=${state.temporalSearch}`;
    const res = await fetch(url, { signal: state.timelineController.signal });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (sequence !== state.timelineSequence) return;
    state.timelineData = data;
    state.timelineDetector = data.default_detector || null;
    // Por defecto seleccionar automáticamente todas las fotos mostradas (históricas + todas las visitas SPHEREx)
    state.timelineBlinkMode = "all";
    state.timelineSelectedKeys = new Set(tlAllAvailableFrameKeys(data));
    state.timelineBlinkStep = 0;
  } catch (err) {
    if (sequence !== state.timelineSequence) return;
    if (err.name !== "AbortError") state.timelineError = err.message;
  } finally {
    if (sequence === state.timelineSequence) {
      state.timelineLoading = false;
      if (state.timelineData) {
        buildTimelineBlinkFrames(state.timelineData);
        startBlinkTimer();
      }
      renderTimeline();
      renderCanvas();
      renderContextSkyMap();
    }
  }
}

function setSpectrumPlotMode(mode) {
  state.spectrumPlotMode = mode === "timeline" ? "timeline" : "spectrum";
  syncUrlParams(state.ra, state.dec, state.fov, state.temporalSearch);
  renderSpectrumOrLightCurve();
}

function exportTimelineCsv() {
  const data = state.timelineData;
  if (!data || !(data.series || []).length) {
    setExploreProgress("Todavía no hay una línea histórica con mediciones para exportar.");
    return;
  }
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    "record_type,ra_deg,dec_deg,detector,comparison_mode,photometry,visit_date,mjd,flux_mjy_sr,flux_uncertainty_mjy_sr,n_exposures,wavelength_um,east_offset_arcsec,north_offset_arcsec",
  ];
  data.series.forEach((s) => {
    s.points.forEach((p) => {
      rows.push([
        "brightness", data.ra.toFixed(6), data.dec.toFixed(6), q(s.detector), s.mode, s.photometry, p.date_iso,
        Number(p.mjd).toFixed(4), Number(p.flux_mjy_sr).toFixed(5), Number(p.flux_uncertainty).toFixed(5),
        p.n_exposures, Number(p.wavelength_um).toFixed(4), "", "",
      ].join(","));
    });
  });
  (data.motion?.positions || []).forEach((p) => {
    const visit = data.visits.find((v) => v.visit_id === p.visit_id);
    rows.push([
      "position", data.ra.toFixed(6), data.dec.toFixed(6), "", "", "", visit?.date_iso || "",
      Number(p.mjd).toFixed(4), "", "", p.n_exposures, "", Number(p.east_arcsec).toFixed(2), Number(p.north_arcsec).toFixed(2),
    ].join(","));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `papastronomy_linea_historica_${Number(data.ra).toFixed(4)}_${Number(data.dec).toFixed(4)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  setExploreProgress(`Línea histórica exportada (${rows.length - 1} filas): ${a.download}`);
}

function renderSpectrumOrLightCurve(data = state.lastSpectrumData) {
  const titleEl = document.getElementById("spectrum-panel-title");
  const btnSpec = document.getElementById("btn-plot-spectrum");
  const btnLc = document.getElementById("btn-plot-lightcurve");
  const isTimeline = state.spectrumPlotMode === "timeline";
  if (btnSpec && btnLc) {
    btnSpec.className = !isTimeline
      ? "px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-semibold"
      : "px-2 py-0.5 rounded text-slate-300 hover:text-white";
    btnLc.className = isTimeline
      ? "px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-semibold"
      : "px-2 py-0.5 rounded text-slate-300 hover:text-white";
  }
  document.getElementById("spectrum-plot")?.classList.toggle("hidden", isTimeline);
  document.getElementById("timeline-view")?.classList.toggle("hidden", !isTimeline);
  document.querySelectorAll(".spectrum-only").forEach((el) => el.classList.toggle("hidden", isTimeline));

  if (isTimeline) {
    if (titleEl) titleEl.textContent = "Línea histórica · cómo cambió este lugar con el tiempo";
    renderTimeline();
    return;
  }
  renderTimelineBadge();
  if (!data || !window.Plotly) return;

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
  state.spectrumController?.abort();
  state.spectrumController = new AbortController();
  document.getElementById("spectrum-coord-label").textContent = "Midiendo espectro de la posición seleccionada…";
  const refCenterRa = Number.isFinite(centerRaOverride) ? centerRaOverride : state.ra;
  const refCenterDec = Number.isFinite(centerDecOverride) ? centerDecOverride : state.dec;
  void fetchAndRenderTimeline(pointRa, pointDec, refCenterRa, refCenterDec);
  try {
    const url = `/api/spectrum?ra=${pointRa}&dec=${pointDec}&center_ra=${refCenterRa}&center_dec=${refCenterDec}&fov=${state.fov}&max_epochs=${state.exploreData?.epochs?.length || 10}&temporal_search=${state.temporalSearch}`;
    const res = await fetch(url, { signal: state.spectrumController.signal });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (sequence !== state.spectrumSequence) return;
    state.lastSpectrumData = data;

    if (!keepSelectedPixel) {
      state.selectedPixel = { x: data.x_pix, y: data.y_pix };
    }
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const dispX = state.selectedPixel ? Math.round(state.selectedPixel.x) : data.x_pix;
    const dispY = state.selectedPixel ? Math.round(state.selectedPixel.y) : data.y_pix;
    const detTag = state.selectedChangeId
      ? ` · Objeto #${state.selectedChangeId}`
      : state.selectedDetectionId
      ? ` · Marca ΔI #${state.selectedDetectionId}`
      : "";
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
    if (err.name === "AbortError" || sequence !== state.spectrumSequence) return;
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
  auto.textContent = `Secuencia automática · todas las exposiciones${targetInfo.best_band_clean_pct != null ? ` (mejor: ${targetInfo.best_band_clean_pct}%)` : ""}`;
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
    const seq = getViewerSequence();
    void detName;
    void wlRange;
    pairOpt.textContent = `Animación por fechas · ${seq.indices.length} fechas (${seq.mode === "approx" ? "mismo detector, color parecido" : "misma banda"})`;
    select.appendChild(pairOpt);
  }

  const detEntries = Object.entries(detectorCoadds || {});
  if (detEntries.length > 0) {
    detEntries.forEach(([detCode, dc]) => {
      const detOpt = document.createElement("option");
      detOpt.value = `coadd:${detCode}`;
      detOpt.textContent =
        `Suma SNR Detector ${detCode} (${dc.frame_count} exp · ` +
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
    option.textContent = `${index + 1}. ${wavelengthLabel} · ${bandwidthLabel} · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% limpios`;
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
  state.viewerStep = 0;
  if (pairIndices.length >= 2) {
    select.value = "pair";
    state.selectedBand = "pair";
    state.pairBlinkPhase = 0;
    state.currentEpochIdx = getSynchronizedTemporalState().correspondingEpochIdx;
  } else {
    select.value = "auto";
    state.selectedBand = "auto";
    state.currentEpochIdx = targetInfo.best_band_index || 0;
  }
  if (summary) {
    const best = targetInfo.best_band_index;
    const bestEp = Number.isInteger(best) ? epochs[best] : null;
    const loadedBands = Number.isInteger(targetInfo.total_bands) && targetInfo.total_bands > 0
      ? targetInfo.total_bands
      : epochs.length;
    const detCount = detEntries.length;
    if (state.selectedBand === "pair" && pairIndices.length >= 2) {
      const firstEp = epochs[pairIndices[0]];
      const lastEp = epochs[pairIndices[pairIndices.length - 1]];
      summary.textContent = describeViewerSequence();
    } else {
      summary.textContent = bestEp
        ? `Automática: ${Number(bestEp.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(bestEp.bandwidth_um || 0).toFixed(3)} µm) · ${bestEp.detector || "detector"} · ${bestEp.clean_pixels_pct}% limpios · ${loadedBands} bandas (${detCount} detectores con suma SNR).`
        : `Automática: no se pudo determinar una longitud de onda válida · ${loadedBands} bandas cargadas.`;
    }
  }
  syncViewerSlider();
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
  document.querySelectorAll("#coord-form input, #coord-form select, #coord-form button[type=submit], .preset-btn, .fov-pill, #btn-load-102-bands, #btn-temporal-search, #btn-irsa-sync, #select-band, #slider-epoch")
    .forEach((el) => { el.disabled = busy; });
  document.getElementById("coord-form").setAttribute("aria-busy", String(busy));
  document.getElementById("coord-form").querySelector("button[type=submit]").textContent = busy ? "Procesando…" : "Explorar Cielo";
}

async function exploreCoordinates(ra, dec, fov, maxEpochs = 20, temporalSearch = false, refresh = false) {
  ra = Number(ra); dec = Number(dec); fov = Number(fov);
  if (![ra, dec, fov].every(Number.isFinite) || ra < 0 || ra > 360 || dec < -90 || dec > 90 || fov <= 0.005 || fov > 1) {
    setExploreProgress("Revisá las coordenadas: RA 0–360°, Dec −90–90°, FoV entre 0.005° y 1°.");
    return;
  }
  const sequence = ++state.exploreSequence;
  abortBackgroundTiles();
  state.exploreController?.abort();
  state.spectrumController?.abort();
  state.spectrumSequence++;
  state.timelineController?.abort();
  state.timelineSequence++;
  Object.assign(state, { timelineData: null, timelineLoading: false, timelineError: null, timelineSelectedVisit: null });
  renderTimeline();
  const forceCenter = state.forceCenterSelection;
  state.forceCenterSelection = false;
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
    Object.assign(state, { ra, dec, fov, exploreData: data, epochImages: images, flagImages: flags,
      coaddImage: coadd, diffImage: diff, detectorCoaddImages, crossmatchByDetId: {}, temporalSearch,
      viewerStep: 0 });
    document.getElementById("input-ra").value = ra.toFixed(6);
    document.getElementById("input-dec").value = dec.toFixed(6);
    document.getElementById("input-fov").value = fov.toFixed(4);
    syncFovPresetSelect(fov);
    syncUrlParams(ra, dec, fov, temporalSearch);
    buildCatalogSourcesFromField();
    populateBandSelector(data.epochs, data.target_info, data.detector_coadds);
    const newEpochsList = refresh
      ? (data.epochs || []).filter((ep) => !prevKeys.has(epKey(ep)))
      : [];
    if (refresh && newEpochsList.length > 0) {
      const firstNewIdx = data.epochs.findIndex((ep) => !prevKeys.has(epKey(ep)));
      if (firstNewIdx >= 0 && !isSequenceBand()) {
        state.currentEpochIdx = firstNewIdx;
      }
    }
    syncViewerSlider();
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.classList.toggle("target-btn-active", btn.dataset.target === data.target_info.matched_target_id);
    });
    document.getElementById("badge-datasource").textContent =
      `${data.target_info.data_source} · ${data.target_info.total_frames} recortes`;
    document.getElementById("analysis-note").textContent = data.target_info.analysis_note;
    document.getElementById("mode-diff").disabled = !data.target_info.difference_available;
    if (state.viewMode === "diff" && !data.target_info.difference_available) setViewMode("blink");
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
    // El punto inicial es el centro; cuando llega el análisis de «Objetos que cambian» se abre el
    // objeto principal del campo (si el usuario no eligió otro punto antes).
    const top = null;
    state.selectedDetectionId = null;
    state.selectedChangeId = null;
    state.selectedPixel = { x: 63.5, y: 63.5 };
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
    state.exploreSpectrumSeq = state.spectrumSequence;
    void fetchAndRenderChanges(!forceCenter);
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
    mode === "diff" || mode === "manual_diff"
      ? diffLegend.classList.remove("hidden")
      : diffLegend.classList.add("hidden");
  }
  renderCanvas();
}

document.addEventListener("DOMContentLoaded", async () => {
  const plot = document.getElementById("spectrum-plot");
  new ResizeObserver(() => {
    if (window.Plotly && plot.data) Plotly.Plots.resize(plot);
  }).observe(plot);
  const initial = getParamsFromUrl();
  state.ra = initial.ra;
  state.dec = initial.dec;
  state.fov = initial.fov;
  state.embed = Boolean(initial.embed);
  state.invertPixels = Boolean(initial.invert);
  state.spectrumPlotMode = initial.timeline ? "timeline" : "spectrum";
  renderSpectrumOrLightCurve();
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
        exploreCoordinates(found.ra_deg, found.dec_deg, found.default_fov);
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
          ? "Asinh"
          : state.stretchLinearity >= 0.95
          ? "Lineal"
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
      setExploreProgress("Cargá una región primero para ejecutar Shift & Stack.");
      return;
    }
    const snrBoost = Math.sqrt(Math.max(1, nEp)).toFixed(2);
    state.shiftStackCanvas = canvas;
    state.shiftStackMeta = {
      pmRaMasYr,
      pmDecMasYr,
      directPixelDelta,
      snrBoost,
      label: customLabel || `Shift & Stack activo (${nEp} épocas alineadas en movimiento)`,
    };
    setViewMode("shift_stack");
    setExploreProgress(
      `Shift & Stack completado: μ_α*=${Math.round(pmRaMasYr)} mas/a, μ_δ=${Math.round(pmDecMasYr)} mas/a · Ganancia SNR ~${snrBoost}×.`
    );
  };

  document.getElementById("btn-shift-stack")?.addEventListener("click", () => {
    const pmRa = parseFloat(document.getElementById("input-shift-pmra")?.value || "0") || 0;
    const pmDec = parseFloat(document.getElementById("input-shift-pmdec")?.value || "0") || 0;
    applyShiftAndStack(pmRa, pmDec, null);
  });

  document.getElementById("btn-autotrack-dipole")?.addEventListener("click", () => {
    const movers = isChangesForCurrentField()
      ? (state.changesData.objects || []).filter((o) => o.kind === "moving" || o.kind === "both")
      : [];
    const mover = movers.find((o) => o.id === state.selectedChangeId) || movers[0];
    if (mover && Number.isFinite(mover.motion?.pm_ra_mas_yr)) {
      const pmRa = Math.round(mover.motion.pm_ra_mas_yr);
      const pmDec = Math.round(mover.motion.pm_dec_mas_yr);
      const inRa = document.getElementById("input-shift-pmra");
      const inDec = document.getElementById("input-shift-pmdec");
      if (inRa) inRa.value = String(pmRa);
      if (inDec) inDec.value = String(pmDec);
      applyShiftAndStack(pmRa, pmDec, null,
        `Auto-Track · objeto #${mover.id} (movimiento medido ${fmtNum(mover.motion.pm_total_arcsec_yr, 1)}″/año)`);
      return;
    }
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
      let pmRaMasYr = Math.round((-dxEarlyToLate * arcsecPerPix * 1000.0) / 0.5);
      let pmDecMasYr = Math.round((dyEarlyToLate * arcsecPerPix * 1000.0) / 0.5);

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
    const epochs = state.exploreData?.epochs || [];
    const pairIndices = state.exploreData?.target_info?.analysis_frame_indices || [];
    const selA = document.getElementById("select-epoch-a");
    const selB = document.getElementById("select-epoch-b");
    // Épocas A y B elegidas en «Herramientas avanzadas» (por defecto: primera y última comparables).
    const fallbackA = pairIndices.length >= 2 ? pairIndices[0] : 0;
    const fallbackB = pairIndices.length >= 2 ? pairIndices[pairIndices.length - 1] : Math.max(0, epochs.length - 1);
    const pickedA = selA ? parseInt(selA.value, 10) : NaN;
    const pickedB = selB ? parseInt(selB.value, 10) : NaN;
    const idxA = Number.isInteger(pickedA) ? pickedA : fallbackA;
    const idxB = Number.isInteger(pickedB) ? pickedB : fallbackB;
    if (!Number.isInteger(idxA) || !Number.isInteger(idxB)) return;
    if (op === "blink") {
      state.manualPairIndices = pairIndices.length >= 2 ? [...pairIndices] : [idxA, idxB];
      state.selectedBand = pairIndices.length >= 2 ? "pair" : "manual_pair";
      const bandSelect = document.getElementById("select-band");
      if (bandSelect && state.selectedBand === "pair") bandSelect.value = "pair";
      state.viewerStep = 0;
      state.currentEpochIdx = getSynchronizedTemporalState().correspondingEpochIdx;
      syncViewerSlider();
      setViewMode("blink");
      setUnifiedPlaybackState(true);
      renderContextSkyMap();
      return;
    }
    const manualCanvas = computeManualEpochPairCanvas(idxA, idxB, op);
    if (!manualCanvas) return;
    state.manualOpCanvas = manualCanvas;
    state.manualOpMeta = {
      op,
      idxA,
      idxB,
      count: Math.max(pairIndices.length, state.timelineBlinkFrames?.length || 0, 2),
    };
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

  document.getElementById("btn-plot-spectrum")?.addEventListener("click", () => setSpectrumPlotMode("spectrum"));
  document.getElementById("btn-plot-lightcurve")?.addEventListener("click", () => setSpectrumPlotMode("timeline"));
  document.getElementById("btn-timeline-badge")?.addEventListener("click", () => setSpectrumPlotMode("timeline"));
  document.getElementById("select-timeline-detector")?.addEventListener("change", (e) => {
    state.timelineDetector = e.target.value;
    state.timelineSelectedVisit = null;
    state.timelineBlinkMode = "all";
    state.timelineSelectedKeys = new Set(tlAllAvailableFrameKeys(state.timelineData));
    state.timelineBlinkStep = 0;
    renderTimeline();
  });

  document.getElementById("btn-tl-mode-spherex")?.addEventListener("click", () => setTimelineBlinkMode("spherex"));
  document.getElementById("btn-tl-mode-historic")?.addEventListener("click", () => setTimelineBlinkMode("historic"));
  document.getElementById("btn-tl-mode-all")?.addEventListener("click", () => setTimelineBlinkMode("all"));
  document.getElementById("btn-tl-play")?.addEventListener("click", () => {
    setUnifiedPlaybackState(!state.isPlaying);
  });
  const stepTimelineComparator = () => {
    const frames = state.timelineBlinkFrames || [];
    if (!frames.length) return;
    state.timelineBlinkStep = (state.timelineBlinkStep + 1) % frames.length;
    renderTimelineBlinkFrame(true);
  };
  document.getElementById("btn-tl-step")?.addEventListener("click", stepTimelineComparator);
  document.getElementById("timeline-blink-stage")?.addEventListener("click", stepTimelineComparator);
  document.getElementById("select-tl-fps")?.addEventListener("change", (e) => {
    const fps = parseFloat(e.target.value) || 2;
    state.timelineBlinkFps = fps;
    state.fps = fps;
    const mainFpsSel = document.getElementById("select-fps");
    if (mainFpsSel) mainFpsSel.value = String(Math.round(fps));
    startBlinkTimer();
  });

  document.getElementById("btn-export-csv")?.addEventListener("click", () => {
    if (state.spectrumPlotMode === "timeline") {
      exportTimelineCsv();
      return;
    }
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

  document.getElementById("btn-play-pause").addEventListener("click", () => {
    const nextPlaying = !state.isPlaying;
    if (nextPlaying && !isSequenceBand()) {
      const pairIndices = state.exploreData?.target_info?.analysis_frame_indices || [];
      state.selectedBand = pairIndices.length >= 2 ? "pair" : "auto";
      const bandSelect = document.getElementById("select-band");
      if (bandSelect) bandSelect.value = state.selectedBand;
      syncViewerSlider();
    }
    setUnifiedPlaybackState(nextPlaying);
  });

  document.getElementById("slider-epoch").addEventListener("input", (e) => {
    const value = parseInt(e.target.value, 10) || 0;
    if (isSequenceBand()) {
      // En la animación, el deslizador elige la fecha (sin salir de las fechas comparables).
      state.viewerStep = value;
      state.currentEpochIdx = getSynchronizedTemporalState().correspondingEpochIdx;
    } else {
      state.currentEpochIdx = value;
      state.selectedBand = String(value);
      const bandSelect = document.getElementById("select-band");
      if (bandSelect) bandSelect.value = state.selectedBand;
    }
    renderCanvas();
    renderContextSkyMap();
  });

  document.getElementById("select-band").addEventListener("change", (e) => {
    state.selectedBand = e.target.value;
    const epochs = state.exploreData?.epochs || [];
    state.viewerStep = 0;
    const selectedIndex = isSequenceBand() ? getSynchronizedTemporalState().correspondingEpochIdx : getSelectedBandIndex(epochs);
    state.currentEpochIdx = selectedIndex;
    syncViewerSlider();
    const ep = epochs[selectedIndex];
    const summary = document.getElementById("band-summary");
    if (summary) {
      if (String(state.selectedBand).startsWith("coadd:")) {
        const detCode = String(state.selectedBand).slice(6);
        const dc = state.exploreData?.detector_coadds?.[detCode];
        if (dc) {
          summary.textContent =
            `Suma SNR ${dc.detector}: mediana de ${dc.frame_count} exposiciones ` +
            `(${Number(dc.wavelength_min_um).toFixed(3)}–${Number(dc.wavelength_max_um).toFixed(3)} µm) · ${dc.clean_pixels_pct}% de píxeles limpios.`;
        }
      } else if (state.selectedBand === "pair") {
        const pairIndices = state.exploreData?.target_info?.analysis_frame_indices || [];
        summary.textContent = describeViewerSequence();
      } else if (ep) {
        summary.textContent = state.selectedBand === "auto"
          ? `Automática: ${Number(ep.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(ep.bandwidth_um || 0).toFixed(3)} µm) · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% de píxeles limpios.`
          : `Manual: ${Number(ep.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(ep.bandwidth_um || 0).toFixed(3)} µm) · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% de píxeles limpios.`;
      }
    }
    renderCanvas();
    renderContextSkyMap();
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
    const currentEpochs = state.exploreData?.epochs?.length || 20;
    const nextEpochs = Math.min(102, Math.max(currentEpochs + 6, state.temporalSearch ? 24 : 16));
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
    const fps = parseInt(e.target.value, 10) || 2;
    state.fps = fps;
    state.timelineBlinkFps = fps;
    const tlFpsSel = document.getElementById("select-tl-fps");
    if (tlFpsSel) tlFpsSel.value = String(fps);
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
    if (state.blinkTimer) {
      clearInterval(state.blinkTimer);
      state.blinkTimer = null;
    }
    state.viewMode = "blink";
    try {
      const stream = canvas.captureStream(0);
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
      state.viewMode = savedMode;
      state.selectedBand = savedBand;
      state.currentEpochIdx = savedEpochIdx;
      const selBand = document.getElementById("select-band");
      if (selBand) selBand.value = savedBand;
      syncViewerSlider();
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

  await exploreCoordinates(state.ra, state.dec, state.fov, initial.temporalSearch ? 24 : 20, initial.temporalSearch);
  startBlinkTimer();
});
