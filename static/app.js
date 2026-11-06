/**
 * Frontend v2.4 - Papastronomy SPHEREx & Planet X Explorer.
 * Conectado a recortes .FITS reales de NASA/IPAC IRSA (128x128 px),
 * visor multi-época en loop para Flipbook, Resta (ΔI) y Suma SNR,
 * y visor interactivo de Contexto Multi-Catálogo (Gaia DR3 + AllWISE).
 */

const CUTOUT_NPIX = 128.0;
const TILE_STEP_PIX = 96.0;
const TILE_MARGIN_PIX = (CUTOUT_NPIX - TILE_STEP_PIX) / 2;
const DEFAULT_SKY_ZOOM = +(CUTOUT_NPIX / TILE_STEP_PIX).toFixed(4);
const MAX_CONCURRENT_TILE_FETCHES = 2;

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
  showNamedObjects: false,
  selectedNamedObjectId: null,
  hoveredNamedObjectId: null,
  showGaiaCat: true,
  showWiseCat: true,
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
  if (rect.fullCutout) {
    ctx.drawImage(img, 0, 0, CUTOUT_NPIX, CUTOUT_NPIX, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  ctx.drawImage(
    img,
    TILE_MARGIN_PIX,
    TILE_MARGIN_PIX,
    TILE_STEP_PIX,
    TILE_STEP_PIX,
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
  const z = Math.max(0.0, snr + 0.55);
  const norm = Math.min(1.0, Math.asinh(z / 2.2) / Math.asinh(14.0));
  return Math.min(255, Math.max(0, Math.round(norm * 255)));
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
  for (let idx = 0; idx < w * h; idx++) {
    const sMid = blendMid[idx];
    const sEarly = blendEarly[idx];
    const sLate = blendLate[idx];
    const sLum = Math.max(0.0, 0.25 * sEarly + 0.50 * sMid + 0.25 * sLate + 0.55);
    const lum = Math.min(1.0, Math.asinh(sLum / 2.0) / Math.asinh(13.5));

    const sourceWeight = Math.min(1.0, Math.max(0.0, (sLum - 1.1) / 2.6));
    const colorIndex = Math.max(-1.0, Math.min(1.0, (sLate - sEarly) * 0.22)) * sourceWeight;

    const baseR = 7 + lum * 242;
    const baseG = 11 + lum * 236;
    const baseB = 22 + lum * 233;

    const i = idx * 4;
    colorImg.data[i] = Math.min(255, Math.max(0, Math.round(baseR + colorIndex * 46)));
    colorImg.data[i + 1] = Math.min(255, Math.max(0, Math.round(baseG - Math.abs(colorIndex) * 10)));
    colorImg.data[i + 2] = Math.min(255, Math.max(0, Math.round(baseB - colorIndex * 46)));
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

  // 1. Precargar de inmediato el paquete ligero de estrellas y catálogos en un radio 3x mayor
  void prefetchWideCatalogsAndStars(state.skyView.centerRa, state.skyView.centerDec, sequence);

  // 2. Encolar sectores FITS visibles + sectores vecinos predictivos en la dirección del movimiento
  if (state.prefetchTimerId) clearTimeout(state.prefetchTimerId);
  state.prefetchTimerId = setTimeout(() => {
    if (sequence !== state.exploreSequence) return;
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
  }, 90);
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
        const activeObj = (state.skyView.namedObjects || []).find((o) => o.id === state.selectedNamedObjectId);
        if (activeObj) showNamedObjectDetail(activeObj);
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
      const activeObj = (state.skyView.namedObjects || []).find((o) => o.id === state.selectedNamedObjectId);
      if (activeObj) showNamedObjectDetail(activeObj);
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

function buildCatalogSourcesFromField() {
  const visuals = createTileVisualCanvases(state.coaddImage, state.epochImages, 0, 0);
  state.originVisualGrids = visuals.visualGrids || null;
  state.skyView.colorSkyCanvas = visuals.colorCanvas;
  if (visuals.healedCoaddCanvas) state.coaddImage = visuals.healedCoaddCanvas;
  if (visuals.normalizedEpochs?.length) state.epochImages = visuals.normalizedEpochs;
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
    btn.addEventListener("mouseenter", () => {
      state.hoveredNamedObjectId = obj.id;
      showNamedObjectDetail(obj);
      renderContextSkyMap();
      renderCanvas();
    });
    btn.addEventListener("mouseleave", () => {
      state.hoveredNamedObjectId = null;
      const activeObj = objects.find((o) => o.id === state.selectedNamedObjectId) || objects[0];
      if (activeObj) showNamedObjectDetail(activeObj);
      renderContextSkyMap();
      renderCanvas();
    });
    btn.addEventListener("click", () => {
      state.selectedNamedObjectId = obj.id;
      showNamedObjectDetail(obj);
      renderNamedObjectsPanel();
      state.selectedDetectionId = null;
      state.selectedPixel = { x: obj.x, y: obj.y };
      updateAIDetectionCardsSelection();
      updateAladinView(obj.ra, obj.dec, state.fov);
      renderCanvas();
      const tileGx = Math.floor((obj.x + 0.5) / CUTOUT_NPIX);
      const tileGy = Math.floor((obj.y + 0.5) / CUTOUT_NPIX);
      const tileCenter = getTileCenterCoords(tileGx, tileGy);
      fetchAndRenderSpectrum(obj.ra, obj.dec, true, tileCenter.ra, tileCenter.dec);
    });
    listEl.appendChild(btn);
  });

  const activeObj = objects.find((o) => o.id === state.selectedNamedObjectId) || objects[0];
  if (activeObj) {
    state.selectedNamedObjectId = activeObj.id;
    showNamedObjectDetail(activeObj);
  }
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
    const snapped = snapGlobalPixelToTilePeak(rawPos.x, rawPos.y, 22, 0.65);
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
    map.set(obj.id, {
      ...obj,
      catalogRa,
      catalogDec,
      ...pos,
      in_fov: true,
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
  const minStep = state.fov * 0.55;
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

  const objectsPromise = (async () => {
    try {
      const res = await fetch(`/api/objects?ra=${state.ra}&dec=${state.dec}&fov=${state.fov}`,
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
        const res = await fetch(`/api/catalog?catalog=${catalog}&ra=${state.ra}&dec=${state.dec}&fov=${state.fov}`,
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

  // Expandir el paquete de estrellas y catálogos a sectores vecinos (3x FoV) solo si el Mapa Global está activo
  if (sequence === state.exploreSequence && state.infinitePlaneEnabled) {
    state.catalogCentersQueried = [];
    void prefetchWideCatalogsAndStars(state.ra, state.dec, sequence);
  }
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

  // 1. Dibujar todos los sectores del mosaico continuo infrarrojo visibles en pantalla
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let gy = gyMin; gy <= gyMax; gy++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const rect = getTileCanvasRect(gx, gy, W);
      const tile = state.tileGrid.get(`${gx},${gy}`);
      const isOrigin = gx === 0 && gy === 0;
      const colorImg = (tile && tile.status === "ready")
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
      const ringColor = isHovered ? "#34d399" : hasPlanets ? "#a78bfa" : "#fde047";

      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = isHovered || isSelected ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, isHovered ? 9 : 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (isHovered || state.showNamedObjects) {
        const labelText = hasPlanets
          ? `${obj.name} · ${obj.planets.length} planeta${obj.planets.length === 1 ? "" : "s"}`
          : obj.name;
        drawTagAbovePoint(
          ctx,
          cx,
          cy,
          labelText,
          ringColor,
          isHovered ? "#6ee7b7" : hasPlanets ? "#ddd6fe" : "#fef08a",
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
  const W = canvas.width;
  const H = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#030712";
  ctx.fillRect(0, 0, W, H);

  const epochs = state.exploreData.epochs || [];
  const epIdx = getSelectedBandIndex(epochs);
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
        } else if (state.viewMode === "coadd") {
          baseImg = tCoadd;
        } else if (tEpochs && tEpochs.length > 0) {
          const tileEpIdx = isOrigin ? epIdx : state.currentEpochIdx % tEpochs.length;
          baseImg = tEpochs[tileEpIdx];
        }

        if (state.viewMode === "blink" && tCoadd && baseImg !== tCoadd) {
          drawSeamlessTileImage(ctx, tCoadd, rect);
        }
        if (baseImg) {
          drawSeamlessTileImage(ctx, baseImg, rect);
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

  // 4. Etiquetas de astros nombrados al pasar el cursor (o con "Fijar nombres" activo)
  if ((state.showNamedObjects || state.hoveredNamedObjectId) && state.skyView.namedObjects && state.skyView.namedObjects.length > 0) {
    state.skyView.namedObjects.forEach((obj) => {
      const isHovered = state.hoveredNamedObjectId === obj.id;
      if (!isHovered && !state.showNamedObjects) return;
      const { cx: ox, cy: oy } = fitsToSkyCanvas(obj.x, obj.y, W);
      if (ox < -20 || ox > W + 20 || oy < -20 || oy > H + 20) return;
      const hasPlanets = (obj.planets && obj.planets.length > 0) || obj.kind === "planet";
      const labelText = hasPlanets
        ? `${obj.name} · ${obj.planets.length} planeta${obj.planets.length === 1 ? "" : "s"}`
        : obj.name;
      drawTagAbovePoint(
        ctx,
        ox,
        oy,
        labelText,
        hasPlanets ? "#a78bfa" : "#34d399",
        hasPlanets ? "#ddd6fe" : "#a7f3d0",
        W
      );
    });
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
    if (indices.length > 0 && !indices.includes(state.currentEpochIdx)) {
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
  badge.textContent = `${detections.length} anomalía${detections.length === 1 ? "" : "s"}`;
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
    if (cachedMatch || idx < 4) {
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

async function fetchAndRenderSpectrum(pointRa, pointDec, keepSelectedPixel = false, centerRaOverride = null, centerDecOverride = null) {
  if (state.isLoading) return;
  const sequence = ++state.spectrumSequence;
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
  abortBackgroundTiles();
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
    setExploreProgress(data.target_info.matched_description || `Región RA=${ra.toFixed(4)}°, Dec=${dec.toFixed(4)}° lista.`);
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

  const chkNamed = document.getElementById("chk-named-objects");
  if (chkNamed) {
    chkNamed.addEventListener("change", (e) => {
      state.showNamedObjects = e.target.checked;
      renderContextSkyMap();
      renderCanvas();
    });
  }

  document.getElementById("chk-gaia").addEventListener("change", (e) => {
    state.showGaiaCat = e.target.checked;
    renderContextSkyMap();
  });

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

  await exploreCoordinates(state.ra, state.dec, state.fov, initial.temporalSearch ? 24 : 10, initial.temporalSearch);
  startBlinkTimer();
});
