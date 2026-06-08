const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
const defaultsStart = script.indexOf('function defaultPdfDraft');
const defaultsEnd = script.indexOf('function defaultProfileTextBlocks', defaultsStart);
const defaultsContext = { Object, String };
vm.createContext(defaultsContext);
new vm.Script(script.slice(defaultsStart, defaultsEnd), { filename: 'index.html:quest-defaults' }).runInContext(defaultsContext);
assert.deepStrictEqual(Object.keys(defaultsContext.defaultQuest().stepChatLinks), []);
assert.deepStrictEqual(Object.keys(defaultsContext.ensureQuestDefaults({}).stepChatLinks), []);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(defaultsContext.ensureQuestDefaults({ stepChatLinks: { 1: 'https://chat.example/legacy' } }).stepChatLinks[1])),
  { url: 'https://chat.example/legacy', updatedAt: '' }
);

const start = script.indexOf("var HANDOFF_STEP_INDEXES=");
const end = script.indexOf('function getNextStep', start);
assert(start >= 0 && end > start, 'Quest-Handoff-Funktionen wurden nicht gefunden');

const firm = {
  id: 'firm-1',
  name: 'Beispiel GmbH',
  region: 'Bremen',
  status: 'offen',
  bewerbungsDatum: '',
  anschreibenSatz: '',
  nextSteps: [],
  quest: {
    done: {}, returns: {}, extracted: {}, rawReturns: {}, normalizedReturns: {},
    contact: { ansprechpartner: '', anrede: '', email: '', adresse: '' },
    verdict: '', stepStatus: { 2: 'Rohentwurf' }, stepChatLinks: {},
    bausteine: { ansprechpartner: '', adressblock: '', motivationssatz: '', skillmatch: '', firmenbezug: '', notizen: '' },
    pdfDraft: { _set: {} }
  }
};
const elements = {};
let saveCalls = 0;
const context = {
  console,
  JSON,
  Date,
  Number,
  Object,
  Array,
  String,
  RegExp,
  Promise,
  STEP_STATUSES: ['offen', 'begonnen', 'Rohentwurf', 'geprüft', 'erledigt'],
  BAUSTEIN_KEYS: ['ansprechpartner', 'adressblock', 'motivationssatz', 'skillmatch', 'firmenbezug', 'notizen'],
  STEPS: [
    { name: 'Eignungsprüfung' }, { name: 'Kontaktdaten' }, { name: 'Firmenprofil-Stichpunkte' },
    { name: 'Anschreiben generieren' }, { name: 'Anschreiben prüfen' }, { name: 'PDF-Dateiname' },
    { name: 'Mailtext' }, { name: 'Tracking-Eintrag' }
  ],
  S: { firms: [firm] },
  activeQuestFirmId: firm.id,
  openSteps: {},
  getCfg: () => ({ beruf: 'Fachinformatiker für Anwendungsentwicklung', traeger: 'IBB AG', von: '10.08.2026', bis: '02.04.2027' }),
  getProfileTextBlocks: () => ({ standardEinleitung: 'Standard', standardMotivation: '', standardProjekte: '', standardSchluss: '' }),
  defaultPdfDraft: defaultsContext.defaultPdfDraft,
  defaultQuest: defaultsContext.defaultQuest,
  ensureQuestDefaults: defaultsContext.ensureQuestDefaults,
  getFirm: id => String(id) === firm.id ? firm : undefined,
  findByName: name => String(name).toLowerCase() === firm.name.toLowerCase() ? firm : undefined,
  extractJSON: raw => JSON.parse(raw),
  defaultNextStep: () => ({ id: '', title: '', details: '', source: 'email', sourceDate: '', dueDate: '', status: 'offen', priority: 'normal', createdAt: '', updatedAt: '' }),
  normalizeNextStepStatus: value => ['offen', 'in_arbeit', 'wartet', 'erledigt'].includes(value) ? value : 'offen',
  normalizeNextStepPriority: value => ['niedrig', 'normal', 'hoch'].includes(value) ? value : 'normal',
  uid: () => 'next-1',
  save: async () => { saveCalls += 1; return true; },
  checkResultSummary: result => `Urteil: ${result.urteil}`,
  renderDB() {}, renderQuestOverview() {}, renderNextStepsPanel() {}, renderQuestSteps() {},
  updateStatusStrip() {}, renderBausteine() {}, updateMomentumModule() {}, updateMobileBar() {}, drawMap() {},
  refreshPdfDraftPreview() {}, renderPdfDraftSection() {},
  promptHTML: value => value,
  esc: value => String(value),
  document: { querySelector: () => null, getElementById: id => elements[id] || null },
  window: { open() {} },
  copyText() {}, updateProgress() {}, toast() {}
};
vm.createContext(context);
new vm.Script(script.slice(start, end), { filename: 'index.html:quest-handoff' }).runInContext(context);
const mergeStart = script.indexOf('function pickBetterDate');
const mergeEnd = script.indexOf('function mergeMailReview', mergeStart);
new vm.Script(script.slice(mergeStart, mergeEnd), { filename: 'index.html:quest-merge' }).runInContext(context);

[0, 1, 2, 3, 4, 6, 7].forEach(stepIndex => {
  const startPrompt = context.getStepStartPrompt(stepIndex, firm);
  assert(startPrompt.includes('offenen Arbeitschat'));
  assert(startPrompt.includes('Beispiel GmbH'));
  assert(!startPrompt.includes('Gib AUSSCHLIESSLICH'));
  assert(startPrompt.includes('noch kein finales Übergabe-JSON'));
  const stepHandoff = context.getStepHandoffPrompt(stepIndex, firm);
  assert(stepHandoff.includes('bewerbungstracker-quest-step-handoff-v1'));
  assert(stepHandoff.includes(`"stepIndex": ${stepIndex}`));
  assert(stepHandoff.includes('"sourceChatUrl": ""'));
});

