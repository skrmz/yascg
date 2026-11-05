# Leitfaden für eigene Zauber

Eigene Zauber bringen deine eigene Magie in Yet Another Spell Card Generator. Sie werden lokal in deinem Browser gespeichert, erscheinen mit dem Badge **Eigen** in der Zauberbibliothek und lassen sich wie mitgelieferte Zauber zu Decks hinzufügen und drucken. Sie sind nicht Teil des SRD. Exportiere deine eigenen Zauber regelmäßig, damit du sie wiederherstellen oder in einen anderen Browser übertragen kannst.

## Einen eigenen Zauber in der App erstellen

1. Öffne die **Bibliothek** und wähle **Eigenen Zauber erstellen**.
2. Fülle Name, Grad, Schule, Zeitaufwand, Reichweite, Wirkungsdauer, Konzentration, Ritual, Komponenten, Klassen, Beschreibung und höhere Grade aus. In den Feldern für Beschreibung und höhere Grade wird Markdown unterstützt.
3. Wähle **Zauber speichern**. Der Zauber wird lokal gespeichert, erscheint mit dem Badge **Eigen** und kann im Detailbereich bearbeitet werden.

Das Formular bietet keine Felder für `subclasses`, `savingThrow`, `damageTypes`, oder `sourceLabel`. Verwende für diese Felder den JSON-Import. Formular und Importschema akzeptieren für Zeitaufwand, Reichweite und Wirkungsdauer jeweils bis zu 500 Zeichen.

### Zaubertext abkürzen

Der Editor für eigene Zauber bietet **Abkürzen** und **Abkürzung rückgängig machen** für neue Zauber, normale Bearbeitungen eigener Zauber und bearbeitbare Kopien. Im eingeschränkten SRD-Override-Editor sind diese Aktionen nicht verfügbar.

- Abgekürzt werden nur deine Zauberdaten: Beschreibung, höhere Grade, Zeitaufwand, Reichweite, Wirkungsdauer sowie Komponentenbeschreibungen und Materialkosten. Oberflächenbeschriftungen wie **Zeitaufwand**, **Reichweite** und **Wirkungsdauer** werden nie abgekürzt.
- Die Zuordnung verwendet die Sprache, die beim Öffnen des Editors erfasst wurde. Es gibt nur englische und deutsche Textkataloge; andere Sprachen zeigen einen erklärenden Status, statt auf Englisch auszuweichen.
- Zahlenangaben nach `bis zu`/`up to` werden zu `≤`, wobei Zeiteinheiten kompakt erscheinen, etwa `≤ 1h`, `≤ 10min` und `≤ 3d`. Andere Einheiten behalten ihre normale Schreibweise (`≤ 30 ft`); Wendungen ohne Zahl bleiben unverändert.
- In Markdown-Texten wird gewöhnlicher Fließtext abgekürzt; Code, HTML-Attribute, URLs, Linkziele/-titel/-referenzen, Bilder, Escapes und Struktursyntax bleiben erhalten.
- **Abkürzung rückgängig machen** stellt die vom letzten Vorgang geänderten Felder wieder her, solange der Editor geöffnet ist. Spätere manuelle Änderungen an diesen Feldern werden dabei überschrieben; andere Felder bleiben unberührt.
- Beim Speichern wird der abgekürzte Text gespeichert. Es gibt keine gespeicherte Sicherung und keine automatische Rückabkürzung; bewahre den ursprünglichen Wortlaut bei Bedarf separat auf.

## Eigene Zauber importieren

1. Öffne die **Bibliothek** und wähle **Eigene Zauber importieren/exportieren**.
2. Wähle **Eigene Zauber importieren…** und eine `.json`-Datei mit höchstens 5 MiB.
3. Warte, bis die Zauberbibliothek und die SRD-Validierungsdaten fertig geladen sind.
4. Prüfe die Validierungszusammenfassung. Wenn eine importierte `id` bereits existiert, wähle **Überspringen**, **Beide behalten** oder **Vorhandenes überschreiben**.
5. Wähle **Import übernehmen**.

Der Import ist atomar: Ein ungültiger Datensatz verwirft die gesamte Datei, sodass nichts geschrieben wird. Der Import verändert niemals das aktive Deck.

## Eigene Zauber exportieren

1. Öffne die **Bibliothek** und wähle **Eigene Zauber importieren/exportieren**.
2. Wähle **Eigene Zauber exportieren**.

Der Export enthält Definitionen eigener Zauber und alle SRD-Überschreibungen für Komponententexte. Er ist keine Deck-Sicherung. Exportiere regelmäßig; der Deck-Export ist eine separate Aktion mit einer anderen Datei.

