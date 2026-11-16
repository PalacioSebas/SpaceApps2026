// Contratos del complemento y del frame. Se simula la API, sin GPU ni descarga externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Node {
  constructor(doc) {
    this.ownerDocument = doc;
    this.listeners = new Map();
    this.children = [];
    this.nodes = new Map();
    this.hidden = false;
    this.isConnected = true;
    this.value = '';
    this.attributes = new Map();
    const classes = new Set();
    this.classList = {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      },
    };
  }
  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    options.signal?.addEventListener('abort', () => this.listeners.get(type).delete(callback), {once:true});
  }
  emit(type, event = {}) {
    event.target ??= this;
    event.currentTarget = this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
  append(child) { this.children.push(child); child.parent = this; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(node) { for (let current = node; current; current = current.parent) if (current === this) return true; return false; }
  matches(selector) { return selector === ':popover-open' && this.popoverOpen === true; }
  focus() { this.focused = true; }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node(this.ownerDocument));
    const node = this.nodes.get(selector);
    if (selector === '.aladin-reference-survey' && !node.value) node.value = 'dss2';
    return node;
  }
}

function mockFullscreenAPI(doc, mode, popover) {
  const control = {requests:[], pending:[], exits:0, popoverShows:0, popoverHides:0};
  doc.fullscreenElement = null;
  control.enter = element => { doc.fullscreenElement = element; doc.emit('fullscreenchange'); };
  control.escape = () => { doc.fullscreenElement = null; doc.emit('fullscreenchange'); };
  if (mode) {
    doc.fullscreenEnabled = mode !== 'disabled';
    doc.exitFullscreen = () => { control.exits++; control.escape(); return Promise.resolve(); };
  }
  control.configure = node => {
    if (mode) node.requestFullscreen = () => {
      control.requests.push(node);
      if (mode === 'reject') return Promise.reject(new Error('Fullscreen blocked'));
      if (mode === 'deferred') return new Promise((resolve,reject) => {
        control.pending.push({resolve() { control.enter(node); resolve(); },reject() { reject(new Error('Fullscreen blocked')); }});
      });
      control.enter(node);
      return Promise.resolve();
    };
    if (popover) {
      node.showPopover = () => {
        control.popoverShows++;
        node.popoverOpen = true;
        node.emit('toggle', {oldState:'closed', newState:'open'});
      };
      node.hidePopover = () => {
        control.popoverHides++;
        node.popoverOpen = false;
        node.emit('toggle', {oldState:'open', newState:'closed'});
      };
    }
    return node;
  };
  control.resolveNext = () => { assert.ok(control.pending.length, 'Hay una solicitud fullscreen pendiente'); control.pending.shift().resolve(); };
  control.rejectNext = () => { assert.ok(control.pending.length, 'Hay una solicitud fullscreen pendiente'); control.pending.shift().reject(); };
  return control;
}

function environment({fullscreen=false, popover=false} = {}) {
  const win = new Node();
  const timers = new Map();
  const observers = [];
  const frames = [];
  const doc = Object.assign(new Node(), { baseURI:'https://example.test/tool/', currentScript:{src:'https://example.test/static/aladin-reference/reference.js'}, defaultView:win,
    documentElement:{}, createElement(tag) {
      const node = fullscreenAPI.configure(new Node(doc));
      if (tag === 'iframe') {
        node.contentWindow = { messages:[], postMessage(message, origin) {this.messages.push({message,origin});} };
        frames.push(node);
      }
      return node;
    },
  });
  const fullscreenAPI = mockFullscreenAPI(doc, fullscreen, popover);
  win.MutationObserver = class {
    constructor(callback) { this.callback=callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected=true; }
  };
  let timerId = 0;
  const env = {URL,AbortController,document:doc,
    setTimeout(callback) {timers.set(++timerId,callback);return timerId;},
    clearTimeout(id) {timers.delete(id);},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'reference.js'),'utf8'),env);
  return {env,doc,win,timers,frames,observers,fullscreenAPI,container:new Node(doc)};
}

