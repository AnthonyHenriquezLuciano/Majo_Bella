/* MAJOBELLA · Validación de datos: las mismas reglas que la web y el backend (client_) */
const PARTICLES = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'di', 'van', 'von'];
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const letters = (s: string) => String(s || '').replace(/[^\p{L}]/gu, '').length;

export const Validate = {
  properName(v: string) {
    const words = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLocaleLowerCase('es').split(' ').filter(Boolean);
    return words.map((w, i) => (i > 0 && PARTICLES.includes(w) ? w
      : w.split('-').map((part) => part.split("'").map((x) => (x ? x.charAt(0).toLocaleUpperCase('es') + x.slice(1) : x)).join("'")).join('-'))).join(' ');
  },
  /* '' si está bien; si no, el mensaje */
  namePart(v: string, label: string) {
    const t = String(v || '').trim();
    if (!t) return `Escribe tu ${label}.`;
    if (!NAME_RE.test(t)) return `Tu ${label} solo puede tener letras.`;
    if (letters(t) < 2) return `Tu ${label} debe tener al menos 2 letras.`;
    return '';
  },
  fullName(first: string, last: string) { return Validate.properName(`${first || ''} ${last || ''}`); },
  splitName(full: string) {
    const w = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (w.length <= 1) return { first: w[0] || '', last: '' };
    if (w.length === 2) return { first: w[0], last: w[1] };
    const cut = w.length >= 4 && !PARTICLES.includes(w[1].toLowerCase()) ? 2 : 1;
    return { first: w.slice(0, cut).join(' '), last: w.slice(cut).join(' ') };
  },
  phone(v: string): { ok: boolean; value: string; empty?: boolean } {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return { ok: false, empty: true, value: '' };
    let d = raw.replace(/\D/g, '');
    if (raw.charAt(0) === '+' && d.charAt(0) !== '1') return d.length >= 8 && d.length <= 15 ? { ok: true, value: `+${d}` } : { ok: false, value: '' };
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (d.length !== 10) return { ok: false, value: '' };
    const f = `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return { ok: true, value: /^(809|829|849)/.test(d) ? f : `+1 ${f}` };
  },
  /* Mientras escribe: 8095551234 → 809-555-1234 (deja tranquilo lo que empieza con +) */
  phoneTyping(v: string, prev = '') {
    if (v.trim().charAt(0) === '+' || v.length < prev.length) return v;
    let d = v.replace(/\D/g, '');
    if (d.length > 10 && d.charAt(0) === '1') d = d.slice(1);
    d = d.slice(0, 10);
    return d.length > 6 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
  },
  phoneError: 'Escribe 10 dígitos, por ejemplo 809-555-1234. Si es de otro país, empieza con + y el código.',
  email(v: string) { return EMAIL_RE.test(String(v || '').trim()); },
  emailError: 'Revisa el correo: por ejemplo nombre@gmail.com.',
};
