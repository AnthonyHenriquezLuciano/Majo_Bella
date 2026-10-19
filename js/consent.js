/* MAJOBELLA · Consentimiento digital (consentimiento.html?c=ID.CLAVE)
   La clienta responde el cuestionario de salud, lee el consentimiento y firma.
   El backend genera el PDF, lo guarda en su ficha y le envía una copia. */
(function () {
  const $ = (id) => document.getElementById(id);
  const C = window.MAJOBELLA_CONFIG || {};
  const api = C.booking && C.booking.apiUrl;
  const code = new URLSearchParams(location.search).get('c') || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const status = (t) => { $('cs-status').textContent = t || ''; $('cs-status').hidden = !t; };
  let questions = [];

  async function post(body) {
    let res;
    try { res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'); }
    const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }));
    if (!data.ok) throw new Error(data.error || 'No se pudo completar.');
    return data;
  }

  function done(title, text) {
    $('cs-form').hidden = true;
    status('');
    if (title) $('cs-done-title').textContent = title;
    if (text) $('cs-done-text').textContent = text;
    $('cs-done').hidden = false;
    $('cs-done').focus();
  }

  /* ---- Firma ---- */
  const pad = $('cs-pad');
  const ctx = pad.getContext('2d');
  let drawing = false, strokes = 0, last = null;
  function sizePad() {
    const r = pad.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const img = strokes ? pad.toDataURL() : null;
    pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    if (img) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, r.width, r.height); i.src = img; }
  }
  const point = (e) => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  pad.addEventListener('pointerdown', (e) => { drawing = true; last = point(e); pad.setPointerCapture(e.pointerId); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = point(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; strokes++;
    e.preventDefault();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => pad.addEventListener(t, () => { drawing = false; }));
  $('cs-clear').addEventListener('click', () => { ctx.clearRect(0, 0, pad.width, pad.height); strokes = 0; });
  window.addEventListener('resize', sizePad);

  /* Firma recortada sobre fondo blanco (PNG liviano) */
  function signature() {
    const out = document.createElement('canvas');
    out.width = 600; out.height = 200;
    const o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, 600, 200);
    o.drawImage(pad, 0, 0, 600, 200);
    return out.toDataURL('image/png');
  }

  /* ---- Formulario ---- */
  function renderQuestions() {
    $('cs-questions').innerHTML = questions.map((q) => `
      <li class="cs-q" data-q="${esc(q.id)}">
        <p>${esc(q.text)}</p>
        <div class="cs-yn" role="radiogroup" aria-label="${esc(q.text)}">
          <label class="gf-chip"><input type="radio" name="q-${esc(q.id)}" value="no"><span>No</span></label>
          <label class="gf-chip"><input type="radio" name="q-${esc(q.id)}" value="si"><span>Sí</span></label>
        </div>
        ${q.detail ? `<div class="field cs-detail" hidden><label for="d-${esc(q.id)}">¿Cuál o cuáles?</label><input id="d-${esc(q.id)}" maxlength="300" autocomplete="off"></div>` : ''}
      </li>`).join('');
  }
  $('cs-questions').addEventListener('change', (e) => {
    const li = e.target.closest('.cs-q');
    if (!li) return;
    li.classList.remove('has-error');
    const d = li.querySelector('.cs-detail');
    if (d) d.hidden = e.target.value !== 'si';
  });

  $('cs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('cs-msg');
    const answers = {};
    let first = null;
    questions.forEach((q) => {
      const li = document.querySelector(`[data-q="${CSS.escape(q.id)}"]`);
      const v = (li.querySelector('input[type=radio]:checked') || {}).value;
      li.classList.toggle('has-error', !v);
      if (!v && !first) first = li;
      const d = li.querySelector('.cs-detail input');
      answers[q.id] = { value: v, detail: d ? d.value.trim() : '' };
    });
    if (first) { msg.textContent = 'Responde todas las preguntas de salud.'; msg.className = 'gf-msg is-error'; first.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const name = $('cs-name').value.trim();
    $('cs-name').closest('.field').classList.toggle('has-error', name.length < 3);
    if (name.length < 3) { msg.textContent = 'Escribe tu nombre completo.'; msg.className = 'gf-msg is-error'; $('cs-name').focus(); return; }
    if (strokes < 8) { msg.textContent = 'Dibuja tu firma en el recuadro.'; msg.className = 'gf-msg is-error'; return; }
    if (!$('cs-accept').checked) { msg.textContent = 'Marca que leíste y aceptas el consentimiento.'; msg.className = 'gf-msg is-error'; return; }
    const btn = $('cs-submit');
    btn.disabled = true; msg.className = 'gf-msg'; msg.textContent = 'Guardando tu firma…';
    try {
      await post({
        action: 'consentSign', c: code, name, answers, accept: true, signature: signature(),
        photos: (document.querySelector('[name=photos]:checked') || {}).value || 'no', extra: $('cs-extra').value.trim(),
      });
      done();
    } catch (err) { msg.textContent = err.message; msg.className = 'gf-msg is-error'; btn.disabled = false; }
  });

  async function start() {
    if (!api) { status('El sistema de reservas no está conectado.'); return; }
    if (!code) { status('Este enlace está incompleto. Ábrelo desde el correo de tu cita.'); return; }
    try {
      const d = await post({ action: 'consentInfo', c: code });
      if (d.signed) { done('Ya firmaste este consentimiento', 'Lo tenemos guardado en tu ficha. Nos vemos en tu cita.'); return; }
      questions = d.questions || [];
      $('cs-appt').innerHTML = `<dl><div><dt>Clienta</dt><dd>${esc(d.name)}</dd></div><div><dt>Servicio</dt><dd>${esc(d.services)}</dd></div><div><dt>Cita</dt><dd>${esc(d.when)}</dd></div></dl>`;
      $('cs-text').innerHTML = String(d.text || '').split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('');
      $('cs-name').value = d.name || '';
      renderQuestions();
      status('');
      $('cs-form').hidden = false;
      sizePad();
    } catch (err) { status(err.message); }
  }
  start();
})();
