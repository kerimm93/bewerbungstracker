# Bewerbungs-Tracker

Eine Single-File-HTML-App für die strukturierte Bearbeitung von Bewerbungen — mit Quest-System, Research-Intake, Baustein-Speicher, Markdown-Export, finaler Anschreiben-Fassung, lokalem Dokumenten-Template-System und optionalem GitHub-Gist-Sync.

---

## Status

Aktueller Stand:
- Single-File-App (`index.html`)
- lokaler App-State via `localStorage`
- optionaler GitHub-Gist-Sync
- Quest-basierter Bewerbungs-Workflow
- strukturierter Research- und Import-Flow
- Baustein-Speicher für Anschreiben
- Markdown-Vorschau für Anschreiben
- editierbare finale Anschreiben-Fassung pro Quest
- lokales Template-System für Anschreiben + Lebenslauf
- kombinierter Druck-/PDF-Flow mit Anschreiben auf Seite 1 und Lebenslauf auf Seite 2
- mobile Bottom Action Bar für schnelles Weiterarbeiten unterwegs

---

## Leitprinzipien

- **Single-File beibehalten**
- **kein unnötiger Rewrite**
- **minimal-invasive Patches**
- **Fokus auf echten Workflow-Nutzen**
- **Sync-Stabilität mitdenken**
- **Änderungen sauber dokumentieren**

---

## Kernidee

Die App verbindet zwei Ebenen:

1. **Bewerbungsdatenbank**
   - Firmen, Kontakte, Regionen, Status, Notizen

2. **Quest-System**
   - Jede Firma kann als strukturierter Bearbeitungsprozess durchlaufen werden
   - Recherche, Eignungsprüfung, Kontaktdaten, Anschreiben, Export und Versand werden in klaren Schritten bearbeitet

Ziel ist nicht nur Datenspeicherung, sondern ein real nutzbarer Workflow für echte Bewerbungsarbeit.

---

## Features

### 1. Quest-System
Jede Bewerbung wird als „Quest“ bearbeitet.

Enthalten sind:
- Schritt-für-Schritt-Workflow pro Firma
- Wiedereinstieg in offene Schritte
- Schrittstatus pro Quest
- Fortschrittslogik
- Navigation zur nächsten sinnvollen offenen Quest
- Quest-Detailansicht mit gesammelten Daten und Arbeitsbereichen

---

### 2. Firmen-Datenbank
Die App enthält eine zentrale Datenbank für Bewerbungen.

Enthalten sind:
- Firmenname
- Region
- Status
- Ansprechpartner
- Anrede
- E-Mail
- Adresse
- firmenspezifischer Satz
- Stichpunkte / Notizen / Eignungsurteil
- Bewerbungsdatum

Zusätzlich:
- Suchfeld
- Statusfilter
- Regionsfilter
- CSV-Export

---

### 3. Karten- / Regionenansicht
Es gibt eine Kartenansicht mit Regionen und firmenspezifischer Zuordnung.

Ziel:
- geografischer Überblick
- regionale Cluster
- schnelles Navigieren zwischen offenen Firmen

---

### 4. Research-Workflow
Die App unterstützt zwei Research-Wege:

#### A. Direkter Research-Intake
Für:
- Deep-Research-Ergebnisse
- Firmenlisten
- rohe Textsammlungen
- JSON-Importdaten

Funktionen:
- Rohdaten einfügen
- analysieren
- bekannte Firmen erkennen
- neue Firmen automatisch anlegen
- Import-Zusammenfassung anzeigen

#### B. Klassischer Bereinigungs-Flow
Für einen manuellen Zwischenschritt mit ChatGPT:

1. Research-Ergebnis einfügen
2. Bereinigungsprompt generieren
3. JSON-Antwort zurück in die App einfügen
4. in Datenbank importieren

---

### 5. Kontaktdaten-Sicherheit
Der Kontaktdaten-Step wurde defensiver gebaut.

Ziel:
- keine halluzinierten E-Mail-Adressen oder Ansprechpartner durch suggestive JSON-Beispielwerte
- unklare Felder sollen leer bleiben
- sicherer Umgang mit unvollständigen Rohdaten

---

### 6. Anschreiben-Prüfung (Step 5)
Für den Schritt „Anschreiben prüfen“ gibt es eine sichtbare Prüflogik.

Enthalten:
- Status-Badge:
  - `⚠ Korrekturbedarf`
  - `✅ Versandbereit`
- sichtbares Prüfergebnis im Quest
- Überarbeitungshinweise im Markdown-Export

Dadurch ist der Prüfstatus nicht mehr nur implizit, sondern direkt im Workflow sichtbar.

---

