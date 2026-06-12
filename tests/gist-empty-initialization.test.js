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

const classifySource = extractFunction('gistClassifyRemoteJson');
const classify = new Function('source', `
  var GIST_ENVELOPE_TYPE='fiae-quest-encrypted-v1';
  function gistValidateSyncPayload(payload){
    if(payload.version!==6 || !Array.isArray(payload.firms) || !Array.isArray(payload.regions)) throw new Error('Legacy-Klartext-Payload ist ungültig');
  }
  eval(source);
  return gistClassifyRemoteJson;
`)(classifySource);

assert.deepStrictEqual(classify(JSON.parse('{}')), {kind:'empty'}, '{} muss als leerer Initial-Gist klassifiziert werden');
assert.strictEqual(classify({unexpected:true}).kind, 'invalid', 'Unbekannte nicht-leere Objekte müssen ungültig bleiben');
assert.strictEqual(classify({version:6}).kind, 'invalid', 'Unvollständige Legacy-Objekte müssen ungültig bleiben');

const syncSource = [extractFunction('gistPushPayload'), extractFunction('gistSync')].join('\n');

function createSyncHarness(mode) {
  return new Function('source', 'mode', `
    var _syncInProgress=false;
    var S={
      cfg:{owner:'local'},
      profileTextBlocks:{intro:'local'},
      regions:[{id:'local-region'}],
      firms:[{id:'local-firm'}],
      deletedIds:{},
      _lastExported:'local-export'
    };
    var initialState=JSON.stringify(S);
    var initialBusinessState=JSON.stringify({cfg:S.cfg,profileTextBlocks:S.profileTextBlocks,regions:S.regions,firms:S.firms,deletedIds:S.deletedIds});
    var calls=[];
    var patchedEnvelope=null;
    var GIST_FILE='fiae_quest_data.json';
    var currentTab='db';
    function gistCheckSyncRequirements(){return {ok:true,token:'token',id:'gist-id'};}
    function setSyncStatus(message){calls.push(['status',message]);}
    function toast(message){calls.push(['toast',message]);}
    async function gistFetchRemote(){calls.push(['fetch']);return {kind:'empty'};}
    async function gistMigrateLegacyRemote(){calls.push(['migrate']);throw new Error('Legacy-Migration darf nicht laufen');}
    function gistBuildPayload(syncTs){calls.push(['build']);return {version:6,exported:syncTs,cfg:S.cfg,profileTextBlocks:S.profileTextBlocks,regions:S.regions,firms:S.firms,deletedIds:S.deletedIds};}
    async function gistEncryptPayload(payload,syncTs){calls.push(['encrypt']);return {type:'fiae-quest-encrypted-v1',version:1,exported:syncTs,ciphertext:'encrypted-local-data'};}
    function githubHeaders(){return {};}
    async function fetch(url,options){calls.push(['patch',url]);patchedEnvelope=JSON.parse(options.body).files[GIST_FILE].content;return {ok:true};}
    async function persistLocalOnly(){calls.push(['persist']);return true;}
    function mergeSyncData(){calls.push(['merge']);return {};}
    function gistValidateSyncPayload(){calls.push(['validate']);}
    function normalizePayloadForCompare(value){return value;}
    function stableStringify(value){return JSON.stringify(value);}
    function createRecoverySnapshot(){calls.push(['recovery']);return {ok:true};}
    async function gistApplyData(){calls.push(['apply']);return true;}
    function confirm(){calls.push(['confirm']);return true;}
    function renderDB(){calls.push(['render']);}
    function drawMap(){calls.push(['render']);}
    function renderQuestOverview(){calls.push(['render']);}
    function updateInfoPanel(){calls.push(['render']);}
    function today(){return '2026-06-12';}
    var console={error:function(){}};
    eval(source);
    return gistSync({mode:mode,silent:mode==='startup'||mode==='auto'}).then(function(result){
      return {
        result:result,
        calls:calls,
        state:JSON.stringify(S),
        initialState:initialState,
        businessState:JSON.stringify({cfg:S.cfg,profileTextBlocks:S.profileTextBlocks,regions:S.regions,firms:S.firms,deletedIds:S.deletedIds}),
        initialBusinessState:initialBusinessState,
        patchedEnvelope:patchedEnvelope
      };
    });
  `)(syncSource, mode);
}

(async () => {
  const push = await createSyncHarness('push');
  assert.deepStrictEqual(push.result, {pushed:true,initialized:true});
  assert.strictEqual(push.calls.filter(([name]) => name === 'patch').length, 1, 'Manueller Push muss den Initial-Gist genau einmal beschreiben');
  assert.strictEqual(push.calls.filter(([name]) => name === 'encrypt').length, 1, 'Der erste Upload muss durch den Verschlüsselungspfad laufen');
  assert.strictEqual(push.calls.some(([name]) => ['migrate','merge','apply','recovery'].includes(name)), false, 'Initial-Push darf weder Migration noch Merge/Apply auslösen');
  assert.strictEqual(push.businessState, push.initialBusinessState, 'Der Initial-Push darf lokale Nutzdaten nicht verändern');
  assert.deepStrictEqual(JSON.parse(push.patchedEnvelope), {
    type:'fiae-quest-encrypted-v1',
    version:1,
    exported:JSON.parse(push.patchedEnvelope).exported,
    ciphertext:'encrypted-local-data'
  }, 'Der Initial-Gist muss mit dem erzeugten verschlüsselten Envelope beschrieben werden');

  for (const mode of ['startup','auto','pull','merge']) {
    const run = await createSyncHarness(mode);
    assert.deepStrictEqual(run.result, {skipped:true,reason:'empty-initial-gist'}, `${mode} muss den leeren Initial-Gist überspringen`);
    assert.strictEqual(run.state, run.initialState, `${mode} darf lokale Daten nicht überschreiben`);
    assert.strictEqual(run.calls.some(([name]) => ['push','migrate','merge','apply','recovery','confirm'].includes(name)), false, `${mode} darf keine schreibende oder bestätigungspflichtige Aktion auslösen`);
  }

  console.log('Empty initial Gist classification and guarded first encrypted push OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
