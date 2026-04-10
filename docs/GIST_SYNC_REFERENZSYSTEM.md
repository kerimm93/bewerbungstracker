# Gist-Sync Referenzsystem für Single-File-Apps

## Zweck dieses Dokuments

Dieses Dokument beschreibt ein **übertragbares, konfliktbewusstes und möglichst robustes GitHub-Gist-Sync-System** für Single-File-HTML-Apps.

Es ist bewusst **umfangreich und redundant** geschrieben. Es dient nicht nur als menschliche Referenz, sondern auch als **Maschinenkontext für KI-Systeme**, die bestehende Apps analysieren, erweitern, debuggen oder neue Apps nach demselben Muster bauen sollen.

Das Dokument soll verhindern, dass die Sync-Architektur bei jedem neuen Projekt erneut mühsam erarbeitet werden muss.

---

## Zielbild

Das Sync-System soll für persönliche Single-File-Apps folgende Eigenschaften haben:

- **vollständig clientseitig** funktionieren
- **ohne eigenes Backend** auskommen
- auf **GitHub Pages** hostbar sein
- lokal **offline-first** nutzbar bleiben
- Daten über ein privates **GitHub Gist** synchronisieren
- **bidirektional** arbeiten
- **Konflikte sichtbar** machen statt sie blind wegzumergen
- **Löschungen stabil** behandeln
- **neue und alte Geräte** kontrolliert zusammenführen
- **Mehrgeräte-Nutzung im Alltag** praktisch überstehen
- **PWA-Nutzung** tolerieren, ohne den Sync zu verfälschen
- bei Fehlern eher **konservativ** sein als aggressiv

Kurz gesagt:

> Der Sync soll lieber einmal zu oft nachfragen als still Daten verlieren.

---

# 1. Grundprinzipien

## 1.1 Architekturprinzip

Die App ist eine **Single-File-HTML-App**:

- eine einzige `index.html`
- kein Framework
- kein Build-Prozess
- kein Backend
- keine Serverdatenbank
- lokale Persistenz im Browser
- optionaler Cloud-Abgleich per Gist

Das Sync-System ist kein universelles verteiltes Datenbanksystem. Es ist ein **pragmatisches, konfliktbewusstes Merge-System für persönliche Apps**.

Es ist dafür optimiert:

- von KI verstanden zu werden
- leicht in andere Projekte kopiert zu werden
- minimalinvasiv erweitert zu werden
- mit kontrollierbarer Komplexität zu arbeiten

---

## 1.2 Leitmaximen

1. **Lokale Daten sind zuerst real.**
   Alles beginnt lokal. Der Gist ist nur Cloud-Spiegel, nicht die primäre Wahrheit.

2. **Der Gist ist Transport- und Abgleichsschicht, nicht Geschäftslogik.**
   Die eigentliche Anwendungslogik sitzt in der App, nicht im Gist.

3. **Kein stiller Datenverlust.**
   Wenn zwei Seiten denselben Eintrag unterschiedlich verändert haben, soll nicht blind überschrieben werden.

4. **Konflikte sind kein Fehler, sondern ein Kontrollpunkt.**
   Ein Konflikt-Modal ist besser als stilles Last-Write-Wins, wenn inhaltliche Arbeit verloren gehen könnte.

5. **Löschungen brauchen eigene Logik.**
   Einfaches Entfernen reicht in Mehrgeräte-Szenarien nicht.

6. **Persistenz und Sync dürfen nicht durcheinanderfließen.**
   Lokales Speichern und Cloud-Sync müssen klar getrennte Pfade haben.

7. **No-Op muss wirklich No-Op sein.**
   Wenn lokal und remote identisch sind, darf kein Push ausgelöst werden.

8. **PWA und Service Worker sind Auslieferungsschicht, nicht Datenlogik.**
   Sie dürfen den Sync nicht definieren, nur die App-Auslieferung beeinflussen.

---

# 2. Das mentale Modell

## 2.1 Die drei Wahrheiten

In der Praxis existieren drei Ebenen:

1. **Lokaler Laufzeit-State**
   - `S`
   - `TODAY`

2. **Lokale persistierte Kopie**
   - localStorage
   - optional IndexedDB