### 7. Baustein-Speicher
Im Quest-Detail gibt es einen ausklappbaren Baustein-Speicher für das Anschreiben.

Bausteine:
- Ansprechpartner
- Adressblock
- Motivationssatz
- Skill-Match
- Firmenbezug
- sonstige Notizen

Ziel:
- unterwegs kleine Anschreiben-Bausteine vorbereiten
- am PC daraus schneller ein sauberes Anschreiben zusammensetzen
- Fortschritt pro Feld sichtbar machen

---

### 8. Markdown-Vorschau für Anschreiben
Aus den gespeicherten Bausteinen kann eine Markdown-Vorschau generiert werden.

Enthalten:
- Adressblock
- Anrede
- Anschreibenkörper
- ggf. Prüfergebnis / Überarbeitungshinweise

Ziel:
- schneller Rohentwurf
- Copy-Paste in andere Systeme
- saubere Zwischenfassung vor finalem Dokument

---

### 9. Finale Anschreiben-Fassung
Zusätzlich zur Markdown-Vorschau gibt es eine editierbare Endfassung für das Anschreiben.

Bearbeitbare Felder:
- Datum
- Adressblock
- Anredezeile
- firmenspezifischer Satz

Eigenschaften:
- pro Quest speicherbar
- aus vorhandenen Daten vorbefüllbar
- manuell überschreibbar
- bewusste Leerwerte bleiben erhalten
- Reset auf Vorschlagswerte möglich

Ziel:
- letzte Korrekturen kurz vor dem Druck
- kein Umweg über eine separate Code-Anpassung

---

### 10. PDF-/Print-Flow
Die App kann aus der finalen Anschreiben-Fassung eine Druckansicht öffnen.

Aktuell gibt es zwei Wege:

#### A. Fallback-Druckansicht
Wenn keine lokalen Templates geladen sind:
- nutzt die App eine eingebaute HTML-Druckansicht

#### B. Lokale Dokumenten-Templates
Wenn Templates geladen sind:
- wird das lokale Anschreiben-Template benutzt
- direkt danach der lokale Lebenslauf
- zwischen beiden liegt ein Seitenumbruch
- Browser-Printdialog dient als PDF-Weg

Ziel:
- echter dokumentennaher Output
- keine Codeänderung bei CV-Änderungen
- Anschreiben und Lebenslauf direkt in einem Drucklauf kombinieren

---

### 11. Lokales Dokumenten-Template-System
In den Einstellungen können lokale Templates geladen werden.

Unterstützt:
- Template-Dateien auswählen
- optional Ordnerauswahl (falls Browser unterstützt)
- Anschreiben-Template
- Lebenslauf-Template
- lokale Assets wie Bewerbungsfoto oder Unterschrift
- Statusanzeige für geladene Templates
- kopierbarer Claude-Prompt zur Erstellung eigener Templates

Ziel:
- App von fest eingebautem Dokument-HTML entkoppeln
- spätere Änderungen an CV/Anschreiben außerhalb des App-Codes ermöglichen
- auch für andere Bewerbungsprofile flexibel bleiben

---

### 12. Mobile Workflow-Optimierungen
Im Quest-Detail gibt es eine mobile Bottom Action Bar.

Enthalten:
- Prompt kopieren
- Ergebnis speichern
- direkt zum nächsten sinnvollen Schritt springen

Ziel:
- mobile Nutzung beschleunigen
- weniger Scroll- und Klickaufwand auf kleinen Displays

---

### 13. GitHub-Gist-Sync
Optionaler Sync über GitHub Gist.

Enthalten:
- Token + Gist-ID nur lokal im Browser gespeichert
- Push
- Pull
- Merge
- Auto-Sync mit Debounce
- Sync-Statusanzeige
- Start-Sync / Merge-Verhalten statt blindem Überschreiben

Ziel:
- Daten zwischen Geräten synchron halten
- lokale Arbeit absichern
- Merge-Konflikte entschärfen

---

### 14. Backup / Import / Export
Enthalten:
- vollständiger JSON-Export
- JSON-Import
- CSV-Export
- Tokens werden nicht exportiert

Ziel:
- Backups
- Wiederherstellung
- Weiterverarbeitung in Tabellen

---

### 15. Tracking-Log
Zusätzlicher Bereich für tab-getrennte Bewerbungs-Tracking-Ausgabe.

Ziel:
- externe Bewerbungslisten
- Reporting
- schnelle Copy-Paste-Ausgabe

---

## Datenmodell

### Globaler State
Die App nutzt einen zentralen State mit:
- Firmen
- Regionen
- Konfiguration
- Löschmarkierungen
- letztem Export-/Sync-Zeitpunkt

