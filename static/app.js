/**
 * Frontend v2.4 - Papastronomy SPHEREx & Planet X Explorer.
 * Conectado a recortes .FITS reales de NASA/IPAC IRSA (128x128 px),
 * visor multi-época en loop para Flipbook, Resta (ΔI) y Suma SNR,
 * y visor interactivo de Contexto Multi-Catálogo (Gaia DR3 + AllWISE).
 */

const CUTOUT_NPIX = 128.0;

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
  showAIMarkers: true,
  showFlags: false,
  selectedPixel: { x: 64, y: 64 },
  selectedDetectionId: null,
  epochImages: [],
  flagImages: [],
  coaddImage: null,
  diffImage: null,
  exploreController: null,
  spectrumController: null,
  exploreSequence: 0,
  spectrumSequence: 0,
  isLoading: false,
  catalogStatus: {},
  temporalSearch: false,
  showGaiaCat: true,
  showWiseCat: true,
  crossmatchByDetId: {},
  skyView: {
    centerRa: 133.795129,
    centerDec: -7.245147,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    moved: false,
    hoverRa: null,
    hoverDec: null,
    gaiaSources: [],
    wiseSources: [],
    colorSkyCanvas: null,
  },
};

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
  };
}

function syncUrlParams(ra, dec, fov, temporalSearch = false) {
  const url = new URL(window.location);
  url.searchParams.set("ra", Number(ra).toFixed(6));
  url.searchParams.set("dec", Number(dec).toFixed(6));
  url.searchParams.set("fov", Number(fov).toFixed(4));
  if (temporalSearch) url.searchParams.set("temporal", "1");
  else url.searchParams.delete("temporal");
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

// ----------------------------------------------------------------------------
// Visor Multi-Catálogo Interactivo (Gaia DR3 + AllWISE + Compuesto Infrarrojo)
// ----------------------------------------------------------------------------
function initAladinLite(ra, dec, fov) {
  state.skyView.centerRa = ra;
  state.skyView.centerDec = dec;
  state.skyView.zoom = 1.0;
  state.skyView.panX = 0;
  state.skyView.panY = 0;

  const skyCanvas = document.getElementById("aladin-canvas");
  if (!skyCanvas) return;

  const btnZoomIn = document.getElementById("aladin-zoom-in");
  const btnZoomOut = document.getElementById("aladin-zoom-out");

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      state.skyView.zoom = Math.min(5.0, +(state.skyView.zoom * 1.35).toFixed(2));
      renderContextSkyMap();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      state.skyView.zoom = Math.max(0.75, +(state.skyView.zoom / 1.35).toFixed(2));
      if (state.skyView.zoom <= 1.05) {
        state.skyView.panX = 0;
        state.skyView.panY = 0;
      }
      renderContextSkyMap();
    });
  }

  skyCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      state.skyView.zoom = Math.min(5.0, Math.max(0.75, +(state.skyView.zoom * factor).toFixed(2)));
      renderContextSkyMap();
    },
    { passive: false }
  );

  skyCanvas.addEventListener("mousedown", (e) => {
    state.skyView.isDragging = true;
    state.skyView.moved = false;
    state.skyView.dragStartX = e.clientX - state.skyView.panX;
    state.skyView.dragStartY = e.clientY - state.skyView.panY;
  });

  window.addEventListener("mouseup", () => {
    state.skyView.isDragging = false;
  });

  skyCanvas.addEventListener("mousemove", (e) => {
    const rect = skyCanvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * skyCanvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * skyCanvas.height;

    if (state.skyView.isDragging) {
      const nx = e.clientX - state.skyView.dragStartX;
      const ny = e.clientY - state.skyView.dragStartY;
      if (Math.hypot(nx - state.skyView.panX, ny - state.skyView.panY) > 3) {
        state.skyView.moved = true;
      }
      state.skyView.panX = Math.max(-160, Math.min(160, nx));
      state.skyView.panY = Math.max(-160, Math.min(160, ny));
      renderContextSkyMap();
      return;
    }

    const { xPix, yPix } = skyCanvasToFITS(cx, cy, skyCanvas.width);
    const coords = pixelToRaDec(xPix, yPix);
    state.skyView.hoverRa = coords.ra;
    state.skyView.hoverDec = coords.dec;
    const coordsEl = document.getElementById("aladin-hud-coords");
    if (coordsEl) {
      coordsEl.textContent = `Cursor RA: ${coords.ra.toFixed(5)}° | Dec: ${coords.dec.toFixed(5)}°`;
    }
  });

  skyCanvas.addEventListener("mouseleave", () => {
    const coordsEl = document.getElementById("aladin-hud-coords");
    if (coordsEl) {
      coordsEl.textContent = `Centro RA: ${state.skyView.centerRa.toFixed(5)}° | Dec: ${state.skyView.centerDec.toFixed(5)}°`;
    }
  });

  skyCanvas.addEventListener("click", (e) => {
    if (state.skyView.moved || state.isLoading || !state.exploreData) return;
    const rect = skyCanvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * skyCanvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * skyCanvas.height;
    const { xPix, yPix } = skyCanvasToFITS(cx, cy, skyCanvas.width);
    if (xPix < 0 || xPix >= CUTOUT_NPIX || yPix < 0 || yPix >= CUTOUT_NPIX) return;

    state.selectedDetectionId = null;
    state.selectedPixel = { x: xPix, y: yPix };
    updateAIDetectionCardsSelection();
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const coords = pixelToRaDec(xPix, yPix);
    fetchAndRenderSpectrum(coords.ra, coords.dec, true);
  });

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

