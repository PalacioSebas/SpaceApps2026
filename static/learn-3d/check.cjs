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
  document: { currentScript: {src:'https://example.test/assets/learn-3d/viewer.js'}, hidden:false,
    createElement() { return {dataset:{},children:[],append(...children) {this.children.push(...children);}}; },
    createTextNode(text) {return {textContent:text};},
  },
  customElements: { get() {}, define(name, definition) { Viewer = definition; } },
  requestAnimationFrame(callback) { frames.set(++id,callback); return id; },
  cancelAnimationFrame(key) { frames.delete(key); },
  console: { warn() {} },
});
for (const name of ['content.js','viewer.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8'),context,{filename:name});
const content = context.window.Papastronomy3DContent;
assert.ok(Object.isFrozen(content) && Object.isFrozen(content.topics[0]));
assert.match(content.limits,/no reconstruye/i);
const objects = context.window.Papastronomy3DObjects;
assert.equal(objects['brown-dwarf'],content,'Se conserva el contrato previo');
for (const object of Object.values(objects)) {
  assert.ok(Object.isFrozen(object));
  for (const topic of object.topics) {
    assert.ok(topic.simple && topic.technical && object.sources[topic.source]);
  }
}

const viewer = new Viewer();
viewer.content = content;
const nodes = new Map();
const node = key => {
  if (!nodes.has(key)) nodes.set(key,{ textContent:'', value:'', disabled:false, hidden:true,children:[],
    replaceChildren() {this.children=[];}, append(...children) {this.children.push(...children);},
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
assert.equal(node('.explanation-picker').value,'simple','Un atributo desconocido usa el estilo simple');
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

viewer.canvas=node('canvas'); viewer.objects=objects;
const engine=viewer.engine;
viewer.attributes.explanation='technical';
viewer.selectObject('young-star');
assert.equal(viewer.objectKind,1);
assert.equal(node('h1').textContent,objects['young-star'].title);
assert.equal(node('.limits').textContent,objects['young-star'].limits);
assert.equal(node('.explanation').textContent,objects['young-star'].topics[0].technical);
assert.equal(node('.topics').children.length,3);
assert.equal(node('.hotspots').children.length,3);
assert.equal(viewer.infrared,1,'Cambiar de objeto conserva la paleta');
assert.equal(viewer.engine,engine,'El selector reutiliza el renderizador');
assert.equal(viewer.pitch,.65,'El disco se inicia inclinado');
assert.equal(node('.orbit').hidden,true);
viewer.selectTopic(2);
assert.ok(node('.source').href.includes('young-star-devouring'));
viewer.attributes.object='brown-dwarf'; viewer.attributeChangedCallback('object');
assert.equal(viewer.objectKind,0);
assert.equal(node('.topics').children.length,3,'No se acumulan controles al alternar');
assert.equal(viewer.topicIndex,0);
assert.equal(node('.orbit').hidden,false);
viewer.selectObject('__proto__');
assert.equal(viewer.content.id,'brown-dwarf','Un objeto desconocido usa el predeterminado');
viewer.attributes.explanation='simple'; viewer.attributeChangedCallback('explanation');

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
console.log('3D: dos objetos, cambio de escena, estilos, temas, paletas, zoom, pausa, visibilidad, liberación y ausencia de WebGL: OK.');

// El adaptador standalone conserva el objeto elegido en enlaces compartibles.
const attributes={};
let changeObject,sharedUrl;
const standalone={
  setAttribute(name,value) {attributes[name]=value;}, getAttribute(name) {return attributes[name];},
  shadowRoot:{querySelector() {return {addEventListener(name,handler) {changeObject=handler;}};}},
};
const returnNodes={};
const pageContext={URL,URLSearchParams,
  location:new URL('https://example.test/models/index.html?object=young-star&explanation=technical&from=explorer'),
  document:{querySelector() {return standalone;},getElementById(id) {return returnNodes[id] ||= {hidden:true};}},
  history:{replaceState(state,title,url) {sharedUrl=url;}},
};
const pageCode=fs.readFileSync(path.join(__dirname,'page.js'),'utf8');
vm.runInNewContext(pageCode,pageContext);
assert.equal(attributes.object,'young-star');
assert.equal(attributes.explanation,'technical');
assert.equal(returnNodes['return-link'].hidden,false);
attributes.object='brown-dwarf';changeObject();
assert.equal(sharedUrl.searchParams.get('object'),'brown-dwarf');
assert.equal(sharedUrl.searchParams.get('explanation'),'technical');
assert.equal(sharedUrl.searchParams.get('from'),'explorer');
pageContext.location=new URL('https://example.test/models/index.html?object=unknown&explanation=unknown');
vm.runInNewContext(pageCode,pageContext);
assert.equal(attributes.object,'brown-dwarf');
assert.equal(attributes.explanation,'simple');
console.log('Página portable: selección por URL, estilo y cambio de objeto compartible: OK.');
