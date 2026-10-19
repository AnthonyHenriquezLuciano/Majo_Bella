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
      img.src = 'assets/logo-majobella.png';
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
    const logo = await loadLogo();
    const W = 1200, H = 720;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#111111'; x.lineWidth = 2; x.strokeRect(36, 36, W - 72, H - 72);
    x.lineWidth = 0.8; x.strokeRect(50, 50, W - 100, H - 100);
    if (logo && logo.naturalWidth) { const h = 92, w = (logo.naturalWidth / logo.naturalHeight) * h; x.drawImage(logo, (W - w) / 2, 96, w, h); }
    x.fillStyle = '#575757'; x.textAlign = 'center';
    x.font = '600 20px Georgia, serif';
    spaced(x, 'TARJETA DE REGALO', W / 2, 250, 6);
    x.fillStyle = '#000'; x.font = '400 96px Georgia, serif';
    x.fillText(M.fmtPrice(Number(g.montoRD) || 0), W / 2, 360);
    x.font = 'italic 30px Georgia, serif'; x.fillStyle = '#111';
    const from = g.comprador || g.de;
    const who = [g.para ? `Para ${g.para}` : '', from ? `de ${from}` : ''].filter(Boolean).join(' · ');
    if (who) x.fillText(who, W / 2, 420);
    if (g.mensaje) { x.font = '24px Georgia, serif'; x.fillStyle = '#575757'; wrap(x, `“${g.mensaje}”`, W / 2, 468, 860, 32); }
    x.fillStyle = '#111'; x.fillRect(W / 2 - 230, 540, 460, 74);
    x.fillStyle = '#fff'; x.font = '600 34px ui-monospace, Menlo, monospace';
    spaced(x, g.codigo, W / 2, 589, 4);
    x.fillStyle = '#575757'; x.font = '19px Georgia, serif';
    const web = String(opts.webUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    x.fillText(`Escribe el código al reservar${web ? ` en ${web}` : ''}${g.vence ? ` · válida hasta ${shortDate(g.vence)}` : ''}`, W / 2, 648);
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
