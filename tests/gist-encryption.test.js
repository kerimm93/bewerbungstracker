const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `Quelltextbereich ${startMarker} wurde nicht gefunden`);
  return html.slice(start, end);
}

const cryptoSource = sourceBetween(
  'function utf8Encode(',
  'function gistBuildPayload('
);
const fetchSource = sourceBetween(
  'async function getFullGistFileText(',
  'async function gistPushPayload('
);

const api = new Function('webCrypto', `
  var crypto=webCrypto;
  var GIST_FILE='fiae_quest_data.json';
  var GIST_ENVELOPE_TYPE='fiae-quest-encrypted-v1';
  var GIST_ENVELOPE_APP='bewerbungstracker';
  var GIST_KDF='PBKDF2-SHA-256';
  var GIST_CIPHER='AES-GCM';
  var GIST_KDF_ITERATIONS=250000;
  var _gistSyncPassphrase='correct horse battery staple';
  var responsePayload=null;
  function githubHeaders(){ return {}; }
  async function fetch(){
    return {ok:true,json:async function(){return responsePayload;}};
  }
  ${cryptoSource}
  ${fetchSource}
  return {
    encrypt:gistEncryptPayload,
    decrypt:gistDecryptEnvelope,
    fetchRemote:gistFetchRemote,
    setPassphrase:function(value){_gistSyncPassphrase=value;},
    setResponse:function(value){responsePayload=value;},
    toBase64:arrayBufferToBase64,
    fromBase64:base64ToArrayBuffer
  };
`)(globalThis.crypto);

const payload = {
  version: 6,
  exported: '2026-06-11T10:00:00.000Z',
  cfg: { name: 'Testperson' },
  profileTextBlocks: { standardEinleitung: 'Hallo' },
  regions: [{ id: 'bremen', name: 'Bremen' }],
  firms: [{ id: 'firm-1', name: 'Beispiel GmbH' }],
  deletedIds: {}
};

(async () => {
  const envelope = await api.encrypt(payload, payload.exported);
  assert.deepStrictEqual(await api.decrypt(envelope), payload, 'Envelope muss authentifiziert entschlüsselt werden');

  api.setResponse({files:{'fiae_quest_data.json':{content:JSON.stringify(envelope)}}});
  assert.deepStrictEqual(
    await api.fetchRemote('token', 'gist-id'),
    payload,
    'gistFetchRemote muss den entschlüsselten Anwendungs-Payload zurückgeben'
  );

  api.setPassphrase('wrong passphrase');
  await assert.rejects(
    api.decrypt(envelope),
    /Passphrase falsch oder Daten manipuliert/,
    'Eine falsche Passphrase muss an der AES-GCM-Authentifizierung scheitern'
  );

  api.setPassphrase('correct horse battery staple');
  const tampered = JSON.parse(JSON.stringify(envelope));
  const ciphertext = new Uint8Array(api.fromBase64(tampered.ciphertext));
  ciphertext[ciphertext.length - 1] ^= 1;
  tampered.ciphertext = api.toBase64(ciphertext);
  await assert.rejects(api.decrypt(tampered), /Daten manipuliert/);

  const invalidMetadata = JSON.parse(JSON.stringify(envelope));
  invalidMetadata.crypto.iterations = 1;
  await assert.rejects(api.decrypt(invalidMetadata), /Kryptoparameter/);

  const mismatchedTimestamp = JSON.parse(JSON.stringify(envelope));
  mismatchedTimestamp.exported = '2026-06-11T10:01:00.000Z';
  await assert.rejects(api.decrypt(mismatchedTimestamp), /Zeitstempel stimmen nicht überein/);

  const plaintextPayload = JSON.parse(JSON.stringify(payload));
  api.setResponse({files:{'fiae_quest_data.json':{content:JSON.stringify(plaintextPayload)}}});
  assert.deepStrictEqual(
    await api.fetchRemote('token', 'gist-id'),
    plaintextPayload,
    'Vorhandene Klartext-Gists sollen weiterhin importierbar bleiben'
  );

  console.log('Gist envelope encryption/decryption and read path OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