function buildCatalogSourcesFromField() {
  if (!state.coaddImage) return;
  const w = 128;
  const h = 128;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  ctx.drawImage(state.coaddImage, 0, 0, w, h);
  const coaddData = ctx.getImageData(0, 0, w, h).data;

  let earlyData = coaddData;
  let lateData = coaddData;
  if (state.epochImages.length >= 2) {
    const cEarly = document.createElement("canvas");
    cEarly.width = w;
    cEarly.height = h;
    cEarly.getContext("2d").drawImage(state.epochImages[0], 0, 0, w, h);
    earlyData = cEarly.getContext("2d").getImageData(0, 0, w, h).data;

    const cLate = document.createElement("canvas");
    cLate.width = w;
    cLate.height = h;
    cLate.getContext("2d").drawImage(state.epochImages[state.epochImages.length - 1], 0, 0, w, h);
    lateData = cLate.getContext("2d").getImageData(0, 0, w, h).data;
  }

  // Calcular mediana del canal rojo para estirar el contraste del mapa multi-catálogo
  const redVals = [];
  for (let i = 0; i < coaddData.length; i += 4) {
    if (coaddData[i] > 0) redVals.push(coaddData[i]);
  }
  redVals.sort((a, b) => a - b);
  const med = redVals.length ? redVals[Math.floor(redVals.length * 0.5)] : 45;
  const p85 = redVals.length ? redVals[Math.floor(redVals.length * 0.85)] : 90;
  const threshold = Math.max(med + 8, Math.min(85, p85));

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = w;
  colorCanvas.height = h;
  const colorCtx = colorCanvas.getContext("2d");
  const colorImg = colorCtx.createImageData(w, h);
  for (let i = 0; i < coaddData.length; i += 4) {
    const vEarly = earlyData[i];
    const vMid = coaddData[i];
    const vLate = lateData[i];
    const boost = Math.max(0, vMid - med * 0.65) * 1.35;
    colorImg.data[i] = Math.min(255, Math.round(vLate * 0.7 + boost * 0.75 + 8));
    colorImg.data[i + 1] = Math.min(255, Math.round(vMid * 0.65 + boost * 0.65 + 14));
    colorImg.data[i + 2] = Math.min(255, Math.round(vEarly * 0.75 + boost * 0.8 + 28));
    colorImg.data[i + 3] = 255;
  }
  colorCtx.putImageData(colorImg, 0, 0);
  state.skyView.colorSkyCanvas = colorCanvas;

  state.skyView.gaiaSources = [];
  state.skyView.wiseSources = [];
}

