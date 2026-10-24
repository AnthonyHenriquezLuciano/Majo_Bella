/* MAJOBELLA · Imagen de la tarjeta de regalo (la usan la web y el dashboard)
   M.GiftCard.canvas(g, { webUrl }) → Promise<canvas>
   M.GiftCard.download(g, { webUrl }) → descarga MAJOBELLA-tarjeta-CODIGO.png
   g: { codigo, montoRD, para, comprador | de, mensaje, vence } */
(function (M) {
  const shortDate = (key) => (key ? new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${key}T12:00:00Z`)).replace('.', '') : '');

  function loadLogo() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = (M.assetBase || '') + 'assets/logo-majobella.png';
    });
  }

  function spaced(ctx, text, cx, y, gap) {
    const chars = [...String(text)];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((t, w) => t + w, 0) + gap * (chars.length - 1);
    let px = cx - total / 2;
    ctx.textAlign = 'left';
    chars.forEach((ch, i) => { ctx.fillText(ch, px, y); px += widths[i] + gap; });
    ctx.textAlign = 'center';
  }
  function wrap(ctx, text, cx, y, max, lh) {
    let line = '';
    String(text).split(' ').forEach((w) => {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > max && line) { ctx.fillText(line, cx, y); y += lh; line = w; } else line = t;
    });
    if (line) ctx.fillText(line, cx, y);
  }

  async function canvas(g, opts = {}) {
    // Exportación autosuficiente: sin dependencias remotas ni imágenes bloqueadas.
    const W = 1200, H = 720;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    // MAJOBELLA · Tarjeta de regalo en negro y marfil, igual que la vista previa.
    const bg = x.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#050505'); bg.addColorStop(.65, '#151515'); bg.addColorStop(1, '#050505');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(247,239,226,.5)'; x.lineWidth = 2; x.strokeRect(34, 34, W - 68, H - 68);
    x.strokeStyle = 'rgba(247,239,226,.18)'; x.lineWidth = 1; x.strokeRect(49, 49, W - 98, H - 98);
    x.beginPath(); x.arc(1060, 70, 300, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,.025)'; x.fill();
    x.textAlign = 'center';
    x.fillStyle = '#f6f0e7'; x.font = '600 31px Georgia, serif';
    spaced(x, 'MAJOBELLA', W / 2, 133, 7);
    x.font = '400 39px Georgia, serif'; x.fillText('✦', W / 2, 190);
    x.fillStyle = '#d8d2c8'; x.font = '600 19px Georgia, serif';
    spaced(x, 'TARJETA DE REGALO', W / 2, 256, 6);
    x.fillStyle = '#fff'; x.font = '600 96px Georgia, serif';
    const amount = M.fmtPrice(Number(g.montoRD) || 0);
    x.fillText(amount, W / 2, 366, 1030);
    const from = g.comprador || g.de;
    const who = [g.para ? `Para ${g.para}` : '', from ? `de ${from}` : ''].filter(Boolean).join(' · ');
    if (who) { x.font = 'italic 31px Georgia, serif'; x.fillStyle = '#eee8df'; x.fillText(who, W / 2, 420, 990); }
    if (g.mensaje) {
      x.font = '23px Georgia, serif'; x.fillStyle = '#cfc9c0';
      wrap(x, `“${String(g.mensaje).slice(0, 140)}”`, W / 2, 461, 880, 31);
    }
    x.fillStyle = 'rgba(255,255,255,.09)'; x.fillRect(W / 2 - 215, 541, 430, 65);
    x.strokeStyle = 'rgba(255,255,255,.56)'; x.lineWidth = 1; x.strokeRect(W / 2 - 215, 541, 430, 65);
    x.fillStyle = '#fff'; x.font = '600 27px ui-monospace, Menlo, monospace';
    spaced(x, g.codigo || 'MJB-····-····', W / 2, 584, 2.3);
    x.fillStyle = '#e7dfd4'; x.font = '600 15px Georgia, serif';
    spaced(x, 'MÁS YO, MÁS BELLA.  ✦  BEAUTY STUDIO', W / 2, 646, 1.2);
    const web = String(opts.webUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    x.font = '15px Georgia, serif';
    const line = `Usa tu código al reservar${g.vence ? ' · Válida hasta ' + shortDate(g.vence) : ''}${web ? ' · ' + web : ''}`;
    x.fillText(line, W / 2, 682, W - 140);
    return c;
  }

  async function download(g, opts) {
    const c = await canvas(g, opts);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `MAJOBELLA-tarjeta-${g.codigo}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  M.GiftCard = { canvas, download };
})(window.MJB);
