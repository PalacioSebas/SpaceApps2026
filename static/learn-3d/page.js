/* Adaptador opcional de esta página; el componente no depende de él. */
(() => {
  const params = new URLSearchParams(location.search);
  const viewer = document.querySelector('papastronomy-object-viewer');
  const validLanguage = value => value === 'es' || value === 'en';
  const storageKey = 'papastronomy-lang';
  let savedLanguage;
  try { savedLanguage = localStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
  const requestedLanguage = params.get('lang');
  const language = validLanguage(requestedLanguage) ? requestedLanguage : validLanguage(savedLanguage) ? savedLanguage : 'es';
  const languageButtons = document.querySelectorAll('[data-language]');

  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set('object', viewer.getAttribute('object'));
    url.searchParams.set('lang', viewer.getAttribute('lang'));
    try { history.replaceState(null, '', url); } catch { /* Some file:// viewers disallow history changes. */ }
  }
  function chooseLanguage(value, remember=false) {
    const locale = validLanguage(value) ? value : 'es';
    const text = window.Papastronomy3DI18n[locale];
    viewer.setAttribute('lang', locale);
    document.documentElement.lang = locale === 'es' ? 'es-AR' : 'en';
    document.title = text.pageTitle;
    document.querySelector('meta[name="description"]').setAttribute('content', text.pageDescription);
    document.querySelectorAll('[data-page-i18n]').forEach(node => { node.textContent = text[node.dataset.pageI18n]; });
    document.getElementById('language-switch').setAttribute('aria-label', text.languageLabel);
    languageButtons.forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.language === locale)); });
    if (remember) {
      try { localStorage.setItem(storageKey, locale); } catch { /* The switch still works without storage. */ }
      updateUrl();
    }
  }
  languageButtons.forEach(button => button.addEventListener('click', () => chooseLanguage(button.dataset.language, true)));
  chooseLanguage(language);
  viewer.setAttribute('object', params.get('object') === 'young-star' ? 'young-star' : 'brown-dwarf');
  viewer.setAttribute('explanation', params.get('explanation') === 'technical' ? 'technical' : 'simple');
  viewer.shadowRoot.querySelector('.object-picker').addEventListener('change', updateUrl);
  if (params.get('from') === 'explorer') {
    document.getElementById('return-link').hidden = false;
    document.getElementById('return-hint').hidden = false;
  }
})();
