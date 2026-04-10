# KERIM APP MASTER REFERENZ
*Single-File HTML Apps — Architektur, Design, Sync, Deployment*

Version: 1.0 — 09.04.2026  
Basis: KERIM APP SYSTEM v2.1 + Daily Log Prinzipiendokument + GitHub Sync Best Practices  
Gilt für: alle persönlichen Single-File-HTML-Apps auf dieser Basis

---

## INHALT

1. [Grundprinzip & Entscheidungen](#1-grundprinzip--entscheidungen)
2. [Technische Basis](#2-technische-basis)
3. [State & Datenhaltung](#3-state--datenhaltung)
4. [GitHub Gist Sync](#4-github-gist-sync)
5. [AES-GCM Verschlüsselung](#5-aes-gcm-verschlüsselung)
6. [Design-System](#6-design-system)
7. [Komponenten-Bibliothek](#7-komponenten-bibliothek)
8. [Navigation](#8-navigation)
9. [Pflicht-Hilfsfunktionen](#9-pflicht-hilfsfunktionen)
10. [PWA-Setup](#10-pwa-setup)
11. [Deployment](#11-deployment)
12. [Validierung & Debugging](#12-validierung--debugging)
13. [Regeln (Nie / Immer)](#13-regeln-nie--immer)
14. [Checkliste neue App](#14-checkliste-neue-app)
15. [Gelöste Probleme & Lektionen](#15-gelöste-probleme--lektionen)

---

## 1. Grundprinzip & Entscheidungen

Jede App ist eine **einzige `.html`-Datei**. Kein Framework, kein Build-Step, kein Backend.

| Entscheidung | Begründung | Verworfen |
|---|---|---|
| Single-File HTML | schnelle Iteration, KI-kompatibel, GitHub-Pages-tauglich | Framework/Bundler |
| Vanilla JS | volle Transparenz, copy-paste-fähige Patches | React/Vue/Svelte |
| `localStorage` first | offline nutzbar, kein Server | Datenbank/Backend |
| State-Split `S` + `TODAY` | klare Trennung Archiv vs. Arbeitstag | flacher State |
| GitHub Gist als Cloud-Sync | einfachster Cloud-Speicher ohne eigenen Server | eigenes Backend |
| AES-GCM-Verschlüsselung nur für Gist | GitHub sieht nur Ciphertext, lokales Arbeiten bleibt einfach | Klartext-Gist |
| Merge statt Last-Write-Wins | reduziert Datenverlust zwischen Geräten | blindes Überschreiben |
| Tombstones für Löschungen | verhindert Resurrection-Bugs beim Sync | hartes Entfernen |
| Auto-Sync mit Debounce | weniger unnötige Netzwerkzugriffe | sofortiger Push |
| `_syncInProgress`-Guard | verhindert re-entrante Syncs | unguarded Save/Push-Ketten |
| `persistLocalOnly()` getrennt von `save()` | lokales Persistieren ohne Sync-Trigger | überall `save()` |
| Startup-Sync vor erstem Render | verhindert Flackern/Zwischenzustände | lokaler Render zuerst |
| ZIP-Backup zusätzlich zu Gist | lokaler Recovery-Pfad, vollständige Wiederherstellung | nur Cloud-Sync |

**Nicht auf diese Basis verallgemeinern:** Framework-Apps, Backend-Apps, Multi-File-Build-Pipelines.

---

## 2. Technische Basis

### Dateistruktur
```
repo/
├── index.html     ← die App (wird bei Updates ersetzt)
├── manifest.json  ← einmalig hochladen, danach unverändert
└── sw.js          ← einmalig hochladen, danach unverändert
```

### App-spezifische Konstanten (oben im Script definieren)
```javascript
var LKEY                       = 'appname_v1';
var GIST_TOKEN_KEY             = 'appname_gist_token';
var GIST_ID_KEY                = 'appname_gist_id';
var GIST_FILE                  = 'appname_data.json';      // einmalig, eindeutig pro App
var SYNC_PASSPHRASE_KEY        = 'appname_sync_passphrase';
var SYNC_PASSPHRASE_REMEMBER_KEY = 'appname_sync_pp_remember';
var DEVICE_ID_KEY              = 'appname_device_id';
var DEVICE_NAME_KEY            = 'appname_device_name';
var AUTO_SYNC_KEY              = 'appname_auto_sync';
var THEME_KEY                  = 'appname_theme';
```

**Alle Keys App-spezifisch benennen** — nie generische Namen wie `gist_token` verwenden, damit sich mehrere Apps im selben Browser nicht gegenseitig überschreiben.

### JS-Validierung
Immer `vm.Script` verwenden — gibt korrekte Zeilennummern (nicht `new Function`):
```bash
node -e "
const fs=require('fs'), vm=require('vm');
try {
  new vm.Script(fs.readFileSync('app.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]);
  console.log('JS OK');
} catch(e) {
  const lines=fs.readFileSync('app.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('\n');
  const ln=parseInt((e.stack.match(/evalmachine[^:]*:(\d+)/)||[])[1]||0);
  console.log('Error at line', ln, ':', e.message);
  for(let i=Math.max(0,ln-2);i<=ln+1;i++) console.log(i+1,'|',lines[i]);
}"
```

---

## 3. State & Datenhaltung

### State-Grundstruktur
```javascript
var S = {
  days:            [],   // [{date, cards, objects, feedItems, reviewDone, closedAt, plan}]
  futurelog:       [],
  migrationPuffer: [],
  zettels:         [],
  trash:           { cards: [], objects: [] },
  deletedIds:      {},   // Tombstones: { id: ISO-Timestamp }
  collections:     [],
  config:          { name: '', context: '', contexts: [] },
  _lastExported:   ''    // ISO-Timestamp des letzten Gist-Pushs
};

var TODAY = {
  date:       '',
  cards:      [],
  objects:    [],
  feedItems:  [],
  reviewDone: false,
  plan: {
    intentionen: '', vermeiden: '', aufstehzeit: '05:00',
    ort: '', stundenplan: '', tasks: []
  }
};
```

### Persistence: zwei Funktionen, zwei Zwecke
```javascript
// Nur lokales Speichern — kein Sync-Trigger
function persistLocalOnly() {
  try { localStorage.setItem(LKEY, JSON.stringify({ S: S, TODAY: TODAY })); }
  catch(e) { toast('⚠ Speicherfehler'); }
}

// Normaler Save mit Sync-Trigger
function save() {
  if (!_syncInProgress) {
    S._lastExported = new Date().toISOString();
  }
  persistLocalOnly();
  if (!_syncInProgress) {
    if (isAutoSyncEnabled()) gistAutoSyncDebounced();
  }
}
```

### Debounced Save für Mikrointeraktionen
```javascript
var _saveDebounceTimer = null;
function saveDebounced() {
  if (_syncInProgress) return;
  if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(function() {
    _saveDebounceTimer = null;
    save();
  }, 600);
}
```

### load() mit Defaults
```javascript
function load() {
  try {
    var d = localStorage.getItem(LKEY);
    if (d) { var p = JSON.parse(d); if (p.S) S = p.S; if (p.TODAY) TODAY = p.TODAY; }
  } catch(e) {}
  // Defaults für alle Felder setzen (immer, auch wenn schon vorhanden):
  if (!S.items)      S.items = [];
  if (!S.deletedIds) S.deletedIds = {};
  // usw.
  pruneDeletedIds(); // Tombstones bereinigen
}
```

**Wichtig:** Alle neuen `S`-Felder müssen gleichzeitig ergänzt werden in: `load()`, `save()`, `mergeS()`, `mergeToday()`, Export und Import.

### Objekt-Mutation immer über `touchObj()`
```javascript
function touchObj(obj) {
  obj.updatedAt = new Date().toISOString();
  stampItemEditMeta(obj);
}
```
`touchObj()` bei: Status, Signifier, Textänderungen, ReviewNote, Collection-Zuweisung, Parent/Child-Änderungen, Promote/Detach.

### Tombstone-Deletion
```javascript
function recordDeletion(id) {
  if (!S.deletedIds) S.deletedIds = {};
  S.deletedIds[id] = new Date().toISOString();
}
function isDeleted(id) {
  return !!(S.deletedIds && S.deletedIds[id]);
}
// TTL 90 Tage — in load() aufrufen
function pruneDeletedIds() {
  var cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  Object.keys(S.deletedIds || {}).forEach(function(id) {
    if (S.deletedIds[id] < cutoff) delete S.deletedIds[id];
  });
}
```

### Merge per ID
```javascript
function mergeById(localArr, remoteArr, idKey) {
  var map = {};
  (localArr||[]).forEach(function(item) { map[item[idKey]] = item; });
  (remoteArr||[]).forEach(function(item) {
    if (isDeleted(item[idKey])) return; // Tombstone: nicht resurrekten
    var existing = map[item[idKey]];
    if (!existing) {
      map[item[idKey]] = item;
    } else {
      var localTs  = existing.updatedAt || existing.createdAt || '0';
      var remoteTs = item.updatedAt     || item.createdAt     || '0';
      if (remoteTs > localTs) map[item[idKey]] = item;
    }
  });
  return Object.values(map).filter(function(item){ return !isDeleted(item[idKey]); });
}
```

Tage (`S.days`) per Datum mergen. Boolesche Felder wie `reviewDone`/`closedAt` per OR: einmal gesetzt, nie verloren.

### Export / Import (immer Klartext)
```javascript
function exportData() {
  var payload = { version: 1, exported: new Date().toISOString(), S: S, TODAY: TODAY };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'appname-export-' + today() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
```
Export **immer Klartext, nie verschlüsselt, nie mit Credentials**.

---

## 4. GitHub Gist Sync

### Zentraler Header-Helper (Pflicht)
```javascript
function githubHeaders(token, includeContentType) {
  var h = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github+json'
  };
  if (includeContentType) h['Content-Type'] = 'application/json';
  return h;
}
// GET  → githubHeaders(token)
// PATCH → githubHeaders(token, true)
```

**Nie inline Header-Objekte schreiben.** Nie `Cache-Control` auf GET-Requests — löst CORS-Preflight aus.

### Freshness-Prüfung
```javascript
// Einziger syncTs pro Push — kein Drift
var syncTs = new Date().toISOString();
S._lastExported = syncTs;
var payload = { version: 2, exported: syncTs, S: S, TODAY: TODAY };

// Beim Pull: gistTime aus entschlüsseltem Payload lesen
var gistTime  = parsed.exported || (parsed.S && parsed.S._lastExported) || '';
var localTime = (S && S._lastExported) || '';

// Leerer lokaler Stand darf immer pullen
var localHasData = (S.days||[]).length > 0 || (TODAY.cards||[]).length > 0;
var localIsEmpty = !localTime && !localHasData;

if (!gistNewer && !localIsEmpty) { toast('Lokal aktuell.'); return; }
```

### gistPush mit Versionscheck und Fehler-Revert
```javascript
async function gistPush(silent) {
  var token = localStorage.getItem(GIST_TOKEN_KEY);
  var gid   = localStorage.getItem(GIST_ID_KEY);
  if (!token || !gid) { if (!silent) toast('Gist nicht konfiguriert.'); return; }

  var prevLastExported = S._lastExported || '';
  try {
    var syncTs = new Date().toISOString();
    S._lastExported = syncTs;

    var payload = gistBuildPayload(syncTs); // verschlüsselt oder Klartext
    var r = await fetch('https://api.github.com/gists/' + gid, {
      method: 'PATCH',
      headers: githubHeaders(token, true),
      body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } } })
    });
    if (r.ok) {
      persistLocalOnly(); // Timestamp lokal verankern
      if (!silent) toast('☁ Gespeichert');
    } else {
      S._lastExported = prevLastExported; // exakter Revert
      toast('Fehler ' + r.status + ' beim Hochladen');
    }
  } catch(e) {
    S._lastExported = prevLastExported; // auch im catch revertieren
    toast('Netzwerkfehler beim Hochladen: ' + e.message.slice(0, 40));
  }
}
```

### Merge: vier Schritte mit Fehlerprotokoll
```javascript
async function gistSync() {
  var token = localStorage.getItem(GIST_TOKEN_KEY);
  var gid   = localStorage.getItem(GIST_ID_KEY);
  if (!token || !gid) return;

  // Schritt 1: Gist-GET
  var res;
  try { res = await fetch('https://api.github.com/gists/' + gid, { headers: githubHeaders(token) }); }
  catch(e) { console.error('[Sync] Schritt 1 – GET fehlgeschlagen:', e); return; }

  // Schritt 2: JSON-Parse
  var remote;
  try {
    var gist = await res.json();
    var file = gist.files && (gist.files[GIST_FILE] || Object.values(gist.files)[0]);
    remote = JSON.parse(await getFullGistFileText(file)); // truncation-sicher
  }
  catch(e) { console.error('[Sync] Schritt 2 – Parse fehlgeschlagen:', e); return; }

  // Schritt 3: Merge
  try { /* mergeS(), mergeToday() */ }
  catch(e) { console.error('[Sync] Schritt 3 – Merge-Fehler:', e); return; }

  // Schritt 4: Zurückschreiben
  try { await gistPush(true); }
  catch(e) { console.error('[Sync] Schritt 4 – PATCH fehlgeschlagen:', e); }
}
```

**Fehlermeldungen:** Immer Schrittnummer nennen.  
- ❌ `"Sync-Fehler: Failed to fetch"`  
- ✅ `"Netzwerkfehler beim Abrufen des Gist (Schritt 1): Failed to fetch"`

### Truncation-Schutz
```javascript
async function getFullGistFileText(file) {
  if (!file.truncated) return file.content;
  var r = await fetch(file.raw_url);
  return r.text();
}
```

### Auto-Sync
```javascript
var _gistAutoSyncTimer = null;
function gistAutoSyncDebounced() {
  if (!isAutoSyncEnabled() || !localStorage.getItem(GIST_TOKEN_KEY)) return;
  if (_gistAutoSyncTimer) clearTimeout(_gistAutoSyncTimer);
  _gistAutoSyncTimer = setTimeout(function() {
    _gistAutoSyncTimer = null;
    gistPush(true);
  }, 30000);
}

function isAutoSyncEnabled() {
  var raw = localStorage.getItem(AUTO_SYNC_KEY);
  return raw === null ? true : raw !== '0';
}
```

---

## 5. AES-GCM Verschlüsselung

Nur der Gist-Inhalt wird verschlüsselt. Lokale Exporte bleiben Klartext.

### Crypto-Helfer
```javascript
function arrayBufferToBase64(buf) {
  var bytes = new Uint8Array(buf), bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToArrayBuffer(b64) {
  var bin = atob(b64), buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function textToUint8(str) { return new TextEncoder().encode(str); }
function uint8ToText(buf)  { return new TextDecoder().decode(buf); }

async function deriveKeyFromPassphrase(passphrase, saltBuf) {
  var mat = await crypto.subtle.importKey('raw', textToUint8(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 250000, hash: 'SHA-256' },
    mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptJsonPayload(payloadObj, passphrase) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var iv   = crypto.getRandomValues(new Uint8Array(12));
  var key  = await deriveKeyFromPassphrase(passphrase, salt.buffer);
  var cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, textToUint8(JSON.stringify(payloadObj)));
  return {
    format: 'appname-encrypted-v1', // APP-SPEZIFISCH ANPASSEN
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 250000 },
    cipher: { name: 'AES-GCM' },
    salt: arrayBufferToBase64(salt.buffer),
    iv:   arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(cipherBuf)
  };
}

async function decryptJsonPayload(envelope, passphrase) {
  var key = await deriveKeyFromPassphrase(passphrase, base64ToArrayBuffer(envelope.salt));
  var plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(envelope.iv)) },
    key, base64ToArrayBuffer(envelope.ciphertext)
  );
  return JSON.parse(uint8ToText(plainBuf));
}

function isEncryptedEnvelope(obj) {
  return obj && obj.format === 'appname-encrypted-v1'; // APP-SPEZIFISCH ANPASSEN
}
```

### Beim Pull: erst entschlüsseln, dann Freshness prüfen
```javascript
var raw = JSON.parse(await getFullGistFileText(file));
var parsed;
if (isEncryptedEnvelope(raw)) {
  var pp = getSyncPassphrase();
  if (!pp) { toast('Bitte Passphrase eingeben.'); return; }
  try { parsed = await decryptJsonPayload(raw, pp); }
  catch(e) { toast('Entschlüsselung fehlgeschlagen — falsche Passphrase?'); return; }
  // Niemals mit kaputten Daten mergen
} else {
  parsed = raw; // Legacy-Klartext
}
// DANACH Freshness-Prüfung auf `parsed.exported`
```

### Passphrase-Management
```javascript
var _syncPassphrase = '';
function getSyncPassphrase() { return _syncPassphrase || localStorage.getItem(SYNC_PASSPHRASE_KEY) || ''; }
function setSyncPassphrase(p, remember) {
  _syncPassphrase = (p || '').trim();
  if (remember && _syncPassphrase) {
    localStorage.setItem(SYNC_PASSPHRASE_KEY, _syncPassphrase);
    localStorage.setItem(SYNC_PASSPHRASE_REMEMBER_KEY, '1');
  } else {
    localStorage.removeItem(SYNC_PASSPHRASE_KEY);
    localStorage.removeItem(SYNC_PASSPHRASE_REMEMBER_KEY);
  }
}
```

---

## 6. Design-System

### Farbpalette (Dark Theme)
```css
:root {
  /* Backgrounds */
  --bg:           #1a1a2e;
  --bg-mid:       #16213e;
  --surface:      #1e2a4a;
  --surface-2:    #162038;
  --surface-3:    #243555;
  --border:       #2a4a7f;
  --border-light: #3a6aaf;

  /* Text */
  --ink:       #e8e8f0;
  --ink-light: #9999bb;
  --ink-dim:   #555577;

  /* Akzente */
  --gold:         #ffb347;
  --gold-light:   #ffd580;
  --purple:       #9b59b6;
  --purple-light: #c39bd3;
  --purple-dark:  #7d3c98;
  --green:        #2ecc71;
  --green-dark:   #1a8a4a;
  --red:          #e74c3c;
  --red-dark:     #c0392b;
  --blue:         #3498db;
  --blue-dark:    #2176ae;
  --teal:         #1abc9c;
  --teal-dark:    #16a085;
  --cyan:         #00d4ff;

  /* Schriften */
  --pixel: 'Press Start 2P', monospace;
  --body:  'Lato', sans-serif;
  --mono:  'JetBrains Mono', 'Courier New', monospace;
  --r:     5px; /* Border-Radius-Basis */
}
```

### Typografie-Regel (kritisch)
```
Press Start 2P  →  NUR: App-Titel, Stat-Werte, Badges (rein dekorativ)
Lato            →  ALLES ANDERE
```

Pixel-Schrift **nie** für: Labels, Buttons, Fließtext, Metadaten, Notices, Tabellen.

### Responsive Schriftgrößen
```css
/* Mobile (<640px)  */ --fs-content: 16px; --fs-label: 11px; --fs-btn: 13px; --touch-min: 44px;
/* Tablet (640px+)  */ --fs-content: 17px; --touch-min: 40px;
/* Desktop (1024px+)*/ --fs-content: 15px; --touch-min: 36px;
```

### Hintergrund & App-Container
```css
body {
  background: var(--bg);
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(155,89,182,0.08) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(52,152,219,0.06) 0%, transparent 50%);
  font-family: var(--body); color: var(--ink);
}
#app { max-width: 1200px; margin: 0 auto; padding: 12px; }
```

---

## 7. Komponenten-Bibliothek

### Header / Titelbox
```css
.htbox {
  background: linear-gradient(135deg, #2d1b69, #1a0a4a);
  border: 2px solid var(--purple);
  box-shadow: 0 0 20px rgba(155,89,182,0.3);
  border-radius: 6px; padding: 10px 20px; text-align: center;
}
.htbox h1  { font-family: var(--pixel); color: var(--gold); font-size: 9px; }
.htbox .sub { font-family: var(--body); font-weight: 300; color: var(--ink-light);
              font-size: 14px; letter-spacing: 4px; text-transform: uppercase; }
```

### Section-Cards
```css
.qs {
  background: var(--surface); border: 1px solid var(--border);
  box-shadow: 0 2px 12px rgba(0,0,0,0.25);
  padding: 14px 16px; margin-bottom: 12px; border-radius: 8px;
}
.qh { /* Section-Überschrift */
  font-family: var(--body); font-weight: 800; font-size: 13px;
  color: var(--gold); text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
```

### Buttons
```css
.btn {
  font-family: var(--body); font-weight: 700; font-size: var(--fs-btn);
  padding: 10px 18px; border: none; border-radius: 8px; cursor: pointer;
  min-height: var(--touch-min); box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  display: inline-flex; align-items: center; gap: 6px;
}
/* Farb-Varianten */
.btn-q { background: linear-gradient(135deg, var(--gold), #e8960a); color: #1a0a00; }
.btn-m { background: linear-gradient(135deg, var(--purple), var(--purple-dark)); color: white; }
.btn-v { background: linear-gradient(135deg, var(--green), var(--green-dark)); color: white; }
.btn-s { background: linear-gradient(135deg, var(--blue), var(--blue-dark)); color: white; }
.btn-t { background: linear-gradient(135deg, var(--teal), var(--teal-dark)); color: white; }
.btn-d { background: linear-gradient(135deg, var(--red), var(--red-dark)); color: white; }
/* Größen */
.btn-sm { font-size: calc(var(--fs-btn) - 2px); padding: 7px 13px;
          min-height: calc(var(--touch-min) - 8px); }
/* States */
.btn:active   { transform: translateY(1px); box-shadow: none; }
.btn:disabled { opacity: 0.38; cursor: not-allowed; }
```

### Filter-Pills
```css
.fp {
  font-family: var(--body); font-weight: 600; padding: 7px 14px;
  border: 1px solid var(--border); border-radius: 20px;
  background: var(--surface); color: var(--ink-light); cursor: pointer;
  min-height: var(--touch-min); display: inline-flex; align-items: center;
  transition: all .15s;
}
.fp:hover  { border-color: var(--purple-light); color: var(--ink); }
.fp.active { background: var(--purple-dark); border-color: var(--purple); color: white; }
```

### Inputs & Labels
```css
input, textarea, select {
  background: rgba(0,0,0,0.25); border: 1px solid var(--border);
  color: var(--ink); font-family: var(--body); font-size: var(--fs-content);
  padding: 10px 14px; min-height: var(--touch-min); border-radius: 6px; width: 100%;
}
input:focus, select:focus {
  outline: none; border-color: var(--purple);
  box-shadow: 0 0 0 2px rgba(155,89,182,0.2);
}
label {
  font-family: var(--body); font-size: 11px; font-weight: 700;
  color: var(--ink-light); text-transform: uppercase; letter-spacing: 0.5px;
  display: block; margin-bottom: 5px; margin-top: 12px;
}
```

### Notices
```css
.notice {
  background: rgba(255,179,71,0.07); border-left: 3px solid var(--gold);
  padding: 10px 14px; font-family: var(--body); font-size: 13px;
  color: var(--ink-light); line-height: 1.6; border-radius: 0 6px 6px 0;
}
.notice.info    { background: rgba(52,152,219,0.07);  border-left-color: var(--blue); }
.notice.danger  { background: rgba(231,76,60,0.10);   border-left-color: var(--red); }
.notice.success { background: rgba(46,204,113,0.07);  border-left-color: var(--green); }
```

### Modals
```css
.modal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px); z-index: 200;
  display: flex; align-items: center; justify-content: center; padding: 12px;
}
.modal-bg.hidden { display: none; }
.modal-box {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; padding: 20px;
}
.modal-title { font-family: var(--body); font-weight: 800; color: var(--gold);
               font-size: 16px; margin-bottom: 16px; }
```

### Toast
```css
#toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px);
  background: var(--surface-3); border: 1px solid var(--border-light);
  color: var(--ink); font-family: var(--body); font-size: 13px;
  padding: 10px 20px; border-radius: 20px;
  opacity: 0; transition: all .25s; z-index: 999; pointer-events: none;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

### Panel-Wrap
```css
.panel-wrap {
  background: var(--surface-2); border: 1px solid var(--border);
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  padding: 16px; min-height: 300px; border-radius: 0 0 8px 8px;
}
.panel { display: none; }
.panel.active { display: block; animation: fi .15s ease; }
@keyframes fi { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
```

---

## 8. Navigation

### Desktop/Tablet: Tab-Leiste
```css
.tab-row {
  overflow-x: auto; scrollbar-width: none;
  background: rgba(0,0,0,0.25); border-radius: 8px 8px 0 0;
}
.tab-btn {
  font-family: var(--body); font-weight: 700;
  border-bottom: 3px solid transparent;
  background: transparent; color: var(--ink-light); white-space: nowrap;
}
.tab-btn.active { color: var(--gold); border-bottom-color: var(--gold); }
```

### Mobile (<768px): Hamburger + Sidebar
```css
@media (max-width: 767px) {
  .tab-row { display: none; }
  #hamburger-btn { display: flex; }
}
.sidebar-nav-btn {
  padding: 14px 20px;
  font-family: var(--body); font-weight: 600; font-size: 15px;
  border-left: 3px solid transparent;
}
.sidebar-nav-btn.active { border-left-color: var(--gold); color: var(--gold); }
```

```javascript
var TABS = [
  { id: 'dashboard', icon: '⚔', label: 'Dashboard' },
  // ...
];

function openSidebar() {
  renderSidebarNav();
  document.getElementById('sidebar').style.transform = 'translateX(0)';
  document.getElementById('sidebar-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').style.transform = 'translateX(-100%)';
  document.getElementById('sidebar-overlay').style.display = 'none';
  document.body.style.overflow = '';
}
// Sidebar schließt automatisch nach Tab-Auswahl
function sidebarNav(tabId) { closeSidebar(); switchTabByName(tabId); }
```

---

## 9. Pflicht-Hilfsfunktionen

```javascript
function uid()     { return String(Date.now()) + String(Math.random()).slice(2,8); }
function today()   { return new Date().toISOString().split('T')[0]; } // YYYY-MM-DD
function todayDE() { return new Date().toLocaleDateString('de-DE'); }

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cleanUrl(url) {
  if (!url) return '';
  var m = url.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
  if (m) return m[1];
  return url.trim();
}

function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
```

---

## 10. PWA-Setup

### `<head>` Ergänzungen
```html
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#1a1a2e">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="App Name">
```

### Service-Worker-Registrierung (vor `</body>`)
```html
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').catch(function() {});
    // .catch() zwingend — 404 in Preview-Umgebungen ist erwartet, kein Bug
  });
}
</script>
```

### `manifest.json`
```json
{
  "name": "App Vollständiger Name",
  "short_name": "Kurzname",
  "description": "Kurzbeschreibung",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "orientation": "any",
  "icons": [{
    "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%231a1a2e'/><text y='68' x='50' text-anchor='middle' font-size='60' fill='%23ffb347'>⚔</text></svg>",
    "sizes": "any",
    "type": "image/svg+xml",
    "purpose": "any maskable"
  }]
}
```

### `sw.js` (Network First, Fallback Cache)
```javascript
const CACHE = 'appname-v1';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', function(e) {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(function(response) {
      var clone = response.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return response;
    }).catch(function() {
      return caches.match(e.request).then(c => c || caches.match('./index.html'));
    })
  );
});
```

---

## 11. Deployment

### GitHub Pages
1. Öffentliches Repository erstellen
2. `index.html` hochladen
3. Settings → Pages → Branch: main → Save
4. URL: `https://username.github.io/repo-name`

### Updates einspielen
Repository → `index.html` → Stift-Icon → Upload → Commit.  
GitHub Pages aktualisiert sich in 1–2 Minuten. **Daten bleiben im Gist unberührt.**

### Gist einrichten
1. Privates Gist auf gist.github.com (Inhalt: `{}`, Dateiname: `appname_data.json`)
2. Token auf github.com/settings/tokens → nur `gist`-Berechtigung
3. In App-Einstellungen: Token + Gist-ID eintragen → ⬆ Hochladen

---

## 12. Validierung & Debugging

### Häufige Bugs
| Bug | Ursache | Fix |
|---|---|---|
| `Illegal return statement` | `function esc(s) {` als str_replace-Anker → Kopf fehlt | Nach jedem Edit Funktionskopf prüfen |
| `switchTab is not defined` | Script lädt nicht (Syntax-Fehler vorher) | vm.Script validieren |
| `btn.classList` TypeError | `btn` ist undefined | `if (btn) btn.classList.add(...)` |
| Gist-GET `Failed to fetch` | `Cache-Control`-Header löst CORS-Preflight aus | Header-Helper verwenden, kein `Cache-Control` auf GET |
| Gist-PATCH schlägt fehl | `Content-Type` fehlt | `githubHeaders(token, true)` |
| `_lastExported`-Drift | zwei getrennte `Date()`-Aufrufe | einzigen `syncTs` verwenden |
| Gelöschte Objekte kommen zurück | kein Tombstone | `recordDeletion()` + `isDeleted()` |
| Gist unvollständig gelesen | GitHub truncated große Inhalte | `getFullGistFileText()` mit `raw_url` |
| CSS als Text angezeigt | `<style>`-Tag fehlt | nach Patch-Operationen prüfen |

---

## 13. Regeln (Nie / Immer)

### Nie
- Tokens/API-Keys in `S`, im Export oder im Gist speichern
- `Cache-Control` auf GitHub-GET-Requests setzen
- `GIST_FILE` und andere Keys inline mehrfach als String verstreuen — immer als Konstante
- `save()` in aktiven Sync-Pfaden nutzen, wenn nur lokal persistiert werden soll
- Zwei getrennte `Date()`-Aufrufe für `_lastExported` und `payload.exported`
- Gelöschte IDs ohne Tombstone entfernen
- Konfliktbehaftete Syncs still automatisch durchlaufen lassen
- ZIP-Overwrite ohne Dry-Run + Confirm anbieten
- Startup-Render vor abgeschlossenem Startup-Sync triggern
- `TODAY` beim Betrachten vergangener Tage blind überschreiben
- Neue State-Felder nur an einer einzigen Stelle hinzufügen

### Immer
- `githubHeaders(token, includeContentType)` zentral verwenden
- Bei PATCH/POST `Content-Type: application/json` setzen
- `updatedAt` bei relevanten Objektmutationen pflegen (`touchObj()`)
- `_syncInProgress`-Guard gegen Re-Entrancy nutzen
- `persistLocalOnly()` nach erfolgreichem Push aufrufen
- `gistTime` aus dem **entschlüsselten Payload** lesen, nie aus dem Envelope
- Bei Push-Fehlern `prevLastExported` exakt restaurieren (auch im `catch`)
- Vollständigen Gist-Text über `raw_url` holen wenn `truncated === true`
- `load()`/Defaults/Import/Merge/Export gemeinsam aktualisieren bei neuen State-Feldern
- Fehlermeldungen mit Schrittnummer im Alert ausgeben
- Service-Worker-Registrierung mit `.catch()` absichern
- JS-Syntax vor Deployment validieren

---

## 14. Checkliste neue App

### Technisches Fundament
- [ ] Alle localStorage-Keys App-spezifisch benannt (`appname_*`)
- [ ] `S` und `TODAY` klar getrennt
- [ ] `load()` setzt Defaults für alle Felder
- [ ] `save()` + `persistLocalOnly()` getrennt
- [ ] `_syncInProgress`-Guard implementiert
- [ ] `saveDebounced()` für Mikrointeraktionen
- [ ] `touchObj()` + `updatedAt` + Device-Meta an allen Mutationen
- [ ] `mergeById()` + app-spezifisches `mergeS()` / `mergeToday()`
- [ ] `deletedIds` / Tombstones integriert
- [ ] `pruneDeletedIds()` in `load()` eingehängt

### Gist-Sync
- [ ] `githubHeaders()` zentral vorhanden
- [ ] Gist-GET ohne `Cache-Control`
- [ ] PATCH/POST immer mit `Content-Type: application/json`
- [ ] `GIST_FILE` als Konstante, eindeutig pro App
- [ ] Token/ID in separaten localStorage-Keys
- [ ] Auto-Sync 30s Debounce
- [ ] Versionscheck vor Push mit Revert-Mechanismus
- [ ] `getFullGistFileText()` für Truncation
- [ ] Einziger `syncTs` pro Push (kein Drift)
- [ ] Merge über vier Schritte mit Fehlerprotokoll

### Verschlüsselung (falls aktiviert)
- [ ] AES-GCM + PBKDF2 integriert
- [ ] `format`-String und `SYNC_PASSPHRASE_KEY` App-spezifisch
- [ ] Freshness-Prüfung nach Entschlüsselung
- [ ] Export bleibt Klartext

### Design
- [ ] CSS-Variablen aus Sektion 6 übernommen
- [ ] Pixel-Schrift nur für Titel/Badges
- [ ] Hamburger-Menü für Mobile (<768px)
- [ ] Touch-Targets ≥ 44px
- [ ] Tab-Leiste horizontal scrollbar

### Export / Import
- [ ] JSON-Export ohne API-Keys, immer Klartext
- [ ] Merge-Import (neue IDs hinzufügen, bestehende schonen)
- [ ] ZIP-Import nur via Dry-Run + Confirm

### Deployment / PWA
- [ ] `manifest.json` mit App-spezifischem Icon und Namen
- [ ] `sw.js` mit App-spezifischem `CACHE`-Namen
- [ ] Service-Worker-Registrierung mit `.catch()`
- [ ] JS-Syntax vor Deployment validieren

---

## 15. Gelöste Probleme & Lektionen

| Problem | Ursache | Lösung |
|---|---|---|
| Reload-Flackern / Count-Sprung | lokaler Render vor abgeschlossenem Startup-Sync | `init()` async, `await gistSync()` vor erstem UI-Render |
| „Speicherfehler" beim Reload | unnötige Writes / Startup-Doppelpfade | `persistLocalOnly()`, sauberer Startup-Pfad |
| `_lastExported`-Drift | Push setzte Timestamp, persistierte ihn nicht lokal | `persistLocalOnly()` nach erfolgreichem `gistPush()` |
| Gelöschte Objekte kamen zurück | kein Löschprotokoll | `deletedIds` + Tombstones |
| GET `Failed to fetch` | `Cache-Control` löste CORS-Preflight aus | kein `Cache-Control` auf GitHub-GET |
| Gist-Datei unvollständig gelesen | GitHub truncated große Inhalte | `getFullGistFileText()` mit `raw_url` |
| Verschlüsselter Gist nicht lesbar | fehlende Passphrase | Entschlüsselungs-Guard + klare Fehlermeldung + kein Merge |
| Konflikte waren Black Box | keine Transparenz | Device-Meta, Sync-Log, Konflikt-Modal |
| Orphaned Collection Refs nach Merge | Cleanup lief nach Save | Cleanup vor Save ziehen |
| Geräte drifteten auseinander | keine Recovery-Schicht | ZIP-Backup + Dry-Run + Restore |
| Auto-Sync störend in Recovery | kein Schalter | `cfgAutoSyncEnabled` per Gerät |
| sw.js 404 in Preview | Vorschau-Umgebung hat keine sw.js | `.catch()` am Register, harmlos behandeln |
| `esc()` nach str_replace defekt | Funktionskopf als Anker verloren | nach jedem Edit Funktionskopf prüfen |

---

---

# ANHANG — Nachträgliche Ergänzungen

*Neue Erkenntnisse, Patterns und Korrekturen werden hier mit Datum ergänzt.  
Nach Akkumulation von ≥5 Einträgen oder nach 4–6 Wochen: Konsolidierung mit KI.*

---

<!-- EINTRAG-VORLAGE:
## YYYY-MM-DD — Kurztitel

**Bereich:** [Sync | Design | State | Deployment | Debug | Architektur | Sonstiges]

[Erkenntnis oder Pattern in 2–5 Sätzen. Warum wichtig, was hat sich geändert oder was wurde gelernt. Optional: Codebeispiel.]
-->

## 2026-04-09 — Dokument konsolidiert

**Bereich:** Architektur

Alle bestehenden Dokumente (KERIM APP SYSTEM v2.0, v2.1, Daily Log Prinzipiendokument v1.0, App System Referenz, PWA Single-File Referenz, GitHub Sync Best Practices, kerim-app-prinzipien) in dieses einzelne Masterdokument zusammengeführt. Redundanzen entfernt, neuester Stand aus jedem Dokument beibehalten. Das Prinzipiendokument vom 07.04.2026 ist aktuellste Quelle für Tombstones, Verschlüsselung und Sync-Guards.
