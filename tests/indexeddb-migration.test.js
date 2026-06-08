const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const marker = `async function ${name}(`;
  const start = html.indexOf(marker);
  assert(start >= 0, `${name} wurde nicht gefunden`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
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
  throw new Error('Funktion konnte nicht extrahiert werden');
}

const source = extractFunction('migrateFromLocalStorageToIndexedDB');
const legacy = { version: 6, firms: [{ id: 'legacy', name: 'Legacy GmbH' }] };
const api = new Function('legacy', `
  var IDB_STATE_KEY='state', IDB_MIGRATED_KEY='fiae_quest_v6_idb_migrated';
  var _migrationStatus='', _idbLastError=null, stored=null, marker=null, openCalls=0;
  var console={info:function(){},warn:function(){}};
  var localStorage={getItem:function(){return marker;},setItem:function(k,v){marker=v;}};
  async function openDB(){openCalls+=1;}
  async function idbGet(){return stored;}
  async function idbSet(key,value){assertKey=key;stored=value;}
  function readLegacyLocalState(){return legacy;}
  var assertKey='';
  ${source}
  return {run:migrateFromLocalStorageToIndexedDB,getStored:()=>stored,getMarker:()=>marker,
    getStatus:()=>_migrationStatus,getKey:()=>assertKey,getOpenCalls:()=>openCalls};
`)(legacy);

(async () => {
  assert.strictEqual(await api.run(), true);
  assert.deepStrictEqual(api.getStored(), legacy);
  assert.strictEqual(api.getKey(), 'state');
  assert.strictEqual(api.getMarker(), '1');
  assert.strictEqual(api.getStatus(), 'migriert');
  assert.strictEqual(await api.run(), false, 'Vorhandener IndexedDB-State darf nicht überschrieben werden');
  assert.strictEqual(api.getOpenCalls(), 2);
  console.log('Legacy migration to mocked IndexedDB OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
