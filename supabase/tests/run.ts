/* Ejecuta todas las pruebas del backend (o las que se indiquen): npx tsx tests/run.ts [nombre…] */
import { readdirSync } from 'node:fs';

const dir = new URL('.', import.meta.url).pathname;
const want = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith('.test.ts') && (!want.length || want.some((w) => f.includes(w)))).sort();
let failed = 0;
for (const f of files) {
  console.log('▶', f);
  const t0 = Date.now();
  try { const mod = await import(dir + f); await mod.default(); console.log('  ✔', f, `(${Date.now() - t0} ms)`); }
  catch (e: any) { failed++; console.log('  ✘', f, '\n   ', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n    ') : e); }
}
console.log(failed ? `\n${failed} de ${files.length} con fallos` : `\nTodas las pruebas pasaron (${files.length} archivos).`);
process.exit(failed ? 1 : 0);
