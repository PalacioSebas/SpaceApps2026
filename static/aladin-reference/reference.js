/* Complemento Aladin Lite: contexto de referencia aislado de los lienzos científicos. */
(() => {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const CHANNEL = 'papastronomy-aladin-reference';
  const LIMIT = 500;
  const mounts = new WeakMap();
  let nextId = 0;

  function position(value) {
    if (!value || !Number.isFinite(value.ra) || !Number.isFinite(value.dec)
        || value.ra < 0 || value.ra > 360 || value.dec < -90 || value.dec > 90) return null;
    return { ra: value.ra % 360, dec: value.dec };
  }

  function catalog(value) {
    const rows = Array.isArray(value?.sources) ? value.sources : [];
    const sources = [];
    let validCount = 0;
    for (const row of rows) {
      const point = position(row);
      if (!point) continue;
      validCount++;
      if (sources.length === LIMIT) continue;
      sources.push({ ...point, id: String(row.id ?? '').slice(0, 160),
        mag: Number.isFinite(row.mag) ? row.mag : null,
        pmra: Number.isFinite(row.pmra) ? row.pmra : null,
        pmdec: Number.isFinite(row.pmdec) ? row.pmdec : null });
    }
    return { sources, validCount, truncated: value?.truncated === true || validCount > LIMIT,
      service: typeof value?.service === 'string' ? value.service.slice(0, 120) : '',
      error: typeof value?.error === 'string' ? value.error.slice(0, 200) : '',
      queryFov: Number.isFinite(value?.queryFov) && value.queryFov > 0.005 && value.queryFov <= 1 ? value.queryFov : null,
      queried: Array.isArray(value?.sources) };
  }

  function cleanContext(value) {
    const center = position(value);
    if (!center || !Number.isFinite(value.fov) || value.fov <= 0.005 || value.fov > 1) return null;
    return { ...center, fov: value.fov, selected: position(value.selected),
      gaia: catalog(value.gaia), allwise: catalog(value.allwise) };
  }

  function describeCatalog(label, value) {
    if (value.error) return `${label}: ${value.error}`;
    if (!value.queried) return `${label}: sin consulta disponible en la herramienta.`;
    const count = value.validCount > LIMIT ? `${LIMIT} de ${value.validCount}` : String(value.sources.length);
    return `${label}: ${count} fuentes${value.truncated ? ' · lista limitada' : ''}${value.service ? ` · ${value.service}` : ''}${value.queryFov ? ` · consulta FoV ${value.queryFov.toFixed(3)}°` : ''}.`;
  }

  function toolLink(catalogName, context, baseUrl) {
    const url = new URL('/api/tools/catalog.vot', baseUrl);
    const queryFov = context[catalogName]?.queryFov || context.fov;
    for (const [key, value] of Object.entries({ catalog: catalogName, ra: context.ra, dec: context.dec, fov: queryFov })) {
      url.searchParams.set(key, String(value));
    }
    return url.href;
  }

  function externalLink(context) {
    const url = new URL('https://aladin.cds.unistra.fr/AladinLite/');
    url.searchParams.set('target', `${context.ra} ${context.dec}`);
    url.searchParams.set('fov', String(context.fov));
    return url.href;
  }

  function mount(container, { getContext, timeoutMs = 20000 } = {}) {
    if (!container?.ownerDocument || typeof getContext !== 'function') throw new Error('Faltan el contenedor o el lector de contexto de Aladin.');
    mounts.get(container)?.destroy();
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    const origin = new URL(doc.baseURI).origin;
    const token = `aladin-reference-${++nextId}`;
    const events = new AbortController();
    const wrapper = doc.createElement('section');
    wrapper.className = 'papastronomy-aladin-reference';
    wrapper.innerHTML = `<link rel="stylesheet"><details>
      <summary>Aladin Lite · referencia del cielo</summary>
      <div class="aladin-reference-body">
        <p class="aladin-reference-note">Imágenes de relevamientos externos. El contorno delimita el campo de la herramienta; las marcas de Gaia y AllWISE conservan sus coordenadas de catálogo. El botón Sincronizar campo actualiza también la selección mostrada.</p>
        <div class="aladin-reference-controls"><button type="button" class="aladin-reference-sync">Sincronizar campo</button>
          <label>Fondo<select class="aladin-reference-survey"><option value="dss2">DSS2 óptico</option><option value="2mass">2MASS JHK</option><option value="allwise">AllWISE infrarrojo</option></select></label>
          <button type="button" class="aladin-reference-fullscreen" aria-pressed="false">Pantalla completa</button>
          <button type="button" class="aladin-reference-retry" hidden>Reintentar</button></div>
        <p class="aladin-reference-status" role="status">Se carga al abrir este panel.</p>
        <div class="aladin-reference-frame"></div>
        <p class="aladin-reference-position"></p>
        <div class="aladin-reference-catalogs"><p class="aladin-reference-gaia"></p><p class="aladin-reference-allwise"></p></div>
        <p class="aladin-reference-note">Se muestran hasta 500 fuentes por catálogo. El VOTable exporta el resultado del backend, limitado a 2000 fuentes. Los relevamientos y catálogos corresponden a épocas distintas; las posiciones se muestran sin propagación de movimiento propio. Desplazar esta referencia conserva las coordenadas de la consulta científica.</p>
        <div class="aladin-reference-links"><a class="aladin-reference-external" target="_blank" rel="noopener noreferrer">Abrir Aladin en otra pestaña ↗</a><a class="aladin-reference-vot-gaia">Gaia · VOTable</a><a class="aladin-reference-vot-allwise">AllWISE · VOTable</a></div>
        <p class="aladin-reference-credit">Aladin Lite · CDS / Université de Strasbourg. Fondos HiPS servidos por ESA Sky.</p>
      </div></details>`;
    const node = selector => wrapper.querySelector(selector);
    node('link').href = new URL('reference.css', assetBase).href;
    container.append(wrapper);
    const details = node('details');
    let context = null;
    let frame = null;
    let frameEvents = null;
    let ready = false;
    let timer = null;
    let destroyed = false;
    let observer = null;
    let fullscreenPending = false;
    let fullscreenIntent = 0;
    let expandedInWindow = false;
    let pageActive = true;
    let statusMessage = 'Se carga al abrir este panel.';
    let statusFailed = false;
    let fullscreenNotice = '';
    const fullscreenButton = node('.aladin-reference-fullscreen');

    function updateFullscreenControl() {
      const expanded = doc.fullscreenElement === wrapper || expandedInWindow;
      wrapper.classList.toggle('aladin-reference-expanded', expanded);
      fullscreenButton.textContent = expanded ? 'Salir de pantalla completa' : 'Pantalla completa';
      fullscreenButton.setAttribute('aria-pressed', String(expanded));
      fullscreenButton.disabled = fullscreenPending || destroyed;
    }
    async function exitExpanded() {
      setFullscreenNotice('');
      if (expandedInWindow) {
        expandedInWindow = false;
        try { wrapper.hidePopover(); } catch { /* Removing the attribute also closes it. */ }
        wrapper.removeAttribute('popover');
      }
      if (doc.fullscreenElement === wrapper && typeof doc.exitFullscreen === 'function') {
        try { await doc.exitFullscreen(); }
        catch { if (!destroyed && pageActive) setFullscreenNotice('Usá Esc para salir de pantalla completa.'); }
      }
      updateFullscreenControl();
    }
    function expandWithinWindow() {
      if (typeof wrapper.showPopover !== 'function' || typeof wrapper.hidePopover !== 'function') {
        setFullscreenNotice('Este navegador no permite ampliar el panel. Abrí la herramienta en Chrome, Edge o Firefox.');
        return;
      }
      try {
        // The top layer avoids clipping by the host's panels, without moving or
        // reloading the iframe and losing its current position or zoom.
        wrapper.setAttribute('popover', 'manual');
        wrapper.showPopover();
        expandedInWindow = true;
        updateFullscreenControl();
        setFullscreenNotice('Vista ampliada dentro del navegador. Usá Esc o el botón para volver al panel.');
      } catch {
        wrapper.removeAttribute('popover');
        setFullscreenNotice('No se pudo ampliar el panel. Podés reintentar desde el botón Pantalla completa.');
      }
    }
    async function toggleFullscreen() {
      if (destroyed || fullscreenPending || !details.open || !pageActive) return;
      const intent = ++fullscreenIntent;
      fullscreenPending = true;
      setFullscreenNotice('');
      updateFullscreenControl();
      try {
        if (doc.fullscreenElement === wrapper || expandedInWindow) {
          await exitExpanded();
        } else if (typeof wrapper.requestFullscreen === 'function' && doc.fullscreenEnabled !== false) {
          try {
            await wrapper.requestFullscreen();
            if (intent !== fullscreenIntent || destroyed || !details.open || !pageActive) await exitExpanded();
          } catch {
            if (intent === fullscreenIntent && !destroyed && details.open && pageActive) expandWithinWindow();
          }
        } else {
          expandWithinWindow();
        }
      } finally {
        fullscreenPending = false;
        updateFullscreenControl();
        if (!destroyed && pageActive && details.open && wrapper.isConnected) fullscreenButton.focus();
      }
    }

    function renderStatus() {
      node('.aladin-reference-status').textContent = `${statusMessage}${fullscreenNotice ? ` ${fullscreenNotice}` : ''}`;
      node('.aladin-reference-retry').hidden = !statusFailed;
    }
    function setFullscreenNotice(message) {
      fullscreenNotice = message;
      renderStatus();
    }
    function setStatus(message, failed = false) {
      statusMessage = message;
      statusFailed = failed;
      renderStatus();
    }
    function removeFrame() {
      clearTimeout(timer);
      timer = null;
      ready = false;
      frameEvents?.abort();
      frameEvents = null;
      frame?.remove();
      frame = null;
      node('.aladin-reference-position').textContent = '';
    }
    function send(type) {
      if (!frame?.contentWindow || !context) return;
      frame.contentWindow.postMessage({ channel: CHANNEL, token, type, context,
        survey: node('.aladin-reference-survey').value }, origin);
    }
    function fail(message) {
      removeFrame();
      setStatus(message, true);
    }
    function readContext() {
      try { return cleanContext(getContext()); } catch { return null; }
    }
    function sync() {
      if (destroyed) return false;
      context = readContext();
      const unavailable = !context;
      node('.aladin-reference-sync').disabled = unavailable;
      for (const selector of ['.aladin-reference-external', '.aladin-reference-vot-gaia', '.aladin-reference-vot-allwise']) node(selector).hidden = unavailable;
      if (unavailable) {
        removeFrame();
        setStatus('No hay un campo válido para mostrar. Explorá una región y sincronizá de nuevo.');
        return false;
      }
      node('.aladin-reference-gaia').textContent = describeCatalog('Gaia', context.gaia);
      node('.aladin-reference-allwise').textContent = describeCatalog('AllWISE', context.allwise);
      node('.aladin-reference-external').href = externalLink(context);
      node('.aladin-reference-vot-gaia').href = toolLink('gaia', context, doc.baseURI);
      node('.aladin-reference-vot-allwise').href = toolLink('allwise', context, doc.baseURI);
      if (ready) send('update');
      return true;
    }
    function startFrame() {
      if (destroyed || frame || !details.open || !sync()) return;
      setStatus('Cargando Aladin Lite y el fondo de referencia…');
      const currentFrame = doc.createElement('iframe');
      currentFrame.title = 'Aladin Lite, referencia astronómica del campo';
      currentFrame.className = 'aladin-reference-iframe';
      currentFrame.src = new URL('frame.html', assetBase).href;
      currentFrame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame = currentFrame;
      frameEvents = new AbortController();
      currentFrame.addEventListener('load', () => { if (frame === currentFrame) send('init'); }, { signal: frameEvents.signal });
      currentFrame.addEventListener('error', () => { if (frame === currentFrame) fail('No se pudo cargar la referencia. Podés reintentar o abrir Aladin en otra pestaña.'); }, { signal: frameEvents.signal });
      node('.aladin-reference-frame').append(currentFrame);
      timer = setTimeout(() => {
        if (frame === currentFrame && !ready) fail('Aladin tardó demasiado en iniciar. Revisá la conexión y reintentá.');
      }, timeoutMs);
    }
    function onMessage(event) {
      if (destroyed || event.origin !== origin || event.source !== frame?.contentWindow) return;
      const message = event.data;
      if (!message || message.channel !== CHANNEL || message.token !== token) return;
      if (message.type === 'ready') {
        clearTimeout(timer);
        timer = null;
        ready = true;
        setStatus('Aladin iniciado. El fondo se carga desde el servicio externo; la navegación queda en este panel.');
        send('update');
      } else if (message.type === 'error') {
        fail(typeof message.message === 'string' ? message.message.slice(0, 300) : 'No se pudo iniciar Aladin Lite. Reintentá o abrilo en otra pestaña.');
      } else if (message.type === 'position' && position(message) && Number.isFinite(message.fov)) {
        node('.aladin-reference-position').textContent = `Vista de referencia · RA ${message.ra.toFixed(5)}° · Dec ${message.dec.toFixed(5)}° · FoV ${message.fov.toFixed(4)}°`;
      } else if (message.type === 'exit-expanded' && expandedInWindow) {
        void exitExpanded();
      }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      fullscreenIntent++;
      void exitExpanded();
      events.abort();
      observer?.disconnect();
      removeFrame();
      wrapper.remove();
      mounts.delete(container);
    }
    details.addEventListener('toggle', () => {
      if (details.open) startFrame();
      else { fullscreenIntent++; void exitExpanded(); removeFrame(); setStatus('Se carga al abrir este panel.'); }
    }, { signal: events.signal });
    fullscreenButton.addEventListener('click', () => { void toggleFullscreen(); }, { signal: events.signal });
    doc.addEventListener('fullscreenchange', updateFullscreenControl, { signal: events.signal });
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && expandedInWindow) {
        event.preventDefault();
        void exitExpanded();
      }
    }, { signal: events.signal });
    wrapper.addEventListener('toggle', (event) => {
      if (event.target === wrapper && event.newState === 'closed' && expandedInWindow) {
        expandedInWindow = false;
        wrapper.removeAttribute('popover');
        updateFullscreenControl();
      }
    }, { signal: events.signal });
    node('.aladin-reference-sync').addEventListener('click', () => { if (sync()) startFrame(); }, { signal: events.signal });
    node('.aladin-reference-retry').addEventListener('click', () => { removeFrame(); startFrame(); }, { signal: events.signal });
    node('.aladin-reference-survey').addEventListener('change', () => { if (ready) send('survey'); }, { signal: events.signal });
    win.addEventListener('message', onMessage, { signal: events.signal });
    win.addEventListener('pagehide', () => {
      pageActive = false;
      fullscreenIntent++;
      void exitExpanded();
      removeFrame();
      setStatus('Referencia pausada.');
    }, { signal: events.signal });
    win.addEventListener('pageshow', () => { pageActive = true; if (details.open) startFrame(); }, { signal: events.signal });
    if (win.MutationObserver) {
      observer = new win.MutationObserver(() => { if (!wrapper.isConnected) destroy(); });
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    }
    const api = { sync, open() { details.open = true; startFrame(); }, destroy };
    mounts.set(container, api);
    sync();
    return api;
  }

  globalThis.PapastronomyAladinReference = Object.freeze({ mount });
  globalThis.PapastronomyAladinReferenceSupport = Object.freeze({ cleanContext, describeCatalog, toolLink, externalLink, CHANNEL, LIMIT });
})();