async function loadFieldCatalogs(sequence) {
  state.catalogStatus = { gaia: "consultando", allwise: "consultando" };
  const refreshBadge = () => {
    document.getElementById("aladin-catalog-badge").textContent =
      `Gaia: ${state.catalogStatus.gaia} · WISE: ${state.catalogStatus.allwise}`;
  };
  refreshBadge();
  await Promise.all(["gaia", "allwise"].map(async (catalog) => {
    try {
      const res = await fetch(`/api/catalog?catalog=${catalog}&ra=${state.ra}&dec=${state.dec}&fov=${state.fov}`,
        { signal: state.exploreController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (sequence !== state.exploreSequence) return;
      const sources = data.sources.map((src) => ({ ...src, ...raDecToPixel(src.ra, src.dec), w1: src.mag }));
      state.skyView[catalog === "gaia" ? "gaiaSources" : "wiseSources"] = sources;
      state.catalogStatus[catalog] = `${sources.length}${data.truncated ? "+" : ""} · ${data.service || "catálogo"}`;
    } catch (error) {
      if (sequence !== state.exploreSequence || error.name === "AbortError") return;
      state.catalogStatus[catalog] = "no disponible";
    }
    refreshBadge();
    updateCatalogSelectionSummary();
    renderContextSkyMap();
  }));
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
  const canvas = document.getElementById("aladin-canvas");
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
  updateCatalogSelectionSummary();
  renderContextSkyMap();
}

function renderContextSkyMap() {
  const canvas = document.getElementById("aladin-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, W, H);

  // 1. Dibujar mapa de cielo infrarrojo con el zoom y paneo actuales
  if (state.skyView.colorSkyCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const half = W / 2;
    ctx.translate(half + state.skyView.panX, half + state.skyView.panY);
    ctx.scale(state.skyView.zoom, state.skyView.zoom);
    ctx.translate(-half, -half);
    ctx.drawImage(state.skyView.colorSkyCanvas, 0, 0, W, H);
    ctx.restore();
  }

  // 2. Grilla astrométrica ICRS (RA / Dec) con etiquetas de grados
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.20)";
  ctx.fillStyle = "rgba(148, 163, 184, 0.78)";
  ctx.font = "10px monospace";
  ctx.lineWidth = 1;
  const gridSteps = [24, 64, 104];
  gridSteps.forEach((gp) => {
    const p1 = fitsToSkyCanvas(gp, 0, W);
    const p2 = fitsToSkyCanvas(gp, CUTOUT_NPIX - 1, W);
    ctx.beginPath();
    ctx.moveTo(p1.cx, 0);
    ctx.lineTo(p2.cx, H);
    ctx.stroke();

    const coordRa = pixelToRaDec(gp, 64).ra;
    if (p1.cx > 24 && p1.cx < W - 44) {
      ctx.fillText(`${coordRa.toFixed(3)}°`, p1.cx + 3, 48);
    }

    const q1 = fitsToSkyCanvas(0, gp, W);
    const q2 = fitsToSkyCanvas(CUTOUT_NPIX - 1, gp, W);
    ctx.beginPath();
    ctx.moveTo(0, q1.cy);
    ctx.lineTo(W, q2.cy);
    ctx.stroke();

    const coordDec = pixelToRaDec(64, gp).dec;
    if (q1.cy > 56 && q1.cy < H - 48) {
      ctx.fillText(`${coordDec.toFixed(3)}°`, 6, q1.cy - 3);
    }
  });
  ctx.restore();

  // 3. Superponer fuentes del catálogo AllWISE (rombos ámbar)
  if (state.showWiseCat && state.skyView.wiseSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.6;
    state.skyView.wiseSources.forEach((src) => {
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      const r = 6.5;
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

  // 4. Superponer fuentes del catálogo Gaia DR3 (círculos celestes)
  if (state.showGaiaCat && state.skyView.gaiaSources.length > 0) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.6;
    state.skyView.gaiaSources.forEach((src) => {
      const { cx, cy } = fitsToSkyCanvas(src.x, src.y, W);
      if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // 5. Superponer detecciones IA (Dipolos y Variables)
  if (state.exploreData && state.exploreData.ai_detections) {
    state.exploreData.ai_detections.forEach((det) => {
      const { cx, cy } = fitsToSkyCanvas(det.x_pix, det.y_pix, W);
      const isSelected = state.selectedDetectionId === det.id;
      ctx.save();

      if (det.type === "MOVING_DIPOLE" && det.neg_x_pix !== null && det.neg_y_pix !== null) {
        const negPt = fitsToSkyCanvas(det.neg_x_pix, det.neg_y_pix, W);
        ctx.strokeStyle = "#fb7185";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(negPt.cx, negPt.cy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }

      ctx.strokeStyle = isSelected
        ? "#10b981"
        : det.type === "MOVING_DIPOLE"
        ? "#fb7185"
        : "#fde047";
      ctx.lineWidth = isSelected ? 2.8 : 1.8;
      ctx.setLineDash(isSelected ? [] : [3, 2]);
      ctx.beginPath();
      ctx.arc(cx, cy, isSelected ? 14 : 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isSelected ? "#6ee7b7" : "#fda4af";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`#${det.id}`, cx + 12, cy - 4);
      ctx.restore();
    });
  }

  // 6. Retícula del píxel/objeto seleccionado
  if (state.selectedPixel) {
    const { cx, cy } = fitsToSkyCanvas(state.selectedPixel.x, state.selectedPixel.y, W);
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy);
    ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();
    ctx.restore();
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
  if (state.selectedBand === "auto") {
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
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const epochs = state.exploreData.epochs || [];
  const epIdx = getSelectedBandIndex(epochs);
  let baseImg = null;

  if (state.viewMode === "diff") {
    baseImg = state.diffImage;
  } else if (state.viewMode === "coadd") {
    baseImg = state.coaddImage;
  } else if (state.epochImages.length > 0) {
    baseImg = state.epochImages[epIdx];
  }

  if (baseImg) {
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
  }

  if (state.showFlags && state.flagImages.length > 0) {
    const flgImg = state.flagImages[epIdx % state.flagImages.length];
    if (flgImg) {
      ctx.drawImage(flgImg, 0, 0, canvas.width, canvas.height);
    }
  }

  const scale = canvas.width / CUTOUT_NPIX;

  if (state.showAIMarkers && state.exploreData.ai_detections
      && (state.viewMode !== "blink" || state.exploreData.target_info.analysis_frame_indices.includes(epIdx))) {
    state.exploreData.ai_detections.forEach((det) => {
      const cx = (det.x_pix + 0.5) * scale;
      const cy = (CUTOUT_NPIX - 1.0 - det.y_pix + 0.5) * scale;
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
          const nx = (det.neg_x_pix + 0.5) * scale;
          const ny = (CUTOUT_NPIX - 1.0 - det.neg_y_pix + 0.5) * scale;

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

  if (state.selectedPixel) {
    const sx = (state.selectedPixel.x + 0.5) * scale;
    const sy = (CUTOUT_NPIX - 1.0 - state.selectedPixel.y + 0.5) * scale;
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

  if (epochs.length > 0) {
    const ep = epochs[epIdx];
    const totalEpochs = state.exploreData.target_info.total_epochs || epochs.length;
    const epochLabel = `Época temporal ${ep.epoch_id + 1}/${totalEpochs}`;
    const bandLabel = `${Number(ep.wavelength_center_um).toFixed(3)} µm · ${ep.detector || "detector"}`;
    document.getElementById("frame-counter").textContent =
      state.viewMode === "blink"
        ? `${epochLabel} · ${bandLabel}`
        : state.viewMode === "diff"
        ? "Resta temporal · bandas comparables"
        : "Mediana · bandas comparables";
    if (state.viewMode === "blink") {
      const mjd = Number(ep.obs_time);
      const date = ep.obs_time && Number.isFinite(mjd)
        ? new Date((mjd - 40587) * 86400000).toISOString().replace("T", " ").slice(0, 19) + " UTC"
        : ep.obs_time || "sin fecha";
      document.getElementById("overlay-date").textContent = `Fecha: ${date}`;
      document.getElementById("overlay-clean").textContent = `Píxeles limpios: ${ep.clean_pixels_pct}%`;
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

function startBlinkTimer() {
  if (state.timerId) clearInterval(state.timerId);
  if (!state.isPlaying) return;
  const intervalMs = Math.round(1000 / state.fps);
  state.timerId = setInterval(() => {
    if (!state.isLoading && state.viewMode === "blink" && state.selectedBand === "auto"
        && state.exploreData?.epochs?.length > 0) {
      state.currentEpochIdx = (state.currentEpochIdx + 1) % state.exploreData.epochs.length;
      document.getElementById("slider-epoch").value = state.currentEpochIdx;
      renderCanvas();
    }
  }, intervalMs);
}

function updateAIDetectionCardsSelection() {
  document.querySelectorAll("[data-detection-id]").forEach((card) => {
    const detId = parseInt(card.dataset.detectionId, 10);
    const isSelected = detId === state.selectedDetectionId;
    const badgeEl = card.querySelector(".selected-det-badge");
    if (isSelected) {
      card.classList.add("ring-2", "ring-emerald-400", "bg-slate-800/90");
      if (badgeEl) badgeEl.classList.remove("hidden");
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
  badge.textContent = `${detections.length} anomalía${detections.length === 1 ? "" : "s"}`;

  if (detections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-xs text-slate-400 p-3 bg-slate-900/60 rounded-lg border border-slate-800";
    empty.textContent = state.exploreData?.target_info?.difference_available
      ? "No se detectaron anomalías > 4σ en la resta preliminar calibrada."
      : state.exploreData?.target_info?.analysis_note || "Resta temporal no disponible.";
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
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs font-bold mb-1 gap-1">
        <span class="${isDipole ? "text-rose-300" : "text-amber-300"}">
          #${det.id} · ${isDipole ? "DIPOLO CANDIDATO" : "MONOPOLO VARIABLE"}
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
      <div class="text-[11px] font-mono text-slate-300 mb-1">
        RA: ${det.ra.toFixed(5)}° | Dec: ${det.dec.toFixed(5)}° · Píxel (${det.x_pix.toFixed(1)}, ${det.y_pix.toFixed(1)})
      </div>
      <p class="detection-description text-[11px] text-slate-400 leading-snug"></p>
    `;
    card.querySelector(".detection-description").textContent = det.description;
    const sequence = state.exploreSequence;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); }
    });
    if (idx < 3) {
      const line = document.createElement("p");
      line.className = "text-[11px] text-slate-500 leading-snug mt-1";
      line.textContent = "Consultando Gaia DR3 / AllWISE...";
      card.appendChild(line);
      fetch(`/api/crossmatch?ra=${det.ra}&dec=${det.dec}&radius=14`, { signal: state.exploreController.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((res) => {
          if (sequence !== state.exploreSequence) return;
          if (res.catalog_match) {
            const matchText = `Cruce catálogo: ${res.catalog_match}`;
            line.textContent = matchText;
            line.className = "text-[11px] text-emerald-300 leading-snug mt-1";
            state.crossmatchByDetId[det.id] = matchText;
          } else {
            const noMatchText = "Sin coincidencia en 14\"; requiere revisión";
            line.textContent = noMatchText;
            line.className = "text-[11px] text-amber-300 leading-snug mt-1";
            state.crossmatchByDetId[det.id] = noMatchText;
          }
          if (state.selectedDetectionId === det.id) {
            updateCatalogSelectionSummary();
          }
        })
        .catch(() => {
          line.textContent = "No se pudo completar el cruce con catálogos.";
        });
    }
    card.addEventListener("click", () => {
      state.selectedDetectionId = det.id;
      state.selectedPixel = { x: det.x_pix, y: det.y_pix };
      updateAIDetectionCardsSelection();
      renderCanvas();
      updateAladinView(det.ra, det.dec, state.fov);
      fetchAndRenderSpectrum(det.ra, det.dec, true);
    });
    container.appendChild(card);
  });

  updateAIDetectionCardsSelection();
}

async function fetchAndRenderSpectrum(pointRa, pointDec, keepSelectedPixel = false) {
  if (state.isLoading) return;
  const sequence = ++state.spectrumSequence;
  state.spectrumController?.abort();
  state.spectrumController = new AbortController();
  document.getElementById("spectrum-coord-label").textContent = "Midiendo espectro de la posición seleccionada…";
  try {
    const url = `/api/spectrum?ra=${pointRa}&dec=${pointDec}&center_ra=${state.ra}&center_dec=${state.dec}&fov=${state.fov}&max_epochs=${state.exploreData?.epochs?.length || 10}&temporal_search=${state.temporalSearch}`;
    const res = await fetch(url, { signal: state.spectrumController.signal });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (sequence !== state.spectrumSequence) return;

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

function populateBandSelector(epochs, targetInfo) {
  const select = document.getElementById("select-band");
  const summary = document.getElementById("band-summary");
  if (!select) return;
  select.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = `Secuencia automática · inicia en mejor cobertura${targetInfo.best_band_clean_pct != null ? ` (${targetInfo.best_band_clean_pct}%)` : ""}`;
  select.appendChild(auto);
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
  select.value = "auto";
  state.selectedBand = "auto";
  state.currentEpochIdx = targetInfo.best_band_index || 0;
  if (summary) {
    const best = targetInfo.best_band_index;
    const bestEp = Number.isInteger(best) ? epochs[best] : null;
    const loadedBands = Number.isInteger(targetInfo.total_bands) && targetInfo.total_bands > 0
      ? targetInfo.total_bands
      : epochs.length;
    summary.textContent = bestEp
      ? `Automática: ${Number(bestEp.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(bestEp.bandwidth_um || 0).toFixed(3)} µm) · ${bestEp.detector || "detector"} · ${bestEp.clean_pixels_pct}% de píxeles limpios · ${loadedBands} bandas cargadas.`
      : `Automática: no se pudo determinar una longitud de onda válida · ${loadedBands} bandas cargadas.`;
  }
}

function setExploreBusy(busy) {
  state.isLoading = busy;
  document.querySelectorAll("#coord-form input, #coord-form button[type=submit], .preset-btn, #btn-load-102-bands, #btn-temporal-search, #select-band, #slider-epoch")
    .forEach((el) => { el.disabled = busy; });
  document.getElementById("coord-form").setAttribute("aria-busy", String(busy));
  document.getElementById("coord-form").querySelector("button[type=submit]").textContent = busy ? "Procesando…" : "Explorar Cielo";
}

async function exploreCoordinates(ra, dec, fov, maxEpochs = 10, temporalSearch = false, refresh = false) {
  ra = Number(ra); dec = Number(dec); fov = Number(fov);
  if (![ra, dec, fov].every(Number.isFinite) || ra < 0 || ra > 360 || dec < -90 || dec > 90 || fov <= 0.005 || fov > 1) {
    setExploreProgress("Revisá las coordenadas: RA 0–360°, Dec −90–90°, FoV entre 0.005° y 1°.");
    return;
  }
  const sequence = ++state.exploreSequence;
  state.exploreController?.abort();
  state.spectrumController?.abort();
  state.spectrumSequence++;
  state.exploreController = new AbortController();
  const controller = state.exploreController;
  const timeout = setTimeout(() => controller.abort(), 240000);
  setExploreBusy(true);
  const stopLoading = showLoading("Consultando IRSA y procesando recortes FITS…");
  try {
    const res = await fetch(`/api/explore?ra=${ra}&dec=${dec}&fov=${fov}&max_epochs=${maxEpochs}&temporal_search=${temporalSearch}&refresh=${refresh}`, { signal: state.exploreController.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    const [images, flags, coadd, diff] = await Promise.all([
      Promise.all(data.epochs.map((ep) => loadImagePromise(ep.image_base64))),
      Promise.all(data.epochs.map((ep) => loadImagePromise(ep.flags_base64))),
      loadImagePromise(data.coadd_image_base64), loadImagePromise(data.diff_image_base64),
    ]);
    if (sequence !== state.exploreSequence) return;
    Object.assign(state, { ra, dec, fov, exploreData: data, epochImages: images, flagImages: flags,
      coaddImage: coadd, diffImage: diff, crossmatchByDetId: {}, temporalSearch });
    document.getElementById("input-ra").value = ra.toFixed(6);
    document.getElementById("input-dec").value = dec.toFixed(6);
    document.getElementById("input-fov").value = fov.toFixed(4);
    syncUrlParams(ra, dec, fov, temporalSearch);
    populateBandSelector(data.epochs, data.target_info);
    const slider = document.getElementById("slider-epoch");
    slider.max = Math.max(0, data.epochs.length - 1);
    slider.value = state.currentEpochIdx;
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.classList.toggle("target-btn-active", btn.dataset.target === data.target_info.matched_target_id);
    });
    document.getElementById("badge-datasource").textContent =
      `${data.target_info.data_source} · ${data.target_info.total_frames} recortes`;
    document.getElementById("analysis-note").textContent = data.target_info.analysis_note;
    document.getElementById("mode-diff").disabled = !data.target_info.difference_available;
    if (state.viewMode === "diff" && !data.target_info.difference_available) setViewMode("blink");
    buildCatalogSourcesFromField();
    const top = data.ai_detections?.[0];
    state.selectedDetectionId = top?.id || null;
    state.selectedPixel = top ? { x: top.x_pix, y: top.y_pix } : { x: 63.5, y: 63.5 };
    renderAIDetectionsList(data.ai_detections || []);
    state.skyView.zoom = 1;
    updateAladinView(ra, dec, fov);
    renderCanvas();
    setExploreBusy(false);
    setExploreProgress(data.target_info.matched_description || `Región RA=${ra.toFixed(4)}°, Dec=${dec.toFixed(4)}° lista.`);
    void loadFieldCatalogs(sequence);
    await fetchAndRenderSpectrum(top?.ra ?? ra, top?.dec ?? dec, Boolean(top));
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
  ["blink", "diff", "coadd"].forEach((m) => {
    const btn = document.getElementById(`mode-${m}`);
    btn.className =
      m === mode
        ? "px-2.5 py-1 rounded-md bg-sky-500 text-slate-950 font-semibold"
        : "px-2.5 py-1 rounded-md text-slate-300 hover:text-white";
  });
  const diffLegend = document.getElementById("diff-legend");
  mode === "diff" ? diffLegend.classList.remove("hidden") : diffLegend.classList.add("hidden");
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
    const ra = parseFloat(document.getElementById("input-ra").value);
    const dec = parseFloat(document.getElementById("input-dec").value);
    const fov = parseFloat(document.getElementById("input-fov").value);
    exploreCoordinates(ra, dec, fov);
  });

  document.getElementById("btn-share-url").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(window.location.href); }
    catch { setExploreProgress("No se pudo copiar. Copiá el enlace desde la barra de direcciones."); return; }
    const btn = document.getElementById("btn-share-url");
    const orig = btn.innerHTML;
    btn.innerHTML = "<span>URL Copiada</span>";
    setTimeout(() => (btn.innerHTML = orig), 1800);
  });

  document.getElementById("mode-blink").addEventListener("click", () => setViewMode("blink"));
  document.getElementById("mode-diff").addEventListener("click", () => setViewMode("diff"));
  document.getElementById("mode-coadd").addEventListener("click", () => setViewMode("coadd"));

  document.getElementById("btn-play-pause").addEventListener("click", (e) => {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
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
    if (summary && ep) {
      summary.textContent = state.selectedBand === "auto"
        ? `Automática: ${Number(ep.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(ep.bandwidth_um || 0).toFixed(3)} µm) · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% de píxeles limpios.`
        : `Manual: ${Number(ep.wavelength_center_um).toFixed(3)} µm (Δλ ${Number(ep.bandwidth_um || 0).toFixed(3)} µm) · ${ep.detector || "detector"} · ${ep.clean_pixels_pct}% de píxeles limpios.`;
    }
    renderCanvas();
  });

  document.getElementById("btn-temporal-search").addEventListener("click", () => {
    exploreCoordinates(Number(document.getElementById("input-ra").value),
      Number(document.getElementById("input-dec").value), Number(document.getElementById("input-fov").value), 24, true, true);
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

  document.getElementById("chk-ai-markers").addEventListener("change", (e) => {
    state.showAIMarkers = e.target.checked;
    renderCanvas();
  });

  document.getElementById("chk-flags").addEventListener("change", (e) => {
    state.showFlags = e.target.checked;
    renderCanvas();
  });

  document.getElementById("chk-gaia").addEventListener("change", (e) => {
    state.showGaiaCat = e.target.checked;
    renderContextSkyMap();
  });

  document.getElementById("chk-wise").addEventListener("change", (e) => {
    state.showWiseCat = e.target.checked;
    renderContextSkyMap();
  });

  document.getElementById("btn-recenter-aladin").addEventListener("click", (e) => {
    state.skyView.zoom = 1.0;
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

  const canvas = document.getElementById("spherex-canvas");
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (state.isLoading || !state.exploreData) return;
    const x_pix = Math.max(0, Math.min(127, (clickX / rect.width) * CUTOUT_NPIX - 0.5));
    const y_pix = Math.max(0, Math.min(127, CUTOUT_NPIX - 0.5 - (clickY / rect.height) * CUTOUT_NPIX));

    state.selectedDetectionId = null;
    state.selectedPixel = { x: x_pix, y: y_pix };
    updateAIDetectionCardsSelection();
    renderCanvas();
    updateCatalogSelectionSummary();
    renderContextSkyMap();

    const coords = pixelToRaDec(x_pix, y_pix);
    fetchAndRenderSpectrum(coords.ra, coords.dec, true);
  });

  await exploreCoordinates(state.ra, state.dec, state.fov, initial.temporalSearch ? 24 : 10, initial.temporalSearch);
  startBlinkTimer();
});
