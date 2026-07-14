const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const defaultsStart = script.indexOf('var STANDARD_PDF_OVERRIDE_KEYS');
const defaultsEnd = script.indexOf('function defaultProfileTextBlocks', defaultsStart);
const defaultsContext = { Object, String };
vm.createContext(defaultsContext);
new vm.Script(script.slice(defaultsStart, defaultsEnd)).runInContext(defaultsContext);

function firm(id, name) {
  return { id, name, region: 'Bremen', status: 'offen', nextSteps: [], quest: defaultsContext.defaultQuest() };
}
const A = firm('a', 'A GmbH');
const B = firm('b', 'B GmbH');
const C = firm('c', 'C GmbH');
const D = firm('d', 'D GmbH');
let saveCalls = 0;
const elements = {};
const context = {
  console, JSON, Date, Number, Object, Array, String, RegExp, Promise, Math,
  localStorage: { value: '', getItem(){ return this.value; }, setItem(k, v){ this.value = v; } },
  S: { firms: [A, B, C, D] },
  activeQuestFirmId: A.id,
  STEPS: [
    { name: 'Eignungsprüfung', tool: 'perplexity', tl: 'Perplexity' },
    { name: 'Kontaktdaten', tool: 'perplexity', tl: 'Perplexity' },
    { name: 'Firmenprofil-Stichpunkte', tool: 'perplexity', tl: 'Perplexity' },
    { name: 'Anschreiben generieren', tool: 'gpt', tl: 'ChatGPT' },
    { name: 'Anschreiben prüfen', tool: 'gpt', tl: 'ChatGPT' },
    { name: 'PDF-Dateiname', tool: 'app', tl: 'App' },
    { name: 'Mailtext', tool: 'gpt', tl: 'ChatGPT' },
    { name: 'Tracking-Eintrag', tool: 'gpt', tl: 'ChatGPT' }
  ],
  ensureQuestDefaults: defaultsContext.ensureQuestDefaults,
  defaultQuest: defaultsContext.defaultQuest,
  defaultPdfDraft: defaultsContext.defaultPdfDraft,
  STANDARD_PDF_OVERRIDE_KEYS: defaultsContext.STANDARD_PDF_OVERRIDE_KEYS,
  PDF_OVERRIDE_TO_OMIT_KEY: defaultsContext.PDF_OVERRIDE_TO_OMIT_KEY,
  normalizeEmailInput: defaultsContext.normalizeEmailInput,
  getFirm: id => context.S.firms.find(f => String(f.id) === String(id)),
  findByName: name => context.S.firms.find(f => f.name === name),
  isQuestActiveForOverview: f => f.status !== 'absage' && f.status !== 'zusage',
  getNextStep: f => ({ idx: Number(Object.keys(f.quest.stepStatus)[0] || 0), step: context.STEPS[0] }),
  questProgressValue: () => 0,
  fmtProgress: v => String(v),
  esc: v => String(v ?? '').replace(/[&<>"']/g, ''),
  document: { getElementById: id => elements[id] || null, querySelector: () => null, querySelectorAll: () => [] },
  window: { open() {} },
  extractJSON: raw => JSON.parse(raw),
  defaultNextStep: () => ({ id: '', title: '', details: '', source: 'email', sourceDate: '', dueDate: '', status: 'offen', priority: 'normal', createdAt: '', updatedAt: '' }),
  normalizeNextStepStatus: v => v || 'offen', normalizeNextStepPriority: v => v || 'normal', uid: () => 'uid',
  save: async () => { saveCalls++; return true; },
  checkResultSummary: r => r.urteil || '',
  renderDB(){}, renderQuestOverview(){}, renderNextStepsPanel(){}, renderQuestSteps(){}, updateStatusStrip(){}, renderBausteine(){}, updateMomentumModule(){}, updateMobileBar(){}, drawMap(){}, renderPdfDraftSection(){},
  copyText(){}, toast(){}, updateProgress(){}, promptHTML: v => v,
  getCfg: () => ({ beruf: 'FIAE', traeger: 'IBB', von: '2026-08-10', bis: '2027-04-02' }), getProfileTextBlocks: () => ({}), getFirmLocation: f => f.region
};
vm.createContext(context);
const statusStart = script.indexOf('async function setStepDoneStateForFirm');
const statusEnd = script.indexOf('function findNextMomentumFirm', statusStart);
new vm.Script(script.slice(statusStart, statusEnd)).runInContext(context);
const start = script.indexOf('var HANDOFF_STEP_INDEXES=');
const end = script.indexOf('function getNextStep', start);
new vm.Script(script.slice(start, end)).runInContext(context);

const beforeS = JSON.stringify(context.S);
let normalized = context.normalizeBatchUiState({ slotCount: 9, slots: [
  { firmId: 'a', stepIndex: 2 }, { firmId: 'missing', stepIndex: 1 }, { firmId: 'a', stepIndex: 3 }, { firmId: 'b', stepIndex: 99 }
]});
assert.strictEqual(normalized.slotCount, 4, 'slotCount must be capped to 4');
assert.strictEqual(JSON.stringify(normalized.slots.slice(0, 3).map(s => s.firmId)), JSON.stringify(['a', 'b', 'c']));
assert.strictEqual(JSON.stringify(context.S), beforeS, 'normalizing batch UI state must not mutate S');
normalized = context.normalizeBatchUiState({ slotCount: 1, slots: [{ firmId: 'a', stepIndex: 0 }] });
assert.strictEqual(normalized.slotCount, 2, 'slotCount must be raised to 2');
context.localStorage.value = '{broken';
assert.doesNotThrow(() => context.loadBatchUiState(), 'invalid JSON in localStorage must be ignored');

elements['batch-cards'] = { style: { props: {}, setProperty(k, v){ this.props[k] = v; } }, addEventListener(){}, _batchBound: false, innerHTML: '' };
context.batchUiState = context.normalizeBatchUiState({ slotCount: 2, slots: [
  { firmId: 'a', stepIndex: 0 }, { firmId: 'b', stepIndex: 1 }, { firmId: 'c', stepIndex: 2 }, { firmId: 'd', stepIndex: 3 }
]});
context.setBatchSlotCount(3);
assert.strictEqual(context.batchUiState.slotCount, 3);
assert.strictEqual((elements['batch-cards'].innerHTML.match(/<div class="batch-card(?: |")/g) || []).length, 3);
context.setBatchSlotCount(4);
assert.strictEqual(context.batchUiState.slotCount, 4);
assert.strictEqual((elements['batch-cards'].innerHTML.match(/<div class="batch-card(?: |")/g) || []).length, 4);
assert.strictEqual(context.batchUiState.slots[2].firmId, 'c');
assert.strictEqual(context.batchUiState.slots[3].firmId, 'd');
context.setBatchSlotCount(2);
assert.strictEqual((elements['batch-cards'].innerHTML.match(/<div class="batch-card(?: |")/g) || []).length, 2);
context.setBatchSlotCount(4);
assert.strictEqual(context.batchUiState.slots[2].firmId, 'c', 'hidden slot 3 must survive 4 -> 2 -> 4');
assert.strictEqual(context.batchUiState.slots[3].firmId, 'd', 'hidden slot 4 must survive 4 -> 2 -> 4');
assert.strictEqual((elements['batch-cards'].innerHTML.match(/<div class="batch-card(?: |")/g) || []).length, 4);

