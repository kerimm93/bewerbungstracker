const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map((marker) => html.indexOf(marker)).find((index) => index >= 0);
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

const recoverySource = extractFunction('createRecoverySnapshot');
const recoveryApi = new Function('source', `
  var S={firms:[{id:'local',name:'Lokale Firma'}],nested:{value:1}};
  var LS_EMERGENCY='emergency', stored='', downloads=0, failStore=false, failDownload=false;
  var localStorage={setItem:function(key,value){if(failStore) throw new Error('store'); stored=value;}};
  var console={error:function(){},warn:function(){}};
  function today(){return '2026-06-11';}
  function downloadJson(){if(failDownload) throw new Error('download'); downloads+=1;}
  eval(source);
  return {
    run:function(opts){return createRecoverySnapshot(opts);},
    state:function(){return S;}, setState:function(value){S=value;}, stored:function(){return stored;},
    downloads:function(){return downloads;}, failBoth:function(){failStore=true;failDownload=true;},
    failStoreOnly:function(){failStore=true;failDownload=false;}
  };
`)(recoverySource);

const storedResult = recoveryApi.run({});
assert.strictEqual(storedResult.ok, true);
assert.strictEqual(storedResult.persisted, true);
assert.strictEqual(storedResult.exported, false);
assert.deepStrictEqual(JSON.parse(recoveryApi.stored()), recoveryApi.state());
storedResult.snapshot.nested.value = 99;
assert.strictEqual(recoveryApi.state().nested.value, 1, 'Snapshot muss eine tiefe JSON-Kopie sein');

recoveryApi.failStoreOnly();
const exportedResult = recoveryApi.run({});
assert.strictEqual(exportedResult.ok, true, 'Download muss als Recovery-Fallback gelten');
assert.strictEqual(exportedResult.persisted, false);
assert.strictEqual(exportedResult.exported, true);

recoveryApi.failBoth();
assert.strictEqual(recoveryApi.run({}).ok, false, 'Ohne Persistenz und Export muss Recovery scheitern');

const applySource = extractFunction('gistApplyData');
const applyApi = new Function('source', `
  var S={cfg:{name:'local'},profileTextBlocks:{},regions:[{id:'local-region'}],firms:[{id:'local-firm'}],deletedIds:{},_lastExported:'local-time'};
  var shouldPersist=false, persistedCandidate=null, currentTab='db';
  function gistValidateSyncPayload(payload){if(!payload || !Array.isArray(payload.firms)) throw new Error('invalid');}
  function ensureFirmDefaults(f){return f;}
  function ensureProfileTextBlocks(v){return v||{};}
  async function persistLocalOnly(candidate){persistedCandidate=JSON.parse(JSON.stringify(candidate));return shouldPersist;}
  function renderDB(){} function drawMap(){} function renderQuestOverview(){}
  function updateInfoPanel(){} function loadGistCfgUI(){} function loadProfileTextBlocksUI(){}
  eval(source);
  return {apply:gistApplyData,state:function(){return S;},allow:function(){shouldPersist=true;},candidate:function(){return persistedCandidate;}};
`)(applySource);

(async () => {
  const payload={version:6,exported:'remote-time',cfg:{name:'remote'},profileTextBlocks:{},regions:[],firms:[],deletedIds:{}};
  const before=JSON.stringify(applyApi.state());
  assert.strictEqual(await applyApi.apply(payload,{}), false);
  assert.strictEqual(JSON.stringify(applyApi.state()), before, 'Fehlgeschlagene Persistenz darf Runtime-State nicht verändern');
  assert.deepStrictEqual(applyApi.candidate().firms, [], 'Gültiger leerer Remote-Firmenstand muss als solcher persistiert werden');
  applyApi.allow();
  assert.strictEqual(await applyApi.apply(payload,{}), true);
  assert.deepStrictEqual(applyApi.state().firms, []);

  const syncSource=extractFunction('gistSync');
  assert(syncSource.indexOf("if(!confirm(pullMessage))") < syncSource.indexOf('var pullRecovery=createRecoverySnapshot'));
  assert(syncSource.includes("createRecoverySnapshot({download:true,fileName:'FIAE_Quest_RECOVERY_vor_Gist_Pull_'"), 'Pull-Recovery muss auch bei erfolgreichem localStorage-Write heruntergeladen werden');
  assert(syncSource.indexOf('var pullRecovery=createRecoverySnapshot') < syncSource.indexOf('gistApplyData(remoteData'));
  assert(syncSource.includes("createRecoverySnapshot({download:true,fileName:'FIAE_Quest_RECOVERY_vor_Gist_Merge_'"), 'Merge-Recovery muss auch bei erfolgreichem localStorage-Write heruntergeladen werden');
  assert(syncSource.indexOf('var mergeRecovery=createRecoverySnapshot') < syncSource.indexOf('mergeSyncData(localData, remoteData)'));
  assert(syncSource.includes("remoteResult.kind==='missing'"));
  assert(syncSource.includes('Der gültige Remote-Stand enthält keine Firmen'));

  console.log('Recovery snapshot, guarded pull/merge ordering and atomic Gist apply OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
