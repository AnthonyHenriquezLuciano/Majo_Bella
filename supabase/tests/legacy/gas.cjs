// Simulación mínima de Google Apps Script para probar el backend anterior (Code.gs) en Node: se usa para probar la migración a Supabase
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

const calls = { n: 0 };
function makeSheet(name) {
  const data = []; // filas de arrays
  const sh = {
    name, data, getName: () => name,
    getLastRow() { return data.length; },
    getLastColumn() { return data.reduce((m, r) => Math.max(m, r.length), 0); },
    deleteRow(r) { data.splice(r - 1, 1); },
    getMaxRows() { return 1000; },
    getRange(r, c, nr = 1, nc = 1) {
      calls.n++;
      return {
        setValues(vals) { vals.forEach((row, i) => { while (data.length < r + i) data.push([]); row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v; }); }); return this; },
        setValue(v) { return this.setValues([[v]]); },
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : v); } out.push(row); } return out; },
        setNumberFormat() { return this; }, setFontWeight() { return this; },
      };
    },
    setFrozenRows() {}, autoResizeColumns() {},
  };
  return sh;
}
function makeSS() {
  const sheets = {};
  return {
    sheets,
    getId: () => 'SHEET1', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET1',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet() {},
  };
}

function load(codePath, opts = {}) {
  const ss = makeSS();
  const props = { PAYPAL_CLIENT_ID: 'x', PAYPAL_SECRET: 'y', PAYPAL_ENV: 'sandbox', ADMIN_EMAILS: 'majo@example.com' };
  const cache = {};
  const mails = [], events = {}, drive = {}, triggers = [];
  const pp = { n: 0, orders: {}, captures: {}, refunds: [], failCapture: false };
  const tokens = { 'admin-token': 'majo@example.com', 'client-token': 'ana@example.com' };
  let driveN = 0;
  const fileObj = (id) => ({
    getId: () => id,
    getBlob: () => ({ getBytes: () => drive[id].bytes }),
    setTrashed: () => { delete drive[id]; },
    setSharing: (a, p) => { drive[id].sharing = a + ':' + p; },
    getSharingAccess: () => 'PRIVATE', getEditors: () => [], getViewers: () => [],
    makeCopy: (name, f) => { const nid = 'DRV' + (++driveN); drive[nid] = Object.assign({}, drive[id], { name, copyOf: id }); return fileObj(nid); },
  });
  const folder = { getId: () => 'FOLDER1', getSharingAccess: () => 'PRIVATE', getEditors: () => [], getViewers: () => [{ getEmail: () => 'amiga@example.com' }], createFile: (blob) => { const id = 'DRV' + (++driveN); drive[id] = blob; return fileObj(id); } };
  const ctx = {
    console,
    Logger: { log: (m) => opts.verbose && console.log('[GAS]', m) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => null, create: () => ss },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => { if (opts.failMail) throw new Error('quota'); mails.push(m); }, getRemainingDailyQuota: () => 100 - mails.length },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((h) => ({ getHandlerFunction: () => h })),
      deleteTrigger: (t) => { const i = triggers.indexOf(t.getHandlerFunction()); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (h) => { const ch = { timeBased: () => ch, everyHours: () => ch, forSpreadsheet: () => ch, onEdit: () => ch, create: () => { triggers.push(h); } }; return ch; },
    },
    DriveApp: {
      getFolderById: (id) => { if (id !== 'FOLDER1') throw new Error('no folder'); return folder; },
      createFolder: () => folder,
      getFileById: (id) => { if (id === 'SHEET1') return { getSharingAccess: () => 'PRIVATE', getEditors: () => [{ getEmail: () => 'majo@example.com' }], getViewers: () => [] }; if (!drive[id]) throw new Error('no file'); return fileObj(id); },
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
    },
    CalendarApp: {
      getDefaultCalendar: () => ({
        createEvent: (t, s, e, o) => { const id = 'EV' + Object.keys(events).length; events[id] = { t, s, e, o }; return { getId: () => id }; },
        getEventById: (id) => events[id] ? { deleteEvent: () => { delete events[id]; }, setTime: (a, b) => { events[id].s = a; events[id].e = b; } } : null,
      }),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      newBlob: function mk(bytes, mime, name) { const b = { bytes, mime, name, getContentType: () => b.mime, setName: (n) => { b.name = n; return b; }, getName: () => b.name, getAs: (t) => mk(bytes, t, name), getBytes: () => (typeof bytes === 'string' ? [...Buffer.from(bytes)] : bytes) }; return b; },
      base64Decode: (s) => [...Buffer.from(s, 'base64')].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (s) => (Array.isArray(s) ? Buffer.from(s.map((b) => (b + 256) % 256)) : Buffer.from(s)).toString('base64'),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s).digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
        return fmt.replace('yyMMdd', p.year.slice(2) + p.month + p.day).replace('yyyy-MM-dd', `${p.year}-${p.month}-${p.day}`).replace('HH', p.hour).replace(/^H$/, String(Number(p.hour))).replace('mm', p.minute);
      },
    },
    UrlFetchApp: {
      fetch(url, o = {}) {
        const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
        if (url.includes('tokeninfo')) {
          const t = decodeURIComponent(url.split('id_token=')[1]);
          return tokens[t] ? res(200, { aud: '333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com', email: tokens[t], email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600) }) : res(400, {});
        }
        if (url.includes('turnstile/v0/siteverify')) return res(200, { success: String(o.payload.response).startsWith('ok') });
        if (url.endsWith('/v1/oauth2/token')) return res(200, { access_token: 'AT', expires_in: 32000 });
        const body = o.payload ? JSON.parse(o.payload) : null;
        let m;
        if (url.endsWith('/v2/checkout/orders')) {
          const id = 'ORDER' + (++pp.n);
          pp.orders[id] = { id, status: 'CREATED', amount: body.purchase_units[0].amount };
          return res(201, { id, status: 'CREATED' });
        }
        if ((m = url.match(/orders\/([^/]+)\/capture$/))) {
          const o2 = pp.orders[m[1]];
          if (!o2) return res(404, { message: 'not found' });
          if (pp.failCapture) return res(422, { details: [{ issue: 'INSTRUMENT_DECLINED' }] });
          if (o2.status === 'COMPLETED') return res(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
          o2.status = 'COMPLETED'; o2.capture = 'CAP' + pp.n + m[1];
          pp.captures[o2.capture] = o2;
          return res(201, { id: o2.id, status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: o2.capture, status: 'COMPLETED', amount: o2.amount }] } }] });
        }
        if ((m = url.match(/captures\/([^/]+)\/refund$/))) { pp.refunds.push(m[1]); return res(201, { id: 'REF' + pp.refunds.length, status: 'COMPLETED' }); }
        if ((m = url.match(/orders\/([^/]+)$/))) { const o2 = pp.orders[m[1]]; return res(200, { id: o2.id, status: o2.status, purchase_units: [{ payments: { captures: [{ id: o2.capture, status: 'COMPLETED', amount: o2.amount }] } }] }); }
        return res(404, { message: 'mock: ' + url });
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8') + '\n;this.__api={doGet,doPost,setup,tareasProgramadas};', ctx);
  const api = ctx.__api;
  return {
    ss, props, mails, events, pp, drive, triggers, ctx,
    setup: () => api.setup(),
    cron: () => api.tareasProgramadas(),
    get: (params) => JSON.parse(api.doGet({ parameter: params }).text),
    post: (body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text),
  };
}
module.exports = { load, calls };