3. **Remote-Kopie im Gist**
   - JSON-Payload
   - optional verschlüsselt

Wichtig:

- Laufzeit-State und lokal persistierte Kopie sollten eng zusammenliegen
- der Gist darf zeitweise hinterherhinken
- ein älterer Gist ist nicht automatisch ein Problem
- problematisch wird es erst, wenn der Abgleich falsche Entscheidungen trifft

---

## 2.2 Der Sync ist kein Push oder Pull, sondern ein Entscheidungsprozess

Ein guter Sync besteht nicht nur aus „hole remote“ oder „schreibe remote“, sondern aus einer Kette von Entscheidungen:

1. Ist ein Sync überhaupt erlaubt?
2. Ist bereits ein Sync aktiv?
3. Ist lokal leer?
4. Ist remote leer?
5. Sind Zeitstempel identisch?
6. Gibt es echte Inhaltsunterschiede?
7. Gibt es Konflikte für dieselben IDs?
8. Muss gemergt werden?
9. Muss nur gepusht werden?
10. Muss nur gepullt werden?
11. Ist das Ergebnis inhaltlich identisch zu remote?
12. Muss der gemeinsame Stand zurückgeschrieben werden?

Das System steht oder fällt mit dieser Entscheidungslogik.

---

# 3. Zustandsmodell

## 3.1 Empfohlenes Basis-Schema

```javascript
var S = {
  days: [],
  futurelog: [],
  migrationPuffer: [],
  zettels: [],
  trash: { cards: [], objects: [] },
  deletedIds: {},
  collections: [],
  config: { name: '', context: '', contexts: [] },
  _lastExported: ''
};

var TODAY = {
  date: '',
  cards: [],
  objects: [],
  feedItems: [],
  reviewDone: false,
  plan: {
    intentionen: '',
    vermeiden: '',
    aufstehzeit: '05:00',
    ort: '',
    stundenplan: '',
    tasks: []
  }
};
```

Dieses Schema ist beispielhaft, aber das Grundmuster ist übertragbar:

- `S` = langfristiger persistenter State
- `TODAY` = aktiver Arbeitstag / aktuelle Session / aktueller Laufzustand

---

## 3.2 Pflichtfelder für syncbare Objekte

Jedes Objekt, das konfliktbewusst gesynct werden soll, sollte möglichst folgende Felder haben:

- `id`
- `createdAt`
- `updatedAt`
- `lastEditedByDeviceId`
- `lastEditedByDeviceName`

Optional je nach App:

- `status`
- `dismissed`
- `reviewNote`
- `collectionIds`
- `children`
- `parentId`
- `scheduledFor`
- `migratedTo`
- `sourceCardId`

### Warum diese Felder wichtig sind

- `id` bestimmt Objektidentität
- `createdAt` hilft beim Erstvergleich
- `updatedAt` ist das wichtigste Freshness-Signal pro Objekt
- Geräte-Metadaten helfen bei Konfliktanzeigen und Nachvollziehbarkeit

---

## 3.3 `_lastExported`

`S._lastExported` ist **kein Inhaltsfeld**, sondern ein **Freshness-Marker** für den zuletzt erfolgreich festgeschriebenen Gist-Stand.

Er dient dazu:

- Pull-/Skip-/Push-Entscheidungen zu beschleunigen
- identische oder bereits synchronisierte Stände zu erkennen
- Debugging lesbarer zu machen

Wichtig:

- `_lastExported` darf **nicht** mit inhaltlicher Änderung verwechselt werden
- für Inhaltsvergleiche sollte `_lastExported` neutralisiert werden
- Push und Payload sollten **denselben Sync-Zeitstempel** benutzen

---

# 4. Persistenz-Schichten

## 4.1 `save()` vs. `persistLocalOnly()`

Das ist einer der wichtigsten Punkte im gesamten System.

### `save()`

`save()` ist der normale Anwendungs-Persistenzpfad.

Es darf typischerweise:

- lokalen State persistieren
- `_lastExported` aktualisieren, wenn sinnvoll
- Auto-Sync triggern
- Raw-Backup-Auto-Sync triggern
- UI-Folgen auslösen

