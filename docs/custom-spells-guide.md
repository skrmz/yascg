# Custom Spells Guide

Custom spells add your own magic to Yet Another Spell Card Generator. They are stored locally in your browser, appear in the spell library with the **Custom** badge, and can be added to decks and printed like bundled spells. They are not part of the SRD, and there are no accounts or cloud sync. Custom spells are language-agnostic records: the app does not translate them or link language variants automatically. Export your custom spells regularly so you can restore them or move them to another browser.

## Create a custom spell in the app

1. Open the **Library** pane and choose **Create custom spell**.
2. Fill in the name, level, school, casting time, range, duration, concentration, ritual, components, classes, description, and higher levels. Markdown is supported in the description and higher-level text fields.
3. Choose **Save spell**. The spell is stored locally, appears with the **Custom** badge, and can be edited from the details pane.

The in-app form does not expose `subclasses`, `savingThrow`, `damageTypes`, or `sourceLabel`. Use JSON import for those fields. The form and the import schema both accept up to 500 characters for casting time, range, and duration.

### Abbreviate custom spell text

The custom-spell editor offers **Abbreviate** and **Undo abbreviation** for new spells, ordinary custom spell edits, and editable copies. The action is not available in the restricted SRD override editor.

- It shortens only your spell-data text: description, higher levels, casting time, range, duration, and component descriptions/cost. UI labels such as **Casting Time**, **Range**, and **Duration** are never abbreviated.
- Matching uses the language captured when the editor opened. Only English and German prose catalogs are available; other languages show an explanatory status instead of using English.
- Numeric quantities introduced by `up to`/`bis zu` become `≤`, with compact time units such as `≤ 1h`, `≤ 10min`, and `≤ 3d`. Non-time units keep their normal spacing (`≤ 30 ft`), and phrases without a number are unchanged.
- In Markdown text, ordinary prose is abbreviated, while code, HTML attributes, URLs, link destinations/titles/reference identifiers, images, escapes, and structural syntax are preserved.
- **Undo abbreviation** restores the fields changed by the latest action until the editor closes. Later manual edits to those changed fields are overwritten by Undo; unrelated fields are untouched.
- Saving stores the abbreviated text. There is no persisted backup or automatic de-abbreviation, so save the original wording separately if you may need it later.

### Apply a pre-generated short description

When you create an editable copy from a bundled SRD spell, the editor offers **Apply short description** for copies whose spell has a reviewed short text in the language the editor opened in. The text is bundled with the app; nothing is generated in your browser and no data leaves it.

1. Add the SRD spell to the active deck and choose **Create editable copy**.
2. Choose **Apply short description**. The description and, when available, the higher levels are replaced with the shorter reviewed text. The button is disabled with a short hint when no short text exists for that spell or language.
3. Choose **Undo short description** to restore the previous text while the editor is open. Undo works last-in-first-out together with **Abbreviate**, so you can mix both actions and undo them in reverse order.
4. Choose **Save spell** and decide whether to replace the active deck entry. The preview and printed card use the shortened text.

This action is available only for editable copies created in the current session. A saved custom copy stores no link to its SRD origin, so reopening it through **Edit** does not offer **Apply short description**; create a new editable copy from the SRD spell instead.

## Import and export custom spells

**Import:**

1. Open the **Library** pane and choose **Custom spell import/export**, then **Import custom spells…**.
2. Select a `.json` file no larger than 5 MiB.
3. Wait until the spell library and SRD validation data have finished loading.
4. Review the validation summary. If an imported `id` already exists, choose **Skip**, **Keep both**, or **Overwrite existing**.
5. Choose **Commit import**.

Import is atomic: one invalid record rejects the whole file, so nothing is written. Import adds spells to the library and never changes the active deck.

**Export:** open the **Library** pane and choose **Custom spell import/export**, then **Export custom spells**. The export contains custom spell definitions and any SRD component-text overrides. It is not a deck backup; deck export is a separate action with a different file.

## JSON format

The file is a JSON object with a required `type` of `"custom-spells"`, a required `spells` array, and an optional `srdSpellOverrides` array. Normal exports include `srdSpellOverrides`, possibly as `[]`. The `spells` array may contain one or more spell objects; every `id` must be unique within the file.

