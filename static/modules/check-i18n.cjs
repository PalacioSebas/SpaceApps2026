// Exercise the shared localization runtime with DOM nodes, without a browser or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({ query = '', stored = null, blocked = false } = {}) {
  const observers = new Set();
  let nodeReplacements = 0, fetches = 0, storageWrites = 0, localeEvents = 0, historyWrites = 0;
  const contains = (root, node) => {
    for (let current = node; current; current = current.parentNode) if (current === root) return true;
    return false;
  };
  const mutation = (record) => {
    for (const observer of observers) {
      const options = observer.options;
      if (!observer.active || !contains(observer.root, record.target)) continue;
      if (record.type === 'attributes' && (!options.attributes || !options.attributeFilter.includes(record.attributeName))) continue;
      if (record.type === 'characterData' && !options.characterData) continue;
      if (record.type === 'childList' && !options.childList) continue;
      observer.records.push(record);
    }
  };
  class EventTarget {
    constructor() { this.handlers = new Map(); }
    addEventListener(type, callback) { (this.handlers.get(type) || this.handlers.set(type, []).get(type)).push(callback); }
    removeEventListener(type, callback) { this.handlers.set(type, (this.handlers.get(type) || []).filter(fn => fn !== callback)); }
    dispatchEvent(event) { for (const callback of this.handlers.get(event.type) || []) callback(event); return true; }
  }
  class Node extends EventTarget {
    constructor(type) { super(); this.nodeType = type; this.childNodes = []; this.parentNode = null; }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get isConnected() { return this.nodeType === 9 || Boolean(this.parentNode?.isConnected || this.host?.isConnected); }
    appendChild(child) { child.parentNode = this; this.childNodes.push(child); mutation({ type: 'childList', target: this, addedNodes: [child] }); return child; }
    get textContent() { return this.childNodes.map(child => child.nodeType === 3 ? child.nodeValue : child.textContent).join(''); }
    set textContent(value) { nodeReplacements++; this.childNodes = []; this.appendChild(new Text(String(value))); }
    set innerHTML(_value) { nodeReplacements++; throw Error('Localization must not replace markup'); }
    set outerHTML(_value) { nodeReplacements++; throw Error('Localization must not replace nodes'); }
    querySelectorAll(selector) {
      assert.equal(selector, '[data-language]');
      const result = [];
      const walk = root => { for (const child of root.childNodes) { if (child.nodeType === 1 && child.hasAttribute('data-language')) result.push(child); walk(child); } };
      walk(this); return result;
    }
  }
  class Text extends Node {
    constructor(value) { super(3); this.value = value; }
    get nodeValue() { return this.value; }
    set nodeValue(value) { this.value = value; mutation({ type: 'characterData', target: this }); }
  }
  class Element extends Node {
    constructor(name) { super(1); this.localName = name; this.attributes = new Map(); this.dataset = {}; this.value = ''; this.checked = false; this.style = {}; }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_all, letter) => letter.toUpperCase())] = String(value);
      mutation({ type: 'attributes', target: this, attributeName: name });
    }
    get lang() { return this.getAttribute('lang'); }
    set lang(value) { this.setAttribute('lang', value); }
    closest(selector) {
      for (let element = this; element; element = element.parentElement) {
        if (selector.split(',').some(part => part.startsWith('[') ? element.hasAttribute(part.slice(1, -1)) : element.localName === part)) return element;
      }
      return null;
    }
    attachShadow() { this.shadowRoot = new Node(11); this.shadowRoot.host = this; return this.shadowRoot; }
  }
  const document = new Node(9);
  document.readyState = 'complete';
  document.documentElement = document.appendChild(new Element('html'));
  const body = document.documentElement.appendChild(new Element('body'));
  const add = (name, text, attributes = {}, parent = body) => {
    const element = parent.appendChild(new Element(name));
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text !== undefined) element.appendChild(new Text(text));
    return element;
  };
  const window = new EventTarget();
  const dispatch = window.dispatchEvent.bind(window);
  window.dispatchEvent = event => { if (event.type === 'papastronomy-lang-change') localeEvents++; return dispatch(event); };
  const environment = vm.createContext({
    window, document, URL,
    location: new URL(`https://example.test/tool/?${query}`),
    history: { state: { preserved: true }, replaceState(state, _title, url) { assert.equal(state.preserved, true); if (blocked) throw Error('History blocked'); historyWrites++; environment.location = new URL(url); } },
    localStorage: { getItem(key) { assert.equal(key, 'papastronomy-lang'); if (blocked) throw Error('Storage blocked'); return stored; }, setItem(key, value) { assert.equal(key, 'papastronomy-lang'); if (blocked) throw Error('Storage blocked'); stored = value; storageWrites++; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.records = []; observers.add(this); }
      observe(root, options) { this.root = root; this.options = options; this.active = true; }
      disconnect() { this.active = false; this.records = []; }
    },
    fetch() { fetches++; throw Error('Translations must not fetch data'); },
  });
  for (const relative of ['i18n.js', 'translations.js', '../observatory/translations.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, relative), 'utf8'), environment, { filename: relative });
  }
  const flush = () => {
    for (let pass = 0; pass < 30; pass++) {
      let pending = false;
      for (const observer of observers) {
        if (!observer.active || !observer.records.length) continue;
        pending = true; const records = observer.records.splice(0); observer.callback(records);
      }
      if (!pending) return;
    }
    throw Error('Localization observer failed to settle');
  };
  return { add, Text, Node, Element, body, document, window, environment, flush,
    i18n: environment.PapastronomyI18n,
    get replacements() { return nodeReplacements; }, get fetches() { return fetches; }, get storageWrites() { return storageWrites; },
    get localeEvents() { return localeEvents; }, get historyWrites() { return historyWrites; } };
}

