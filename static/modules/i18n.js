/* Localización ES/EN de la interfaz. No modifica valores, datos ni controles científicos. */
(() => {
  'use strict';
  if (globalThis.PapastronomyI18n) return;
  const KEY = 'papastronomy-lang';
  const EVENT = 'papastronomy-lang-change';
  const valid = value => value === 'es' || value === 'en';
  const exact = { es: new Map(), en: new Map() };
  const patterns = { es: [], en: [] };
  const cache = { es: new Map(), en: new Map() };
  const watched = new Map();
  const textState = new WeakMap();
  const attributeState = new WeakMap();
  const listeners = new Set();
  const attributes = ['title', 'placeholder', 'aria-label', 'aria-description', 'aria-valuetext', 'alt', 'label'];
  const ignore = 'script,style,textarea,pre,code,[contenteditable],[data-i18n-skip]';
  let language = 'es';
  try {
    const requested = new URL(location.href).searchParams.get('lang');
    const saved = localStorage.getItem(KEY);
    language = valid(requested) ? requested : valid(saved) ? saved : 'es';
  } catch {
    try { const requested = new URL(location.href).searchParams.get('lang'); if (valid(requested)) language = requested; } catch { /* File previews remain usable. */ }
  }

  function compile(source, target) {
    const indices = [];
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = source.split(/(\{\d+\})/g).map(part => {
      if (/^\{\d+\}$/.test(part)) { indices.push(part); return /\r?\n/.test(source) ? '([\\s\\S]*?)' : '([^\\r\\n]*?)'; }
      return escape(part);
    }).join('');
    return { regex: new RegExp('^' + expression + '$'), target, indices,
      weight: source.replace(/\{\d+\}/g, '').length };
  }
  function register(pairs) {
    for (const [sourceEs, sourceEn] of pairs) {
      if (typeof sourceEs !== 'string' || typeof sourceEn !== 'string') continue;
      const es = sourceEs.trim(), en = sourceEn.trim();
      if (!es || !en || es === en) continue;
      exact.en.set(es, en); exact.es.set(en, es);
      if (/\{\d+\}/.test(es)) {
        patterns.en.push(compile(es, en)); patterns.es.push(compile(en, es));
      }
    }
    for (const lang of ['es', 'en']) {
      patterns[lang].sort((a, b) => b.weight - a.weight);
      cache[lang].clear();
    }
    if (document.documentElement) apply(document);
  }
  function t(value) {
    if (typeof value !== 'string' || !value.trim()) return value;
    const found = cache[language].get(value);
    if (found !== undefined) return found;
    const trimmed = value.trim();
    let result = exact[language].get(trimmed);
    if (result === undefined && trimmed.length < 6000) {
      for (const rule of patterns[language]) {
        const match = rule.regex.exec(trimmed);
        if (!match) continue;
        const captures = new Map(rule.indices.map((key, index) => [key, match[index + 1]]));
        result = rule.target.replace(/\{\d+\}/g, key => captures.get(key) ?? key);
        break;
      }
    }
    if (result === undefined && /\r?\n/.test(value)) result = value.split(/(\r?\n)/).map(part => /\r?\n/.test(part) ? part : t(part)).join('');
    else result = result === undefined ? value : value.slice(0, value.indexOf(trimmed)) + result + value.slice(value.indexOf(trimmed) + trimmed.length);
    if (cache[language].size >= 2048) cache[language].delete(cache[language].keys().next().value);
    cache[language].set(value, result);
    return result;
  }
  function skipped(element) { return Boolean(element?.closest?.(ignore)); }
  function sourceText(node) {
    if (!node) return '';
    if (node.nodeType === 3) {
      const state = textState.get(node);
      return state && state.last === node.nodeValue ? state.source : node.nodeValue;
    }
    return Array.from(node.childNodes || [], sourceText).join('');
  }
  function translateText(node) {
    if (skipped(node.parentElement)) return;
    const current = node.nodeValue;
    const previous = textState.get(node);
    const source = previous && previous.last === current ? previous.source : current;
    const translated = t(source);
    textState.set(node, { source, last: translated });
    if (translated !== current) node.nodeValue = translated;
  }
  function translateAttributes(element) {
    if (skipped(element)) return;
    let state = attributeState.get(element);
    if (!state) { state = new Map(); attributeState.set(element, state); }
    const translatedAttributes = element.localName === 'meta' && element.getAttribute('name') === 'description' ? [...attributes, 'content'] : attributes;
    for (const name of translatedAttributes) {
      if (!element.hasAttribute?.(name)) continue;
      const current = element.getAttribute(name);
      const previous = state.get(name);
      const source = previous && previous.last === current ? previous.source : current;
      const translated = t(source);
      state.set(name, { source, last: translated });
      if (translated !== current) element.setAttribute(name, translated);
    }
  }
  function apply(root = document) {
    if (!root) return;
    if (root.nodeType === 3) { translateText(root); return; }
    if (root.nodeType === 1) {
      if (skipped(root)) return;
      if (root.localName === 'papastronomy-object-viewer') {
        if (root.getAttribute('lang') !== language) root.setAttribute('lang', language);
        return; // This portable viewer owns its translated content and state.
      }
      translateAttributes(root);
      if (root.shadowRoot) watch(root.shadowRoot);
    }
    for (const child of root.childNodes || []) apply(child);
  }
  function syncControls(root) {
    for (const button of root.querySelectorAll?.('[data-language]') || []) {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    }
  }
  function watch(root = document) {
    if (!root || watched.has(root)) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') apply(record.target);
        else if (record.type === 'attributes') translateAttributes(record.target);
        else for (const child of record.addedNodes) apply(child);
      }
      for (const [target, active] of watched) {
        if (target.host && !target.host.isConnected) { active.disconnect(); watched.delete(target); }
      }
    });
    watched.set(root, observer);
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...attributes, 'content'] });
    apply(root); syncControls(root);
  }
  function updateUrl() {
    try { const url = new URL(location.href); url.searchParams.set('lang', language); history.replaceState(history.state, '', url); } catch { /* Some file previews prohibit history changes. */ }
  }
  function change(next, remember, updateAddress) {
    if (!valid(next)) return;
    language = next;
    if (remember) { try { localStorage.setItem(KEY, language); } catch { /* The interface still translates in memory. */ } }
    if (updateAddress) updateUrl();
    document.documentElement.lang = language;
    for (const root of watched.keys()) { apply(root); syncControls(root); }
    for (const listener of listeners) listener(language);
  }
  function setLanguage(next) {
    change(next, true, true);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: language }));
  }
  globalThis.PapastronomyI18n = Object.freeze({
    get language() { return language; }, t, register, apply, watch, setLanguage, sourceText,
    syncLanguage(next) { change(next, false, false); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
  window.addEventListener('storage', event => { if (event.key === KEY && valid(event.newValue)) change(event.newValue, false, false); });
  window.addEventListener(EVENT, event => {
    const next = valid(event.detail) ? event.detail : (() => { try { return localStorage.getItem(KEY); } catch { return language; } })();
    if (valid(next) && next !== language) change(next, false, false);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-language]');
    if (button && valid(button.dataset.language)) setLanguage(button.dataset.language);
  });
  const start = () => { document.documentElement.lang = language; watch(document); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