## JSON-Format

Die Datei ist ein JSON-Objekt mit dem erforderlichen `type` `"custom-spells"`, einem erforderlichen `spells`-Array und einem optionalen `srdSpellOverrides`-Array. Normale Exporte enthalten `srdSpellOverrides`, gegebenenfalls als `[]`.

> **Achtung:** Unbekannte Schlüssel auf oberster Ebene werden abgelehnt. Unbekannte Schlüssel innerhalb eines Zauberdatensatzes werden stillschweigend verworfen, sodass ein Tippfehler ohne Fehler verschwinden kann. Es gibt kein Feld `locale` oder `language`: Eigene Zauber sind sprachunabhängige Datensätze, und Sprachvarianten benötigen unterschiedliche IDs.

### Erforderliche Zauberfelder

| Feld            | Typ / Einschränkung                           | Hinweise                                                                             |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`            | nicht leerer String, maximal 120 Zeichen      | Eindeutig in der Datei und darf nicht mit `srd-` beginnen. Eine UUID wird empfohlen. |
| `name`          | nicht leerer String, maximal 120 Zeichen      | Angezeigter Zaubername.                                                              |
| `level`         | Ganzzahl `0`–`9`                              | `0` bedeutet Zaubertrick.                                                            |
| `school`        | einer der 8 exakten englischen Schulnamen     | Groß- und Kleinschreibung beachten.                                                  |
| `castingTime`   | nicht leerer String, maximal 500 Zeichen      | Freitext, etwa `"1 Action"` oder `"1 Aktion"`.                                       |
| `range`         | nicht leerer String, maximal 500 Zeichen      | Freitext, etwa `"60 feet"` oder `"18 Meter"`.                                        |
| `components`    | Objekt mit drei erforderlichen Booleans       | `verbal`, `somatic` und `material`.                                                  |
| `duration`      | nicht leerer String, maximal 500 Zeichen      | Freitext, etwa `"Up to 1 minute"` oder `"Bis zu 1 Minute"`.                          |
| `concentration` | Boolean                                       | Auch bei `false` erforderlich.                                                       |
| `ritual`        | Boolean                                       | Auch bei `false` erforderlich.                                                       |
| `classes`       | Array eindeutiger englischer Kernklassennamen | Darf leer sein.                                                                      |
| `description`   | nicht leeres Array aus Strings                | Jeder Eintrag maximal 20.000 Zeichen.                                                |
| `source`        | `"Custom"`                                    | SRD-Datensätze werden abgelehnt.                                                     |

### Optionale Zauberfelder

| Feld           | Typ / Einschränkung                                      | Hinweise                                                             |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `subclasses`   | Array eindeutiger Strings, jeweils maximal 500 Zeichen   | Kanonische Werte wie `"Bard: College of Lore"` verwenden.            |
| `savingThrow`  | `"STR"`, `"DEX"`, `"CON"`, `"INT"`, `"WIS"` oder `"CHA"` | Wird als Metadatum gespeichert; nicht auf der Karte angezeigt.       |
| `damageTypes`  | Array aus Strings, jeweils maximal 500 Zeichen           | Für lokalisierte Badges die untenstehenden Schadens-Slugs verwenden. |
| `higherLevels` | Array aus Strings, jeweils maximal 20.000 Zeichen        | Wird unter der lokalisierten Überschrift für höhere Grade angezeigt. |
| `sourceLabel`  | String, maximal 500 Zeichen                              | Ersetzt den Standardtext des Badges **Eigen**.                       |
| `updatedAt`    | nicht negative Ganzzahl                                  | Optionaler Zeitstempel in Millisekunden.                             |

Die kombinierte Länge von `description` und `higherLevels` darf 50.000 Zeichen nicht überschreiten.

### Erlaubte Werte

**Schulen:** `Abjuration`, `Conjuration`, `Divination`, `Enchantment`, `Evocation`, `Illusion`, `Necromancy`, `Transmutation`

**Kernklassen:** `Barbarian`, `Bard`, `Cleric`, `Druid`, `Fighter`, `Monk`, `Paladin`, `Ranger`, `Rogue`, `Sorcerer`, `Warlock`, `Wizard`

**Attributswerte:** `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHA`

**Schadensarten:** `acid`, `bludgeoning`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `piercing`, `poison`, `psychic`, `radiant`, `slashing`, `thunder`

Maschinenlesbare Werte bleiben auf Englisch, auch wenn der Zaubertext deutsch oder in einer anderen Sprache ist.

### Komponenten

Die drei Boolean-Flags sind erforderlich. Optionale Details sind `verbalDescription`, `somaticDescription`, `materialDescription`, `materialCost`, und `materialConsumed`. Jedes Textfeld akzeptiert höchstens 500 Zeichen.

### Beschreibung und Markdown

`description` muss mindestens einen String enthalten. Jeder Eintrag wird zu einem Markdown-Absatz. Rohes HTML wird verworfen, und Links in Zauberbeschreibungen werden als reiner Text angezeigt. Eine Markdown-Tabelle, die zu groß für eine Karte ist, blockiert das Drucken dieses Zaubers.

### Vollständiges Beispiel

Dieses Beispiel ist ein spielbarer eigener Zauber, inspiriert von [Der tödlichste Witz der Welt](https://de.wikipedia.org/wiki/Der_t%C3%B6dlichste_Witz_der_Welt). Es zeigt jede unterstützte Eigenschaft, einschließlich aller optionalen Felder und Komponentendetails. Die Werte von `description` und `higherLevels` demonstrieren Markdown; der Wert von `source` bleibt kanonisch, auch wenn der Zaubertext lokalisiert ist.

```json
{
  "type": "custom-spells",
  "spells": [
    {
      "id": "funniest-joke-of-the-world-de",
      "name": "Der tödlichste Witz der Welt",
      "level": 6,
      "school": "Enchantment",
      "castingTime": "1 Aktion",
      "range": "18 Meter",
      "components": {
        "verbal": true,
        "verbalDescription": "Wenn ist das Nunstück git und Slotermeyer? Ja! Beiherhund das Oder die Flipperwaldt gersput!",
        "somatic": true,
        "somaticDescription": "ROFL (vor Lachen auf dem Boden rollen)",
        "material": true,
        "materialDescription": "ein Fetzen Pergament mit der Pointe",
        "materialCost": "5 GM",
        "materialConsumed": true
      },
      "duration": "bis zu 1 Minute",
      "concentration": true,
      "ritual": true,
      "classes": [
        "Bard",
        "Sorcerer",
        "Warlock"
      ],
      "subclasses": [
        "Bard: College of Lore"
      ],
      "savingThrow": "WIS",
      "damageTypes": [
        "psychic"
      ],
      "description": [
        "Du erzählst einen so unfassbar absurden Witz, dass alle, die ihn hören, in unkontrollierbares, immer heftiger werdendes Gelächter ausbrechen. Jede Kreatur innerhalb der Reichweite, die dich hören und verstehen kann, muss einen WEI-RW ablegen.",
        "**Anfänglicher RW.** Bei einem misslungenen RW erleidet die Kreatur **4W8 psychischen Schaden** und erhält für die Wirkungsdauer den Zustand **Handlungsunfähig**, während sie in unkontrollierbares Gelächter ausbricht. Misslingt der RW um 5 oder mehr, erhält sie zusätzlich den Zustand **Betäubt** für die Wirkungsdauer. Bei einem gelungenen RW bleibt die Kreatur unbeeinflusst.",
        "**Eskalierendes Gelächter.** Ab der zweiten Runde der Wirkungsdauer muss jede betroffene Kreatur zu Beginn jedes ihrer Züge erneut einen RW ablegen. Das Gelächter wird mit jeder Runde heftiger. Die Kreatur ringt verzweifelt nach Luft, während ihr Körper von unkontrollierbaren Lachkrämpfen geschüttelt wird.",
        "**Tod durch Lachen.** Misslingt einer betroffenen Kreatur einer dieser nachfolgenden RW, stirbt sie augenblicklich vor Lachen. Dieser Tod wird nicht durch Schaden verursacht und kann daher weder durch Resistenz noch durch Immunität gegen psychischen Schaden verhindert werden.",
        "**Den Witz überwinden.** Bei einem gelungenen nachfolgenden RW gewinnt die Kreatur die Kontrolle über sich zurück und der Zauber endet für sie. Alle durch diesen Zauber verursachten Zustände enden sofort.",
        "**Wirkungsdauer und Immunität.** Der Zauber endet, sobald deine Konzentration endet oder 1 Minute vergangen sind, je nachdem, was zuerst eintritt. Alle durch diesen Zauber verursachten Zustände enden mit dem Zauber. Konstrukte und Kreaturen, die die Sprache des Witzes nicht verstehen können, bleiben unbeeinflusst."
      ],
      "higherLevels": [
        "Wenn du diesen Zauber mit einem Zauberplatz des 7. Grades oder höher wirkst, erhöht sich der anfängliche psychische Schaden um 1W8 für jeden Zauberplatzgrad über dem 6. Der tödliche Effekt bleibt unverändert."
      ],
      "source": "Custom",
      "sourceLabel": "Eigen",
      "updatedAt": 1767225600000
    }
  ],
  "srdSpellOverrides": []
}
```

### Fehlerbehebung

| Symptom                                                                | Ursache und Lösung                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Die Nutzdaten müssen ein JSON-Objekt sein.`                           | Die Datei ist ein bloßes Array. Packe die Zauberdatensätze in das Umschlagobjekt.             |
| `Es wurden "custom-spells"-Nutzdaten erwartet…`                        | `type` fehlt oder ist nicht `"custom-spells"`.                                                |
| `Ungültige Nutzdaten bei "spells.0.…"`                                 | Ein Pflichtfeld fehlt, hat den falschen Typ oder verwendet einen nicht kanonischen Enum-Wert. |
| `Doppelte Zauber-ID "…" innerhalb der Importdatei.`                    | Gib jedem Datensatz, auch jeder Sprachvariante, eine eindeutige `id`.                         |
| `… SRD-Datensätze können nicht als eigene Zauber importiert werden.`   | Setze `"source": "Custom"`.                                                                   |
| `Die Datei überschreitet das Importlimit von 5 MiB für eigene Zauber.` | Teile die Datei in kleinere Importe auf.                                                      |
| Die Beschreibung fehlt oder ist leer                                   | Gib mindestens einen nicht leeren `description`-Eintrag an.                                   |