### `persistLocalOnly()`

`persistLocalOnly()` ist der **lokale Sicherungspfad ohne Sync-Nebenwirkungen**.

Es soll:

- nur lokal persistieren
- keinen Auto-Sync triggern
- keinen zusätzlichen Zustandslärm erzeugen

### Warum diese Trennung kritisch ist

Ohne diese Trennung passieren typische Fehler:

- Pull löst sofort wieder Push aus
- erfolgreicher Push verändert den State erneut unnötig
- `_lastExported` driftet
- Sync-Pfade triggern sich gegenseitig
- Start-Sync erzeugt irreführende Folgeänderungen

---

## 4.2 `_syncInProgress`

Ein expliziter Guard wie `_syncInProgress` ist Pflicht.

Er verhindert:

- Reentrancy
- doppelte Syncs
- Save-Trigger innerhalb laufender Syncs
- Auto-Sync während Merge/Pull/Push

Ohne diesen Guard wird ein Single-File-Sync schnell chaotisch.

---

# 5. Gist als Remote-Schicht

## 5.1 Warum Gist?

GitHub Gist ist in diesem System attraktiv, weil:

- kein Backend nötig ist
- private Gists reichen aus
- JSON-Datei einfach lesbar/schreibbar ist
- Versionierung grundsätzlich vorhanden ist
- GitHub Pages + Gist gut zusammenpassen

Aber:

- Gist ist keine Datenbank
- Gist ist nicht für feingranulare Mehrbenutzer-Transaktionen gedacht
- API-Latenz und Cache-Verhalten existieren
- der Remote-Stand kann zeitweise alt sein

Darum braucht die App ihre eigene Konflikt- und Merge-Intelligenz.

---

## 5.2 Empfohlenes Gist-Payload-Format

```json
{
  "version": 2,
  "exported": "2026-04-08T10:00:00.000Z",
  "S": { ... },
  "TODAY": { ... }
}
```

Optional kann dieses Payload verschlüsselt werden.

### Semantik

- `version` = Formatversion des Payloads
- `exported` = globaler Sync-Zeitstempel des geschriebenen Remote-Stands
- `S` = persistenter State
- `TODAY` = aktueller temporärer State

---

## 5.3 Was niemals in den Gist gehört

Nicht in `S` und nicht in den Gist gehören:

- GitHub-Token
- API-Keys
- Passwörter
- lokale Browser-spezifische Konfigurationsreste
- Debug-Caches, die nur für ein Gerät relevant sind

Credentials gehören in getrennte lokale Schlüssel.

---

# 6. Merge-Philosophie

## 6.1 Merge ist nicht gleich Konfliktauflösung

Ein Merge bedeutet zunächst nur:

> Beide Seiten werden zu einem gemeinsamen Zielstand zusammengesetzt.

Ein Konflikt bedeutet:

> Für dieselbe ID gibt es auf beiden Seiten relevante Unterschiede, die nicht still entschieden werden sollen.

Das System braucht daher beide Ebenen:

- **automatisches Merge** für unproblematische Fälle
- **manuelle Konfliktentscheidung** für riskante Fälle

---

## 6.2 Merge-Strategien nach Datentyp

### Arrays mit eigenständigen IDs

Beispiel:

- `cards`
- `objects`
- `futurelog`
- `zettels`

Empfohlen:

- Union per ID
- neueres `updatedAt` gewinnt nur dann automatisch, wenn kein Konfliktfall vorliegt
- tombstoned IDs nie resurrecten

### Tagescontainer `S.days`

Empfohlen:

- pro Datum zusammenführen
- innerhalb eines Tages wieder per ID mergen
- `reviewDone` / `closedAt` per konservativer Regel zusammenführen

### `TODAY`

Sonderfall, weil aktiv und zeitnah.

Empfohlen:

- nie blind von leerem remote überschreiben lassen
- lokale aktivere Version schützen
- trotzdem konfliktfähig halten

### Konfigurationsfelder

Beispiel:

- `config`

Oft sinnvoll:

- lokal gewinnt
- oder app-spezifische Priorität

---

## 6.3 Deterministische Sortierung