function checkRoundTripAndIsolation() {
  const f = fixture({ query: 'ra=133.795129&dec=-7.245147&fov=.05' });
  const button = f.add('button', 'Explorar Cielo', { title: 'Búsqueda por coordenadas', 'aria-label': 'Explorar Cielo', id: 'btn-science' });
  const originalTextNode = button.childNodes[0];
  const input = f.add('input', undefined, { placeholder: 'Preguntá por una imagen, un candidato o un espectro…', name: 'ra', value: '133.795129' });
  input.value = '133,795129'; input.checked = true; input.style.width = '132px';
  const select = f.add('select'); select.value = 'brown-dwarf';
  const option = f.add('option', 'Principiante', { value: 'brown-dwarf' }, select);
  const identifier = f.add('span', 'WISE 0855 · D1 · MOVING_DIPOLE · 1.20 µm · 8,5σ');
  const alias = f.add('strong', 'Explorador', { 'data-i18n-skip': '' });
  const message = f.add('p', 'Explorador', { 'data-i18n-skip': '' });
  const editable = f.add('div', 'Explorador', { contenteditable: 'true' });
  const textarea = f.add('textarea', 'Explorador'); textarea.value = 'Mi mensaje';
  const es = f.add('button', 'ES', { 'data-language': 'es' });
  const en = f.add('button', 'EN', { 'data-language': 'en' });
  const description = f.add('meta', undefined, { name: 'description', content: 'Sin datos' });
  const policy = f.add('meta', undefined, { 'http-equiv': 'Content-Security-Policy', content: 'Sin datos' });
  let businessCalls = 0;
  const handler = () => { businessCalls++; };
  button.addEventListener('click', handler);
  f.flush();
  assert.equal(f.document.documentElement.lang, 'es');
  f.i18n.setLanguage('en'); f.flush();
  assert.equal(button.textContent, 'Explore sky');
  assert.equal(button.getAttribute('title'), 'Coordinate search');
  assert.equal(button.getAttribute('aria-label'), 'Explore sky');
  assert.equal(input.getAttribute('placeholder'), 'Ask about an image, a candidate or a spectrum…');
  assert.equal(option.textContent, 'Beginner');
  assert.equal(f.i18n.sourceText(button), 'Explorar Cielo', 'Legacy text comparisons retain the source language');
  assert.equal(button.childNodes[0], originalTextNode, 'Translation keeps the original text node');
  assert.equal(button.handlers.get('click')[0], handler, 'Translation keeps the original handler');
  assert.equal(businessCalls, 0, 'Switching language does not activate business controls');
  assert.equal(input.value, '133,795129'); assert.equal(input.checked, true);
  assert.equal(input.getAttribute('name'), 'ra'); assert.equal(input.getAttribute('value'), '133.795129');
  assert.equal(input.style.width, '132px'); assert.equal(select.value, 'brown-dwarf'); assert.equal(option.getAttribute('value'), 'brown-dwarf');
  for (const element of [alias, message, editable, textarea]) assert.equal(element.textContent, 'Explorador');
  assert.equal(textarea.value, 'Mi mensaje');
  assert.equal(identifier.textContent, 'WISE 0855 · D1 · MOVING_DIPOLE · 1.20 µm · 8,5σ');
  assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(description.getAttribute('content'), 'No data', 'Page descriptions are localized');
  assert.equal(policy.getAttribute('content'), 'Sin datos', 'Other metadata content is not interpreted as UI text');
  assert.equal(en.getAttribute('aria-pressed'), 'true'); assert.equal(es.getAttribute('aria-pressed'), 'false');
  assert.equal(f.environment.location.searchParams.get('ra'), '133.795129');
  assert.equal(f.environment.location.searchParams.get('lang'), 'en');
  button.dispatchEvent({ type: 'click', target: button }); assert.equal(businessCalls, 1);
  f.i18n.setLanguage('es'); f.flush();
  assert.equal(button.textContent, 'Explorar Cielo'); assert.equal(button.getAttribute('title'), 'Búsqueda por coordenadas');
  assert.equal(input.getAttribute('placeholder'), 'Preguntá por una imagen, un candidato o un espectro…');
  assert.equal(option.textContent, 'Principiante'); assert.equal(f.replacements, 0); assert.equal(f.fetches, 0);
  assert.equal(description.getAttribute('content'), 'Sin datos');
  assert.equal(policy.getAttribute('content'), 'Sin datos');
}

