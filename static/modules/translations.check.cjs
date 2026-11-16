// Localización de presentación: los contratos, valores y reglas siguen en español internamente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const environment = vm.createContext({
  URL, AbortController, DOMException,
  location: new URL('https://example.test/modules/?lang=es&ra=133.795'),
  localStorage: {getItem() {return null;},setItem() {}},
  document: {readyState:'loading',documentElement:{lang:'es'},addEventListener() {}},
  window: {addEventListener() {},dispatchEvent() {}},
  CustomEvent: class {constructor(type, options) {this.type=type;Object.assign(this,options);}},
});
for (const file of ['i18n.js','translations.js','access/model.js','assistant/rules.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),environment,{filename:file});
}
const i18n=environment.PapastronomyI18n;
const rules=environment.PapastronomyAssistantRules;
const profiles=environment.PapastronomyProfiles;
assert.ok(Object.isFrozen(environment.PapastronomyModuleTranslations));
assert.ok(environment.PapastronomyModuleTranslations.every(Object.isFrozen));
const store=new profiles.Store({getItem() {return null;},setItem() {}});
store.enter('principiante',{alias:'Explorador',interest:'analisis',explanations:'tecnica'});
store.remember({maxFrames:24,fps:1.2,showFlags:true});
const profileBefore=JSON.stringify(store.data);
const context={profile:store.get(),target:{ra:133.795,dec:-7.245,fov:.05,total_frames:24,total_epochs:3,
  total_bands:4,difference_available:true,matched_target_name:'WISE 0855'},
  detections:[{id:7,type:'MOVING_DIPOLE',snr_score:8.5,shift_arcsec:1.25}],selectedDetectionId:7};
const responseBefore=JSON.stringify(rules.reply('Explicá el candidato seleccionado',context));
const proposalBefore=JSON.stringify(rules.propose(context));
const question='¿Qué es una enana marrón?';
assert.equal(i18n.t(question),question);
i18n.setLanguage('en');
assert.equal(i18n.t(question),'What is a brown dwarf?');
assert.equal(i18n.t('Mi perfil'),'My profile');
assert.equal(i18n.t('Principiante · Sin campo cargado'),'Beginner · No field loaded');
assert.equal(i18n.t('Avanzado · WISE 0855'),'Advanced · WISE 0855');
assert.equal(i18n.t('Centro: RA 133.79500°, Dec -7.24500°.'),'Center: RA 133.79500°, Dec -7.24500°.');
assert.equal(i18n.t('Señal reportada por el detector: 8,5σ. Desplazamiento aparente: 1,25″.'),
  'Signal reported by the detector: 8,5σ. Apparent displacement: 1,25″.');
assert.equal(i18n.t('Gaia: 500 de 700 fuentes · lista limitada · CDS VizieR · consulta FoV 0.050°.'),
  'Gaia: 500 of 700 sources · limited list · CDS VizieR · query FoV 0.050°.');
const greeting='Hola, Explorador. Puedo explicar el campo, revisar candidatos y preparar ajustes. Elegí una guía o escribí una consulta.';
assert.equal(i18n.t(greeting),'Hello, Explorador. I can explain the field, review candidates and prepare settings. Choose a guide or type a question.',
  'Un alias que coincide con una etiqueta no se traduce dentro de la frase');
const summary=rules.reply('¿Qué es SPHEREx?',{}).summary;
assert.notEqual(i18n.t(summary),summary,'El resumen abreviado de la guía se traduce');
const translatedCandidate=i18n.t(rules.reply('Explicá el candidato seleccionado',context).text);
assert.ok(translatedCandidate.includes('Signal reported by the detector: 8,5σ.'),
  'Una plantilla con identificador no captura el resto de una respuesta multilínea');
assert.ok(translatedCandidate.includes('Compare dates with the buttons on its card.'),
  'Las líneas siguientes de la explicación también se traducen');
assert.equal(JSON.stringify(store.data),profileBefore,'El idioma no cambia datos ni preferencias de la cuenta');
assert.equal(JSON.stringify(rules.reply('Explicá el candidato seleccionado',context)),responseBefore,
  'Las respuestas y mediciones del proveedor conservan su contrato original');
assert.equal(JSON.stringify(rules.propose(context)),proposalBefore,'Las propuestas no cambian con el idioma');
assert.equal(rules.classify(question),'brownDwarf','La clasificación existente se conserva');
for (const raw of ['WISE 0855','MOVING_DIPOLE','D1','1.20 µm','0.05','Explorador de Orión']) {
  assert.equal(i18n.t(raw),raw,'Se conservan identificadores y valores sin una traducción de interfaz');
}
i18n.setLanguage('es');
assert.equal(i18n.t('My profile'),'Mi perfil');
assert.equal(i18n.t('Advanced · WISE 0855'),'Avanzado · WISE 0855');
assert.equal(JSON.stringify(store.data),profileBefore);
console.log('Traducciones de módulos: ES/EN, plantillas, alias/datos preservados y contratos de perfiles/proveedor intactos: OK.');