Ein Merge ohne nachträgliche Sortierung kann zu abweichender Reihenfolge auf Geräten führen.

Das ist **nicht automatisch ein Datenverlustproblem**, aber ein UX-Thema.

Wenn Reihenfolge wichtig ist, sollte nach dem Merge eine feste Sortierung angewendet werden, z. B. nach:

- `createdAt`
- Zeitfeld
- Datum + Zeit
- explizitem Sortierindex

Wenn Reihenfolge nicht kritisch ist, kann man das vorerst ignorieren.

---

# 7. Konflikterkennung

## 7.1 Wann liegt ein Konflikt vor?

Ein Konflikt liegt vor, wenn:

- lokal und remote **dieselbe ID** enthalten
- beide Seiten materielle Unterschiede haben
- und diese Unterschiede nicht blind per Timestamp entschieden werden sollen

Typische Konfliktkategorien:

- Status
- Collection-Zuweisung
- Kinder / Hierarchie
- Textinhalt
- Planung / Terminierung
- Geräte-Metadaten als Begleitinformation

---

## 7.2 Was kein Konflikt sein muss

Nicht alles, was abweicht, ist automatisch konfliktwürdig.

Beispiele:

- reiner `_lastExported`-Unterschied
- leerer Remote vs. vorhandener Lokalstand
- bloße Reihenfolge in einem Array, wenn Reihenfolge semantisch egal ist
- Geräte-Metadaten allein, wenn kein anderer inhaltlicher Unterschied vorliegt

---

## 7.3 Konflikt-Modal als Sicherheitsventil

Das Konflikt-Modal ist kein Zeichen für kaputten Sync, sondern ein Schutzmechanismus.

Es ist besonders wertvoll bei:

- nachträglicher Altlast-Bearbeitung
- mehreren Geräten mit altem Datenbestand
- paralleler Objektbearbeitung
- Einführung neuer Metadaten in vorhandene Objekte

### UX-Nachteil

Bei sehr vielen Altlast-Konflikten ist es mühsam, jeden Konflikt einzeln zu wählen.

### Implementierter UX-Fix: Bulk-Vorauswahl

Das System unterstützt eine **Bulk-Vorauswahl im Konflikt-Modal**:

- „Alle auf lokal“
- „Alle auf remote“

**Wichtig (Verhaltensgarantien):**

- Die Buttons setzen **nur die Vorauswahl** der bestehenden Radio-Inputs pro Konflikt.
- Es erfolgt **keine sofortige Übernahme** und **kein Speichern**.
- Einzelne Konflikte können danach **manuell überschrieben** werden.
- Erst der Button **„Auswahl anwenden“** bestätigt die Entscheidungen und erzeugt die `resolutions`.

**Implementationshinweis (minimal-invasiv):**

- Funktion `presetSyncConflicts(choice)` setzt den `checked`-Status der Radio-Inputs (`local`/`remote`).
- Bestehende Logik in `confirmSyncConflicts()` bleibt unverändert und ist der **einzige Commit-Punkt**.

**Nutzen:**

- drastische Reduktion von Friktion bei Massenkonflikten (z. B. Altlast-Migration)
- kein Risiko für Datenintegrität, da keine Auto-Resolution

**Optionaler weiterer UX-Fix (später):**

- Bulk-Vorauswahl als Sticky-Leiste bei langen Listen
- Hinweistext: „setzt nur die Vorauswahl, bestätigt noch nichts“

Nicht als sofortige Auto-Bestätigung, sondern als **Vorauswahlhilfe**.

---

# 8. Geräte-Metadaten

## 8.1 Warum Geräte-Metadaten wichtig sind

Geräte-Metadaten machen Konflikte lesbarer:

- Wo wurde zuletzt bearbeitet?
- Ist das ein Altobjekt ohne Herkunft?
- Ist das die Laptop-Version oder die Mobile-Version?

Ohne diese Felder sind Konfliktmodals deutlich weniger interpretierbar.

---

## 8.2 Warum Altlast-Konflikte plötzlich massenhaft erscheinen können

Wenn alte Objekte ursprünglich **keine** Geräte-Metadaten hatten und neue Bearbeitungen jetzt welche stempeln, dann entstehen plötzlich viele Konflikte mit Mustern wie:

