/* MAJOBELLA · Dashboard: Web
   Galería de antes y después, reseñas de Google, "Conoce a Majo", franja de anuncio,
   perfil de Google y venta de tarjetas de regalo en la web. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const KEYS = ['majoTitulo', 'majoTexto', 'majoCerts', 'anuncioActivo', 'anuncioTexto', 'anuncioEnlace', 'googleRating', 'googleResenas', 'googleUrl', 'googleResenaUrl', 'tarjetasEnLinea', 'tarjetaMin', 'tarjetaMax', 'tarjetaVenceDias'];
  const BOOL = ['anuncioActivo', 'tarjetasEnLinea'];
  const DEFAULTS = { majoTitulo: 'Conoce a Majo', anuncioActivo: 'si', tarjetasEnLinea: 'si', tarjetaMin: '500', tarjetaMax: '30000', tarjetaVenceDias: '365' };
  let editingReview = null;
  let dirty = false;

  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const serviceOptions = (sel) => {
    const names = A.services().map((s) => s.name);
    if (sel && !names.includes(sel)) names.push(sel);
    return names.map((n) => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  };
  const gallery = () => (A.data.gallery || []).slice().sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(b.creada).localeCompare(String(a.creada)));
  const reviews = () => (A.data.reviews || []).slice().sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(b.fecha).localeCompare(String(a.fecha)));

  /* ---------- Render ---------- */
  function render() {
    const g = gallery();
    $('wb-gallery').innerHTML = g.length ? g.map((it, i) => {
      const on = !/^no$/i.test(it.visible);
      return `<li class="gal-item${on ? '' : ' off'}" data-gal="${esc(it.id)}">
        <div class="gal-pair"><img src="${esc(it.antesUrl)}" alt="Antes" loading="lazy"><img src="${esc(it.despuesUrl)}" alt="Después" loading="lazy"></div>
        <div class="gal-meta">
          <select data-gal-field="servicio" aria-label="Servicio">${serviceOptions(it.servicio)}</select>
          <input data-gal-field="texto" value="${esc(it.texto || '')}" maxlength="200" placeholder="Descripción (opcional)" aria-label="Descripción">
          <div class="gal-actions">
            <button type="button" class="act" data-gal-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
            <button type="button" class="act" data-gal-move="1" ${i === g.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
            <button type="button" class="act" data-gal-toggle>${on ? 'Ocultar' : 'Mostrar'}</button>
            <button type="button" class="act act-ghost" data-gal-del>Quitar</button>
          </div>
        </div></li>`;
    }).join('') : '<li class="empty">Aún no hay fotos publicadas.</li>';

    const r = reviews();
    $('wb-reviews').innerHTML = r.length ? r.map((v) => `<li class="promo">
        <div class="pr-main">
          <div class="pr-top"><p class="t-name">${esc(v.autora)} <span class="stars" aria-label="${v.estrellas} estrellas">${stars(Number(v.estrellas) || 5)}</span></p>${/^no$/i.test(v.visible) ? '<span class="pill st-cancelada">Oculta</span>' : ''}</div>
          <p class="t-sub">${esc(v.texto)}</p>
          <p class="t-sub">${A.shortDate(v.fecha)}</p>
        </div>
        <div class="due-actions">
          <button type="button" class="act" data-rev-edit="${esc(v.id)}">Editar</button>
          <button type="button" class="act act-ghost" data-rev-del="${esc(v.id)}">Borrar</button>
        </div></li>`).join('') : '<li class="empty">Aún no has añadido reseñas.</li>';

    if (!dirty) fillForm();
    renderMajoPhoto();
    preview();
  }

  function fillForm() {
    const s = A.settingsMap();
    const f = $('wb-form');
    KEYS.forEach((k) => {
      const v = s[k] != null && s[k] !== '' ? s[k] : (DEFAULTS[k] || '');
      if (BOOL.includes(k)) f[k].checked = !/^no$/i.test(v);
      else f[k].value = v;
    });
  }
  function renderMajoPhoto() {
    const url = A.settingsMap().majoFotoUrl;
    const el = $('wb-majo-img');
    el.style.backgroundImage = url ? `url("${url}")` : '';
    el.textContent = url ? '' : 'Sin foto';
  }
  function preview() {
    const f = $('wb-form');
    const auto = (A.data.promos || []).find((p) => p.tipo === 'auto' && !/^no$/i.test(p.activo) && (!p.desde || p.desde <= M.todayKey()) && (!p.hasta || p.hasta >= M.todayKey()));
    let t;
    if (!f.anuncioActivo.checked) t = 'La franja está apagada.';
    else if (f.anuncioTexto.value.trim()) t = `Se verá: «${f.anuncioTexto.value.trim()}»`;
    else if (auto) t = `Se verá la promoción automática «${auto.nombre}».`;
    else t = 'Sin texto ni promoción automática vigente: la franja no aparece.';
    $('wb-ann-preview').textContent = t;
  }

  /* ---------- Guardar ajustes de la web ---------- */
  async function save(e) {
    e.preventDefault();
    const f = $('wb-form');
    const settings = {};
    KEYS.forEach((k) => { settings[k] = BOOL.includes(k) ? (f[k].checked ? 'si' : 'no') : f[k].value.trim(); });
    if (settings.googleRating && !(Number(settings.googleRating.replace(',', '.')) <= 5)) { A.toast('La puntuación debe ser un número hasta 5, por ejemplo 4.9.'); return; }
    await A.busy($('wb-save'), async () => {
      try {
        const res = await A.call('adminSaveSettings', { settings });
        A.data = res;
        dirty = false;
        render();
        A.toast('Guardado. La web ya muestra los cambios.');
      } catch (err) { A.toast(err.message); }
    });
  }

  /* ---------- Foto de Majo ---------- */
  function resize(file, max) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.86).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo abrir la foto. Usa JPG o PNG.')); };
      img.src = url;
    });
  }
  async function uploadMajo(input) {
    const file = input.files[0];
    if (!file) return;
    const msg = $('wb-majo-msg');
    msg.textContent = 'Subiendo…';
    try {
      const data = await resize(file, 1400);
      const res = await A.call('adminUploadPublic', { mime: 'image/jpeg', data });
      const row = A.data.settings.find((x) => x.key === 'majoFotoUrl');
      if (row) row.value = res.url; else A.data.settings.push({ key: 'majoFotoUrl', value: res.url, help: '' });
      msg.textContent = '';
      renderMajoPhoto();
      A.toast('Foto publicada en la web.');
    } catch (err) { msg.textContent = err.message; }
    input.value = '';
  }

  /* ---------- Galería ---------- */
  async function patchGallery(id, patch, btn) {
    const run = async () => {
      const res = await A.call('adminSaveGallery', Object.assign({ id }, patch));
      A.upsert('gallery', res.item);
    };
    try { if (btn) await A.busy(btn, run); else await run(); render(); }
    catch (err) { A.toast(err.message); }
  }
  async function moveGallery(id, dir, btn) {
    const g = gallery();
    const i = g.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= g.length) return;
    [g[i], g[j]] = [g[j], g[i]];
    await A.busy(btn, async () => {
      try {
        for (let k = 0; k < g.length; k++) {
          if (Number(g[k].orden) !== k) {
            const res = await A.call('adminSaveGallery', { id: g[k].id, orden: k });
            A.upsert('gallery', res.item);
          }
        }
        render();
      } catch (err) { A.toast(err.message); }
    });
  }

  /* Publicar desde la ficha de la clienta */
  A.openPublish = function (clientKey) {
    const files = (A.data.files || []).filter((f) => f.clave === clientKey && f.mime !== 'application/pdf');
    const pick = (tipo, name) => {
      const list = files.filter((f) => f.tipo === tipo).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      return list.length ? list.map((f, i) => `<label class="pick"><input type="radio" name="${name}" value="${esc(f.id)}" ${i === 0 ? 'checked' : ''}><img alt="${esc(f.nombre)}" data-pick="${esc(f.id)}"><span>${A.shortDate(f.fecha)}</span></label>`).join('')
        : '<p class="hint">Sube primero una foto en la ficha.</p>';
    };
    const f = $('pb-form');
    f.reset();
    f.dataset.client = clientKey;
    $('pb-antes').innerHTML = pick('antes', 'antes');
    $('pb-despues').innerHTML = pick('despues', 'despues');
    const last = A.data.items.filter((a) => A.clientKey(a.client.email, a.client.phone, a.client.name) === clientKey && a.status === 'completada').sort((a, b) => b.date.localeCompare(a.date))[0];
    $('pb-servicio').innerHTML = serviceOptions(last && last.services[0] ? last.services[0].name : '');
    $('pb-msg').textContent = '';
    A.open('dlg-pub');
    f.querySelectorAll('[data-pick]').forEach(async (img) => {
      try { img.src = await A.fileUrl(img.dataset.pick); } catch (e) { /* sin vista previa */ }
    });
  };
  async function publish(e) {
    e.preventDefault();
    const f = $('pb-form');
    const antes = f.querySelector('[name=antes]:checked');
    const despues = f.querySelector('[name=despues]:checked');
    if (!antes || !despues) { $('pb-msg').textContent = 'Elige una foto de antes y una de después.'; return; }
    if (!f.permiso.checked) { $('pb-msg').textContent = 'Marca que la clienta te dio permiso.'; return; }
    await A.busy($('pb-save'), async () => {
      try {
        const res = await A.call('adminPublishGallery', { antesId: antes.value, despuesId: despues.value, servicio: f.servicio.value, texto: f.texto.value.trim(), permiso: true, orden: -1 });
        A.data.gallery = A.data.gallery || [];
        A.data.gallery.push(res.item);
        A.close('dlg-pub');
        render();
        A.toast('Publicado en la galería de la web.');
      } catch (err) { $('pb-msg').textContent = err.message; }
    });
  }

  /* ---------- Reseñas ---------- */
  function openReview(id) {
    editingReview = id ? A.data.reviews.find((r) => r.id === id) : null;
    const f = $('rv-form');
    f.reset();
    const r = editingReview || { estrellas: '5', fecha: M.todayKey(), orden: '0', visible: 'si' };
    f.autora.value = r.autora || '';
    f.estrellas.value = String(r.estrellas || 5);
    f.texto.value = r.texto || '';
    f.fecha.value = r.fecha || '';
    f.orden.value = r.orden || 0;
    f.visible.checked = !/^no$/i.test(r.visible);
    $('rv-msg').textContent = '';
    A.open('dlg-review');
  }
  async function saveReview(e) {
    e.preventDefault();
    const f = $('rv-form');
    const review = { id: editingReview ? editingReview.id : '', autora: f.autora.value.trim(), estrellas: f.estrellas.value, texto: f.texto.value.trim(), fecha: f.fecha.value, orden: f.orden.value, visible: f.visible.checked };
    if (!review.autora || !review.texto) { $('rv-msg').textContent = 'Escribe el nombre y el texto.'; return; }
    await A.busy($('rv-save'), async () => {
      try {
        const res = await A.call('adminSaveReview', { review });
        A.data.reviews = A.data.reviews || [];
        A.upsert('reviews', res.review);
        A.close('dlg-review'); render();
        A.toast('Reseña guardada.');
      } catch (err) { $('rv-msg').textContent = err.message; }
    });
  }

  /* ---------- Inicio ---------- */
  A.sections.web = {
    render,
    init() {
      const f = $('wb-form');
      f.addEventListener('submit', save);
      f.addEventListener('input', () => { dirty = true; preview(); });
      f.addEventListener('change', () => { dirty = true; preview(); });
      $('wb-majo-file').addEventListener('change', (e) => uploadMajo(e.target));
      $('wb-rev-new').addEventListener('click', () => openReview(null));
      $('rv-form').addEventListener('submit', saveReview);
      $('pb-form').addEventListener('submit', publish);
      $('wb-reviews').addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-rev-edit]');
        if (ed) { openReview(ed.dataset.revEdit); return; }
        const dl = e.target.closest('[data-rev-del]');
        if (!dl) return;
        if (dl.dataset.confirm !== '1') { dl.dataset.confirm = '1'; dl.textContent = '¿Borrar?'; setTimeout(() => { dl.dataset.confirm = ''; dl.textContent = 'Borrar'; }, 4000); return; }
        await A.busy(dl, async () => {
          try { await A.call('adminDeleteReview', { id: dl.dataset.revDel }); A.remove('reviews', dl.dataset.revDel); render(); A.toast('Reseña borrada.'); }
          catch (err) { A.toast(err.message); }
        });
      });
      const gl = $('wb-gallery');
      gl.addEventListener('change', (e) => {
        const fld = e.target.closest('[data-gal-field]');
        if (!fld) return;
        patchGallery(fld.closest('[data-gal]').dataset.gal, { [fld.dataset.galField]: fld.value.trim() });
      });
      gl.addEventListener('click', async (e) => {
        const li = e.target.closest('[data-gal]');
        if (!li) return;
        const id = li.dataset.gal;
        const mv = e.target.closest('[data-gal-move]');
        if (mv) { moveGallery(id, Number(mv.dataset.galMove), mv); return; }
        const tg = e.target.closest('[data-gal-toggle]');
        if (tg) { const it = A.data.gallery.find((x) => x.id === id); patchGallery(id, { visible: /^no$/i.test(it.visible) }, tg); return; }
        const dl = e.target.closest('[data-gal-del]');
        if (dl) {
          if (dl.dataset.confirm !== '1') { dl.dataset.confirm = '1'; dl.textContent = '¿Quitar de la web?'; setTimeout(() => { dl.dataset.confirm = ''; dl.textContent = 'Quitar'; }, 4000); return; }
          await A.busy(dl, async () => {
            try { await A.call('adminDeleteGallery', { id }); A.remove('gallery', id); render(); A.toast('Quitada de la galería. Las fotos siguen en la ficha.'); }
            catch (err) { A.toast(err.message); }
          });
        }
      });
    },
  };
})(window.MJB);
