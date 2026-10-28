/* MAJOBELLA · Menú de servicios (estilo Fresha)
   Pestañas por categoría, tarjetas con "Añadir" y detalle desplegable:
   para quién es, qué incluye, resultado, cómo prepararse y cuidados. */
(function (M) {
  const list_ = (items) => `<ul>${items.map((i) => `<li>${M.escapeHtml(i)}</li>`).join('')}</ul>`;

  M.initServices = function () {
    const tabs = document.getElementById('menu-tabs');
    const list = document.getElementById('services-list');
    let active = 'Todos';
    const categories = () => (M.serviceCategories && M.serviceCategories.length)
      ? M.serviceCategories
      : [...new Set(M.services.map((s) => s.category || 'Servicios'))].map((name) => ({ id: name, name }));

    function details(s) {
      // Orden editorial: izquierda tratamiento / resultado; derecha indicaciones.
      const block = (title, value, list = false) => {
        if (!value || (Array.isArray(value) && !value.length)) return '';
        const text = list ? list_(Array.isArray(value) ? value : String(value).split(/\r?\n/).filter(Boolean)) : M.escapeHtml(value);
        return `<div class="svc-detail-section"><dt>${title}</dt><dd>${text}</dd></div>`;
      };
      const left = block('Ideal para', s.idealFor)
        + block('Qué incluye', s.includes, true)
        + block('Resultado', s.results);
      const right = block('Antes de tu cita', s.prep, true)
        + block('Cuidados posteriores', s.aftercare, true);
      return left || right ? `<div class="svc-detail-col svc-detail-primary">${left}</div><div class="svc-detail-col svc-detail-care">${right}</div>` : '';
    }

    /* Precio con la promoción automática vigente, si la hay */
    function priceHtml(s) {
      const p = M.promoFor && M.promoFor(s.id);
      if (!p) return `<p class="svc-price">${M.fmtServicePrice(s)}</p>`;
      const until = p.until ? ` hasta el ${M.dayMonth(p.until)}` : '';
      return `<p class="svc-price"><s>${M.fmtServicePrice(s)}</s> ${s.priceFrom ? 'Desde ' : ''}${M.fmtPrice(s.price - p.discount)}</p>
            <p class="svc-promo"><span>${M.escapeHtml(M.promoLabel(p))}</span>${M.escapeHtml(p.name)}${until}</p>`;
    }

    function card(s) {
      const on = M.state.selected.includes(s.id);
      const hasDetails = true;
      return `
        <article class="svc-card${on ? ' is-selected' : ''}" data-id="${s.id}">
          <div class="svc-info">
            <h3 class="svc-name">${M.escapeHtml(M.Validate.properName(s.name))}</h3>
            <p class="svc-dur">${M.fmtDurationShort(s.durationMinutes)}</p>
            <p class="svc-desc">${M.escapeHtml(s.description)}</p>
            ${priceHtml(s)}
            <button type="button" class="svc-more" aria-expanded="false" aria-controls="det-${s.id}">Ver detalle</button>
          </div>
          <button type="button" class="svc-add" data-add="${s.id}" aria-label="${on ? 'Quitar' : 'Añadir'} ${M.escapeHtml(M.Validate.properName(s.name))}" aria-pressed="${on}">
            <span class="svc-add-label" aria-hidden="true">${on ? '✓' : '+'}</span>
          </button>
          <dl class="svc-details" id="det-${s.id}" hidden>
            ${details(s) || `<div class="svc-detail-col"><div class="svc-detail-section"><dt>Acerca del servicio</dt><dd>${M.escapeHtml(s.description || 'Consulta la información del tratamiento antes de reservar.')}</dd></div></div>`}
          </dl>
        </article>`;
    }

    M.refreshServices = () => render();
    function render() {
      const cats = categories();
      const cat = cats.find(c => c.name === active);
      if (!cat) active = 'Todos';
      // Filtros originales siempre visibles: "Todos" muestra la lista de categorías.
      tabs.innerHTML = ['Todos', ...cats.map((c) => c.name)].map((name) => `
        <button type="button" class="menu-tab${name === active ? ' is-active' : ''}"
          role="tab" aria-selected="${name === active}" data-cat="${M.escapeHtml(name)}">${M.escapeHtml(M.Validate.properName(name))}</button>`).join('');
      if (!cat) {
        list.innerHTML = `<div class="menu-category-grid">${cats.map((c) => {
          return `<button type="button" class="menu-category-tile" data-open-category="${M.escapeHtml(c.name)}">
            <strong>${M.escapeHtml(M.Validate.properName(c.name))}</strong>
            <span class="menu-category-cta">Explorar →</span>
          </button>`;
        }).join('')}</div>`;
        return;
      }
      const items = M.services.filter((s) => s.categoryId === cat.id || (!s.categoryId && s.category === cat.name));
      const parents = (M.serviceGroups || []).filter((g) => g.categoryId === cat.id);
      const direct = items.filter((s) => !s.parentId || !parents.some((g) => g.id === s.parentId));
      list.innerHTML = `<div class="menu-category-heading"><h3>${M.escapeHtml(M.Validate.properName(cat.name))}</h3></div>
        ${parents.map((g) => {
          const children = items.filter((s) => s.parentId === g.id);
          if (!children.length) return '';
          return `<details class="menu-service-group">
            <summary aria-label="Ver opciones de ${M.escapeHtml(M.Validate.properName(g.name))}">
              <span class="menu-group-copy">
                <span class="menu-group-name">${M.escapeHtml(M.Validate.properName(g.name))}</span>
                <span class="menu-group-hint">Ver opciones</span>
              </span>
              <span class="menu-group-expand" aria-hidden="true"></span>
            </summary>
            <div class="menu-service-children">${g.description ? `<p>${M.escapeHtml(g.description)}</p>` : ''}
              ${children.map(card).join('')}
            </div>
          </details>`;
        }).join('')}
        ${direct.map(card).join('')}`;
    }

    function toggleDetails(cardEl) {
      const btn = cardEl.querySelector('.svc-more');
      const panel = cardEl.querySelector('.svc-details');
      if (!btn || !panel) return;
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Ocultar detalle' : 'Ver detalle';
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
      const categoryButton = e.target.closest('[data-open-category]');
      if (categoryButton) {
        active = categoryButton.dataset.openCategory;
        render();
        tabs.scrollIntoView({ block: 'nearest' });
        return;
      }
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
        b.querySelector('.svc-add-label').textContent = on ? '✓' : '+';
        b.setAttribute('aria-label', `${on ? 'Quitar' : 'Añadir'} ${c.querySelector('.svc-name').textContent}`);
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
