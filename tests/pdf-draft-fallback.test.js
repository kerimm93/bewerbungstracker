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
  STEP_STATUSES: ['offen', 'begonnen', 'Rohentwurf', 'geprüft', 'erledigt'],
  BAUSTEIN_KEYS: ['ansprechpartner', 'adressblock', 'motivationssatz', 'skillmatch', 'firmenbezug', 'notizen'],
  S: { profileTextBlocks: { standardEinleitung: 'Globaler Standard', standardMotivation: '', standardProjekte: '', standardSchluss: '' } },
  todayDe: () => '01.07.2026',
  getCfg: () => ({ name: 'Kerim Mallée', beruf: 'Fachinformatiker für Anwendungsentwicklung' })
};
vm.createContext(context);
new vm.Script(script.slice(start, end), { filename: 'index.html:pdf-draft' }).runInContext(context);
const mergeStart = script.indexOf('function pickBetterDate');
const mergeEnd = script.indexOf('function mergeMailReview', mergeStart);
new vm.Script(script.slice(mergeStart, mergeEnd), { filename: 'index.html:pdf-merge' }).runInContext(context);
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


function questWithPdfDraft(pdfDraft) {
  const q = context.defaultQuest();
  q.pdfDraft = Object.assign(context.defaultPdfDraft(), pdfDraft);
  q.pdfDraft._set = Object.assign({}, pdfDraft._set || {});
  q.pdfDraft._omit = Object.assign({}, pdfDraft._omit || {});
  return q;
}
function letterForQuest(q) {
  return context.getFinalLetterModel(Object.assign({}, firm, { quest: q })).standardEinleitung;
}

let localQuest = questWithPdfDraft({ standardEinleitungOverride: '', _set: { standardEinleitungOverride: true }, _omit: {} });
let remoteQuest = questWithPdfDraft({ standardEinleitungOverride: 'Remote Custom', _set: { standardEinleitungOverride: true }, _omit: {} });
let mergedQuest = context.mergeQuest(localQuest, remoteQuest);
assert.strictEqual(mergedQuest.pdfDraft.standardEinleitungOverride, 'Remote Custom');
assert.strictEqual(mergedQuest.pdfDraft._set.standardEinleitungOverride, true);
assert.notStrictEqual(mergedQuest.pdfDraft._omit.standardEinleitungOverride, true);
assert.strictEqual(letterForQuest(mergedQuest), 'Remote Custom', 'Merged non-empty remote override must not fall back to global');

localQuest = questWithPdfDraft({ standardEinleitungOverride: '', _set: {}, _omit: { standardEinleitungOverride: true } });
remoteQuest = questWithPdfDraft({ standardEinleitungOverride: 'Custom trotz altem omit', _set: { standardEinleitungOverride: true }, _omit: {} });
mergedQuest = context.mergeQuest(localQuest, remoteQuest);
assert.strictEqual(mergedQuest.pdfDraft.standardEinleitungOverride, 'Custom trotz altem omit');
assert.strictEqual(mergedQuest.pdfDraft._set.standardEinleitungOverride, true);
assert.notStrictEqual(mergedQuest.pdfDraft._omit.standardEinleitungOverride, true);
assert.strictEqual(letterForQuest(mergedQuest), 'Custom trotz altem omit', 'Stale omit must not block selected custom override');

localQuest = questWithPdfDraft({ standardEinleitungOverride: '', _set: { standardEinleitungOverride: true }, _omit: {} });
remoteQuest = questWithPdfDraft({ standardEinleitungOverride: '', _set: { standardEinleitungOverride: true }, _omit: {} });
mergedQuest = context.mergeQuest(localQuest, remoteQuest);
assert.notStrictEqual(mergedQuest.pdfDraft._set.standardEinleitungOverride, true);
assert.notStrictEqual(mergedQuest.pdfDraft._omit.standardEinleitungOverride, true);
assert.strictEqual(letterForQuest(mergedQuest), 'Globaler Standard', 'Only empty legacy overrides must fall back to global');

localQuest = questWithPdfDraft({ standardEinleitungOverride: '', _set: {}, _omit: { standardEinleitungOverride: true } });
remoteQuest = questWithPdfDraft({ standardEinleitungOverride: '', _set: {}, _omit: {} });
mergedQuest = context.mergeQuest(localQuest, remoteQuest);
assert.strictEqual(mergedQuest.pdfDraft._omit.standardEinleitungOverride, true);
assert.strictEqual(letterForQuest(mergedQuest), '', 'Explicit omit without custom override must remain omitted');

console.log('PDF draft fallback semantics OK');
