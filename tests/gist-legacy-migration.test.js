const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  let start = html.indexOf(`async function ${name}(`);
  if (start < 0) {
    start = html.indexOf(`function ${name}(`);
  }
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

const syncSource = extractFunction('gistSync');

function createSyncHarness(mode) {
  return new Function('source', 'mode', `
    var _syncInProgress=false;
    var calls=[];
    function toast(message){calls.push(['toast',message]);}
    function setSyncStatus(message){calls.push(['status',message]);}
    function gistCheckSyncRequirements(){return {ok:true,token:'token',id:'gist'};}
    async function gistFetchRemote(){calls.push(['fetch']);return {kind:'legacy',payload:{version:6,exported:'',cfg:{},regions:[],firms:[]}};}
    async function gistMigrateLegacyRemote(){calls.push(['migrate']);return {migrated:true};}
    async function gistApplyData(){calls.push(['apply']);return true;}
    async function gistPushPayload(){calls.push(['push']);}
    function gistBuildPayload(){calls.push(['build']);return {};}
    function mergeSyncData(){calls.push(['merge']);return {};}
    function normalizePayloadForCompare(){return {};}
    function stableStringify(){return '';}
    function renderDB(){} function drawMap(){} function renderQuestOverview(){}
    var currentTab=''; function updateInfoPanel(){}
    eval(source);
    return gistSync({mode:mode,silent:mode==='startup'||mode==='auto'}).then(function(result){return {result:result,calls:calls};});
  `)(syncSource, mode);
}


const startupSource = extractFunction('gistStartupSync');

async function runLegacyStartupHarness() {
  return new Function('source', `
    var _gistSyncPassphrase='secret', _gistStartupSyncPending=true, _gistStartupSyncPromise=null;
    function gistGetToken(){return 'token';}
    function gistGetId(){return 'gist';}
    function gistSync(){return Promise.resolve({skipped:true,reason:'legacy'});}
    eval(source);
    return gistStartupSync().then(function(result){return {result:result,pending:_gistStartupSyncPending};});
  `)(startupSource);
}

const migrationSource = [
  extractFunction('createRecoverySnapshot'),
  extractFunction('gistCreateLegacyRecoverySnapshot'),
  extractFunction('gistMigrateLegacyRemote')
].join('\n');

function createMigrationHarness(options = {}) {
  return new Function('source', 'confirmed', 'passphrase', `
    var _gistSyncPassphrase=passphrase;
    var LS_EMERGENCY='emergency', GIST_FILE='fiae_quest_data.json';
    var S={cfg:{name:'runtime'},regions:[{id:'local'}],firms:[{id:'local-firm'}],deletedIds:{},_lastExported:'old'};
    var initialJson=JSON.stringify(S), calls=[], stored=null, downloaded=null, patched=null;
    var localStorage={setItem:function(key,value){calls.push(['store',key]);stored=value;}};
    var console={error:function(){},warn:function(){}};
    function today(){return '2026-06-11';}
    function downloadJson(data,name){calls.push(['download',name]);downloaded=JSON.stringify(data);}
    function toast(message){calls.push(['toast',message]);}
    function confirm(message){calls.push(['confirm',message]);return confirmed;}
    function gistBuildPayload(){calls.push(['build']);return {version:6,exported:'old',cfg:S.cfg,profileTextBlocks:{},regions:S.regions,firms:S.firms,deletedIds:S.deletedIds};}
    function mergeSyncData(local,remote){calls.push(['merge']);return {cfg:{name:'merged'},profileTextBlocks:{},regions:local.regions.concat(remote.regions),firms:local.firms.concat(remote.firms),deletedIds:{}};}
    function gistValidateSyncPayload(payload){calls.push(['validate']);return payload;}
    async function gistEncryptPayload(payload){calls.push(['encrypt']);return {type:'encrypted',target:payload};}
    function githubHeaders(){return {};}
    async function fetch(url,options){calls.push(['patch']);patched=JSON.parse(options.body);return {ok:true};}
    async function gistApplyData(payload){calls.push(['apply']);S=JSON.parse(JSON.stringify(payload));return true;}
    function setSyncStatus(message){calls.push(['status',message]);}
    eval(source);
    return {
      run:function(){return gistMigrateLegacyRemote('token','gist',{version:6,exported:'legacy',cfg:{},profileTextBlocks:{},regions:[{id:'remote'}],firms:[{id:'remote-firm'}],deletedIds:{}},false);},
      inspect:function(){return {calls:calls,stored:stored,downloaded:downloaded,patched:patched,initialJson:initialJson,state:JSON.stringify(S)};}
    };
  `)(migrationSource, options.confirmed !== false, options.passphrase === undefined ? 'secret' : options.passphrase);
}

(async () => {
  for (const mode of ['startup', 'auto']) {
    const {result, calls} = await createSyncHarness(mode);
    assert.deepStrictEqual(result, {skipped:true,reason:'legacy'});
    assert.strictEqual(calls.some(([name]) => ['migrate','apply','push','merge','build'].includes(name)), false, `${mode} darf Legacy-Daten nicht verarbeiten`);
  }

  const legacyStartup = await runLegacyStartupHarness();
  assert.strictEqual(legacyStartup.pending, true, 'Legacy-Startup darf den aufgeschobenen Start nicht als erfolgreich abschließen');

  const manual = await createSyncHarness('merge');
  assert.strictEqual(manual.calls.filter(([name]) => name === 'migrate').length, 1, 'Manuelle Aktion muss in den Migrationspfad wechseln');

  const cancelled = createMigrationHarness({confirmed:false});
  assert.deepStrictEqual(await cancelled.run(), {skipped:true,reason:'legacy-not-confirmed'});
  assert.strictEqual(cancelled.inspect().calls.some(([name]) => ['download','store','merge','encrypt','patch','apply'].includes(name)), false, 'Ohne Bestätigung darf keine Migration oder Sicherung starten');

  const noPassphrase = createMigrationHarness({passphrase:''});
  await assert.rejects(noPassphrase.run(), /Passphrase fehlt/);
  assert.strictEqual(noPassphrase.inspect().calls.length, 0, 'Ohne Passphrase darf die Migration keinerlei Seiteneffekt haben');

  const migration = createMigrationHarness();
  assert.deepStrictEqual(await migration.run(), {migrated:true});
  const state = migration.inspect();
  assert.strictEqual(state.downloaded, state.initialJson, 'Recovery-Download muss den unveränderten Runtime-State enthalten');
  assert.strictEqual(state.stored, state.initialJson, 'LS_EMERGENCY muss eine serialisierte Kopie des unveränderten Runtime-State enthalten');
  const order = state.calls.map(([name]) => name);
  assert(order.indexOf('confirm') < order.indexOf('download'));
  assert(order.indexOf('download') < order.indexOf('merge'));
  assert(order.indexOf('store') < order.indexOf('merge'));
  assert(order.indexOf('merge') < order.indexOf('encrypt'));
  assert(order.indexOf('encrypt') < order.indexOf('patch'));
  assert(order.indexOf('patch') < order.indexOf('apply'));
  assert.deepStrictEqual(state.calls.filter(([name]) => name === 'toast').map(([,message]) => message), ['Legacy-Gist wurde verschlüsselt migriert.'], 'Die Migration darf nur ihren abschließenden Erfolgstoast ausgeben');
  assert(state.patched.files['fiae_quest_data.json'].content.includes('"type": "encrypted"'));

  console.log('Legacy Gist blocking, confirmation, recovery snapshot and encrypted migration OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
