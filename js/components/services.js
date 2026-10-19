/* MAJOBELLA · Menú de servicios (estilo Fresha)
   Pestañas por categoría, tarjetas con "Añadir" y detalle desplegable:
   para quién es, qué incluye, resultado, cómo prepararse y cuidados. */
(function (M) {
  const list_ = (items) => `<ul>${items.map((i) => `<li>${M.escapeHtml(i)}</li>`).join('')}</ul>`;

  M.initServices = function () {
    const tabs = document.getElementById('menu-tabs');
    const list = document.getElementById('services-list');
    const cats = [...new Set(M.services.map((s) => s.category || 'Servicios'))];
    let active = 'Todos';

    tabs.innerHTML = ['Todos', ...cats].map((c) => `
      <button type="button" class="menu-tab${c === active ? ' is-active' : ''}" role="tab" aria-selected="${c === active}" data-cat="${M.escapeHtml(c)}">${M.escapeHtml(c)}</button>`).join('');

    function details(s) {
      const blocks = [];
      if (s.idealFor) blocks.push(`<div><dt>Ideal para</dt><dd>${M.escapeHtml(s.idealFor)}</dd></div>`);
      if (s.includes && s.includes.length) blocks.push(`<div><dt>Qué incluye</dt><dd>${list_(s.includes)}</dd></div>`);
      if (s.results) blocks.push(`<div><dt>Resultado</dt><dd>${M.escapeHtml(s.results)}</dd></div>`);
      if (s.prep && s.prep.length) blocks.push(`<div><dt>Antes de tu cita</dt><dd>${list_(s.prep)}</dd></div>`);
      if (s.aftercare && s.aftercare.length) blocks.push(`<div><dt>Después</dt><dd>${list_(s.aftercare)}</dd></div>`);
      return blocks.join('');
    }

    function card(s) {
      const on = M.state.selected.includes(s.id);
      const hasDetails = s.idealFor || (s.includes && s.includes.length);
      return `
        <article class="svc-card${on ? ' is-selected' : ''}" data-id="${s.id}">
          <div class="svc-info">
            <h3 class="svc-name">${M.escapeHtml(s.name)}</h3>
            <p class="svc-dur">${M.fmtDurationShort(s.durationMinutes)}</p>
            <p class="svc-desc">${M.escapeHtml(s.description)}</p>
            <p class="svc-price">${M.fmtServicePrice(s)}</p>
            ${hasDetails ? `<button type="button" class="svc-more" aria-expanded="false" aria-controls="det-${s.id}">Ver detalles</button>` : ''}
          </div>
          <button type="button" class="svc-add" data-add="${s.id}" aria-pressed="${on}">
            <span class="svc-add-icon" aria-hidden="true"></span>
            <span class="svc-add-label">${on ? 'Añadido' : 'Añadir'}</span>
            <span class="sr-only"> ${M.escapeHtml(s.name)}</span>
          </button>
          ${hasDetails ? `<dl class="svc-details" id="det-${s.id}" hidden>${details(s)}</dl>` : ''}
        </article>`;
    }

    function render() {
      const groups = cats
        .filter((c) => active === 'Todos' || c === active)
        .map((c) => ({ c, items: M.services.filter((s) => (s.category || 'Servicios') === c) }));
      list.innerHTML = groups.map(({ c, items }) => `
        ${items.length > 1 ? `<h3 class="menu-cat">${M.escapeHtml(c)}</h3>` : ''}
        ${items.map(card).join('')}`).join('');
    }

    function toggleDetails(cardEl) {
      const btn = cardEl.querySelector('.svc-more');
      const panel = cardEl.querySelector('.svc-details');
      if (!btn || !panel) return;
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Ocultar detalles' : 'Ver detalles';
      cardEl.classList.toggle('is-open', open);
      if (open) {
        panel.hidden = false;
        if (!M.reduceMotion()) gsap.fromTo(panel, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.5, ease: 'power2.out' });
      } else if (M.reduceMotion()) {
        panel.hidden = true;
      } else {
        gsap.to(panel, { height: 0, opacity: 0, duration: 0.35, ease: 'power2.in', onComplete: () => { panel.hidden = true; gsap.set(panel, { clearProps: 'height,opacity' }); } });
      }
    }

    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.menu-tab');
      if (!b) return;
      active = b.dataset.cat;
      tabs.querySelectorAll('.menu-tab').forEach((t) => {
        const on = t === b;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      render();
      if (!M.reduceMotion()) gsap.from(list.children, { opacity: 0, y: 12, duration: 0.6, stagger: 0.05, ease: 'power2.out' });
    });

    list.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.svc-card');
      if (!cardEl) return;
      if (e.target.closest('.svc-add')) { M.toggleService(cardEl.dataset.id, 'services'); return; }
      if (e.target.closest('.svc-details')) return;
      toggleDetails(cardEl);
    });

    // Refleja la selección sin volver a dibujar todo
    M.on((st) => {
      list.querySelectorAll('.svc-card').forEach((c) => {
        const on = st.selected.includes(c.dataset.id);
        c.classList.toggle('is-selected', on);
        const b = c.querySelector('.svc-add');
        b.setAttribute('aria-pressed', String(on));
        b.querySelector('.svc-add-label').textContent = on ? 'Añadido' : 'Añadir';
      });
    });

    render();
  };

  /* Preguntas frecuentes (acordeón) */
  M.initFaq = function () {
    const box = document.getElementById('faq-list');
    if (!box) return;
    box.innerHTML = (window.MAJOBELLA_FAQ || []).map((f, i) => `
      <div class="faq-item">
        <h3><button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-${i}">${M.escapeHtml(f.q)}<span class="faq-icon" aria-hidden="true"></span></button></h3>
        <div class="faq-a" id="faq-${i}" hidden><p>${M.escapeHtml(f.a)}</p></div>
      </div>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.faq-q');
      if (!b) return;
      const open = b.getAttribute('aria-expanded') !== 'true';
      const panel = document.getElementById(b.getAttribute('aria-controls'));
      b.setAttribute('aria-expanded', String(open));
      if (open) {
        panel.hidden = false;
        if (!M.reduceMotion()) gsap.fromTo(panel, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.45, ease: 'power2.out' });
      } else {
        panel.hidden = true;
      }
    });
  };
})(window.MJB);