(async () => {
  await context.saveStepChatLinkValue(2, 'b', ' https://chat.example/b ');
  assert.strictEqual(B.quest.stepChatLinks[2].url, 'https://chat.example/b');
  assert.strictEqual(A.quest.stepChatLinks[2], undefined);
  await context.setStepDoneStateForFirm(2, 'b', true);
  assert.strictEqual(B.quest.done[2], true);
  assert.strictEqual(B.quest.stepStatus[2], 'erledigt');
  assert.strictEqual(A.quest.done[2], undefined);

  await context.importQuestStepHandoffJson(JSON.stringify({
    type: 'bewerbungstracker-quest-step-handoff-v1', firmId: 'b', firmName: 'B GmbH', stepIndex: 1, stepName: 'Kontaktdaten',
    data: { telefon: '+49 123', email: 'b@example.test' }, nextSteps: []
  }), { firmId: 'b', stepIndex: 1 });
  assert.strictEqual(B.telefon, '+49 123');
  assert.strictEqual(A.telefon, undefined);

  await assert.rejects(() => context.importQuestStepHandoffJson(JSON.stringify({
    type: 'bewerbungstracker-quest-step-handoff-v1', firmId: 'b', firmName: 'B GmbH', stepIndex: 1, stepName: 'Kontaktdaten',
    data: { telefon: '+49 999' }, nextSteps: []
  }), { firmId: 'a', stepIndex: 1 }), /passt nicht zum ausgewählten Batch-Slot/);
  assert.strictEqual(B.telefon, '+49 123');

  await assert.rejects(() => context.importQuestStepHandoffJson(JSON.stringify({
    type: 'bewerbungstracker-quest-step-handoff-v1', firmId: 'b', firmName: 'B GmbH', stepIndex: 1, stepName: 'Kontaktdaten',
    data: { telefon: '+49 888' }, nextSteps: []
  }), { firmId: 'b', stepIndex: 2 }), /passt nicht zum ausgewählten Schritt/);
  assert.strictEqual(B.telefon, '+49 123');

  await assert.rejects(() => context.importQuestStepHandoffJson(JSON.stringify({
    type: 'bewerbungstracker-quest-step-handoff-v1', firmId: 'b', firmName: 'B GmbH', stepIndex: 1, stepName: 'Kontaktdaten',
    data: { telefon: '+49 777' }, nextSteps: []
  })), /Bitte öffne diese Firma/);
  assert.strictEqual(B.telefon, '+49 123');
  console.log('Batch mode helpers OK');
})().catch(err => { console.error(err); process.exit(1); });