- lokal: `Unbekannt`
- remote: `Laptop`

Das ist oft **kein Zeichen für neuen Bug**, sondern für ein einmaliges Nachziehen eines modernisierten Datenmodells.

### Konsequenz

Große Konfliktmengen können bei Altlast-Migrationswellen einmalig auftreten, sollten aber später deutlich seltener werden.

---

# 9. Tombstones und Löschungen

## 9.1 Das Grundproblem

Wenn ein Objekt lokal gelöscht und remote noch vorhanden ist, dann passiert ohne Tombstone oft:

- nächster Merge resurrectet das gelöschte Objekt

Das ist ein klassischer Resurrection-Bug.

---

## 9.2 Lösung: `deletedIds`

```javascript
S.deletedIds = {
  "obj_123": "2026-04-08T10:00:00.000Z"
}
```

Beim Löschen:

1. ID in `deletedIds` aufnehmen
2. Objekt aus aktiven Arrays entfernen
3. Merge-Funktionen müssen tombstoned IDs filtern

### Vorteile

- Löschungen sind sync-stabil
- gelöschte Elemente kehren nicht einfach zurück
- Mehrgeräte-Szenarien bleiben kontrollierbar

### Restore

Beim Restore muss der Tombstone wieder entfernt werden.

---

# 10. Freshness-Logik

## 10.1 Drei Ebenen von Frische

1. **globaler Sync-Zeitstempel**
   - `S._lastExported`
   - `payload.exported`

2. **objektbezogene Frische**
   - `updatedAt`
   - `createdAt`

3. **inhaltliche Gleichheit**
   - Snapshot-Vergleich ohne reine Meta-Felder

Ein gutes System nutzt **alle drei**, aber verwechselt sie nicht.

---

## 10.2 Der häufigste Denkfehler

Der häufigste Fehler ist:

> zu prüfen, ob der Merge den lokalen Stand verändert hat,
> statt zu prüfen, ob der gemergte Zielstand vom aktuellen Remote-Stand abweicht.

Genau daraus entstehen falsche `skip`-Fälle.

### Richtige Frage

Nicht:

- „Hat remote lokal verändert?“

Sondern:

- „Ist der gemeinsame Zielstand bereits identisch mit remote?“

Nur wenn ja, darf `skip` kommen.

---

## 10.3 Der entscheidende Patch-Gedanke

Für bidirektionalen Alltagssync braucht man typischerweise zwei Prüfgrößen:

- `didChange`
  - Hat der Merge lokal überhaupt etwas verändert?

- `needsPush`
  - Weicht der gemergte Zielstand inhaltlich vom aktuellen Remote-Stand ab?

Und die Push-Bedingung ist dann sinngemäß:

```javascript
if (didChange || needsPush) {
  // pushen
} else {
  // skip
}
```

Das ist der Kern, der den Alltagssync von einem bloßen Pull-Merge zu einem echten bidirektionalen Sync macht.

---

# 11. `gistSync()` als Orchestrator

## 11.1 Aufgaben von `gistSync()`

`gistSync()` ist die zentrale Entscheidungsfunktion.

Sie sollte mindestens:

1. Guard prüfen (`_syncInProgress`)
2. Tokens/Gist-ID prüfen
3. Remote laden
4. Remote-JSON lesen / entschlüsseln
5. Timestamps lesen
6. Schnell-Entscheidungen treffen, wenn sinnvoll
7. lokale und remote Snapshots erzeugen
8. Konflikte erkennen
9. gemergten Zielstand berechnen
10. Konfliktentscheidungen anwenden
11. lokale Laufzeitzustände ersetzen
12. lokale Persistenz sauber aktualisieren
13. nur bei Bedarf pushen
14. Status / Logs schreiben

---

## 11.2 `gistPush()`

`gistPush()` sollte:

- einen **einzigen gemeinsamen Sync-Zeitstempel** erzeugen
- `S._lastExported` und `payload.exported` mit genau diesem Wert befüllen
- den Remote-Payload schreiben
- bei Erfolg lokal per `persistLocalOnly()` festziehen
- bei Fehler `prevLastExported` exakt zurücksetzen