function checkDynamicAndShadowContent() {
  const f = fixture({ query: 'lang=en' });
  const dynamic = f.add('p', 'Sin coincidencia'); f.flush();
  const originalNode = dynamic.childNodes[0];
  assert.equal(dynamic.textContent, 'No match');
  assert.equal(f.i18n.sourceText(dynamic), 'Sin coincidencia');
  originalNode.nodeValue = 'Cargando…'; f.flush();
  assert.equal(dynamic.textContent, 'Loading…'); assert.equal(f.i18n.sourceText(dynamic), 'Cargando…');
  const wrapper = f.add('div');
  wrapper.setAttribute('title', 'Sin datos'); f.flush(); assert.equal(wrapper.getAttribute('title'), 'No data');
  const host = f.add('papastronomy-access');
  const shadow = host.attachShadow();
  const label = f.add('span', 'Mi perfil', {}, shadow);
  f.i18n.apply(host); f.flush(); assert.equal(label.textContent, 'My profile');
  const viewer = f.add('papastronomy-object-viewer'); f.flush();
  assert.equal(viewer.getAttribute('lang'), 'en', 'Portable 3D content receives the chosen language');
  f.i18n.setLanguage('es'); f.flush();
  assert.equal(dynamic.textContent, 'Cargando…'); assert.equal(label.textContent, 'Mi perfil');
  assert.equal(viewer.getAttribute('lang'), 'es'); assert.equal(dynamic.childNodes[0], originalNode);
  assert.equal(f.replacements, 0); assert.equal(f.fetches, 0);
}