> **Caution:** Unknown top-level keys are rejected. Unknown keys inside a spell record are silently discarded, so a typo can disappear without an error. There is no `locale` or `language` field: custom spells are language-agnostic records, and language variants need distinct IDs.

### Required spell fields

| Field           | Type / constraint                              | Notes                                                                                                    |
| --------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`            | non-empty string, max 120 characters           | Unique in the file; a UUID is recommended. An `srd-` prefix is remapped to a fresh ID and reported.       |
| `name`          | non-empty string, max 120 characters           | Displayed spell name.                                                                                    |
| `level`         | integer `0`–`9`                                | `0` means cantrip.                                                                                       |
| `school`        | one of the 8 exact English school names        | Case-sensitive.                                                                                          |
| `castingTime`   | non-empty string, max 500 characters           | Free text, such as `"1 Action"` or `"1 Aktion"`.                                                         |
| `range`         | non-empty string, max 500 characters           | Free text, such as `"60 feet"` or `"18 Meter"`.                                                          |
| `components`    | object with three required booleans            | `verbal`, `somatic`, and `material`.                                                                     |
| `duration`      | non-empty string, max 500 characters           | Free text, such as `"Up to 1 minute"`.                                                                   |
| `concentration` | boolean                                        | Required even when `false`.                                                                              |
| `ritual`        | boolean                                        | Required even when `false`.                                                                              |
| `classes`       | array of unique exact English core class names | May be empty.                                                                                            |
| `description`   | non-empty array of strings                     | Each entry max 20,000 characters.                                                                        |
| `source`        | `"Custom"`                                     | SRD-sourced records are rejected.                                                                        |

### Optional spell fields

| Field          | Type / constraint                                       | Notes                                                                            |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `subclasses`   | array of unique strings, each max 500 characters        | Use canonical `"<Class>: <Subclass>"` values, such as `"Bard: College of Lore"`. |
| `savingThrow`  | `"STR"`, `"DEX"`, `"CON"`, `"INT"`, `"WIS"`, or `"CHA"` | Stored as metadata; not rendered on the card.                                    |
| `damageTypes`  | array of strings, each max 500 characters               | Use the lowercase damage slugs below for localized badges.                       |
| `higherLevels` | array of strings, each max 20,000 characters            | Rendered under the localized higher-levels heading.                              |
| `sourceLabel`  | string, max 500 characters                              | Replaces the default **Custom** badge text.                                      |
| `updatedAt`    | non-negative integer                                    | Optional timestamp in milliseconds.                                              |

The combined length of `description` and `higherLevels` must not exceed 50,000 characters.

### Allowed values

**Schools:** `Abjuration`, `Conjuration`, `Divination`, `Enchantment`, `Evocation`, `Illusion`, `Necromancy`, `Transmutation`

**Core classes:** `Barbarian`, `Bard`, `Cleric`, `Druid`, `Fighter`, `Monk`, `Paladin`, `Ranger`, `Rogue`, `Sorcerer`, `Warlock`, `Wizard`

**Ability scores:** `STR`, `DEX`, `CON`, `INT`, `WIS`, `CHA`

**Damage types:** `acid`, `bludgeoning`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `piercing`, `poison`, `psychic`, `radiant`, `slashing`, `thunder`

Machine-readable values stay in English even when the spell text is German or another language.

### Components

The three boolean flags are required. Optional details are `verbalDescription`, `somaticDescription`, `materialDescription`, `materialCost`, and `materialConsumed`. Each text field accepts at most 500 characters.

### Description and Markdown

`description` must contain at least one string. Each entry becomes a Markdown paragraph. Raw HTML is dropped, and links inside spell descriptions render as plain text. A Markdown table that is too large for a card blocks printing for that spell.

### Complete example

This example is a playable custom spell inspired by [The Funniest Joke in the World](https://en.wikipedia.org/wiki/The_Funniest_Joke_in_the_World). It demonstrates every supported property, including all optional fields and component details. The `source` value stays canonical even when the spell text is localized.

```json
{
  "type": "custom-spells",
  "spells": [
    {
      "id": "funniest-joke-of-the-world-en",
      "name": "The Funniest Joke in the World",
      "level": 6,
      "school": "Enchantment",
      "castingTime": "1 Action",
      "range": "60 feet",
      "components": {
        "verbal": true,
        "verbalDescription": "Wenn ist das Nunstück git und Slotermeyer? Ja! Beiherhund das Oder die Flipperwaldt gersput!",
        "somatic": true,
        "somaticDescription": "ROFL (Rolling On the Floor Laughing)",
        "material": true,
        "materialDescription": "a scrap of parchment with the punchline",
        "materialCost": "5 gp",
        "materialConsumed": true
      },
      "duration": "up to 1 minute",
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
        "You tell a joke so devastatingly absurd that those who hear it are overcome by uncontrollable, increasingly violent laughter. Each creature within range that can hear and understand you must make a Wisdom saving throw.",
        "**Initial Saving Throw.** On a failed save, a creature takes **4d8 Psychic damage** and has the **Incapacitated** condition for the duration as it collapses into uncontrollable laughter. If it fails the save by 5 or more, it also has the **Stunned** condition for the duration. On a successful save, the creature is unaffected.",
        "**Escalating Laughter.** Beginning on the 2nd round, each affected creature must repeat the saving throw at the start of each of its turns. The laughter grows increasingly intense as the creature struggles to breathe, its body convulsing uncontrollably.",
        "**Death by Laughter.** If an affected creature fails any of these subsequent saving throws, it immediately dies from uncontrollable laughter. This death cannot be prevented by resistance or immunity to Psychic damage.",
        "**Breaking the Joke.** On a successful subsequent saving throw, the creature regains control of itself, and the spell ends for that creature. All conditions imposed by this spell immediately end.",
        "**Duration and Immunity.** The spell ends when your Concentration ends or after 1 minute, whichever comes first. All conditions imposed by this spell end when it ends. Constructs and creatures unable to understand the language in which the joke is told are unaffected."
      ],
      "higherLevels": [
        "When you cast this spell using a spell slot of level 7 or higher, the initial Psychic damage increases by 1d8 for each spell slot level above 6. The death effect remains unchanged."
      ],
      "source": "Custom",
      "sourceLabel": "Custom",
      "updatedAt": 1767225600000
    }
  ],
  "srdSpellOverrides": []
}
```

### Troubleshooting

| Symptom                                                 | Cause and fix                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `The payload must be a JSON object.`                    | The file is a bare array. Wrap the spell records in the envelope object.       |
| `Expected a "custom-spells" payload…`                   | `type` is missing or is not `"custom-spells"`.                                 |
| `Invalid payload on "spells.0.…"`                       | A required field is missing, has the wrong type, or uses a non-canonical enum. |
| `Duplicate spell ID "…" inside the import file.`        | Give every record, including each language variant, a unique `id`.             |
| `… SRD-sourced records cannot be imported…`             | Set `"source": "Custom"`.                                                      |
| `The file exceeds the 5 MiB custom-spell import limit.` | Split the file into smaller imports.                                           |
| The description is missing or empty                     | Provide at least one non-empty `description` entry.                            |

## Generate with an AI assistant

For more reliable results, download the [JSON Schema](/custom-spell-card-json-schema.json "download") and use it with an AI model that supports **Structured Outputs** (JSON Schema). Copy the complete JSON example above and provide it to the assistant together with this prompt; if supported, also configure the downloaded schema as the output schema. Describe your spell in the last line.

```text
Create a custom spell for D&D 5.5e 2024 rules.

Use the provided JSON example as the exact structural template. Return a complete, directly importable custom-spells JSON file, not just a spell object, in the top-level format {"type":"custom-spells","spells":[...],"srdSpellOverrides":[]}.

Requirements:
- Follow the example's structure, field types, and allowed values.
- Keep required fields; include optional fields only when relevant.
- Set source to "Custom" and generate a unique id that does not start with "srd-".
- Keep JSON keys and machine-readable values in English; write spell names, descriptions, and other readable text in English.
- Follow D&D 2024 spell conventions and aim for reasonable game balance.
- Before responding, check JSON syntax, schema consistency, and spell mechanics.

Output only valid JSON, without Markdown fences, explanations, comments, or trailing commas.

Spell concept: <describe your spell here>
```

Review the generated spell before importing it. Save the response as a `.json` file, import it through **Custom spell import/export**, review the validation summary, and commit the import. The app validates structure, not game balance or rules correctness; review the generated spell before using it at the table.

See the [SRD 5.2.1](https://www.dndbeyond.com/srd) for the bundled rules content.