---

## 11.3 `gistPull()`

`gistPull()` darf ruhig einfacher sein als `gistSync()`, sollte aber:

- remote laden
- JSON lesen
- Freshness prüfen
- lokal nur überschreiben, wenn sinnvoll oder ausdrücklich gewünscht
- keine Auto-Sync-Schleife auslösen

---

# 12. No-Op und Skip

## 12.1 Was ein echter No-Op ist

Ein echter No-Op liegt vor, wenn:

- lokal und remote inhaltlich identisch sind
- oder der gemeinsame Merge-Zielstand identisch mit remote ist
- und keine Konflikte offen sind

Dann gilt:

- kein Push
- `skip`
- möglichst klare Diagnosemeldung

---

## 12.2 Gute No-Op-Meldungen

Hilfreiche Formulierungen:

- `Sync ohne Änderungen`
- `Kein inhaltlicher Unterschied nach Merge`
- `Zeitstempel identisch`
- `Identischer Stand`

### UX-Hinweis

Statusfelder sollten semantisch sauber sein.

Wenn derselbe Pfad sowohl „echter Merge“ als auch „remote war nur hinterher“ abbildet, werden Labels schnell missverständlich.

---

# 13. PWA, Manifest und Service Worker

## 13.1 Was das Manifest macht

Das Manifest steuert:

- Name
- Start-URL
- Farben
- Display-Modus
- Icon

Es ist **nicht Teil der Sync-Entscheidungslogik**.

---

## 13.2 Was der Service Worker beeinflusst

Der Service Worker beeinflusst:

- App-Auslieferung
- Cache
- Offline-Verhalten
- installierte PWA vs. normaler Browser-Tab

Er sollte **nicht** die Gist-Logik selbst steuern.

### Typische Gefahr

- alter App-Code aus Cache
- installierte PWA läuft anders als normaler Browser-Tab
- Entwickler glaubt an neuen Sync-Bug, obwohl nur eine alte Shell geladen wurde

---

## 13.3 Debug-Regel bei PWA-Verdacht

Wenn gehostete PWA und lokal geöffnete HTML unterschiedlich wirken:

1. Service Worker unregister
2. Site Data löschen
3. Hard Reload
4. normal im Browser testen
5. erst danach PWA erneut installieren

So trennt man Auslieferungsproblem von Datenproblem.

---

# 14. Typische Fehlerklassen

## 14.1 Harmlos / beobachtbar

- Reihenfolge von Karten variiert nach Merge
- Statuswort „merged“ wirkt semantisch zu breit
- Konsolenwarnung zu veralteten Meta-Tags
- CDN-/Tracking-Warnung für JSZip
- No-Op erst nach einer letzten Konvergenzrunde

## 14.2 Mittel / später verbessern

- Konflikt-Modal ohne Bulk-Vorauswahl
- Diagnosefelder nicht immer mit bestem Endstatus synchron
- unnötige Folge-Pushes nach Konvergenz
- Sortierung nicht deterministisch

## 14.3 Red Flags

- Karten verschwinden
- Karten duplizieren sich systematisch
- gleiche Daten führen dauerhaft zu Merge + Push ohne Ende
- Löschungen resurrecten
- heutiger Stand wird durch leeren Remote überschrieben
- vergangene Tage verlieren Inhalte
- Import/Load verwechselt Wrapper- und State-Format

---

# 15. Testprotokolle

## 15.1 Pflicht-Tests für jede neue App mit Gist-Sync

### Test A: Lokal neuer als remote

1. Gerät A: neuen Eintrag anlegen
2. A syncen
3. Gerät B syncen
4. Eintrag erscheint auf B

### Test B: Remote neuer als lokal

1. Gerät B: neuen Eintrag anlegen
2. B syncen
3. Gerät A syncen
4. Eintrag erscheint auf A

### Test C: Beide Seiten unterschiedlich geändert

1. A ändert Objekt X
2. B ändert Objekt Y
3. A sync
4. B sync
5. A ggf. nochmal sync
6. gemeinsamer Stand vorhanden

### Test D: Echter No-Op

