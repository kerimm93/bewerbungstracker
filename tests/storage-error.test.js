const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
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
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`${name} konnte nicht vollständig extrahiert werden`);
}

const functionNames = [
  'getJsonSizeInfo',
  'formatJsonSize',
  'isQuotaExceededError',
  'getStorageErrorLabel',
  'recordPersistError',
  'persistLocalOnly',
  'save',
  'downloadJson',
  'emergencyExport'
];
const source = functionNames.map(extractFunction).join('\n');

const quotaError = new Error("Failed to execute 'setItem' on 'Storage'");
quotaError.name = 'QuotaExceededError';
const runtimeState = {
  version: 6,
  cfg: { name: 'Testperson' },
  profileTextBlocks: { standardEinleitung: 'Runtime-Text' },
  regions: [{ name: 'Testregion' }],
  firms: [{ id: '1', name: 'Nicht gespeicherte Runtime-Firma' }],
  deletedIds: {},
  _lastExported: '2026-06-07T12:00:00.000Z'
};

const api = new Function('assert', 'Blob', 'quotaError', 'runtimeState', `
  var autoSyncCalls=0;
  var clickedDownload=null;
  var toastMessage='';
  var LS='fiae_quest_v6';
  var S=runtimeState;
  var _syncInProgress=false;
  var _lastPersistError=null;
  var _lastPersistPayloadSize=null;
  var _lastPersistFailedAt='';
  var currentTab='db';
  var shouldThrow=true;
  var localStorage={setItem:function(){if(shouldThrow) throw quotaError;}};
  var console={error:function(){}};
  var URL={
    createObjectURL:function(blob){globalThis.__storageTestBlob=blob;return 'blob:test';},
    revokeObjectURL:function(){}
  };
  var document={createElement:function(){return {click:function(){clickedDownload=this.download;}};}};
  function toast(msg){toastMessage=msg;}
  function updateInfoPanel(){}
  function gistAutoSyncDebounced(){autoSyncCalls+=1;}
  function today(){return '2026-06-08';}
  function getProfileTextBlocks(){return S.profileTextBlocks;}
  ${source}
  return {
    save:save,
    emergencyExport:emergencyExport,
    getState:function(){return S;},
    getError:function(){return _lastPersistError;},
    getPayloadSize:function(){return _lastPersistPayloadSize;},
    getFailedAt:function(){return _lastPersistFailedAt;},
    getAutoSyncCalls:function(){return autoSyncCalls;},
    getDownload:function(){return clickedDownload;},
    getToast:function(){return toastMessage;},
    allowPersist:function(){shouldThrow=false;}
  };
`)(assert, Blob, quotaError, runtimeState);

assert.strictEqual(api.save(), false, 'save() muss bei setItem-Fehler false liefern');
assert.strictEqual(api.getState()._lastExported, '2026-06-07T12:00:00.000Z', '_lastExported muss im Runtime-State zurückgesetzt werden');
assert(api.getError(), '_lastPersistError muss gesetzt sein');
assert.strictEqual(api.getError().label, 'Speicherlimit überschritten');
assert(api.getPayloadSize().bytes > 0, 'Payload-Größe muss erfasst werden');
assert(api.getFailedAt(), 'Fehlerzeitpunkt muss gesetzt werden');
assert.strictEqual(api.getAutoSyncCalls(), 0, 'Auto-Sync darf nach fehlgeschlagenem Speichern nicht starten');
assert(api.getToast().includes('Emergency-Backup'), 'Toast muss auf Emergency-Backup hinweisen');

(async () => {
  const blob = api.emergencyExport();
  assert(blob instanceof Blob, 'emergencyExport() muss einen Blob erzeugen');
  assert.strictEqual(api.getDownload(), 'FIAE_Quest_EMERGENCY_Backup_2026-06-08.json');
  const payload = JSON.parse(await blob.text());
  assert.strictEqual(payload.emergency, true);
  assert.strictEqual(payload.version, 6);
  assert.strictEqual(payload.firms[0].name, 'Nicht gespeicherte Runtime-Firma', 'Export muss den Runtime-State enthalten');
  assert(payload.runtimePayloadSize.includes('KB'));
  assert(!Object.prototype.hasOwnProperty.call(payload, 'gistToken'));
  assert(!Object.prototype.hasOwnProperty.call(payload, 'gistId'));
  api.allowPersist();
  assert.strictEqual(api.save(), true, 'save() muss bei verfügbarem localStorage true liefern');
  assert.strictEqual(api.getAutoSyncCalls(), 1, 'Auto-Sync muss nach erfolgreichem Speichern normal geplant werden');
  assert.strictEqual(api.getError(), null, 'Ein erfolgreicher Persist muss den Laufzeit-Fehlerstatus zurücksetzen');
  console.log('Storage failure and emergency export OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