function checkPatternsAndPreferences() {
  const f = fixture({ query: 'lang=en', stored: 'es' });
  assert.equal(f.i18n.language, 'en', 'Explicit URL language takes priority over storage');
  f.i18n.register([
    ['Medida [A+B]*(x)?^$ {0} · σ={1}', 'Measurement [A+B]*(x)?^$ {0} · σ={1}'],
    ['Consulta {0}\nDetalle {1}', 'Query {0}\nDetail {1}'],
    ['Patrón literal [.*+?^$()|\\] {0}', 'Literal pattern [.*+?^$()|\\] {0}'],
  ]);
  assert.equal(f.i18n.t("Medida [A+B]*(x)?^$ Barnard's Star + S-02 · σ=−1.23"), "Measurement [A+B]*(x)?^$ Barnard's Star + S-02 · σ=−1.23");
  assert.equal(f.i18n.t('Consulta α Cyg\nβ Cyg\nDetalle RA 133.795°'), 'Query α Cyg\nβ Cyg\nDetail RA 133.795°');
  assert.equal(f.i18n.t('Patrón literal [.*+?^$()|\\] WISE 0855'), 'Literal pattern [.*+?^$()|\\] WISE 0855');
  assert.equal(f.i18n.t('  Mi perfil\nSin datos  '), '  My profile\nNo data  ');
  let notifications = 0;
  const unsubscribe = f.i18n.subscribe(() => notifications++);
  f.i18n.setLanguage('es'); assert.equal(notifications, 1);
  assert.equal(f.i18n.t("Measurement [A+B]*(x)?^$ Barnard's Star + S-02 · σ=−1.23"), "Medida [A+B]*(x)?^$ Barnard's Star + S-02 · σ=−1.23");
  unsubscribe(); f.i18n.setLanguage('en'); assert.equal(notifications, 1);
  assert.equal(f.storageWrites, 2);
  const blocked = fixture({ query: 'lang=en&ra=10', stored: 'es', blocked: true });
  assert.equal(blocked.i18n.language, 'en');
  blocked.i18n.setLanguage('es'); assert.equal(blocked.i18n.language, 'es');
  assert.equal(blocked.document.documentElement.lang, 'es'); assert.equal(blocked.fetches, 0);
  const stored = fixture({ stored: 'en' }); assert.equal(stored.i18n.language, 'en');
  stored.window.dispatchEvent({ type: 'storage', key: 'papastronomy-lang', newValue: 'es' });
  assert.equal(stored.i18n.language, 'es');
  stored.document.dispatchEvent({ type: 'click', target: stored.add('button', 'EN', { 'data-language': 'en' }) });
  assert.equal(stored.i18n.language, 'en');
}

function checkParentLanguageSynchronization() {
  const f = fixture({ query: 'lang=es&ra=133.795129', stored: 'es' });
  const label = f.add('p', 'Mi perfil');
  const input = f.add('input', undefined, { placeholder: 'Tu consulta' }); input.value = 'WISE 0855';
  const viewer = f.add('papastronomy-object-viewer');
  f.flush();
  const originalAddress = f.environment.location.href;
  let notifications = 0;
  f.i18n.subscribe(() => notifications++);
  f.i18n.syncLanguage('en'); f.flush();
  assert.equal(f.i18n.language, 'en'); assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(label.textContent, 'My profile'); assert.equal(input.getAttribute('placeholder'), 'Your question');
  assert.equal(viewer.getAttribute('lang'), 'en'); assert.equal(input.value, 'WISE 0855');
  assert.equal(notifications, 1);
  assert.equal(f.environment.location.href, originalAddress, 'The parent owns the address during synchronization');
  assert.equal(f.storageWrites, 0, 'Synchronizing an iframe does not write the shared preference');
  assert.equal(f.localeEvents, 0, 'Synchronizing an iframe does not broadcast a new language event');
  assert.equal(f.historyWrites, 0);
  f.i18n.syncLanguage('es'); f.flush();
  assert.equal(label.textContent, 'Mi perfil'); assert.equal(viewer.getAttribute('lang'), 'es');
  assert.equal(f.storageWrites, 0); assert.equal(f.localeEvents, 0); assert.equal(f.historyWrites, 0);
  f.i18n.syncLanguage('fr'); assert.equal(f.i18n.language, 'es');
  assert.equal(f.replacements, 0); assert.equal(f.fetches, 0);
}

checkRoundTripAndIsolation();
checkDynamicAndShadowContent();
checkPatternsAndPreferences();
checkParentLanguageSynchronization();
console.log('I18n runtime: ES/EN round trips, live text/attributes, shadow roots, preferences, templates, original handlers and scientific/user values preserved; no network: OK.');
