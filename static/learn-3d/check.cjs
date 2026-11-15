// Estado del componente y liberación de recursos. No simula una GPU ni un navegador.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frames = new Map();
let id = 0;
let Viewer;
class Element {
  constructor() { this.attributes = {}; this.isConnected = true; }
  attachShadow() { this.shadowRoot = {}; }
  getAttribute(key) { return this.attributes[key]; }
}
const context = vm.createContext({
  window: {}, URL, HTMLElement: Element,
  document: { currentScript: {src:'https://example.test/assets/learn-3d/viewer.js'}, hidden:false },
  customElements: { get() {}, define(name, definition) { Viewer = definition; } },
  requestAnimationFrame(callback) { frames.set(++id,callback); return id; },
  cancelAnimationFrame(key) { frames.delete(key); },
  console: { warn() {} },
});
for (const name of ['content.js','viewer.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8'),context,{filename:name});
const content = context.window.Papastronomy3DContent;
assert.ok(Object.isFrozen(content) && Object.isFrozen(content.topics[0]));
assert.match(content.limits,/no reconstruye/i);
for (const topic of content.topics) {
  assert.ok(topic.simple && topic.technical && content.sources[topic.source]);
}

const viewer = new Viewer();
viewer.content = content;
const nodes = new Map();
const node = key => {
  if (!nodes.has(key)) nodes.set(key,{ textContent:'', value:'', disabled:false, hidden:true,
    setAttribute(name,value) { this[name]=value; } });
  return nodes.get(key);
};
viewer.$ = node;
const topicButtons = content.topics.map(topic => ({dataset:{topic:topic.id},setAttribute(name,value) {this[name]=value;}}));
const modeButtons = [0,1].map(mode => ({dataset:{mode:String(mode)},setAttribute(name,value) {this[name]=value;}}));
viewer.shadowRoot.querySelectorAll = selector => selector === '[data-topic]' ? topicButtons : modeButtons;
let draws = 0;
viewer.engine = {draw() {draws++;}};
viewer.selectTopic(0);
assert.equal(node('.explanation').textContent,content.topics[0].simple);
viewer.attributes.explanation = 'technical'; viewer.attributeChangedCallback();
assert.equal(node('.explanation').textContent,content.topics[0].technical);
viewer.attributes.explanation = '<img src=x onerror=alert(1)>'; viewer.attributeChangedCallback();
assert.equal(node('select').value,'simple','Un atributo desconocido usa el estilo simple');
viewer.selectTopic(2);
assert.equal(node('.source').href,content.sources.spherex.url);
assert.equal(topicButtons.filter(button=>button['aria-pressed']==='true').length,1);
viewer.setMode(1);
assert.equal(viewer.infrared,1);
assert.match(node('.caption').textContent,/no indican temperaturas/);
assert.equal(modeButtons[1]['aria-pressed'],'true');
viewer.setZoom(10); assert.equal(viewer.zoom,1.35);
viewer.setZoom(-4); assert.equal(viewer.zoom,.75);
viewer.reset(); assert.equal(viewer.zoom,1); assert.equal(viewer.phase,0);
assert.ok(draws > 0);

viewer.setPlaying(true);
assert.equal(frames.size,1);
viewer.setPlaying(true);
assert.equal(frames.size,1,'Animar dos veces no duplica el ciclo');
viewer.setPlaying(false);
assert.equal(frames.size,0);
assert.equal(node('.play').textContent,'Animar objeto');
viewer.inView=false; viewer.setPlaying(true);
assert.equal(frames.size,0,'Fuera de pantalla no se anima');
viewer.inView=true; context.document.hidden=true; viewer.schedule();
assert.equal(frames.size,0,'La pestaña oculta no se anima');
context.document.hidden=false; viewer.schedule();
assert.equal(frames.size,1,'Al volver se reanuda');

let destroyed=0,aborted=0,disconnected=0;
viewer.engine.destroy=()=>destroyed++;
viewer.abort={abort() {aborted++;}};
viewer.resize=viewer.intersection={disconnect() {disconnected++;}};
viewer.disconnectedCallback();
assert.equal(frames.size,0); assert.equal(destroyed,1); assert.equal(aborted,1); assert.equal(disconnected,2);
viewer.disconnectedCallback(); assert.equal(destroyed,1,'Liberar dos veces es seguro');

viewer.canvas={getContext() {return null;}};
viewer.startRenderer();
assert.equal(node('.fallback').hidden,false,'Sin WebGL se informa la limitación');
assert.equal(node('.play').disabled,true);
viewer.selectTopic(1);
assert.equal(node('.explanation').textContent,content.topics[1].simple,'El contenido funciona sin GPU');
console.log('3D: contenido, estilos, temas, paletas, zoom, pausa, visibilidad, liberación y ausencia de WebGL: OK.');
