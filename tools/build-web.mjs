/* MAJOBELLA · Arma las páginas de la web a partir de web/pages y web/partials
   Uso: node tools/build-web.mjs [versión]   (la versión va en ?v= de cada CSS/JS para que se actualice la caché)
   Cada página empieza con <!--page {"key","file","path","title","description","ogTitle","ogDescription","jsonld"}--> */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');
const v = process.argv[2] || read('sw.js').match(/const VERSION = 'mjb-([^']+)'/)[1];

const JSONLD = `<!-- Ficha del negocio para Google -->
<script type="application/ld+json">
${read('web/partials/jsonld.json').trim()}
</script>`;

const partial = (name) => read(`web/partials/${name}.html`);
let n = 0;
for (const f of readdirSync(root + 'web/pages').filter((x) => x.endsWith('.html'))) {
  const src = read('web/pages/' + f);
  const m = src.match(/^<!--page (\{.*\})-->\n/);
  if (!m) throw new Error('Falta la cabecera <!--page …--> en ' + f);
  const meta = JSON.parse(m[1]);
  const body = src.slice(m[0].length);
  const isHome = meta.key === 'inicio';
  let head = partial('head')
    .replace(/{{title}}/g, meta.title).replace(/{{description}}/g, meta.description)
    .replace(/{{ogTitle}}/g, meta.ogTitle || meta.title).replace(/{{ogDescription}}/g, meta.ogDescription || meta.description)
    .replace(/{{path}}/g, meta.path).replace('{{extraHead}}', meta.jsonld ? JSONLD : '');
  let html = `<!doctype html>
<html lang="es">
<head>
${head}</head>
<body data-page="${meta.key}">
<!--MJB:BODY-START-->
${partial('header')}
${body}
${partial('footer')}

${partial('overlays')}<!--MJB:BODY-END-->

${partial('scripts')}</body>
</html>
`;
  html = html.replace(/{{H}}/g, isHome ? '' : './').replace(/{{v}}/g, v);
  // Página actual en el menú
  html = html.replace(new RegExp(`data-nav="${meta.key}"`, 'g'), `data-nav="${meta.key}" aria-current="page"`);
  writeFileSync(root + meta.file, html);
  n++;
}
console.log(`Páginas generadas: ${n} (versión ${v})`);