## Mit einem KI-Assistenten generieren

Für zuverlässigere Ergebnisse lade das [JSON-Schema](/custom-spell-card-json-schema.json "download") herunter und verwende es mit einem KI-Modell, das **Structured Outputs** (JSON Schema) unterstützt. Dadurch wird das erforderliche Ausgabeformat besser eingehalten.

Kopiere das vollständige JSON-Beispiel oben und übergib es zusammen mit diesem Prompt an einen KI-Assistenten. Falls unterstützt, hinterlege zusätzlich das heruntergeladene Schema als Ausgabeschema. Beschreibe deinen Zauber in der letzten Zeile.

```text
Erstelle einen Zauber für D&D 5.5e 2024.

Verwende das bereitgestellte JSON-Beispiel als genaue strukturelle Vorlage. Gib eine vollständige, direkt importierbare custom-spells-JSON-Datei zurück, nicht nur ein einzelnes Zauberobjekt.

Anforderungen:
- Halte dich an die Struktur, Datentypen und erlaubten Werte des Beispiels.
- Behalte alle Pflichtfelder bei; verwende optionale Felder nur, wenn sie sinnvoll sind.
- Behalte das oberste Format bei: {"type":"custom-spells","spells":[...],"srdSpellOverrides":[]}.
- Setze source auf "Custom" und erstelle eine eindeutige id, die nicht mit "srd-" beginnt.
- Belasse JSON-Schlüssel und maschinenlesbare Werte im erwarteten englischen Format.
- Schreibe Zaubernamen, Beschreibungen und andere lesbare Texte auf Deutsch.
- Orientiere dich an den D&D-Regeln von 2024 und achte auf eine angemessene Spielbalance.
- Prüfe vor der Ausgabe die JSON-Syntax, die Schemakonformität und die Zaubermechanik.

Gib ausschließlich gültiges JSON zurück, ohne Markdown-Codeblöcke, Erklärungen, Kommentare oder nachgestellte Kommas.

Zauberkonzept: <beschreibe hier deinen Zauber>
```

Überprüfe den generierten Zauber vor dem Import.

Speichere die Antwort anschließend als `.json`-Datei, importiere sie über **Eigene Zauber importieren/exportieren**, prüfe die Validierungszusammenfassung und übernimm den Import. Die App validiert die Struktur, nicht die Spielbalance oder Regelkorrektheit; prüfe den generierten Zauber, bevor du ihn am Spieltisch verwendest.

## Einschränkungen

- Eigene Zauber liegen nur im lokalen Browserspeicher. Es gibt keine Konten und keine Cloud-Synchronisierung.
- Die App übersetzt eigene Zauber nicht und verknüpft Sprachvarianten nicht automatisch.
- Ein Import fügt Zauber zur Bibliothek hinzu, nicht zum aktiven Deck.
- SRD-Datensätze und SRD-Überschreibungen für Komponententexte sind von eigenen Zaubern getrennt.
- Importdateien sind auf 5 MiB begrenzt.

Siehe das [SRD 5.2.1](https://www.dndbeyond.com/srd) für die mitgelieferten Regeltexte.
