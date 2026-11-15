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
  setAttribute(key, value) { this.attributes[key] = String(value); }
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
for (const name of ['content.js','i18n.js','viewer.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8'),context,{filename:name});
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

const locales = context.window.Papastronomy3DLocales;
const uiLocales = context.window.Papastronomy3DI18n;
assert.equal(locales.es, objects, 'El catálogo español conserva el contrato original');
assert.ok(Object.isFrozen(locales) && Object.isFrozen(locales.en));
assert.deepEqual(Object.keys(locales.en), Object.keys(locales.es));
assert.deepEqual(Object.keys(uiLocales.en).sort(), Object.keys(uiLocales.es).sort());
for (const language of ['es', 'en']) {
  assert.ok(Object.isFrozen(uiLocales[language]));
  for (const value of Object.values(uiLocales[language])) {
    assert.equal(typeof value, 'string');
    assert.ok(value.trim(), `Traducción de interfaz vacía en ${language}`);
  }
  for (const [objectId, object] of Object.entries(locales[language])) {
    const original = objects[objectId];
    assert.equal(object.id, original.id);
    assert.equal(object.reviewedOn, original.reviewedOn);
    assert.ok(Object.isFrozen(object) && Object.isFrozen(object.topics[0]));
    for (const key of ['title', 'subtitle', 'category', 'disclosure', 'limits']) {
      assert.ok(object[key].trim(), `Falta ${key} en ${language}/${objectId}`);
    }
    assert.equal(object.topics.length, original.topics.length);
    object.topics.forEach((topic, index) => {
      const reference = original.topics[index];
      for (const key of ['id', 'number', 'source']) assert.equal(topic[key], reference[key]);
      for (const key of ['title', 'short', 'activity', 'simple', 'technical', 'takeaway']) {
        assert.ok(topic[key].trim(), `Falta ${key} en ${language}/${objectId}/${topic.id}`);
        if (language === 'en') assert.notEqual(topic[key], reference[key], `Sin traducir ${objectId}/${topic.id}/${key}`);
      }
      assert.equal(object.sources[topic.source].url, original.sources[topic.source].url);
    });
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
const translatedTextNodes = ['reset', 'fallback', 'guideStart'].map(key => ({dataset:{i18n:key},textContent:''}));
const translatedAriaNodes = ['hotspotsLabel', 'zoomLabel'].map(key => ({
  dataset:{i18nAria:key},setAttribute(name,value) {this[name]=value;},
}));
viewer.shadowRoot.querySelectorAll = selector => {
  if (selector === '[data-topic]') return topicButtons;
  if (selector === '[data-mode]') return modeButtons;
  if (selector === '[data-i18n]') return translatedTextNodes;
  if (selector === '[data-i18n-aria]') return translatedAriaNodes;
  return [];
};
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

// El recorrido prepara escenas reversibles; los controles manuales siguen disponibles.
viewer.selectObject('young-star'); viewer.selectTopic(2); viewer.setMode(0);viewer.setZoom(1.2);
viewer.yaw=.8;viewer.pitch=.9;viewer.phase=4;viewer.setDiskVisible(false);viewer.setPlaying(true);
const beforeGuide={yaw:viewer.yaw,pitch:viewer.pitch,zoom:viewer.zoom,phase:viewer.phase,
  infrared:viewer.infrared,diskVisible:viewer.diskVisible,playing:viewer.playing,topicIndex:viewer.topicIndex};
viewer.startGuide();
assert.equal(viewer.guided,true);assert.equal(viewer.playing,false);assert.equal(frames.size,0);
assert.equal(viewer.topicIndex,0);assert.equal(viewer.diskVisible,0);
assert.equal(node('.guide-progress').hidden,false);assert.equal(node('.guide-progress').value,1);
assert.equal(node('.previous').disabled,true);
const snapshot=viewer.guideSnapshot;viewer.startGuide();assert.equal(viewer.guideSnapshot,snapshot);
viewer.nextTopic();assert.equal(viewer.diskVisible,1);assert.equal(viewer.infrared,1);
viewer.setDiskVisible(false);assert.equal(viewer.diskVisible,0);
assert.equal(node('.disk-toggle')['aria-pressed'],'false');
viewer.attributes.explanation='technical';viewer.attributeChangedCallback('explanation');
assert.equal(viewer.diskVisible,0,'Cambiar explicación no altera la comparación manual');
viewer.nextTopic();assert.equal(viewer.pitch,.22);assert.equal(node('.next').textContent,'Terminar recorrido ✓');
viewer.nextTopic();assert.equal(viewer.guided,false);assert.equal(viewer.guideSnapshot,null);
for(const [key,value] of Object.entries(beforeGuide))assert.equal(viewer[key],value,`Se restaura ${key}`);
assert.equal(frames.size,1);assert.match(node('.guide-status').textContent,/completo/);
viewer.startGuide();viewer.stopGuide();assert.equal(viewer.diskVisible,0);
viewer.startGuide();viewer.selectObject('brown-dwarf');
assert.equal(viewer.guided,false);assert.equal(viewer.guideSnapshot,null);assert.equal(node('.disk-row').hidden,true);
viewer.startGuide();viewer.selectTopic(2);assert.equal(viewer.infrared,1);
viewer.stopGuide();assert.equal(viewer.topicIndex,0);
viewer.selectObject('young-star');assert.equal(node('.disk-row').hidden,false);assert.equal(viewer.diskVisible,1);
viewer.selectObject('brown-dwarf');viewer.attributes.explanation='simple';viewer.setPlaying(false);

// Traducir durante el recorrido conserva la comparación manual y su restauración.
viewer.attributes.object='young-star';
viewer.attributes.explanation='technical';
viewer.selectObject('young-star');
viewer.setZoom(1.17);
viewer.yaw=.7;viewer.pitch=.8;viewer.phase=12;
viewer.startGuide();viewer.nextTopic();
viewer.setDiskVisible(false);viewer.setMode(0);viewer.setZoom(1.24);
viewer.yaw=.9;viewer.pitch=.3;viewer.phase=14;
const languageStateKeys = ['objectKind','topicIndex','yaw','pitch','zoom','phase',
  'infrared','diskVisible','playing','guided','guideSnapshot'];
const beforeLanguage = Object.fromEntries(languageStateKeys.map(key => [key, viewer[key]]));
const originalSnapshot = viewer.guideSnapshot;
viewer.attributes.lang='en';viewer.attributeChangedCallback('lang');
assert.equal(viewer.content, locales.en['young-star']);
assert.equal(node('h1').textContent, locales.en['young-star'].title);
assert.equal(node('.explanation').textContent, locales.en['young-star'].topics[1].technical);
assert.equal(node('.guide-task p').textContent, locales.en['young-star'].topics[1].activity);
assert.equal(node('.topics').children.length,3);
assert.equal(node('.topics').children[1].textContent,locales.en['young-star'].topics[1].short);
assert.equal(viewer.engine,engine,'Traducir reutiliza el renderizador');
assert.equal(node('.caption').textContent,uiLocales.en.captionVisible);
assert.equal(node('.disk-toggle').textContent,uiLocales.en.showDisk);
assert.equal(node('.play').textContent,uiLocales.en.play);
assert.equal(node('.next').textContent,uiLocales.en.nextStep);
assert.equal(node('.guide-status').textContent,uiLocales.en.guideStarted);
assert.ok(viewer.canvas['aria-label'].includes(locales.en['young-star'].title));
for (const element of translatedTextNodes) assert.equal(element.textContent,uiLocales.en[element.dataset.i18n]);
for (const element of translatedAriaNodes) assert.equal(element['aria-label'],uiLocales.en[element.dataset.i18nAria]);
for (const key of languageStateKeys) assert.equal(viewer[key],beforeLanguage[key],`Traducir conserva ${key}`);
viewer.attributes.lang='es';viewer.attributeChangedCallback('lang');
assert.equal(node('.explanation').textContent, objects['young-star'].topics[1].technical);
for (const key of languageStateKeys) assert.equal(viewer[key],beforeLanguage[key],`Volver a español conserva ${key}`);
viewer.attributes.lang='__proto__';viewer.attributeChangedCallback('lang');
assert.equal(viewer.content, objects['young-star'],'Un idioma desconocido usa español');
viewer.stopGuide();
for (const [key,value] of Object.entries(originalSnapshot)) assert.equal(viewer[key],value,`El recorrido bilingüe restaura ${key}`);
viewer.attributes.lang='es';viewer.attributes.object='brown-dwarf';viewer.attributes.explanation='simple';
viewer.selectObject('brown-dwarf');viewer.setPlaying(false);

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
viewer.startGuide();assert.equal(viewer.guided,true);viewer.stopGuide();
console.log('3D: dos objetos, cambio de escena, estilos, temas, paletas, zoom, pausa, visibilidad, liberación y ausencia de WebGL: OK.');

const pageCode=fs.readFileSync(path.join(__dirname,'page.js'),'utf8');

function createPage(query = '', savedLanguage = null, storageDenied = false) {
  const attributes = {};
  const state = {savedLanguage, writes:[], handlers:{}};
  const makeNode = () => ({hidden:true,textContent:'',dataset:{},
    setAttribute(name,value) {this[name]=value;},
    addEventListener(name,handler) {this.handlers ||= {};this.handlers[name]=handler;},
  });
  const standalone = {
    setAttribute(name,value) {attributes[name]=value;}, getAttribute(name) {return attributes[name];},
    shadowRoot:{querySelector(selector) {return {
      addEventListener(name,handler) {state.handlers[selector]=handler;},
    };}},
  };
  const buttons = ['es','en'].map(language => Object.assign(makeNode(), {dataset:{language}}));
  const translatedPageNodes = ['moduleName','returnLink','footerLabel','footerText','returnHint']
    .map(key => Object.assign(makeNode(), {dataset:{pageI18n:key}}));
  const nodes = {};
  const description = makeNode();
  const storage = {
    getItem(key) {
      assert.equal(key,'papastronomy-lang');
      if (storageDenied) throw new Error('Storage blocked');
      return state.savedLanguage;
    },
    setItem(key,value) {
      assert.equal(key,'papastronomy-lang');
      if (storageDenied) throw new Error('Storage blocked');
      state.savedLanguage=value;state.writes.push(value);
    },
  };
  const pageContext = {
    URL,URLSearchParams,localStorage:storage,
    window:{Papastronomy3DI18n:uiLocales,localStorage:storage,addEventListener() {}},
    location:new URL('https://example.test/models/index.html' + query),
    document:{
      title:'',documentElement:{lang:'es-AR'},
      querySelector(selector) {return selector.startsWith('meta') ? description : standalone;},
      querySelectorAll(selector) {return selector === '[data-language]' ? buttons : translatedPageNodes;},
      getElementById(id) {return nodes[id] ||= makeNode();},
    },
    history:{replaceState(state,title,url) {pageContext.location=new URL(url);}},
  };
  vm.runInNewContext(pageCode,pageContext);
  return {attributes,state,buttons,translatedPageNodes,nodes,description,context:pageContext,
    click(language) {
      const button=buttons.find(item => item.dataset.language === language);
      button.handlers.click({target:button,currentTarget:button});
    },
  };
}

// Compartir idioma conserva selección, estilo y origen del enlace.
const page = createPage('?object=young-star&explanation=technical&from=explorer&lang=en','es');
assert.equal(page.attributes.object,'young-star');
assert.equal(page.attributes.explanation,'technical');
assert.equal(page.attributes.lang,'en','El parámetro de URL prevalece sobre la preferencia guardada');
assert.equal(page.nodes['return-link'].hidden,false);
assert.equal(page.nodes['return-hint'].hidden,false);
assert.equal(page.context.document.documentElement.lang,'en');
assert.equal(page.context.document.title,uiLocales.en.pageTitle);
assert.equal(page.description.content,uiLocales.en.pageDescription);
for (const element of page.translatedPageNodes) assert.equal(element.textContent,uiLocales.en[element.dataset.pageI18n]);
page.click('es');
assert.equal(page.attributes.lang,'es');
assert.equal(page.state.savedLanguage,'es');
assert.equal(page.context.document.documentElement.lang,'es-AR');
assert.equal(page.nodes['language-switch']['aria-label'],uiLocales.es.languageLabel);
assert.equal(page.context.location.searchParams.get('lang'),'es');
assert.equal(page.context.location.searchParams.get('object'),'young-star');
assert.equal(page.context.location.searchParams.get('explanation'),'technical');
assert.equal(page.context.location.searchParams.get('from'),'explorer');
assert.equal(page.buttons[0]['aria-pressed'],'true');
assert.equal(page.buttons[1]['aria-pressed'],'false');
assert.equal(createPage('',page.state.savedLanguage).attributes.lang,'es','La elección se conserva en una nueva visita');
page.attributes.object='brown-dwarf';page.state.handlers['.object-picker']();
assert.equal(page.context.location.searchParams.get('object'),'brown-dwarf');
assert.equal(page.context.location.searchParams.get('lang'),'es');

assert.equal(createPage('', 'en').attributes.lang,'en','Recupera la preferencia guardada');
assert.equal(createPage().attributes.lang,'es','Sin preferencia, comienza en español');
const invalidPage=createPage('?object=unknown&explanation=unknown&lang=unknown','invalid');
assert.equal(invalidPage.attributes.object,'brown-dwarf');
assert.equal(invalidPage.attributes.explanation,'simple');
assert.equal(invalidPage.attributes.lang,'es');
const privatePage=createPage('?lang=en', null, true);
assert.equal(privatePage.attributes.lang,'en','El visor funciona cuando localStorage está bloqueado');
privatePage.click('es');
assert.equal(privatePage.attributes.lang,'es');
assert.equal(privatePage.context.location.searchParams.get('lang'),'es');
console.log('Idiomas: catálogos completos, recorrido reversible, preferencia local y enlaces ES/EN: OK.');
