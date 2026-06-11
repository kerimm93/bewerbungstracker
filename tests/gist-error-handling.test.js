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

const readSource = [
  'getFullGistFileText', 'gistClassifyRemoteJson', 'gistFetchRemote'
].map(extractFunction).join('\n');

function createReadHarness(fetchImpl) {
  return new Function('fetchImpl', `
    var GIST_FILE='fiae_quest_data.json';
    var GIST_ENVELOPE_TYPE='encrypted';
    function githubHeaders(token){return {'Authorization':'token '+token};}
    function gistValidateSyncPayload(payload){
      if(!payload||payload.version!==6||!Array.isArray(payload.firms)||!Array.isArray(payload.regions)||!payload.cfg) throw new Error('Payload ist ungültig');
      return payload;
    }
    function gistValidateEncryptedEnvelope(envelope){if(!envelope.crypto) throw new Error('Envelope-Kryptoparameter fehlen');}
    async function gistDecryptEnvelope(){throw new Error('Entschlüsselung fehlgeschlagen – Passphrase falsch oder Payload beschädigt');}
    async function fetch(url,opts){return fetchImpl(url,opts);}
    ${readSource}
    return {fetchRemote:gistFetchRemote,fullText:getFullGistFileText};
  `)(fetchImpl);
}

(async () => {
  let api = createReadHarness(async () => { throw new TypeError('offline'); });
  await assert.rejects(api.fetchRemote('token', 'id'), /^Error: Gist-GET \/ Netzwerkfehler$/);

  api = createReadHarness(async () => ({ok:false,status:403}));
  await assert.rejects(api.fetchRemote('token', 'id'), /Gist-GET HTTP 403/);

  api = createReadHarness(async () => ({ok:true,json:async () => { throw new SyntaxError('bad'); }}));
  await assert.rejects(api.fetchRemote('token', 'id'), /Gist-GET \/ Fehlerhaftes JSON/);

  api = createReadHarness(async () => ({ok:true,json:async () => ({message:'not a gist'})}));
  await assert.rejects(api.fetchRemote('token', 'id'), /Gist-GET \/ Unerwartetes Payload-Format/);

  api = createReadHarness(async () => ({ok:true,json:async () => ({files:{'fiae_quest_data.json':{content:'{broken'}}})}));
  await assert.rejects(api.fetchRemote('token', 'id'), /^Error: Fehlerhaftes JSON$/);

  api = createReadHarness(async () => ({ok:true,json:async () => ({files:{'fiae_quest_data.json':{content:JSON.stringify({foo:'bar'})}}})}));
  await assert.rejects(api.fetchRemote('token', 'id'), /Unerwartetes Payload-Format/);

  api = createReadHarness(async () => ({ok:true,json:async () => ({files:{'fiae_quest_data.json':{content:JSON.stringify({type:'encrypted',crypto:{}})}}})}));
  await assert.rejects(api.fetchRemote('token', 'id'), /Entschlüsselung fehlgeschlagen – Passphrase falsch oder Payload beschädigt/);

  let rawRequest = null;
  api = createReadHarness(async (url, opts) => {
    rawRequest = {url, opts};
    return {ok:true,text:async () => 'raw payload'};
  });
  assert.strictEqual(await api.fullText({truncated:true,raw_url:'https://example.test/raw'}), 'raw payload');
  assert.strictEqual(rawRequest.url, 'https://example.test/raw');
  assert.deepStrictEqual(rawRequest.opts, {headers:{Accept:'application/vnd.github.raw'}});

  const pushSource = extractFunction('gistPushPayload');
  async function runPush(fetchImpl) {
    return new Function('fetchImpl', `
      var S={_lastExported:'before'};
      var GIST_FILE='fiae_quest_data.json';
      var Date=function(){return {toISOString:function(){return 'after';}};};
      async function gistEncryptPayload(){return {ciphertext:'encrypted'};}
      function gistBuildPayload(){return {};}
      function githubHeaders(token,includeContentType){return includeContentType?{'Content-Type':'application/json'}:{};}
      async function persistLocalOnly(){return true;}
      async function fetch(url,opts){return fetchImpl(url,opts);}
      var console={error:function(){}};
      ${pushSource}
      return gistPushPayload('token','id',false);
    `)(fetchImpl);
  }
  await assert.rejects(runPush(async () => { throw new TypeError('offline'); }), /PATCH Netzwerkfehler/);
  await assert.rejects(runPush(async () => ({ok:false,status:422})), /PATCH HTTP 422/);

  assert(html.includes("if(!await gistApplyData(remoteData,{skipRender:false})) throw new Error('IndexedDB-Fehler nach Pull')"));
  assert(html.includes("if(didChange&&!await gistApplyData(mergedPayload,{skipRender:true})) throw new Error('IndexedDB-Fehler nach Merge')"));
  assert(html.includes("if(!await persistLocalOnly(S,{suppressToast:true})) throw new Error('IndexedDB-Fehler nach Push')"));
  assert(html.includes("headers:githubHeaders(token,true)"), 'PATCH muss JSON-Header über githubHeaders(token,true) behalten');
  assert(!/api\.github\.com\/gists\/.*Cache-Control/.test(html), 'Gist-GET darf keinen Cache-Control-Header ergänzen');

  const syncSource = extractFunction('gistSync');
  assert.strictEqual((syncSource.match(/toast\(errorMessage\)/g) || []).length, 1, 'Fehlerpfad darf höchstens einen Toast ausgeben');
  assert.strictEqual((syncSource.match(/setSyncStatus\(errorMessage,false,false\)/g) || []).length, 1, 'Fehlerpfad muss genau einen finalen Status setzen');

  console.log('Gist GET/PATCH error classification, raw fallback and single failure notification OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
