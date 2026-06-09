const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');

const helpersStart = script.indexOf('function normalizePdfFileNamePart');
const helpersEnd = script.indexOf('// ================================================================\n// STEPS', helpersStart);
assert(helpersStart >= 0 && helpersEnd > helpersStart, 'App-Heuristiken wurden nicht gefunden');

let config = { name: 'Max Mustermann', beruf: 'Fachinformatiker für Anwendungsentwicklung' };
const context = { String, getCfg: () => config };
vm.createContext(context);
new vm.Script(script.slice(helpersStart, helpersEnd), { filename: 'index.html:app-heuristics' }).runInContext(context);

const firm = {
  name: 'Beispielwerke AG',
  region: 'Oldenburg',
  status: 'offen',
  bewerbungsDatum: '2026-06-08',
  adresse: 'Beispielwerke AG\nMusterweg 7\n26122 Oldenburg',
  quest: { contact: { adresse: '' } }
};
const before = JSON.stringify(firm);
const tsv = context.buildTrackingTsv(firm);
assert.strictEqual(
  tsv,
  [
    '2026-06-08', 'ja', 'Initiativbewerbung', 'Beispielwerke AG,26122 Oldenburg',
    'Praktikum Fachinformatiker für Anwendungsentwicklung', 'nein', 'nein', 'nein', 'nein'
  ].join('\t')
);
assert.strictEqual(tsv.split('\t').length, 9, 'Tracking-TSV muss exakt neun tab-getrennte Spalten enthalten');
assert.strictEqual(JSON.stringify(firm), before, 'buildTrackingTsv darf Firmendaten und Status nicht verändern');

const fallbackFirm = { name: 'Nordlicht Systeme', region: 'Bremen', bewerbungsDatum: '', quest: { contact: {} } };
assert.strictEqual(
  context.buildTrackingTsv(fallbackFirm).split('\t').slice(0, 5).join('|'),
  '|ja|Initiativbewerbung|Nordlicht Systeme,Bremen|Praktikum Fachinformatiker für Anwendungsentwicklung'
);

const renderStart = script.indexOf('function renderQuestSteps');
const renderEnd = script.indexOf('// ================================================================\n// DATABASE', renderStart);
const renderSource = script.slice(renderStart, renderEnd);
assert(renderSource.includes("if(i===5)"), 'PDF-Dateiname braucht einen eigenen App-Renderpfad');
assert(renderSource.includes("+(i===5?'':("), 'PDF-Dateiname muss den Prompt-/Chat-Aktionsblock auslassen');
assert(renderSource.includes('Dateiname kopieren'));
assert(renderSource.includes('Tracking-TSV kopieren'));
assert(renderSource.includes('isStepChatLinkRelevant(i)?'), 'Arbeitschat-Link muss zentral nach Schritt gefiltert werden');
assert(script.includes('function isStepChatLinkRelevant(si){ return [0,1,2,3,4,6,7]'), 'PDF-Dateiname darf nicht chat-link-relevant sein');

assert(html.includes('<details class="legacy-cleanup"><summary>Erweiterter Legacy-Bereinigungspfad</summary>'));
assert(!html.includes('<details class="legacy-cleanup" open>'), 'Legacy-Bereich muss standardmäßig eingeklappt sein');
['saveRaw', 'genCleanPromptForStep', 'saveNormalized', 'clearReturn'].forEach(name => {
  assert(script.includes(`function ${name}`), `${name} muss erhalten bleiben`);
});
assert(renderSource.includes('1 — Rohergebnis'));
assert(renderSource.includes('2 — Bereinigungs-Prompt'));
assert(renderSource.includes('3 — Strukturierte Fassung'));

console.log('Quest UI cleanup heuristics and progressive disclosure OK');