### Quest-State pro Firma
Ein Quest enthält u. a.:
- erledigte Schritte
- Rückgaben / Prompts
- extrahierte Daten
- rohe und normalisierte Returns
- Kontaktdaten
- Prüfergebnis
- Verdict
- Schrittstatus
- Bausteine
- `pdfDraft` für die finale Anschreiben-Fassung

### `pdfDraft`
Die finale Anschreiben-Fassung speichert:
- `datum`
- `adressblock`
- `anredezeile`
- `firmenspezifischerSatz`

Zusätzlich:
- `_set`-Logik, damit bewusst geleerte Felder beim Rendern oder Merge nicht wieder ungewollt befüllt werden

---

## Bekannte Stärken

- sehr schneller Single-File-Workflow
- klarer Quest-Fokus statt bloßer Datensammlung
- sinnvoller Übergang von Recherche → Anschreiben → Druck
- vorbereitende Bausteinlogik für mobiles und PC-basiertes Arbeiten
- lokale Templates reduzieren spätere Codeänderungen
- Sync ist bewusst mit Merge-Logik gedacht, nicht nur als stumpfer Push/Pull

---

## Bekannte Grenzen

- lokales Template-System ist laufzeitbasiert und nicht dauerhaft im eigentlichen App-State gespeichert
- Template-/Asset-Verarbeitung ist bewusst pragmatisch gehalten
- der Browser-Printdialog ist der PDF-Weg, keine separate PDF-Library
- für maximale Flexibilität sollten Lebenslauf-Templates saubere Platzhalter wie `{{DATUM}}` bzw. `{{ORT_DATUM}}` enthalten
- sehr exotische CSS-Konstrukte in Templates können trotz Scoping aufwendiger sein

---

## Zuletzt umgesetzt

### Anschreiben- und Review-Workflow
- sichtbarer Prüfbadge für „Anschreiben prüfen“
- Prüfergebnis im Quest sichtbarer gemacht
- Überarbeitungshinweise in Markdown-Export eingebaut

### Kontaktdaten-Sicherheit
- JSON-Beispielwerte im Kontaktdaten-Prompt entschärft
- leere Strings statt suggestiver Platzhalter

### Finale Anschreiben-Fassung
- editierbare Endfassung pro Quest
- Vorbefüllung mit Fallback-Logik
- bewusste Leerwerte bleiben erhalten
- Merge-Verhalten für `pdfDraft` abgesichert

### Lokale Dokumenten-Templates
- Anschreiben + Lebenslauf lokal ladbar
- kombinierter Print-Flow
- Asset-Rewrite für lokale Bilddateien
- Claude-Prompt zum Erstellen eigener Templates
- CSS-Scoping für getrennte Template-Wirkung im gemeinsamen Druckdokument

---

## Nächste sinnvolle Schritte

### 1. README / Dokumentation weiter schärfen
- konkretes Nutzerbeispiel ergänzen
- Template-System mit erwartetem Platzhalter-Schema dokumentieren

### 2. Template-System härten
- optional bessere Auswahl bei mehreren HTML-Kandidaten
- optional Unterstützung für weitere Dokumenttypen
- ggf. spätere Behandlung lokaler CSS-`url(...)`-Assets

### 3. Vorschau verbessern
- In-App-Vorschau optional näher an das echte geladene Template bringen
- sichtbare Kennzeichnung, wenn lokales Template aktiv ist

### 4. Flexibilität für andere Bewerbungsprofile
- weniger implizite FIAE-Voreinstellungen im Standardtext
- mehrere Dokumentenprofile / Bewerbungsprofile vorbereiten

### 5. Qualitätssicherung
- gezielte Tests für:
  - bewusste Leerwerte im `pdfDraft`
  - Template-Laden
  - Asset-Zuordnung
  - kombinierte Druckansicht
  - Sync-/Merge-Verhalten bei paralleler Bearbeitung

---

## Technische Ausrichtung

- Vanilla HTML / CSS / JS
- keine externen Frameworks
- Single-File-first
- lokaler State + optionaler Gist-Sync
- pragmatische, workflow-orientierte Weiterentwicklung
- kleine, patchbare Änderungen statt großer Umbauten

---

## Entwicklungsmodus

Empfohlener Stil für weitere Arbeit:
- minimal-invasive Patches
- kein unnötiger Rewrite
- immer auf aktuelle `index.html` beziehen
- Änderungen direkt dokumentieren
- nach jedem sinnvollen Merge README mitziehen

---

## Lizenz / Nutzung

Aktuell internes Projekt / Arbeitsstand.
Bei späterer Weitergabe sollten vor allem:
- Template-Mechanik
- Platzhalter-Schema
- bekannte Grenzen
- Sync-Verhalten
sauber dokumentiert werden.
