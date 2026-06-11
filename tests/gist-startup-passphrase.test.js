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

const source = [
  'gistStartupSync',
  'rememberGistSyncPassphrase',
  'init'
].map(extractFunction).join('\n');

function createHarness(options = {}) {
  return new Function('source', 'remoteFirms', `
    var _gistSyncPassphrase='';
    var _gistStartupSyncPending=true;
    var _gistStartupSyncPromise=null;
    var firms=[];
    var syncCalls=0, seedCalls=0, renderCalls=0, toasts=[];
    var passphraseInput={value:''};
    function gistGetToken(){return 'token';}
    function gistGetId(){return 'gist-id';}
    function gistCheckSyncRequirements(){
      return {ok:!!_gistSyncPassphrase,hasPassphrase:!!_gistSyncPassphrase};
    }
    function gistSync(){
      syncCalls+=1;
      firms=remoteFirms.slice();
      return Promise.resolve({pulled:true});
    }
    async function seedIfEmpty(){seedCalls+=1;if(!firms.length) firms.push('default');}
    function toast(message){toasts.push(message);}
    var document={getElementById:function(id){return id==='gist-passphrase'?passphraseInput:null;}};
    async function load(){}
    function loadCfgUI(){}
    function loadGistCfgUI(){}
    function renderTabs(){renderCalls+=1;}
    function renderDBRegionFilter(){renderCalls+=1;}
    function renderDB(){renderCalls+=1;}
    function renderQuestOverview(){renderCalls+=1;}
    function drawMap(){renderCalls+=1;}
    function setTimeout(){}
    eval(source);
    return {
      init:init,
      remember:rememberGistSyncPassphrase,
      setInput:function(value){passphraseInput.value=value;},
      state:function(){return {firms:firms.slice(),syncCalls:syncCalls,seedCalls:seedCalls,pending:_gistStartupSyncPending,renderCalls:renderCalls,toasts:toasts.slice()};}
    };
  `)(source, options.remoteFirms || []);
}

(async () => {
  const withRemoteData = createHarness({remoteFirms:['remote-firm']});
  await withRemoteData.init();
  assert.deepStrictEqual(withRemoteData.state().firms, [], 'Vor der Passphrase dürfen keine Defaults angelegt werden');
  assert.strictEqual(withRemoteData.state().syncCalls, 0, 'Startup-Sync muss ohne Passphrase aufgeschoben werden');
  assert.strictEqual(withRemoteData.state().seedCalls, 0, 'Seeding muss bis nach dem aufgeschobenen Sync warten');
  assert.strictEqual(withRemoteData.state().pending, true);

  withRemoteData.setInput('session secret');
  await withRemoteData.remember();
  assert.strictEqual(withRemoteData.state().syncCalls, 1, 'Übernahme der Passphrase muss den Startup-Sync nachholen');
  assert.deepStrictEqual(withRemoteData.state().firms, ['remote-firm'], 'Remote-Daten müssen vor dem Seeding übernommen werden');
  assert.strictEqual(withRemoteData.state().seedCalls, 1);
  assert.strictEqual(withRemoteData.state().pending, false);

  const withoutRemoteData = createHarness();
  await withoutRemoteData.init();
  withoutRemoteData.setInput('session secret');
  await withoutRemoteData.remember();
  assert.deepStrictEqual(withoutRemoteData.state().firms, ['default'], 'Defaults dürfen erst nach einem erfolgreichen leeren Startup-Sync entstehen');

  console.log('Deferred Gist startup sync and post-sync seeding OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
