/* MAJOBELLA · Barra de suma: aparece solo cuando la clienta añade servicios.
   Muestra servicios elegidos, tiempo total y precio total, con acceso directo a la reserva. */
(function (M) {
  M.initSelectionBar = function () {
    const bar = document.getElementById('selection-bar');
    const names = document.getElementById('sb-names');
    const meta = document.getElementById('sb-meta');
    const price = document.getElementById('sb-price');
    const go = document.getElementById('sb-book');
    const clear = document.getElementById('sb-clear');
    if (!bar) return;
    const booking = document.getElementById('reservar');
    let inBooking = false, visible = false, shown = 0;

    // En la página de reservas baja al formulario; en las demás, lleva a Reservar con lo elegido
    go.addEventListener('click', () => M.goBook(M.state.selected, '', 'bar'));
    clear.addEventListener('click', () => M.selectOnly([], 'bar'));

    if (booking && 'IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { inBooking = e.isIntersecting; update(); }, { threshold: 0.12 }).observe(booking);
    }

    function show(v) {
      if (v === visible) return;
      visible = v;
      document.body.classList.toggle('has-selbar', v);
      if (v) bar.hidden = false;
      if (M.reduceMotion()) { bar.hidden = !v; return; }
      gsap.to(bar, {
        yPercent: v ? 0 : 120, opacity: v ? 1 : 0, duration: v ? 0.7 : 0.45, ease: v ? 'power3.out' : 'power2.in', overwrite: true,
        onComplete: () => { if (!v) bar.hidden = true; },
      });
    }
    gsap.set(bar, { yPercent: 120, opacity: 0 });

    function update() {
      const t = M.totals();
      if (t.items.length) {
        names.textContent = t.items.map((s) => s.name).join(' + ');
        meta.textContent = `${t.items.length} ${t.items.length === 1 ? 'servicio' : 'servicios'} · ${M.fmtDuration(t.minutes)}`;
        const o = { v: shown };
        gsap.to(o, {
          v: t.price, duration: M.reduceMotion() ? 0 : 0.6, ease: 'power2.out', overwrite: true,
          onUpdate: () => { price.textContent = (t.hasFrom ? 'Desde ' : '') + M.fmtPrice(o.v); },
        });
        shown = t.price;
      }
      show(t.items.length > 0 && !inBooking);
    }
    M.on(update);
    update();
  };
})(window.MJB);
