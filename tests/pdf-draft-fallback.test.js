const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
const start = script.indexOf('var STANDARD_PDF_OVERRIDE_KEYS');
const end = script.indexOf('function formatLetterText', start);
assert(start >= 0 && end > start, 'PDF-Draft-Funktionen wurden nicht gefunden');

const firm = {
  id: 'firm-1', name: 'Beispiel GmbH', adresse: '', anrede: '', anschreibenSatz: '',
  quest: {
    done: {}, returns: {}, extracted: {}, rawReturns: {}, normalizedReturns: {},
    contact: { ansprechpartner: '', anrede: '', email: '', telefon: '', adresse: '' },
    verdict: '', stepStatus: {}, stepChatLinks: {},
    bausteine: { ansprechpartner: '', adressblock: '', motivationssatz: '', skillmatch: '', firmenbezug: '', notizen: '' },
    pdfDraft: { standardEinleitungOverride: '', _set: { standardEinleitungOverride: true }, _omit: {} }
  }
};
const context = {
  Object, String, Array, Date,
  DEFAULT_REGIONS: [],
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { addEventListener: () => {}, getElementById: () => null },
  window: {},
  BAUSTEIN_KEYS: ['ansprechpartner', 'adressblock', 'motivationssatz', 'skillmatch', 'firmenbezug', 'notizen'],
  S: { profileTextBlocks: { standardEinleitung: 'Globaler Standard', standardMotivation: '', standardProjekte: '', standardSchluss: '' } },
  todayDe: () => '01.07.2026',
  getCfg: () => ({ name: 'Kerim Mallée', beruf: 'Fachinformatiker für Anwendungsentwicklung' })
};
vm.createContext(context);
new vm.Script(script.slice(start, end), { filename: 'index.html:pdf-draft' }).runInContext(context);
context.S.profileTextBlocks = { standardEinleitung: 'Globaler Standard', standardMotivation: '', standardProjekte: '', standardSchluss: '' };

let model = context.getFinalLetterModel(firm);
assert.strictEqual(model.standardEinleitung, 'Globaler Standard', 'Leerer gesetzter Override muss globalen Standard verwenden');

firm.quest.pdfDraft.standardEinleitungOverride = 'Custom';
firm.quest.pdfDraft._set.standardEinleitungOverride = true;
firm.quest.pdfDraft._omit = {};
model = context.getFinalLetterModel(firm);
assert.strictEqual(model.standardEinleitung, 'Custom', 'Nicht-leerer Override muss Custom-Text verwenden');

firm.quest.pdfDraft.standardEinleitungOverride = '';
firm.quest.pdfDraft._set = {};
firm.quest.pdfDraft._omit = { standardEinleitungOverride: true };
model = context.getFinalLetterModel(firm);
assert.strictEqual(model.standardEinleitung, '', 'Explizites Omit muss final leer sein');

console.log('PDF draft fallback semantics OK');
