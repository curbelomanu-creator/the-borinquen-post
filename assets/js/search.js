document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.getElementById('site-search-toggle');
  const panel = document.getElementById('site-search-panel');
  const close = document.getElementById('site-search-close');
  const input = document.getElementById('site-search-input');
  const results = document.getElementById('site-search-results');
  if (!toggle || !panel || !input || !results) return;

  let index = null;
  const indexUrl = panel.dataset.indexUrl || '/search-index.json';
  const normalize = function (value) {
    return (value || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  const escapeHtml = function (value) {
    return (value || '').replace(/[&<>'"]/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  };

  const openPanel = function () {
    panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add('is-open'); });
    document.body.classList.add('search-open');
    input.focus();
    if (!index) {
      fetch(indexUrl)
        .then(function (response) { return response.json(); })
        .then(function (data) { index = data || []; })
        .catch(function () { index = []; });
    }
  };

  const closePanel = function () {
    panel.classList.remove('is-open');
    document.body.classList.remove('search-open');
    setTimeout(function () { panel.hidden = true; }, 180);
  };

  const render = function (items, query) {
    if (!query) {
      results.innerHTML = '<p class="search-empty">Escribe una palabra, empresa, persona o tema.</p>';
      return;
    }
    if (!items.length) {
      results.innerHTML = '<p class="search-empty">No encontramos noticias para “' + escapeHtml(query) + '”.</p>';
      return;
    }
    results.innerHTML = items.slice(0, 12).map(function (item) {
      return '<a class="search-result" href="' + escapeHtml(item.url) + '">' +
        '<img src="' + escapeHtml(item.image || '/assets/images/default.jpg') + '" alt="">' +
        '<div class="search-result-copy">' +
          '<div class="search-result-meta"><span>' + escapeHtml(item.category || 'Noticias') + '</span><span>' + escapeHtml(item.date || '') + '</span></div>' +
          '<h3>' + escapeHtml(item.title) + '</h3>' +
          '<p>' + escapeHtml(item.excerpt || '') + '</p>' +
        '</div>' +
      '</a>';
    }).join('');
  };

  const search = function () {
    const raw = input.value.trim();
    const q = normalize(raw);
    if (!q || !index) {
      render([], raw);
      return;
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = index.map(function (item) {
      const title = normalize(item.title);
      const category = normalize(item.category);
      const tags = normalize((item.tags || []).join(' '));
      const excerpt = normalize(item.excerpt);
      const content = normalize(item.content);
      let score = 0;
      terms.forEach(function (term) {
        if (title.includes(term)) score += 8;
        if (tags.includes(term)) score += 6;
        if (category.includes(term)) score += 4;
        if (excerpt.includes(term)) score += 3;
        if (content.includes(term)) score += 1;
      });
      const allMatch = terms.every(function (term) {
        return (title + ' ' + tags + ' ' + category + ' ' + excerpt + ' ' + content).includes(term);
      });
      return { item: item, score: allMatch ? score : 0 };
    }).filter(function (row) { return row.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (row) { return row.item; });
    render(scored, raw);
  };

  toggle.addEventListener('click', openPanel);
  if (close) close.addEventListener('click', closePanel);
  panel.addEventListener('click', function (event) { if (event.target === panel) closePanel(); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPanel();
    }
  });
  input.addEventListener('input', search);
});