const sample = () => ({ra:133.795129,dec:-7.245147,fov:0.05,selected:{ra:133.8,dec:-7.24},
  gaia:{sources:[{id:'Gaia 1',ra:133.8,dec:-7.24,mag:12,pmra:1,pmdec:2}],service:'IRSA TAP',queryFov:0.15},
  allwise:{sources:[],service:'CDS VizieR',truncated:false},
});
const test = environment();
const support = test.env.PapastronomyAladinReferenceSupport;
const many = sample();
many.gaia.sources = Array.from({length:600},(_,i)=>({id:String(i),ra:10,dec:20}));
many.gaia.sources.push({id:'bad',ra:NaN,dec:20});
const capped = support.cleanContext(many);
assert.equal(capped.gaia.sources.length,500);
assert.equal(capped.gaia.validCount,600);
assert.equal(capped.gaia.truncated,true);
assert.match(support.describeCatalog('Gaia',capped.gaia),/500 de 600/);
assert.match(support.describeCatalog('Gaia',capped.gaia),/FoV 0.150/);
assert.equal(support.cleanContext({...sample(),fov:0}),null);
assert.equal(support.cleanContext({...sample(),ra:999}),null);
assert.equal(support.cleanContext({...sample(),dec:-91}),null);
const context = support.cleanContext(sample());
assert.ok(support.toolLink('gaia',context,test.doc.baseURI).includes('/api/tools/catalog.vot?catalog=gaia'));
assert.equal(new URL(support.toolLink('gaia',context,test.doc.baseURI)).searchParams.get('fov'),'0.15','La exportación conserva el FoV de consulta del catálogo');
assert.equal(new URL(support.externalLink(context)).origin,'https://aladin.cds.unistra.fr');

let current = sample();
const api = test.env.PapastronomyAladinReference.mount(test.container,{getContext:()=>current});
assert.equal(test.frames.length,0,'El panel cerrado no carga la biblioteca');
api.sync();
assert.equal(test.frames.length,0,'Sincronizar un panel cerrado no crea un iframe');
api.open();
assert.equal(test.frames.length,1);
const firstFrame = test.frames[0];
firstFrame.emit('load');
const init = firstFrame.contentWindow.messages[0];
assert.equal(init.origin,'https://example.test');
assert.equal(init.message.type,'init');
assert.equal(init.message.context.gaia.sources[0].id,'Gaia 1');
function message(frame, values, origin='https://example.test') {
  test.win.emit('message',{source:frame.contentWindow,origin,data:{channel:support.CHANNEL,token:init.message.token,...values}});
}
message(firstFrame,{type:'ready'},'https://other.test');
assert.equal(test.timers.size,1,'Ignora mensajes de otro origen');
test.win.emit('message',{source:{},origin:'https://example.test',data:{...init.message,type:'ready'}});
assert.equal(test.timers.size,1,'Ignora mensajes de otro frame');
message(firstFrame,{type:'ready'});
assert.equal(test.timers.size,0);
current = {...sample(),ra:200};
api.sync();
assert.equal(firstFrame.contentWindow.messages.at(-1).message.context.ra,200);
const wrapper = test.container.children[0];
message(firstFrame,{type:'position',ra:120,dec:-10,fov:2});
assert.match(wrapper.querySelector('.aladin-reference-position').textContent,/120.00000/);
assert.equal(current.ra,200,'La navegación de Aladin no cambia el campo científico');
wrapper.querySelector('details').open=false;
wrapper.querySelector('details').emit('toggle');
assert.equal(firstFrame.isConnected,false,'Cerrar el panel descarga el realm de Aladin');
api.open();
assert.equal(test.frames.length,2);
const timeout = [...test.timers.values()][0];
timeout();
assert.equal(test.frames[1].isConnected,false);
assert.equal(wrapper.querySelector('.aladin-reference-retry').hidden,false);
message(firstFrame,{type:'ready'});
assert.equal(wrapper.querySelector('.aladin-reference-retry').hidden,false,'Un frame anterior no reactiva la instancia');
wrapper.querySelector('.aladin-reference-retry').emit('click');
assert.equal(test.frames.length,3);
test.win.emit('pagehide');
assert.equal(test.frames[2].isConnected,false);
assert.equal(test.timers.size,0);
assert.equal(wrapper.isConnected,true,'La interfaz permanece disponible al volver desde bfcache');
test.win.emit('pageshow',{persisted:true});
assert.equal(test.frames.length,4,'Volver a una página cacheada reabre la referencia visible');
assert.equal(test.frames[3].isConnected,true);
api.destroy();
assert.equal(test.win.listeners.get('message').size,0);
assert.equal(test.observers[0].disconnected,true);
api.destroy();
const detached = environment();
const detachedApi = detached.env.PapastronomyAladinReference.mount(detached.container,{getContext:sample});
detachedApi.open();
detached.container.children[0].isConnected=false;
detached.observers[0].callback();
assert.equal(detached.frames[0].isConnected,false,'Retirar el contenedor libera el iframe');

