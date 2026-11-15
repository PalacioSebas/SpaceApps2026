// Regresiones de compatibilidad de perfiles y contratos del componente portable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function memoryStorage(value = null) {
  let raw = value;
  return {
    getItem() { return raw; },
    setItem(key, value) { raw = value; },
  };
}

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'model.js'), 'utf8'), context);
const profiles = context.PapastronomyProfiles;
const { Store, effectiveSettings, cleanOverrides } = profiles;
const storage = memoryStorage();
const store = new Store(storage);
assert.equal(store.data.entered, false);
assert.equal(store.get(), null);
store.enter('principiante', { alias: ' Luna ' });
assert.equal(store.get().alias, 'Luna');
assert.equal(effectiveSettings(store.get()).fps, 1);
store.remember({ fps: 6, maxFrames: 32, showFlags: true });
store.update({ level: 'avanzado', interest: 'analisis', explanations: 'simple' });
assert.equal(effectiveSettings(store.get()).fps, 6, 'Los ajustes manuales prevalecen al cambiar de nivel');
assert.equal(effectiveSettings(store.get()).maxFrames, 32);
assert.equal(store.get().explanations, 'simple', 'Experiencia y estilo se eligen por separado');
store.rememberRegion(133.8, -7.2, true);
const recovered = new Store(storage);
assert.equal(recovered.data.entered, true);
assert.equal(recovered.get().lastRegion.ra, 133.8);
assert.equal(recovered.get().lastRegion.temporal, true);
recovered.remember({ fps: 3.5, showTemporalTrail: false });
assert.equal(new Store(storage).get().overrides.fps, 3.5, 'La velocidad decimal del nuevo visor se conserva');
assert.equal(new Store(storage).get().overrides.showTemporalTrail, false);
recovered.remember({ fps: 1.2 });
assert.equal(new Store(storage).get().overrides.fps, 1.2);
recovered.remember({ fps: 6 });
recovered.enter('explorador');
assert.equal(effectiveSettings(recovered.get()).fps, 2, 'Cada cuenta mantiene sus ajustes');
recovered.enter('principiante');
assert.equal(effectiveSettings(recovered.get()).fps, 6);
recovered.reset();
assert.equal(effectiveSettings(recovered.get()).fps, 4);
assert.equal(recovered.get().alias, 'Luna');
recovered.leave(true);
assert.equal(recovered.get(), null);
assert.equal(recovered.data.entered, true);
recovered.leave();
assert.equal(recovered.data.entered, false);
assert.throws(() => recovered.enter('__proto__'), /desconocido/);

const clean = cleanOverrides({ fps: '4', maxFrames: 102.5, fov: Infinity, showFlags: 'true',
  spectrumPlotMode: 'timeline', contrastGain: 1.5, unrelated: true });
assert.deepEqual(Object.keys(clean).sort(), ['contrastGain', 'spectrumPlotMode']);
assert.equal(clean.spectrumPlotMode, 'timeline');
assert.equal(cleanOverrides({ spectrumPlotMode: 'lightcurve' }).spectrumPlotMode, 'lightcurve', 'Admite preferencias antiguas');
assert.equal(new Store(memoryStorage('{broken')).persistent, false);
const malformed = new Store(memoryStorage(JSON.stringify({ version: 1, entered: true,
  activeId: 'avanzado', profiles: { avanzado: { alias: 123, level: 'bad', overrides: [] } } })));
assert.equal(malformed.get().alias, profiles.PRESETS.avanzado.alias);
assert.equal(malformed.get().level, 'avanzado');
assert.equal(effectiveSettings(malformed.get()).fps, 4);
const blocked = new Store({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
blocked.enter('explorador', { alias: '<img src=x onerror=alert(1)>' });
assert.equal(blocked.persistent, false);
assert.equal(blocked.get().alias, '<img src=x onerror=alert(1)>', 'El modelo conserva texto sin interpretar HTML');

let Access;
class Element {
  constructor() { this.attributes = new Set(); this.events = []; this.isConnected = true; }
  attachShadow() { this.shadowRoot = {}; }
  hasAttribute(name) { return this.attributes.has(name); }
  dispatchEvent(event) { this.events.push(event); }
}
context.HTMLElement = Element;
context.URL = URL;
context.document = { currentScript: { src: 'https://example.test/modules/access/access.js' } };
context.customElements = { get() {}, define(name, constructor) { Access = constructor; } };
context.CustomEvent = class CustomEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } };
vm.runInContext(fs.readFileSync(path.join(__dirname, 'access.js'), 'utf8'), context);

async function checkComponent() {
  const access = new Access();
  access.store = new Store(memoryStorage());
  access.embedded = false;
  access.renderSummary = () => {};
  access.renderStorageStatus = () => {};
  access.updateDefaults = () => {};
  access.dialog = { close() {} };
  access.openLogin = () => {};
  const ready = access.ready();
  access.enterGuest();
  assert.equal((await ready).entered, true);
  assert.equal(access.session.profile, null);
  assert.equal(access.events[0].detail.reason, 'guest');
  assert.equal(access.events[0].bubbles, true);
  assert.equal(access.events[0].composed, true);
  access.store.enter('principiante');
  access.remember({ fps: 4 });
  assert.equal(access.getSettings().fps, 4);
  access.resetSettings();
  assert.equal(access.getSettings().fps, 1);
  assert.equal(access.events.at(-1).detail.reason, 'reset');
  access.logout();
  assert.equal(access.session.entered, false);
  assert.equal(access.events.at(-1).detail.reason, 'logout');

  let writes = 0;
  context.localStorage = { getItem() { return null; }, setItem() { writes++; } };
  const embedded = new Access();
  embedded.attributes.add('embedded');
  embedded.renderStorageStatus = () => {};
  const session = await embedded.ready();
  embedded.remember({ fps: 6 });
  embedded.rememberRegion(10, 20, false);
  embedded.logout();
  assert.equal(session.entered, true);
  assert.equal(session.profile, null);
  assert.equal(writes, 0, 'El modo embebido no escribe la cuenta del navegador');
  console.log('Acceso portable: perfiles previos, ajustes manuales, invitado, sesión y almacenamiento bloqueado OK.');
}
checkComponent().catch(error => { console.error(error); process.exitCode = 1; });
