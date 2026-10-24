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
    await loadLogo(); // El logotipo se mantiene disponible para otras vistas; el diseño exportado usa tipografía.
    const W = 1200, H = 720;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    // Mismo lenguaje visual que la tarjeta que personalizas en la web.
    const bg = x.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#fcf7ee'); bg.addColorStop(.58, '#f1dfcd'); bg.addColorStop(1, '#dfc4ab');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(68,39,18,.32)'; x.lineWidth = 2; x.strokeRect(31, 31, W - 62, H - 62);
    x.strokeStyle = 'rgba(68,39,18,.16)'; x.lineWidth = 1; x.strokeRect(48, 48, W - 96, H - 96);
    x.beginPath(); x.ellipse(1030, 610, 300, 300, 0, 0, Math.PI * 2);
    x.fillStyle = 'rgba(68,39,18,.045)'; x.fill();
    x.fillStyle = '#442712';
    x.font = '600 29px Georgia, serif';
    spaced(x, 'MAJOBELLA', W / 2, 122, 7);
    x.font = '400 37px Georgia, serif'; x.fillText('✦', W / 2, 185);
    x.fillStyle = '#806148'; x.font = '600 19px Georgia, serif';
    spaced(x, 'TARJETA DE REGALO', W / 2, 246, 5);
    x.fillStyle = '#442712'; x.font = '600 100px Georgia, serif';
    x.fillText(M.fmtPrice(Number(g.montoRD) || 0), W / 2, 361);
    const from = g.comprador || g.de;
    const who = [g.para ? `Para ${g.para}` : '', from ? `de ${from}` : ''].filter(Boolean).join(' · ');
    if (who) {
      x.font = 'italic 30px Georgia, serif'; x.fillStyle = '#442712';
      const max = 56; x.fillText(who.length > max ? who.slice(0, max - 1) + '…' : who, W / 2, 413);
    }
    if (g.mensaje) {
      x.fillStyle = '#6c5544'; x.font = '22px Georgia, serif';
      wrap(x, `“${String(g.mensaje).slice(0, 140)}”`, W / 2, 460, 820, 28);
    }
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(W / 2 - 205, 546, 410, 60);
    x.strokeStyle = '#b79b82'; x.lineWidth = 1; x.strokeRect(W / 2 - 205, 546, 410, 60);
    x.fillStyle = '#442712'; x.font = '600 26px ui-monospace, Menlo, monospace';
    spaced(x, g.codigo || 'MJB-····-····', W / 2, 585, 2);
    x.fillStyle = '#7b5d47'; x.font = '600 15px Georgia, serif';
    spaced(x, 'MÁS YO, MÁS BELLA.  ✦  BEAUTY STUDIO', W / 2, 647, 1.5);
    const web = String(opts.webUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    x.font = '15px Georgia, serif';
    const line = `Al reservar utiliza tu código${web ? ' · ' + web : ''}${g.vence ? ' · Válida hasta ' + shortDate(g.vence) : ''}`;
    x.fillText(line.length > 125 ? line.slice(0, 124) + '…' : line, W / 2, 681);
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