// El idioma cruza el iframe sin sincronizar de nuevo el campo ni perder su vista.
const localized = environment();
let onLanguageChange, languageUnsubscribed=false, localizedContextReads=0;
localized.win.PapastronomyI18n={language:'en',subscribe(callback) {
  onLanguageChange=callback;return ()=>{languageUnsubscribed=true;};
}};
const localizedApi=localized.env.PapastronomyAladinReference.mount(localized.container,{getContext() {
  localizedContextReads++;return sample();
}});
localizedApi.open();
const localizedFrame=localized.frames[0];
assert.equal(new URL(localizedFrame.src).searchParams.get('lang'),'en');
localizedFrame.emit('load');
const localizedInit=localizedFrame.contentWindow.messages[0].message;
assert.equal(localizedInit.language,'en');
localized.win.emit('message',{source:localizedFrame.contentWindow,origin:'https://example.test',
  data:{channel:localizedInit.channel,token:localizedInit.token,type:'ready'}});
const readsBeforeLanguage=localizedContextReads;
const frameUrlBeforeLanguage=localizedFrame.src;
localized.win.PapastronomyI18n.language='es';onLanguageChange('es');
assert.equal(localizedFrame.contentWindow.messages.at(-1).message.type,'language');
assert.equal(localizedFrame.contentWindow.messages.at(-1).message.language,'es');
assert.equal(localizedContextReads,readsBeforeLanguage,'Traducir no vuelve a consultar el contexto científico');
assert.equal(localizedFrame.src,frameUrlBeforeLanguage,'Traducir no recarga el iframe ni su posición/zoom');
assert.equal(localized.frames.length,1);
assert.equal(localizedFrame.isConnected,true);
localizedApi.destroy();assert.equal(languageUnsubscribed,true);

let FrameSupport;
const frameEnvironment = {URL,location:{origin:'https://example.test'},parent:{postMessage(){}},
  window:{addEventListener(){},removeEventListener(){}},document:{getElementById(){return {};}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'frame.js'),'utf8'),frameEnvironment);
FrameSupport = frameEnvironment.PapastronomyAladinFrameSupport;
assert.match(FrameSupport.LIBRARY_URL,/@3\.8\.1\/dist\/aladin\.js$/);
const corners = FrameSupport.fieldCorners({ra:359.999,dec:89.99,fov:0.05});
assert.equal(corners.length,4);
assert.ok(corners.every(([ra,dec])=>Number.isFinite(ra)&&ra>=0&&ra<360&&Number.isFinite(dec)&&dec>=-90&&dec<=90));
// Golden values from pipeline.build_common_target_wcs(359.9,89.5,1.0), Astropy
// all_pix2world([[-.5,-.5],[127.5,-.5],[127.5,127.5],[-.5,127.5]], origin=0).
const wcsCorners = [
  [26.4656329619869, 88.88200290335138],
  [333.33436703801306, 88.88200290335138],
  [269.9014544299673, 89.50003172770329],
  [89.89854557003264, 89.50003172770329],
];
FrameSupport.fieldCorners({ra:359.9,dec:89.5,fov:1}).forEach(([ra,dec],index)=>{
  const deltaRa = ((ra - wcsCorners[index][0] + 540) % 360) - 180;
  assert.ok(Math.abs(deltaRa) < 1e-8, `Esquina TAN ${index}: RA coincide con Astropy`);
  assert.ok(Math.abs(dec - wcsCorners[index][1]) < 1e-8, `Esquina TAN ${index}: Dec coincide con Astropy`);
});
const layers = [];
const handlers = new Map();
const calls = [];
const aladin = {addCatalog(layer){layers.push(layer);},addOverlay(layer){layers.push(layer);},
  on(type,fn){handlers.set(type,fn);},off(type){handlers.delete(type);},
  gotoRaDec(ra,dec){calls.push(['goto',ra,dec]);},setFoV(fov){calls.push(['fov',fov]);},
  getRaDec(){return [200,10];},getFov(){return [0.05,0.05];},
  setImageSurvey(url){calls.push(['survey',url]);},removeOverlays(){layers.length=0;},
};
const A = {aladin(){return aladin;},catalog(options){return {name:options.name,sources:[],removeAll(){this.sources=[];},addSources(rows){this.sources.push(...rows);}};},
  source(ra,dec,data){return {ra,dec,data};},graphicOverlay(){return {removeAll(){},addFootprints(rows){this.rows=rows;}};},polygon(points){return points;},
};
const positions = [];
const renderer = FrameSupport.createRenderer(A,{},context,'dss2',point=>positions.push(point));
assert.equal(layers[0].sources.length,1);
assert.equal(layers[2].sources.length,1);
assert.equal(layers[2].name,'Selección al sincronizar');
assert.equal(layers[2].sources[0].data.id,'Selección al sincronizar');
assert.equal(layers[3].rows[0].length,4);
renderer.update(capped,'2mass');
assert.equal(layers[0].sources.length,500);
assert.equal(layers[2].sources.length,1,'No acumula marcadores de selección');
assert.ok(calls.some(call=>call[0]==='survey'&&call[1]==='https://skies.esac.esa.int/2MASSColor'));
renderer.destroy();renderer.destroy();
assert.equal(handlers.size,0);
assert.equal(layers.length,0);

