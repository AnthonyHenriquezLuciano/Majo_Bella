/* MAJOBELLA · Copia los datos de la web (servicios, preguntas y configuración pública) al paquete compartido
   de las apps (packages/core/src/data.ts), así la web y las apps muestran lo mismo.
   Uso: node tools/build-core-data.mjs   (se corre solo con npm run web:build) */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const window = {};
for (const f of ['js/config.js', 'js/data/services.js', 'js/data/faq.js']) vm.runInNewContext(readFileSync(root + f, 'utf8'), { window });
const C = window.MAJOBELLA_CONFIG;
// Solo lo público que usan las apps (nada de claves: aquí no hay ninguna)
const config = {
  brand: C.brand, whatsapp: C.whatsapp, social: C.social, contact: C.contact, currency: C.currency,
  schedule: C.schedule, policies: C.policies,
  payments: { depositPercent: C.payments.depositPercent, usdRate: C.payments.usdRate, holdMinutes: C.payments.holdMinutes },
  webUrl: 'https://anthonyhenriquezluciano.github.io/Majo_Bella/',
  apiUrl: C.booking.apiUrl,
};
const out = `/* Generado por tools/build-core-data.mjs a partir de js/config.js, js/data/services.js y js/data/faq.js.
   No editar a mano: cambia los archivos de la web y corre «npm run web:build». */
import type { PublicConfig, ServiceInfo, FaqItem } from './types';

export const CONFIG: PublicConfig = ${JSON.stringify(config, null, 2)};

export const SERVICES: ServiceInfo[] = ${JSON.stringify(window.MAJOBELLA_SERVICES, null, 2)};

export const FAQ: FaqItem[] = ${JSON.stringify(window.MAJOBELLA_FAQ, null, 2)};
`;
writeFileSync(root + 'packages/core/src/data.ts', out);
console.log('Datos de las apps:', window.MAJOBELLA_SERVICES.length, 'servicios,', window.MAJOBELLA_FAQ.length, 'preguntas');
