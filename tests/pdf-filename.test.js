const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
const start = script.indexOf('function normalizePdfFileNamePart');
const end = script.indexOf('// ================================================================\n// STEPS', start);
assert(start >= 0 && end > start, 'PDF-Dateinamenfunktionen wurden nicht gefunden');

let config = { name: 'Jörg Müller' };
const context = {
  String,
  getCfg: () => config
};
vm.createContext(context);
new vm.Script(script.slice(start, end), { filename: 'index.html:pdf-filename' }).runInContext(context);

assert.strictEqual(
  context.buildPdfFileName({
    name: 'Beispiel GmbH',
    adresse: 'Beispiel GmbH\nMusterstraße 12\n26160 Bad Zwischenahn'
  }),
  'Joerg_Mueller_Bewerbung_FIAE-Pflichtpraktikum_Beispiel_GmbH_Bad_Zwischenahn.pdf'
);

assert.strictEqual(
  context.buildPdfFileName({ name: 'Weitere & Söhne AG', region: 'Köln' }),
  'Joerg_Mueller_Bewerbung_FIAE-Pflichtpraktikum_Weitere_und_Soehne_AG_Koeln.pdf'
);

assert.strictEqual(
  context.buildPdfFileName({
    name: 'Kontakt Beispiel KG',
    quest: { contact: { adresse: 'Kontakt Beispiel KG\nTestweg 1\n28195 Bremen' } }
  }),
  'Joerg_Mueller_Bewerbung_FIAE-Pflichtpraktikum_Kontakt_Beispiel_KG_Bremen.pdf'
);

assert.strictEqual(
  context.buildPdfFileName({ name: 'Firma ohne Standort' }),
  'Joerg_Mueller_Bewerbung_FIAE-Pflichtpraktikum_Firma_ohne_Standort_Ort.pdf'
);

config = {};
assert.strictEqual(
  context.buildPdfFileName({ name: 'Beispiel GmbH', region: 'Oldenburg' }),
  'Bewerbung_Bewerbung_FIAE-Pflichtpraktikum_Beispiel_GmbH_Oldenburg.pdf'
);

console.log('Generic PDF filename generation OK');