const settle = () => new Promise(resolve => setImmediate(resolve));
function fullscreenFixture(options) {
  const fixture = environment(options);
  fixture.api = fixture.env.PapastronomyAladinReference.mount(fixture.container,{getContext:sample});
  fixture.api.open();
  fixture.wrapper = fixture.container.children[0];
  fixture.button = fixture.wrapper.querySelector('.aladin-reference-fullscreen');
  fixture.frame = fixture.frames[0];
  fixture.frame.emit('load');
  const initMessage = fixture.frame.contentWindow.messages[0].message;
  fixture.message = (values, origin='https://example.test', source=fixture.frame.contentWindow) => {
    fixture.win.emit('message',{source,origin,data:{channel:initMessage.channel,token:initMessage.token,...values}});
  };
  fixture.message({type:'ready'});
  return fixture;
}

function assertExpanded(fixture, expanded) {
  assert.equal(fixture.wrapper.classList.contains('aladin-reference-expanded'),expanded);
  assert.equal(fixture.button.getAttribute('aria-pressed'),String(expanded));
  assert.equal(fixture.button.textContent,expanded ? 'Salir de pantalla completa' : 'Pantalla completa');
}

async function checkFullscreen() {
  const native = fullscreenFixture({fullscreen:'supported',popover:true});
  native.wrapper.querySelector('.aladin-reference-survey').value='allwise';
  native.wrapper.querySelector('.aladin-reference-survey').emit('change');
  native.message({type:'position',ra:120,dec:-10,fov:2});
  const initialPosition = native.wrapper.querySelector('.aladin-reference-position').textContent;
  const initialMessages = native.frame.contentWindow.messages.length;
  native.button.emit('click');
  assert.equal(native.button.disabled,true,'Evita dos solicitudes de pantalla completa simultáneas');
  await settle();
  assert.equal(native.doc.fullscreenElement,native.wrapper);
  assertExpanded(native,true);
  assert.equal(native.button.disabled,false);
  assert.equal(native.fullscreenAPI.popoverShows,0,'Prefiere la API nativa');
  assert.equal(native.frames.length,1);
  assert.equal(native.frame.isConnected,true,'Entrar conserva el iframe y su navegación');
  assert.equal(native.wrapper.querySelector('.aladin-reference-survey').value,'allwise');
  assert.equal(native.wrapper.querySelector('.aladin-reference-position').textContent,initialPosition);
  assert.equal(native.frame.contentWindow.messages.length,initialMessages,'Entrar no resincroniza ni recentra la referencia');
  native.button.emit('click');
  await settle();
  assert.equal(native.doc.fullscreenElement,null);
  assertExpanded(native,false);
  assert.equal(native.fullscreenAPI.exits,1);
  assert.equal(native.frames.length,1,'Salir conserva el mismo iframe');
  native.button.emit('click');
  await settle();
  native.fullscreenAPI.escape();
  assertExpanded(native,false);
  assert.equal(native.frame.contentWindow.messages.length,initialMessages,'Escape nativo conserva el campo navegado');
  native.api.destroy();
  assert.equal(native.doc.listeners.get('fullscreenchange').size,0,'Destroy retira el listener de pantalla completa');

  const rejected = fullscreenFixture({fullscreen:'reject',popover:true});
  rejected.button.emit('click');
  await settle();
  assert.equal(rejected.doc.fullscreenElement,null);
  assert.equal(rejected.fullscreenAPI.popoverShows,1,'Un rechazo nativo usa el fallback disponible');
  assert.equal(rejected.wrapper.getAttribute('popover'),'manual');
  assertExpanded(rejected,true);
  assert.equal(rejected.frame.isConnected,true,'El rechazo de fullscreen no destruye Aladin');
  rejected.doc.emit('keydown',{key:'Escape'});
  await settle();
  assertExpanded(rejected,false);
  assert.equal(rejected.wrapper.getAttribute('popover'),null);
  assert.equal(rejected.fullscreenAPI.popoverHides,1);
  assert.equal(rejected.frames.length,1,'Escape del fallback conserva el iframe');
  rejected.button.emit('click');
  await settle();
  rejected.message({type:'exit-expanded'},'https://other.test');
  assertExpanded(rejected,true);
  rejected.message({type:'exit-expanded'},'https://example.test',{});
  assertExpanded(rejected,true);
  rejected.message({type:'exit-expanded',token:'other-token'});
  assertExpanded(rejected,true);
  rejected.message({type:'exit-expanded'});
  await settle();
  assertExpanded(rejected,false);
  rejected.button.emit('click');
  await settle();
  rejected.wrapper.popoverOpen=false;
  rejected.wrapper.emit('toggle',{oldState:'open',newState:'closed'});
  assertExpanded(rejected,false);
  assert.equal(rejected.wrapper.getAttribute('popover'),null,'Un cierre externo del popover limpia el estado del control');
  assert.equal(rejected.frames.length,1);
  rejected.api.destroy();

  const disabled = fullscreenFixture({fullscreen:'disabled',popover:true});
  disabled.button.emit('click');
  await settle();
  assert.equal(disabled.fullscreenAPI.requests.length,0,'fullscreenEnabled=false evita una solicitud nativa');
  assertExpanded(disabled,true);
  disabled.api.destroy();
  await settle();
  assert.equal(disabled.wrapper.popoverOpen,false,'Destroy cierra el fallback');
  assert.equal(disabled.wrapper.getAttribute('popover'),null);

  for (const fullscreen of [false,'reject']) {
    const unavailable = fullscreenFixture({fullscreen});
    unavailable.button.emit('click');
    await settle();
    assertExpanded(unavailable,false);
    assert.equal(unavailable.button.disabled,false);
    assert.match(unavailable.wrapper.querySelector('.aladin-reference-status').textContent,/pantalla|ampli|navegador/i);
    assert.equal(unavailable.frame.isConnected,true,'La falta de API conserva la referencia utilizable');
    assert.equal(unavailable.frames.length,1);
    unavailable.api.destroy();
  }

  const failedAladin = fullscreenFixture({fullscreen:'reject'});
  failedAladin.message({type:'error',message:'Error persistente de la referencia externa.'});
  assert.equal(failedAladin.wrapper.querySelector('.aladin-reference-retry').hidden,false);
  failedAladin.button.emit('click');
  await settle();
  assert.equal(failedAladin.wrapper.querySelector('.aladin-reference-retry').hidden,false,'El rechazo de fullscreen conserva Reintentar tras un error de Aladin');
  assert.match(failedAladin.wrapper.querySelector('.aladin-reference-status').textContent,/Error persistente de la referencia externa/);
  failedAladin.api.destroy();

  for (const fullscreen of ['supported','reject']) for (const end of ['destroy','close','pagehide']) {
    const active = fullscreenFixture({fullscreen,popover:true});
    active.button.emit('click');
    await settle();
    if (end === 'destroy') active.api.destroy();
    else if (end === 'close') {
      active.wrapper.querySelector('details').open=false;
      active.wrapper.querySelector('details').emit('toggle');
    } else active.win.emit('pagehide');
    await settle();
    assert.equal(active.doc.fullscreenElement,null,`${end} sale de fullscreen propio`);
    assert.equal(active.fullscreenAPI.exits,fullscreen === 'supported' ? 1 : 0);
    if (fullscreen === 'reject') {
      assert.equal(active.wrapper.popoverOpen,false);
      assert.equal(active.wrapper.getAttribute('popover'),null);
    }
    assert.equal(active.frame.isConnected,false);
    active.api.destroy();
  }

  for (const end of ['destroy','close','pagehide']) {
    const pending = fullscreenFixture({fullscreen:'deferred'});
    pending.button.emit('click');
    assert.equal(pending.fullscreenAPI.pending.length,1);
    assert.equal(pending.button.disabled,true);
    if (end === 'destroy') pending.api.destroy();
    else if (end === 'close') {
      pending.wrapper.querySelector('details').open=false;
      pending.wrapper.querySelector('details').emit('toggle');
    } else pending.win.emit('pagehide');
    pending.fullscreenAPI.resolveNext();
    await settle();
    assert.equal(pending.doc.fullscreenElement,null,`Una entrada tardía después de ${end} se revierte`);
    assert.equal(pending.fullscreenAPI.exits,1);
    assert.equal(pending.frame.isConnected,false);
    pending.api.destroy();
  }

  const rejectedAfterDestroy = fullscreenFixture({fullscreen:'deferred',popover:true});
  rejectedAfterDestroy.button.emit('click');
  rejectedAfterDestroy.api.destroy();
  rejectedAfterDestroy.fullscreenAPI.rejectNext();
  await settle();
  assert.equal(rejectedAfterDestroy.fullscreenAPI.popoverShows,0,'Un rechazo tardío no abre el fallback de una instancia destruida');
  assert.equal(rejectedAfterDestroy.doc.fullscreenElement,null);

  for (const lifecycle of ['reopen','restore']) for (const outcome of ['resolve','reject']) {
    const stale = fullscreenFixture({fullscreen:'deferred',popover:true});
    stale.button.emit('click');
    if (lifecycle === 'reopen') {
      stale.wrapper.querySelector('details').open=false;
      stale.wrapper.querySelector('details').emit('toggle');
      stale.api.open();
    } else {
      stale.win.emit('pagehide');
      stale.win.emit('pageshow',{persisted:true});
    }
    assert.equal(stale.frames.length,2,'La reapertura/restauración inicia una nueva referencia');
    const reopenedFrame = stale.frames[1];
    const reopenedStatus = stale.wrapper.querySelector('.aladin-reference-status').textContent;
    if (outcome === 'resolve') stale.fullscreenAPI.resolveNext();
    else stale.fullscreenAPI.rejectNext();
    await settle();
    assert.equal(stale.doc.fullscreenElement,null,`${lifecycle}: una solicitud anterior no expande el panel restaurado`);
    assert.equal(stale.fullscreenAPI.popoverShows,0,`${lifecycle}: un rechazo anterior no abre el fallback`);
    assertExpanded(stale,false);
    assert.equal(reopenedFrame.isConnected,true,'La continuación obsoleta conserva el iframe nuevo');
    assert.equal(stale.wrapper.querySelector('.aladin-reference-status').textContent,reopenedStatus);
    stale.api.destroy();
  }

  const foreign = fullscreenFixture({fullscreen:'supported'});
  const otherElement = new Node(foreign.doc);
  foreign.fullscreenAPI.enter(otherElement);
  assertExpanded(foreign,false,'La expansión de otro elemento no cambia este botón');
  foreign.api.destroy();
  await settle();
  assert.equal(foreign.doc.fullscreenElement,otherElement,'Destroy no sale de fullscreen ajeno');
  assert.equal(foreign.fullscreenAPI.exits,0);
}

checkFullscreen().then(() => {
  console.log('Aladin complementario: carga lazy, catálogo limitado, mensajes verificados, errores/reintento y liberación del iframe OK.');
  console.log('Pantalla completa mock: entrada/salida/Escape, fallback, rechazo, carreras async y limpieza OK.');
  console.log('Renderer mock: capas reales de catálogo, selección, FoV, fondos ESA y navegación independiente OK. Sin validación GPU.');
}).catch(error => { console.error(error); process.exitCode=1; });
