/* MAJOBELLA · Contenido que se edita desde el dashboard (pestaña Web)
   Franja de anuncio, Conoce a Majo, galería de antes y después, reseñas de Google y mapa. */
(function (M) {
  const $ = (id) => document.getElementById(id);
  const esc = M.escapeHtml;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };
  const showNav = (id, on) => document.querySelectorAll(`[data-nav-for="${id}"]`).forEach((n) => { n.hidden = !on; });
  const longDate = (key) => new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00Z`));

  /* ---------- Franja de anuncio ---------- */
  function promoText(p) {
    const ids = p.services || [];
    const names = ids.includes('todos') ? 'todos los servicios' : ids.map((id) => (M.serviceById[id] ? M.serviceById[id].name.toLowerCase() : '')).filter(Boolean).join(', ');
    const off = p.kind === 'monto' ? `${M.fmtPrice(p.value)} de descuento` : `${Number(p.value)}% de descuento`;
    return `${p.name}: ${off} en ${names}${p.until ? ` hasta el ${longDate(p.until)}` : ''}`;
  }
  function initAnnounce(site) {
    const a = site.announcement || {};
    if (a.active === false) return;
    let text = a.text, link = a.link || '#reservar';
    if (!text && (M.promos || []).length) { text = promoText(M.promos[0]); link = a.link || '#servicios'; }
    if (!text) return;
    const key = `mjb.announce.${text}`;
    if (store.get('mjb.announce.closed') === key) return;
    $('announce-text').textContent = text;
    const el = $('announce-link');
    el.href = link;
    if (/^https?:/i.test(link)) { el.target = '_blank'; el.rel = 'noopener'; }
    $('announce').hidden = false;
    $('announce-x').addEventListener('click', () => { $('announce').hidden = true; store.set('mjb.announce.closed', key); });
  }

  /* ---------- Conoce a Majo ---------- */
  function initMajo(site) {
    const m = site.majo || {};
    if (m.title) $('majo-title').textContent = m.title;
    if (m.text) {
      $('majo-text').innerHTML = m.text.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
    }
    if (m.certs && m.certs.length) {
      $('majo-certs-list').innerHTML = m.certs.map((c) => `<li>${esc(c)}</li>`).join('');
      $('majo-certs').hidden = false;
    }
    if (m.photo) {
      const img = $('majo-img');
      const probe = new Image();
      probe.onload = () => {
        img.src = m.photo; img.alt = 'Majo, fundadora de MAJOBELLA';
        img.width = probe.naturalWidth; img.height = probe.naturalHeight;
        img.classList.remove('is-mark');
      };
      probe.src = m.photo;
    }
  }

  /* ---------- Galería de antes y después ---------- */
  const PAGE = 6;
  function initGallery(items) {
    if (!items.length) return;
    $('resultados').hidden = false;
    showNav('resultados', true);
    const services = [...new Set(items.map((x) => x.service).filter(Boolean))];
    let filter = '', shown = PAGE;
    const filters = $('res-filters');
    if (services.length > 1) {
      filters.hidden = false;
      filters.innerHTML = ['', ...services].map((s) => `<button type="button" class="menu-tab${s === '' ? ' is-active' : ''}" data-res-filter="${esc(s)}" aria-pressed="${s === ''}">${s ? esc(s) : 'Todos'}</button>`).join('');
      filters.addEventListener('click', (e) => {
        const b = e.target.closest('[data-res-filter]');
        if (!b) return;
        filter = b.dataset.resFilter; shown = PAGE;
        filters.querySelectorAll('[data-res-filter]').forEach((x) => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', on); });
        render();
      });
    }
    function render() {
      const list = items.filter((x) => !filter || x.service === filter);
      $('res-grid').innerHTML = list.slice(0, shown).map((x, i) => `
        <figure class="ba" style="--pos:50%">
          <div class="ba-frame">
            <img class="ba-img" src="${esc(x.before)}" alt="Antes${x.service ? ` · ${esc(x.service)}` : ''}" loading="lazy" decoding="async">
            <img class="ba-img ba-after" src="${esc(x.after)}" alt="Después${x.service ? ` · ${esc(x.service)}` : ''}" loading="lazy" decoding="async">
            <span class="ba-tag ba-tag-b" aria-hidden="true">Antes</span><span class="ba-tag ba-tag-a" aria-hidden="true">Después</span>
            <span class="ba-handle" aria-hidden="true"></span>
            <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Comparar antes y después${x.service ? ` · ${esc(x.service)}` : ''} ${i + 1}">
          </div>
          ${x.service || x.text ? `<figcaption><strong>${esc(x.service || '')}</strong>${x.text ? ` <span>${esc(x.text)}</span>` : ''}</figcaption>` : ''}
        </figure>`).join('');
      $('res-more').hidden = list.length <= shown;
    }
    $('res-grid').addEventListener('input', (e) => {
      if (!e.target.matches('.ba-range')) return;
      e.target.closest('.ba').style.setProperty('--pos', `${e.target.value}%`);
    });
    $('res-more').addEventListener('click', () => { shown += PAGE; render(); });
    render();
  }

  /* ---------- Reseñas ---------- */
  const starRow = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  function initReviews(list, g) {
    if (!list.length && !g.rating) return;
    $('resenas').hidden = false;
    showNav('resenas', true);
    if (g.rating) {
      $('rv-score').hidden = false;
      $('rv-num').textContent = g.rating.toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      $('rv-stars').textContent = starRow(g.rating);
      $('rv-count').textContent = g.count ? `${g.count} ${g.count === 1 ? 'reseña' : 'reseñas'} en Google` : 'en Google';
      $('rv-score').setAttribute('aria-label', `${g.rating} de 5 estrellas${g.count ? `, ${g.count} reseñas en Google` : ''}`);
    }
    $('rv-list').innerHTML = list.map((r) => `
      <li class="rv-card">
        <p class="rv-card-stars" aria-label="${r.stars} de 5 estrellas">${starRow(r.stars)}</p>
        <blockquote><p>${esc(r.text)}</p></blockquote>
        <p class="rv-author">${esc(r.author)}${r.date ? ` · <time datetime="${esc(r.date)}">${new Intl.DateTimeFormat('es', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${r.date}T12:00:00Z`))}</time>` : ''}</p>
      </li>`).join('');
    if (g.url) { $('rv-all').href = g.url; $('rv-all').hidden = false; }
    if (g.reviewUrl) { $('rv-write').href = g.reviewUrl; $('rv-write').hidden = false; }
  }

  /* ---------- Mapa (se carga al acercarse, en gris) ---------- */
  function initMap() {
    const box = $('map');
    const C = M.config.contact;
    if (!box || !C.lat) { if (box) box.hidden = true; return; }
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      box.innerHTML = `<iframe title="Mapa: cómo llegar a MAJOBELLA Beauty Studio" src="https://www.google.com/maps?q=${C.lat},${C.lng}&z=16&hl=es&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        ${C.mapsUrl ? `<a class="map-open" href="${esc(C.mapsUrl)}" target="_blank" rel="noopener">Abrir en Google Maps</a>` : ''}`;
    };
    $('map-load').addEventListener('click', load);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' });
      io.observe(box);
    }
  }

  M.initSite = function () {
    const site = M.site || {};
    initAnnounce(site);
    initMajo(site);
    initGallery(site.gallery || []);
    initReviews(site.reviews || [], site.google || {});
    initMap();
  };
})(window.MJB);