1. nichts ändern
2. A sync
3. B sync
4. `skip`

### Test E: Frischer Gist

1. neuer leerer Gist
2. Gerät 1 schreibt ersten Stand
3. Gerät 2 lädt daraus
4. No-Op prüfen

### Test F: PWA gegen Browser

1. Browser-Tab testen
2. installierte PWA testen
3. beide müssen denselben Sync-Kern zeigen

### Test G: Altlast-Migration

1. viele alte Objekte bearbeiten
2. Konflikt-Modal prüfen
3. nach erster Bereinigung sollte Konfliktlast sinken

---

# 16. UX-Leitlinien

## 16.1 Was Nutzer sofort verstehen sollten

- Warum wird geskippt?
- Warum wird gepusht?
- Warum wurde ein Konflikt geöffnet?
- Ist remote leer?
- Ist lokal neuer?
- Ist das ein echter Fehler oder nur ein normaler Schutzmechanismus?

## 16.2 Gute Diagnostikfelder

- Gerät
- Device ID
- Auto-Sync an/aus
- lokales `_lastExported`
- letzter Remote-Zeitstempel
- letzter Sync-Status
- letzter Versuch
- kleine Status-Zusammenfassung
- Event-Historie

## 16.3 Später sinnvolle Verbesserungen

- feinere Statusbegriffe in der Diagnostik:
  - `merged`
  - `pulled`
  - `remote aktualisiert`
  - `skipped`
- besserer Hinweis, wenn nur Geräte-Metadaten alt waren
- optionale deterministische Sortierung nach Merge
- optionale Reduktion unnötiger Folge-Pushes
- Konsistenzprüfung für Diagnostik-Felder

---

## 16.4 Bereits umgesetzt: Bulk-Konflikt-Vorauswahl

- Buttons im Konflikt-Modal:
  - „Alle auf lokal“
  - „Alle auf remote“
- Verhalten: setzt nur Vorauswahl, bestätigt nichts
- Commit-Punkt bleibt „Auswahl anwenden“
- Einzelne Ausnahmen bleiben manuell änderbar

**Testplan:**

1. Konflikt-Modal mit vielen Einträgen öffnen
2. „Alle auf remote“ klicken → alle Radios springen auf remote
3. einzelne Einträge auf lokal zurückstellen
4. „Auswahl anwenden“ → nur dann Übernahme
5. Gegenprobe mit „Alle auf lokal“

---

# 17. Übertragbarer Baukasten für andere Projekte

## 17.1 Was fast immer kopierbar ist

- `githubHeaders(...)`
- `gistPayload(...)`
- `persistLocalOnly()`
- `save()` mit Guard-Logik
- `_syncInProgress`
- `gistPush()`-Pattern
- `gistPull()`-Grundstruktur
- `gistSync()`-Orchestrator
- `mergeById(...)`
- Tombstone-System
- Geräte-Metadaten-Stempelung
- Konflikt-Modal-Grundidee (inkl. Bulk-Vorauswahl)
- Diagnostik-Log

## 17.2 Was pro App angepasst werden muss

- State-Struktur
- Merge-Regeln für app-spezifische Felder
- Priorität von `TODAY`
- Sortierregeln
- Konfliktkategorien
- UI-Texte
- welche Arrays per ID, Datum oder Container gemergt werden

---

# 18. Implementierungs-Checkliste für neue Projekte

## Vor dem ersten Commit

- [ ] `S` und `TODAY` sauber getrennt
- [ ] Pflichtfelder pro Objekt vorhanden
- [ ] `persistLocalOnly()` vorhanden
- [ ] `save()` triggert nicht blind in Sync-Pfaden
- [ ] `_syncInProgress` vorhanden
- [ ] `gistPush()` mit gemeinsamem Sync-Timestamp
- [ ] `gistPull()` ohne aggressive Nebenwirkungen
- [ ] `gistSync()` unterscheidet `didChange` und `needsPush`
- [ ] Tombstones implementiert
- [ ] Konflikt-Modal vorhanden
- [ ] **Bulk-Vorauswahl im Konflikt-Modal vorhanden**
- [ ] Diagnostik vorhanden
- [ ] Service Worker stört Sync nicht
- [ ] No-Op-Test erfolgreich

