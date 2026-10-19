/* MAJOBELLA · Apariciones suaves al hacer scroll (fade + slide-up) */
(function (M) {
  M.initReveal = function () {
    if (!window.ScrollTrigger || M.reduceMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('[data-reveal]').forEach((node) => {
      const kids = node.matches('[data-reveal="stagger"]') ? node.children : node;
      gsap.from(kids, {
        y: 28, opacity: 0, duration: 1.3, ease: 'power2.out', stagger: 0.12,
        scrollTrigger: { trigger: node, start: 'top 86%', once: true },
      });
    });
    gsap.utils.toArray('[data-parallax]').forEach((node) => {
      gsap.to(node, { yPercent: parseFloat(node.dataset.parallax), ease: 'none', scrollTrigger: { trigger: node.parentElement, start: 'top bottom', end: 'bottom top', scrub: 1.5 } });
    });
  };
})(window.MJB);