elements['step-chat-link-2'] = { value: ' https://chat.example/step-2 ' };
const statusBeforeChatSave = firm.quest.stepStatus[2];

const handoffPrompt = context.getStepHandoffPrompt(3, firm);
assert(handoffPrompt.includes('bewerbungstracker-quest-step-handoff-v1'));
assert(handoffPrompt.includes('standardEinleitungOverride'));
assert(handoffPrompt.includes('firmenspezifischerSatz'));

(async () => {
  await context.saveStepChatLink(2, firm.id);
  assert.strictEqual(firm.quest.stepChatLinks[2].url, 'https://chat.example/step-2');
  assert(firm.quest.stepChatLinks[2].updatedAt);
  assert.strictEqual(firm.quest.stepStatus[2], statusBeforeChatSave, 'Chat-Link-Speichern darf den Schrittstatus nicht verändern');
  assert.strictEqual(saveCalls, 1);
  assert(context.getStepHandoffPrompt(2, firm).includes('"sourceChatUrl": "https://chat.example/step-2"'));
  elements['step-chat-link-2'].value = '';
  await context.saveStepChatLink(2, firm.id);
  assert.strictEqual(firm.quest.stepChatLinks[2].url, '', 'Ein leer gespeicherter Wert muss den Link löschen');
  assert.strictEqual(firm.quest.stepStatus[2], statusBeforeChatSave);

  await context.importQuestStepHandoffJson(JSON.stringify({
    type: 'bewerbungstracker-quest-step-handoff-v1',
    firmId: firm.id,
    firmName: firm.name,
    stepIndex: 3,
    stepName: 'Anschreiben generieren',
    sourceChatUrl: 'https://chat.example/anschreiben',
    data: {
      standardEinleitungOverride: '',
      firmenspezifischerSatz: 'Passender Firmensatz.',
      standardMotivationOverride: 'Motivation',
      standardProjekteOverride: '',
      standardSchlussOverride: 'Schluss',
      unbekanntesFeld: 'darf nicht persistiert werden'
    },
    nextSteps: [{ title: 'Unterlagen prüfen', details: '', dueDate: '2026-06-10', priority: 'hoch', status: 'offen' }]
  }));

  assert.strictEqual(firm.quest.stepChatLinks[3].url, 'https://chat.example/anschreiben');
  assert(firm.quest.stepChatLinks[3].updatedAt);
  assert.strictEqual(firm.quest.pdfDraft.standardEinleitungOverride, '');
  assert.strictEqual(firm.quest.pdfDraft._set.standardEinleitungOverride, true, 'Bewusst leerer Override muss als gesetzt gelten');
  assert.strictEqual(firm.quest.pdfDraft.firmenspezifischerSatz, 'Passender Firmensatz.');
  assert.strictEqual(firm.quest.stepStatus[3], 'geprüft');
  assert(!firm.quest.normalizedReturns[3].includes('unbekanntesFeld'), 'Unbekannte Felder dürfen nicht übernommen werden');
  assert.strictEqual(firm.nextSteps.length, 1);
  assert.strictEqual(firm.nextSteps[0].source, 'quest-handoff');
  assert.strictEqual(firm.nextSteps[0].priority, 'hoch');

  firm.quest.stepChatLinks[7] = { url: 'https://chat.example/existing-tracking', updatedAt: '2026-06-08T08:00:00.000Z' };
  await context.importQuestStepHandoffJson(JSON.stringify({
    type: 'bewerbungstracker-quest-step-handoff-v1',
    firmName: firm.name,
    stepIndex: 7,
    stepName: 'Tracking-Eintrag',
    data: { bewerbungsDatum: '2026-06-08', trackingText: 'Eintrag', statusUpdate: 'versendet', notizen: '' },
    nextSteps: []
  }));
  assert.strictEqual(firm.bewerbungsDatum, '2026-06-08');
  assert.strictEqual(firm.status, 'versendet');
  assert.strictEqual(firm.quest.stepStatus[7], 'geprüft');
  assert.strictEqual(firm.quest.stepChatLinks[7].url, 'https://chat.example/existing-tracking', 'Handoff ohne sourceChatUrl darf einen bestehenden Link nicht überschreiben');

  const localQuest = context.defaultQuest();
  localQuest.stepChatLinks[1] = { url: 'https://chat.example/local', updatedAt: '2026-06-08T10:00:00.000Z' };
  localQuest.stepChatLinks[2] = { url: 'https://chat.example/local-no-date', updatedAt: '' };
  const remoteQuest = context.defaultQuest();
  remoteQuest.stepChatLinks[0] = { url: 'https://chat.example/remote-only', updatedAt: '2026-06-08T09:00:00.000Z' };
  remoteQuest.stepChatLinks[1] = { url: 'https://chat.example/remote-newer', updatedAt: '2026-06-08T11:00:00.000Z' };
  remoteQuest.stepChatLinks[2] = { url: 'https://chat.example/remote-no-date', updatedAt: '' };
  const mergedQuest = context.mergeQuest(localQuest, remoteQuest);
  assert.strictEqual(mergedQuest.stepChatLinks[0].url, 'https://chat.example/remote-only');
  assert.strictEqual(mergedQuest.stepChatLinks[1].url, 'https://chat.example/remote-newer');
  assert.strictEqual(mergedQuest.stepChatLinks[2].url, 'https://chat.example/local-no-date');
  console.log('Quest handoff and chat-link flow OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
