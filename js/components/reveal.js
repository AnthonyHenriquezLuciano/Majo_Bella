/* MAJOBELLA · Apariciones suaves al hacer scroll (fade + slide-up)
   - Un solo observador por lotes (ScrollTrigger.batch) en vez de uno por elemento: menos trabajo al hacer scroll.
   - Solo transform y opacidad (la tarjeta gráfica las anima sin redibujar la página).
   - El efecto de profundidad (parallax) solo en computadoras: en el celular se prioriza la fluidez. */
(function (M) {
  M.initReveal = function () {
    if (!window.ScrollTrigger || M.reduceMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    const single = gsap.utils.toArray('[data-reveal]:not([data-reveal="stagger"])');
    gsap.set(single, { y: 22, autoAlpha: 0 });
    ScrollTrigger.batch(single, {
      start: 'top 90%', once: true,
      onEnter: (els) => gsap.to(els, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'power2.out', stagger: 0.08, overwrite: true, clearProps: 'transform,visibility' }),
    });
    gsap.utils.toArray('[data-reveal="stagger"]').forEach((node) => {
      const kids = [...node.children];
      gsap.set(kids, { y: 22, autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: node, start: 'top 90%', once: true,
        onEnter: () => gsap.to(kids, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'power2.out', stagger: 0.08, clearProps: 'transform,visibility' }),
      });
    });
    gsap.matchMedia().add('(hover: hover) and (min-width: 900px)', () => {
      gsap.utils.toArray('[data-parallax]').forEach((node) => {
        gsap.to(node, { yPercent: parseFloat(node.dataset.parallax), ease: 'none', scrollTrigger: { trigger: node.parentElement, start: 'top bottom', end: 'bottom top', scrub: 1 } });
      });
    });
  };
})(window.MJB);
