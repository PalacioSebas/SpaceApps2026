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
  }
  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    options.signal?.addEventListener('abort', () => this.listeners.get(type).delete(callback), {once:true});
  }
  emit(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback(event); }
  append(child) { this.children.push(child); child.parent = this; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node(this.ownerDocument));
    const node = this.nodes.get(selector);
    if (selector === '.aladin-reference-survey' && !node.value) node.value = 'dss2';
    return node;
  }
}

function environment() {
  const win = new Node();
  const timers = new Map();
  const observers = [];
  const frames = [];
  const doc = { baseURI:'https://example.test/tool/', currentScript:{src:'https://example.test/static/aladin-reference/reference.js'}, defaultView:win,
    documentElement:{}, createElement(tag) {
      const node = new Node(doc);
      if (tag === 'iframe') {
        node.contentWindow = { messages:[], postMessage(message, origin) {this.messages.push({message,origin});} };
        frames.push(node);
      }
      return node;
    },
  };
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
  return {env,doc,win,timers,frames,observers,container:new Node(doc)};
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
console.log('Aladin complementario: carga lazy, catálogo limitado, mensajes verificados, errores/reintento y liberación del iframe OK.');
console.log('Renderer mock: capas reales de catálogo, selección, FoV, fondos ESA y navegación independiente OK. Sin validación GPU.');
