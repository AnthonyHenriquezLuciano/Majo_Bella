/* MAJOBELLA · Validación de datos (web, app y dashboard). Las mismas reglas que el backend (Code.gs → client_):
   - Nombre y apellido: solo letras, al menos 2 cada uno; se guardan como nombre propio ("María José de la Cruz").
   - Teléfono: 10 dígitos (809/829/849 → 809-555-1234), +1 de EE. UU./Canadá, u otro país empezando con +.
   - Correo: nombre@dominio.algo */
(function (M) {
  const PARTICLES = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'di', 'van', 'von'];
  const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const letters = (s) => String(s || '').replace(/[^\p{L}]/gu, '').length;

  const V = {
    properName(v) {
      const words = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLocaleLowerCase('es').split(' ').filter(Boolean);
      return words.map((w, i) => (i > 0 && PARTICLES.includes(w) ? w
        : w.split('-').map((part) => part.split("'").map((x) => (x ? x.charAt(0).toLocaleUpperCase('es') + x.slice(1) : x)).join("'")).join('-'))).join(' ');
    },
    /* '' si está bien; si no, el mensaje */
    namePart(v, label) {
      const t = String(v || '').trim();
      if (!t) return `Escribe tu ${label}.`;
      if (!NAME_RE.test(t)) return `Tu ${label} solo puede tener letras.`;
      if (letters(t) < 2) return `Tu ${label} debe tener al menos 2 letras.`;
      return '';
    },
    fullName(first, last) { return V.properName(`${first || ''} ${last || ''}`); },
    /* "Ana María Pérez de la Cruz" → { first: "Ana María", last: "Pérez de la Cruz" } (para datos viejos de un solo campo) */
    splitName(full) {
      const w = String(full || '').trim().split(/\s+/).filter(Boolean);
      if (w.length <= 1) return { first: w[0] || '', last: '' };
      if (w.length === 2) return { first: w[0], last: w[1] };
      const cut = w.length >= 4 && !PARTICLES.includes(w[1].toLowerCase()) ? 2 : 1;
      return { first: w.slice(0, cut).join(' '), last: w.slice(cut).join(' ') };
    },
    phone(v) {
      const raw = String(v == null ? '' : v).trim();
      if (!raw) return { ok: false, empty: true, value: '' };
      let d = raw.replace(/\D/g, '');
      if (raw.charAt(0) === '+' && d.charAt(0) !== '1') return d.length >= 8 && d.length <= 15 ? { ok: true, value: `+${d}` } : { ok: false };
      if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
      if (d.length !== 10) return { ok: false };
      const f = `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
      return { ok: true, value: /^(809|829|849)/.test(d) ? f : `+1 ${f}` };
    },
    phoneError: 'Escribe 10 dígitos, por ejemplo 809-555-1234. Si es de otro país, empieza con + y el código.',
    email(v) { return EMAIL_RE.test(String(v || '').trim()); },
    emailError: 'Revisa el correo: por ejemplo nombre@gmail.com.',

    /* Mientras escribe: 8095551234 → 809-555-1234 (deja tranquilo lo que empieza con +) */
    bindPhone(input) {
      if (!input || input.dataset.vPhone) return;
      input.dataset.vPhone = '1';
      input.setAttribute('inputmode', 'tel');
      input.setAttribute('maxlength', '20');
      input.addEventListener('input', (e) => {
        const v = input.value;
        if (v.trim().charAt(0) === '+' || (e.inputType || '').startsWith('delete')) return;
        let d = v.replace(/\D/g, '');
        const one = d.length > 10 && d.charAt(0) === '1';
        if (one) d = d.slice(1);
        d = d.slice(0, 10);
        const f = d.length > 6 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
        if (f !== v) input.value = f;
      });
      input.addEventListener('blur', () => { const p = V.phone(input.value); if (p.ok) input.value = p.value; });
    },
    /* Al salir del campo: "maría JOSÉ" → "María José" */
    bindName(input) {
      if (!input || input.dataset.vName) return;
      input.dataset.vName = '1';
      input.setAttribute('autocapitalize', 'words');
      input.setAttribute('maxlength', '60');
      input.addEventListener('blur', () => { if (input.value.trim()) input.value = V.properName(input.value); });
    },
  };
  M.Validate = V;
})(window.MJB);
