const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const patterns = [`async function ${name}(`, `function ${name}(`];
  const start = patterns.map((pattern) => html.indexOf(pattern)).find((index) => index >= 0);
  assert(start >= 0, `${name} wurde nicht gefunden`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`${name} konnte nicht vollständig extrahiert werden`);
}

const names = [
  'getJsonSizeInfo', 'formatJsonSize', 'isQuotaExceededError', 'getStorageErrorLabel',
  'recordPersistError', 'persistLocalOnly', 'save', 'downloadJson', 'emergencyExport'
];
const source = names.map(extractFunction).join('\n');
const idbError = new Error('IndexedDB put failed');
idbError.name = 'QuotaExceededError';
const runtimeState = {
  version: 6, cfg: { name: 'Testperson' }, profileTextBlocks: { standardEinleitung: 'Runtime-Text' },
  regions: [{ name: 'Testregion' }], firms: [{ id: '1', name: 'Nicht gespeicherte Runtime-Firma' }],
  deletedIds: {}, _lastExported: '2026-06-07T12:00:00.000Z'
};

const api = new Function('Blob', 'idbError', 'runtimeState', `
  var autoSyncCalls=0, clickedDownload=null, toastMessage='', shouldThrow=true;
  var IDB_STATE_KEY='state', IDB_MIGRATED_KEY='fiae_quest_v6_idb_migrated', LS_EMERGENCY='fiae_quest_v6_emergency';
  var S=runtimeState, _syncInProgress=false, _lastPersistError=null, _lastPersistPayloadSize=null;
  var _lastPersistFailedAt='', _idbAvailable=false, _idbLastError=null, _loadedFromIndexedDB=false, _migrationStatus='';
  var currentTab='db';
  var localStorage={setItem:function(){}};
  var console={error:function(){},warn:function(){}};
  var URL={createObjectURL:function(blob){globalThis.__storageTestBlob=blob;return 'blob:test';},revokeObjectURL:function(){}};
  var document={createElement:function(){return {click:function(){clickedDownload=this.download;}};}};
  function toast(msg){toastMessage=msg;} function updateInfoPanel(){}
  function gistAutoSyncDebounced(){autoSyncCalls+=1;} function today(){return '2026-06-08';}
  function getProfileTextBlocks(){return S.profileTextBlocks;} function normalizeState(value){return value;}
  async function idbSet(){if(shouldThrow) throw idbError; return true;}
  ${source}
  return {save, emergencyExport, getState:()=>S, getError:()=>_lastPersistError,
    getPayloadSize:()=>_lastPersistPayloadSize, getFailedAt:()=>_lastPersistFailedAt,
    getAutoSyncCalls:()=>autoSyncCalls, getDownload:()=>clickedDownload, getToast:()=>toastMessage,
    allowPersist:()=>{shouldThrow=false;}};
`)(Blob, idbError, runtimeState);

(async () => {
  assert.strictEqual(await api.save(), false, 'save() muss bei idbSet-Fehler false liefern');
  assert.strictEqual(api.getState()._lastExported, '2026-06-07T12:00:00.000Z');
  assert.strictEqual(api.getError().label, 'Speicherlimit überschritten');
  assert(api.getPayloadSize().bytes > 0);
  assert(api.getFailedAt());
  assert.strictEqual(api.getAutoSyncCalls(), 0, 'Auto-Sync darf nach fehlgeschlagenem Speichern nicht starten');
  assert(api.getToast().includes('Emergency-Backup'));

  const blob = api.emergencyExport();
  assert(blob instanceof Blob);
  assert.strictEqual(api.getDownload(), 'FIAE_Quest_EMERGENCY_Backup_2026-06-08.json');
  const payload = JSON.parse(await blob.text());
  assert.strictEqual(payload.firms[0].name, 'Nicht gespeicherte Runtime-Firma');
  assert(!Object.prototype.hasOwnProperty.call(payload, 'gistToken'));

  api.allowPersist();
  assert.strictEqual(await api.save(), true);
  assert.strictEqual(api.getAutoSyncCalls(), 1);
  assert.strictEqual(api.getError(), null);
  console.log('IndexedDB failure, save guard and emergency export OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
