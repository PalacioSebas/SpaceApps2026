/* Realm propio para Aladin Lite 3.8.1. Quitar el iframe libera su WASM y su render loop. */
(() => {
  'use strict';
  const CHANNEL = 'papastronomy-aladin-reference';
  const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/aladin-lite@3.8.1/dist/aladin.js';
  const SURVEYS = Object.freeze({
    dss2: 'https://skies.esac.esa.int/DSSColor',
    '2mass': 'https://skies.esac.esa.int/2MASSColor',
    allwise: 'https://skies.esac.esa.int/AllWISEColor',
  });

  function fieldCorners({ ra, dec, fov }) {
    const rad = Math.PI / 180;
    const longitude = ra * rad;
    const latitude = dec * rad;
    // The target WCS uses CDELT=(-fov/128,+fov/128) degrees in its TAN plane.
    // These are the four pixel edges (-.5,-.5) through (127.5,127.5), in order.
    const half = fov * rad / 2;
    return [[half, -half], [-half, -half], [-half, half], [half, half]].map(([x, y]) => {
      const distance = Math.hypot(x, y);
      const angle = Math.atan(distance);
      const lat = Math.asin(Math.cos(angle) * Math.sin(latitude)
        + y * Math.sin(angle) * Math.cos(latitude) / distance);
      const lon = longitude + Math.atan2(x * Math.sin(angle),
        distance * Math.cos(latitude) * Math.cos(angle) - y * Math.sin(latitude) * Math.sin(angle));
      return [(lon / rad + 360) % 360, lat / rad];
    });
  }

  function validPosition(value) {
    return value && Number.isFinite(value.ra) && value.ra >= 0 && value.ra <= 360
      && Number.isFinite(value.dec) && value.dec >= -90 && value.dec <= 90;
  }

  function validContext(value) {
    return validPosition(value) && Number.isFinite(value.fov) && value.fov > 0.005 && value.fov <= 1;
  }

  function createRenderer(A, container, context, selectedSurvey, onPosition) {
    const aladin = A.aladin(container, {
      target: `${context.ra} ${context.dec}`, fov: context.fov,
      survey: SURVEYS[selectedSurvey] || SURVEYS.dss2,
      cooFrame: 'ICRSd', mode: 'dark', showSimbadPointerControl: false,
      showLayersControl: false, showFullscreenControl: false, showProjectionControl: false,
      showCooGridControl: true, showSettingsControl: false,
      showShareControl: false, showContextMenu: false, showReticle: true,
    });
    const gaia = A.catalog({ name: 'Gaia · backend', color: '#55d6ff', sourceSize: 8, shape: 'circle' });
    const allwise = A.catalog({ name: 'AllWISE · herramienta', color: '#fbbf24', sourceSize: 8, shape: 'square' });
    const selection = A.catalog({ name: 'Selección al sincronizar', color: '#f3f5fa', sourceSize: 14, shape: 'plus' });
    const footprint = A.graphicOverlay({ name: 'Campo de la herramienta', color: '#c084fc', lineWidth: 2 });
    for (const layer of [gaia, allwise, selection]) aladin.addCatalog(layer);
    aladin.addOverlay(footprint);
    let destroyed = false;
    let survey = selectedSurvey;

    function reportPosition() {
      if (destroyed) return;
      const [ra, dec] = aladin.getRaDec();
      const fov = aladin.getFov()[0];
      if (validPosition({ ra, dec }) && Number.isFinite(fov)) onPosition({ ra, dec, fov });
    }
    aladin.on('positionChanged', reportPosition);
    aladin.on('zoomChanged', reportPosition);

    function replaceCatalog(layer, rows) {
      layer.removeAll();
      const validRows = (Array.isArray(rows) ? rows : []).filter(validPosition).slice(0, 500);
      layer.addSources(validRows.map(row => A.source(row.ra, row.dec, {
        id: String(row.id ?? '').slice(0, 160),
        mag: Number.isFinite(row.mag) ? row.mag : null,
        pmra: Number.isFinite(row.pmra) ? row.pmra : null,
        pmdec: Number.isFinite(row.pmdec) ? row.pmdec : null,
      })));
    }
    function setSurvey(value) {
      const key = Object.hasOwn(SURVEYS, value) ? value : 'dss2';
      if (survey === key) return;
      survey = key;
      aladin.setImageSurvey(SURVEYS[key]);
    }
    function update(value, nextSurvey = survey) {
      if (destroyed || !validContext(value)) return;
      setSurvey(nextSurvey);
      replaceCatalog(gaia, value.gaia?.sources);
      replaceCatalog(allwise, value.allwise?.sources);
      selection.removeAll();
      if (validPosition(value.selected)) selection.addSources([A.source(value.selected.ra, value.selected.dec, { id: 'Selección al sincronizar' })]);
      footprint.removeAll();
      footprint.addFootprints([A.polygon(fieldCorners(value))]);
      aladin.gotoRaDec(value.ra, value.dec);
      aladin.setFoV(value.fov);
      reportPosition();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      aladin.off('positionChanged');
      aladin.off('zoomChanged');
      aladin.removeOverlays();
    }
    update(context, selectedSurvey);
    return { update, setSurvey, destroy };
  }

  let token = null;
  let context = null;
  let survey = 'dss2';
  let renderer = null;
  let starting = false;
  const origin = location.origin;
  function post(type, values = {}) {
    parent.postMessage({ channel: CHANNEL, token, type, ...values }, origin);
  }
  async function initialize() {
    if (starting || renderer) return;
    starting = true;
    try {
      const module = await import(LIBRARY_URL);
      const A = module.default;
      if (!A?.aladin || !A?.catalog || !A?.source || !A?.graphicOverlay || !A?.polygon || !A.init?.then) {
        throw new Error('El paquete de Aladin Lite no tiene la API esperada.');
      }
      await A.init;
      renderer = createRenderer(A, document.getElementById('view'), context, survey, point => post('position', point));
      post('ready');
    } catch (error) {
      post('error', { message: `Aladin Lite no pudo iniciar. Requiere conexión y WebGL2. ${String(error?.message || error).slice(0, 160)}` });
    } finally {
      starting = false;
    }
  }
  function receive(event) {
    if (event.source !== parent || event.origin !== origin) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || typeof message.token !== 'string' || message.token.length > 80) return;
    if (message.type === 'init' && token === null && validContext(message.context)) token = message.token;
    if (message.token !== token || token === null) return;
    if (message.type === 'init' || message.type === 'update') {
      if (!validContext(message.context)) return;
      context = message.context;
      survey = Object.hasOwn(SURVEYS, message.survey) ? message.survey : 'dss2';
      if (renderer) renderer.update(context, survey);
      else if (message.type === 'init') void initialize();
    } else if (message.type === 'survey' && Object.hasOwn(SURVEYS, message.survey)) {
      survey = message.survey;
      renderer?.setSurvey(survey);
    }
  }
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', () => {
    window.removeEventListener('message', receive);
    renderer?.destroy();
    renderer = null;
  }, { once: true });

  globalThis.PapastronomyAladinFrameSupport = Object.freeze({ fieldCorners, validContext, createRenderer, SURVEYS, LIBRARY_URL });
})();