---

# 19. Anti-Patterns

## Niemals

- Tokens in `S` speichern
- Tokens im Gist speichern
- `save()` überall blind in Sync-Pfaden aufrufen
- `_lastExported` als Inhaltsunterschied behandeln
- Push nur davon abhängig machen, ob sich lokal etwas geändert hat
- gelöschte IDs ohne Tombstones behandeln
- remote leeren Zustand über aktiven lokalen Zustand kippen
- Konflikte still verschlucken
- **Bulk-Auswahl automatisch bestätigen (kein Auto-Commit!)**
- Reihenfolge mit Objektidentität verwechseln
- Cache-/PWA-Phänomene als Datenlogik missdiagnostizieren

---

# 20. Praxisregeln für den Alltag

## 20.1 Bei großen Altlast-Wellen

- möglichst auf einem Hauptgerät bündeln
- erst danach auf das andere Gerät synchronisieren
- Konflikt-Modal bewusst durchgehen
- **Bulk-Vorauswahl nutzen, dann Ausnahmen anpassen**
- mit größerer Konfliktmenge rechnen

## 20.2 Bei normaler Nutzung

- neue Aufgaben auf einem Gerät anlegen ist unproblematisch
- echte Parallelbearbeitung desselben Objekts auf mehreren Geräten erhöht Konfliktwahrscheinlichkeit
- Reihenfolge ist nicht automatisch kritisch
- sichtbare Gleichheit + korrekter No-Op ist wichtiger als perfektes Diagnose-Wording

## 20.3 Wann man eingreifen sollte

- bei fehlenden oder doppelten Daten
- bei Resurrection-Bugs
- bei endlosen Merge-Push-Schleifen
- bei PWA/Browser-Divergenz nach Clean Reload

---

# 21. Empfohlene Dokumentenstruktur für KI-Übergaben

Wenn dieses Sync-System an eine KI gegeben wird, sollte der Kontext idealerweise in drei Ebenen übergeben werden:

## Ebene A – Kurzkontext

- App ist Single-File-HTML-App
- lokal first
- Gist als Cloud-Spiegel
- konfliktbewusster bidirektionaler Sync
- keine Frameworks
- kein Rewrite

## Ebene B – Technische Grundregeln

- `S` + `TODAY`
- `save()` vs. `persistLocalOnly()`
- `_syncInProgress`
- Tombstones
- Geräte-Metadaten
- `didChange` + `needsPush`

## Ebene C – Vollreferenz

Dieses Dokument.

---

# 22. Empfohlene nächste Ausbaustufen

Diese Punkte sind sinnvoll, aber nicht nötig, um das System als stabil zu betrachten:

1. feinere Statusbegriffe in der Diagnostik
2. optionale deterministische Sortierung nach Merge
3. optionale Reduktion unnötiger Folge-Pushes
4. Konsistenzprüfung für Diagnostik-Felder
5. dokumentierte Recovery-Prozedur für frischen Gist + Backup-Wiederaufbau

---

# 23. Schlussfolgerung

Der eigentliche Wert dieses Systems liegt nicht nur darin, dass ein einzelner Sync-Bug behoben wurde.

Der eigentliche Wert liegt darin, dass aus harter Debug-Arbeit ein **tragfähiges Muster** entstanden ist:

- konfliktbewusst
- lokal first
- mehrgerätefähig
- ohne Backend
- KI-kompatibel
- modular übertragbar

Dieses Sync-System ist deshalb nicht nur ein Daily-Log-Fix, sondern ein **allgemeines Infrastrukturbauteil** für zukünftige Single-File-Apps.

Wenn es konsequent übernommen wird, spart es bei neuen Projekten sehr viel Zeit, Frust und erneute Fehlersuche.

---

# 24. Kurzfassung in einem Satz

> Verwende GitHub Gist in Single-File-Apps nicht als blinden Cloud-Speicher, sondern als Remote-Spiegel eines lokal geführten, konfliktbewussten Systems mit klarer Trennung von Persistenz, Merge, Konfliktauflösung, Tombstones und No-Op-Logik.

