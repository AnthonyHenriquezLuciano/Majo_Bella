/* MAJOBELLA · Cejas del retrato (SVG)
   Estado 0: cejas naturales, pobladas y ligeramente despeinadas (pelo a pelo).
   Estado 1: powder brows (ombré): vello peinado y relleno en degradado del inicio a la cola. */
(function (M) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const norm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* Recorre una polilínea por longitud: t ∈ [0,1] → punto */
  function sampler(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    return (t) => {
      const d = clamp(t) * L;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const k = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
    };
  }

  /* Curva suave cerrada (Catmull-Rom → Bézier) */
  function smoothClosed(pts) {
    const n = pts.length;
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }

  M.Brows = function (svg, data, opts = {}) {
    const { width: W, height: H } = data;
    if (!opts.mount) svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const defs = el('defs', {}, svg);

    // Textura "powder": base suave + grano fino
    const f = el('filter', { id: 'mjb-powder', x: '-15%', y: '-40%', width: '130%', height: '180%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9', numOctaves: '2', seed: '7', result: 'noise' }, f);
    el('feColorMatrix', { in: 'noise', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.7 -0.42', result: 'grain' }, f);
    el('feComposite', { in: 'SourceGraphic', in2: 'grain', operator: 'in', result: 'grained' }, f);
    el('feGaussianBlur', { in: 'grained', stdDeviation: '0.45', result: 'g1' }, f);
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '1.5', result: 'soft' }, f);
    const ct = el('feComponentTransfer', { in: 'soft', result: 'softA' }, f);
    el('feFuncA', { type: 'linear', slope: '0.85' }, ct);
    const mg = el('feMerge', {}, f);
    el('feMergeNode', { in: 'softA' }, mg);
    el('feMergeNode', { in: 'g1' }, mg);

    const ft = el('filter', { id: 'mjb-tint', x: '-20%', y: '-50%', width: '140%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: '3.5' }, ft);

    const root = el('g', { class: 'brows-root' }, opts.mount || svg);
    const sides = [];
    const r = rng(20251018);

    Object.entries(data.brows).forEach(([key, B], si) => {
      const top = sampler(B.top), bot = sampler(B.bottom);
      const mid = (t) => { const a = top(t), b = bot(t); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      const inner = mid(0), tail = mid(1);
      const g = el('g', { class: `brow brow-${key}` }, root);

      // Relleno ombré (degradado del inicio a la cola) revelado con un barrido
      const gid = `mjb-grad-${key}`, sid = `mjb-sweep-${key}`, mid_ = `mjb-mask-${key}`;
      const grad = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: inner[0], y1: inner[1], x2: tail[0], y2: tail[1] }, defs);
      [[0, 0.16], [0.16, 0.55], [0.45, 0.78], [1, 0.84]].forEach(([o, a]) => el('stop', { offset: o, 'stop-color': '#5a3a26', 'stop-opacity': a }, grad));
      const sweep = el('linearGradient', { id: sid, gradientUnits: 'userSpaceOnUse', x1: inner[0], y1: inner[1], x2: tail[0], y2: tail[1] }, defs);
      const s1 = el('stop', { offset: 0, 'stop-color': '#fff' }, sweep);
      const s2 = el('stop', { offset: 0, 'stop-color': '#000' }, sweep);
      const mask = el('mask', { id: mid_, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${sid})` }, mask);

      const N = 22;
      const outline = [];
      for (let i = 0; i <= N; i++) outline.push(top(i / N));
      for (let i = N; i >= 0; i--) outline.push(bot(i / N));
      const tint = el('path', { d: smoothClosed(outline), fill: '#3a2213', 'fill-opacity': 0.16, filter: 'url(#mjb-tint)', opacity: 0 }, g);
      const fillG = el('g', { mask: `url(#${mid_})`, opacity: 0 }, g);
      el('path', { d: smoothClosed(outline), fill: `url(#${gid})`, filter: 'url(#mjb-powder)' }, fillG);

      // Vello pelo a pelo
      const hairG = el('g', { fill: 'none', 'stroke-linecap': 'round' }, g);
      const hairs = [];
      const COUNT = 175;
      for (let i = 0; i < COUNT; i++) {
        const t = Math.pow(r(), 0.92);
        const s = r();
        const a = top(t), b = bot(t);
        const thick = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const base = [lerp(b[0], a[0], 0.06 + s * 0.8), lerp(b[1], a[1], 0.06 + s * 0.8)];
        const up = norm([a[0] - b[0], a[1] - b[1]]);
        const t0 = Math.min(t, 0.97), m0 = mid(t0), m1 = mid(t0 + 0.03);
        const along = norm([m1[0] - m0[0], m1[1] - m0[1]]);
        let w = t < 0.12 ? 0.12 : t < 0.5 ? lerp(0.22, 0.72, (t - 0.12) / 0.38) : lerp(0.72, 0.93, (t - 0.5) / 0.5);
        if (t > 0.2 && s > 0.62) w = Math.min(0.98, w + 0.16 * (s - 0.62) / 0.38);
        const dir = norm([up[0] * (1 - w) + along[0] * w, up[1] * (1 - w) + along[1] * w]);
        let perp = [-dir[1], dir[0]];
        if (perp[0] * along[0] + perp[1] * along[1] < 0) perp = [-perp[0], -perp[1]];
        const stray = r() < 0.06;
        hairs.push({
          t, base, dir, perp,
          offN: gauss(r) * 0.15 + 0.1 * Math.sin(t * 17 + s * 5 + si) + (stray ? (r() < 0.5 ? -1 : 1) * (0.22 + r() * 0.2) : 0),
          offG: gauss(r) * 0.035,
          lenN: thick * (0.45 + r() * 0.36) * (stray ? 1.25 : 1),
          lenG: thick * (0.55 + r() * 0.22),
          bendN: 0.06 + (r() - 0.5) * 0.3,
          bendG: 0.16 + r() * 0.06,
          wN: 1.35 + r() * 0.9,
          wG: 1.7 + r() * 0.5,
          oN: 0.42 + r() * 0.38,
          oG: stray ? 0 : (0.72 + r() * 0.12) * (t < 0.2 ? 1 : 0.78),
          node: el('path', { stroke: r() < 0.5 ? '#2a180c' : '#3d2616' }, hairG),
        });
      }
      sides.push({ key, g, tint, fillG, s1, s2, hairs });
    });

    let p = 0, intro = 1, sway = 0;
    function render() {
      const sp = smooth(p);
      sides.forEach((S) => {
        S.fillG.setAttribute('opacity', (sp * intro).toFixed(3));
        S.tint.setAttribute('opacity', (intro * (1 - 0.6 * sp)).toFixed(3));
        const a = -0.25 + 1.5 * sp;
        S.s1.setAttribute('offset', clamp(a).toFixed(3));
        S.s2.setAttribute('offset', clamp(a + 0.28).toFixed(3));
        for (const h of S.hairs) {
          const off = lerp(h.offN, h.offG, sp) + sway * (1 - sp) * Math.sin(h.t * 9 + h.base[0] * 0.05);
          const d = rot(h.dir, off);
          const len = lerp(h.lenN, h.lenG, sp);
          const bend = lerp(h.bendN, h.bendG, sp);
          const pp = rot(h.perp, off);
          const ex = h.base[0] + d[0] * len, ey = h.base[1] + d[1] * len;
          const cx = h.base[0] + d[0] * len * 0.5 + pp[0] * len * bend;
          const cy = h.base[1] + d[1] * len * 0.5 + pp[1] * len * bend;
          const show = clamp((intro * 1.25 - h.t) / 0.25);
          h.node.setAttribute('d', `M${h.base[0].toFixed(1)} ${h.base[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
          h.node.setAttribute('stroke-width', lerp(h.wN, h.wG, sp).toFixed(2));
          h.node.setAttribute('stroke-opacity', (lerp(h.oN, h.oG, sp) * show).toFixed(3));
        }
      });
    }
    render();

    return {
      root,
      get progress() { return p; },
      set progress(v) { p = v; render(); },
      get intro() { return intro; },
      set intro(v) { intro = v; render(); },
      get sway() { return sway; },
      set sway(v) { sway = v; render(); },
    };
  };
})(window.MJB);
