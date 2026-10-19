/* MAJOBELLA · Hero: rostro ilustrado centrado con profundidad, microanimaciones y cejas interactivas */
(function (M) {
  M.initHero = function () {
    const hero = document.getElementById('inicio');
    const visual = hero.querySelector('.hero-visual');
    const figure = hero.querySelector('.portrait');
    const svg = hero.querySelector('.portrait-svg');
    const toggle = document.getElementById('brow-toggle');
    const stateLabel = document.getElementById('brow-state');
    const archSin = hero.querySelector('.arch-text.t-sin');
    const archCon = hero.querySelector('.arch-text.t-con');
    const reduce = M.reduceMotion();

    const face = M.drawFace(svg);
    const brows = M.Brows(svg, window.MAJOBELLA_BROWS, { mount: face.browMount });
    const anim = { p: 0, intro: 0 };
    const apply = () => { brows.progress = anim.p; };

    /* ---- Entrada ---- */
    if (reduce) {
      brows.intro = 1;
    } else {
      gsap.timeline({ defaults: { ease: 'power2.out' } })
        .from('.hero-arch', { scale: 0.96, opacity: 0, duration: 1.6, ease: 'power3.out' }, 0)
        .from('.hero-arch-line .arch-path', { strokeDashoffset: 1600, duration: 2.4, ease: 'power2.inOut' }, 0.1)
        .from(face.layers, { opacity: 0, y: 18, duration: 1.6, stagger: 0.12 }, 0.25)
        .to(anim, { intro: 1, duration: 1.6, ease: 'power1.inOut', onUpdate: () => { brows.intro = anim.intro; } }, 1.1)
        .from('.hero-copy [data-hero]', { y: 26, opacity: 0, duration: 1.2, stagger: 0.12 }, 0.35)
        .from('.arch-text.t-sin, .brow-hint', { opacity: 0, y: 10, duration: 1.2, stagger: 0.15 }, 1.4);
    }

    /* ---- Cejas: natural ↔ powder ---- */
    let hovering = false, pinned = false, on = false;
    function sync() {
      const want = hovering || pinned;
      if (want === on) return;
      on = want;
      gsap.to(anim, { p: on ? 1 : 0, duration: reduce ? 0 : (on ? 1.6 : 1.2), ease: 'power2.inOut', overwrite: true, onUpdate: apply });
      gsap.to(brows.root, { y: on ? -2.5 : 0, duration: reduce ? 0 : 1.4, ease: 'power2.inOut', overwrite: 'auto' });
      // Texto en el arco: "SIN MAJOBELLA" sin cursor, el eslogan con el cursor
      const d = reduce ? 0 : 0.9;
      gsap.to(on ? archSin : archCon, { opacity: 0, letterSpacing: '0.6em', duration: d * 0.8, ease: 'power2.in', overwrite: true });
      gsap.fromTo(on ? archCon : archSin, { opacity: 0, letterSpacing: '0.28em' }, { opacity: 1, letterSpacing: '0.42em', duration: d * 1.3, ease: 'power2.out', delay: d * 0.45, overwrite: true });
      stateLabel.textContent = on ? 'Powder brows · definidas y sombreadas' : 'Natural · pobladas y orgánicas';
      toggle.setAttribute('aria-pressed', String(on));
      toggle.textContent = on ? 'Ver cejas naturales' : 'Ver powder brows';
    }
    let lastType = 'mouse';
    figure.addEventListener('pointerdown', (e) => { lastType = e.pointerType; });
    figure.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovering = true; sync(); } });
    figure.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovering = false; sync(); } });
    figure.addEventListener('click', () => { if (lastType !== 'mouse') { pinned = !pinned; sync(); } });
    toggle.addEventListener('click', () => { pinned = !on; hovering = false; sync(); });

    if (reduce) return;

    /* ---- Microanimaciones: respiración, parpadeo, brillo en los lentes, vello ---- */
    gsap.to(face.root, { y: -3, duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to(brows, { sway: 0.06, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to(face.hairFront, { rotation: 0.5, svgOrigin: '300 120', duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 });

    function blink() {
      const tl = gsap.timeline({ onComplete: () => gsap.delayedCall(2.8 + Math.random() * 3.5, blink) });
      face.eyes.forEach((g) => {
        const o = `${g.dataset.cx} ${g.dataset.cy}`;
        tl.to(g, { scaleY: 0.08, svgOrigin: o, duration: 0.09, ease: 'power2.in' }, 0)
          .to(g, { scaleY: 1, svgOrigin: o, duration: 0.16, ease: 'power2.out' }, 0.11);
      });
    }
    gsap.delayedCall(2.4, blink);

    function glint() {
      gsap.fromTo(face.glares, { x: 0 }, {
        x: 170, duration: 1.4, ease: 'power2.inOut',
        onComplete: () => gsap.delayedCall(5 + Math.random() * 4, glint),
      });
    }
    gsap.delayedCall(3.2, glint);

    /* ---- Profundidad: cada capa del rostro se mueve distinto con el cursor ---- */
    if (window.matchMedia('(hover: hover)').matches) {
      const domLayers = [...visual.querySelectorAll('[data-depth]')].filter((n) => !svg.contains(n)).map((n) => ({
        d: parseFloat(n.dataset.depth),
        x: gsap.quickTo(n, 'x', { duration: 1.4, ease: 'power3.out' }),
        y: gsap.quickTo(n, 'y', { duration: 1.4, ease: 'power3.out' }),
      }));
      const svgLayers = face.layers.map((n) => ({
        d: parseFloat(n.dataset.depth),
        x: gsap.quickTo(n, 'x', { duration: 1.2, ease: 'power3.out' }),
        y: gsap.quickTo(n, 'y', { duration: 1.2, ease: 'power3.out' }),
      }));
      const irises = face.irises.map((n) => ({
        x: gsap.quickTo(n, 'x', { duration: 0.6, ease: 'power3.out' }),
        y: gsap.quickTo(n, 'y', { duration: 0.6, ease: 'power3.out' }),
      }));
      gsap.set(figure, { transformPerspective: 1000, transformOrigin: '50% 45%' });
      const rx = gsap.quickTo(figure, 'rotationX', { duration: 1.6, ease: 'power3.out' });
      const ry = gsap.quickTo(figure, 'rotationY', { duration: 1.6, ease: 'power3.out' });
      hero.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = visual.getBoundingClientRect();
        const nx = gsap.utils.clamp(-1, 1, ((e.clientX - r.left) / r.width - 0.5) * 2);
        const ny = gsap.utils.clamp(-1, 1, ((e.clientY - r.top) / r.height - 0.5) * 2);
        domLayers.forEach((l) => { l.x(nx * l.d * 14); l.y(ny * l.d * 9); });
        svgLayers.forEach((l) => { l.x(nx * l.d * 9); l.y(ny * l.d * 5); });
        irises.forEach((l) => { l.x(nx * 3.5); l.y(ny * 2.5); });
        ry(nx * 4); rx(-ny * 3);
      });
      hero.addEventListener('pointerleave', () => {
        domLayers.forEach((l) => { l.x(0); l.y(0); });
        svgLayers.forEach((l) => { l.x(0); l.y(0); });
        irises.forEach((l) => { l.x(0); l.y(0); });
        rx(0); ry(0);
      });
    }

    if (window.ScrollTrigger) {
      gsap.to('.hero-visual-inner', { yPercent: -6, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 1.2 } });
    }
  };
})(window.MJB);
