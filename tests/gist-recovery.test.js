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
  assert(syncSource.indexOf('var didChange=') < syncSource.indexOf('var mergeRecovery=createRecoverySnapshot'));
  assert(syncSource.indexOf('var needsPush=') < syncSource.indexOf('var mergeRecovery=createRecoverySnapshot'));
  assert(syncSource.indexOf("if(!needsPush&&!didChange)") < syncSource.indexOf('var mergeRecovery=createRecoverySnapshot'));
  assert(syncSource.indexOf('var mergeRecovery=createRecoverySnapshot') < syncSource.indexOf('gistApplyData(mergedPayload'));
  assert(syncSource.includes("remoteResult.kind==='missing'"));
  assert(syncSource.includes('Der gültige Remote-Stand enthält keine Firmen'));

  const compareSource=[extractFunction('stableStringify'),extractFunction('normalizePayloadForCompare')].join('\n');
  const compareApi=new Function('source', `
    eval(source);
    return function(value){return stableStringify(normalizePayloadForCompare(value));};
  `)(compareSource);
  assert.strictEqual(
    compareApi({exported:'remote',_lastExported:'outer',S:{_lastExported:'inner',value:1}}),
    compareApi({exported:'local',_lastExported:'other',S:{_lastExported:'nested-other',value:1}}),
    'Export-Zeitstempel müssen auf beiden unterstützten Ebenen neutralisiert werden'
  );

  const syncApi=new Function('source', `
    var S={version:6,cfg:{name:'same'},profileTextBlocks:{},regions:[],firms:[{id:'same'}],deletedIds:{},_lastExported:'local-ts'};
    var _syncInProgress=false, currentTab='db', calls=[], remotePayload=null, mergeResult=null;
    function gistCheckSyncRequirements(){return {ok:true,token:'token',id:'id'};}
    function setSyncStatus(message){calls.push(['status',message]);}
    async function gistFetchRemote(){return {kind:'encrypted',payload:remotePayload};}
    function gistBuildPayload(ts){return {version:6,exported:ts,cfg:S.cfg,profileTextBlocks:S.profileTextBlocks,regions:S.regions,firms:S.firms,deletedIds:S.deletedIds};}
    function mergeSyncData(){return JSON.parse(JSON.stringify(mergeResult));}
    function gistValidateSyncPayload(){}
    function createRecoverySnapshot(){calls.push(['recovery']);return {ok:true};}
    async function gistApplyData(payload){calls.push(['apply',payload.exported]);S._lastExported=payload.exported;return true;}
    async function gistPushPayload(){calls.push(['push']);}
    async function persistLocalOnly(){calls.push(['persist']);return true;}
    function stableStringify(v){if(v===null||typeof v!=='object') return JSON.stringify(v);if(Array.isArray(v)) return '['+v.map(stableStringify).join(',')+']';var keys=Object.keys(v).sort();return '{'+keys.map(function(k){return JSON.stringify(k)+':'+stableStringify(v[k]);}).join(',')+'}';}
    function normalizePayloadForCompare(data){var p=data&&typeof data==='object'?JSON.parse(JSON.stringify(data)):{};if(p.S){p.S._lastExported='';}if(p._lastExported!==undefined)p._lastExported='';if(p.exported!==undefined)p.exported='';return p;}
    function toast(){} function today(){return '2026-06-11';}
    function renderDB(){} function drawMap(){} function renderQuestOverview(){} function updateInfoPanel(){}
    eval(source);
    return {
      run:function(payload,merged,opts){remotePayload=JSON.parse(JSON.stringify(payload));mergeResult=JSON.parse(JSON.stringify(merged));calls=[];return gistSync(opts||{});},
      calls:function(){return calls;}, timestamp:function(){return S._lastExported;}
    };
  `)(syncSource);
  const sameContent={version:6,exported:'remote-ts',cfg:{name:'same'},profileTextBlocks:{},regions:[],firms:[{id:'same'}],deletedIds:{}};
  const noopResult=await syncApi.run(sameContent,sameContent,{mode:'sync',silent:true});
  assert.deepStrictEqual(noopResult,{noop:true});
  assert.strictEqual(syncApi.timestamp(),'local-ts','No-Op darf S._lastExported nicht verändern');
  assert.deepStrictEqual(syncApi.calls().filter((call)=>['recovery','apply','persist','push'].includes(call[0])),[], 'No-Op darf weder Recovery noch Apply, Persist oder Push ausführen');

  const mergedContent={version:6,exported:'remote-ts',cfg:{name:'same'},profileTextBlocks:{},regions:[],firms:[{id:'same'},{id:'remote'}],deletedIds:{}};
  const pullResult=await syncApi.run(mergedContent,mergedContent,{mode:'sync',silent:true});
  assert.strictEqual(pullResult.pulled,true);
  assert.deepStrictEqual(syncApi.calls().filter((call)=>['recovery','apply'].includes(call[0])).map((call)=>call[0]),['recovery','apply'], 'Abweichender Merge darf erst nach dem Recovery-Gate lokal angewendet werden');

  const pushSource=extractFunction('gistPushPayload');
  const pushApi=new Function('source', `
    var S={_lastExported:'before'}, encrypted=null, requestEnvelope=null, persistedTs='';
    var Date=function(){return {toISOString:function(){return '2026-06-11T12:34:56.789Z';}};};
    function gistBuildPayload(ts){return {version:6,exported:ts};}
    async function gistEncryptPayload(payload,ts){encrypted={payload:payload,ts:ts};return {exported:ts};}
    async function fetch(url,opts){requestEnvelope=JSON.parse(JSON.parse(opts.body).files.file.content);return {ok:true};}
    function githubHeaders(){return {};}
    async function persistLocalOnly(){persistedTs=S._lastExported;return true;}
    function setSyncStatus(){} function toast(){}
    var GIST_FILE='file';
    eval(source);
    return {run:function(){return gistPushPayload('token','id',true);},result:function(){return {state:S._lastExported,inner:encrypted.payload.exported,encryption:encrypted.ts,envelope:requestEnvelope.exported,persisted:persistedTs};}};
  `)(pushSource);
  await pushApi.run();
  assert.deepStrictEqual(pushApi.result(),{
    state:'2026-06-11T12:34:56.789Z',inner:'2026-06-11T12:34:56.789Z',encryption:'2026-06-11T12:34:56.789Z',envelope:'2026-06-11T12:34:56.789Z',persisted:'2026-06-11T12:34:56.789Z'
  },'Innerer Payload, Envelope und S._lastExported müssen denselben Push-Zeitstempel verwenden');

  console.log('Recovery snapshot, mutation-free no-op, guarded merge and synchronized push timestamp OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
