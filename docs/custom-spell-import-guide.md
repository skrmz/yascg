# Custom Spell JSON & Import Guide

This guide shows how to define custom spells in JSON and import them into Yet Another Spell Card Generator. It is aimed at users who want to author spells by hand or generate them with a script; no build tools are required.

> **Custom spells are not SRD source files.** The app imports the internal `Spell` shape described here, not the raw SRD shape in [`srd-data-pipeline.md`](srd-data-pipeline.md). A bare JSON array is **not** accepted, and fields such as `index`, `casting_time`, or `damage.damage_type` do not belong in this format.

> **Custom spells have no language dimension.** A custom spell is a single self-contained record. There is no `locale`/`language` field, and two records are never treated as translations of each other — not even when they share an `id`. See [Language and translations](#language-and-translations).

## Quick start: importing a file

1. Start the app and wait until the spell library has finished loading. The import button stays disabled until the SRD validation data is available.
2. In the **Library** pane, choose **Custom spell import/export** next to **Create custom spell**.
3. Choose **Import custom spells…** and select a `.json` file (maximum **5 MiB**).
4. Review the validation summary. Existing spells with the same `id` are reported as collisions — including a different-language version of the same spell, because custom spells have no language dimension. Choose **Skip**, **Keep both**, or **Overwrite existing**.
5. Choose **Commit custom-spell import**. Imported spells appear in the library with the **Custom** source badge and can then be added to a deck.

Importing only adds spells to the library. It does not modify or fill the active deck. The import is atomic: if any record is invalid, nothing is written.

## File structure

The file must be a JSON object (the import envelope) containing an array of spells:

```json
{
  "type": "custom-spells",
  "spells": []
}
```

- `type` — must be exactly `"custom-spells"`.
- `spells` — array of spell records; it may be empty but is required.
- `srdSpellOverrides` — optional; see [SRD component-text overrides](#optional-srd-component-text-overrides).

The format is unversioned: there is no `version` field and no legacy or unknown-version compatibility path. The envelope is strict: unknown **top-level** keys are rejected. Unknown keys **inside a spell record** are silently discarded rather than rejected, so a typo can be lost without an error (this includes `locale` or `language`; see [Language and translations](#language-and-translations)). IDs must be unique within the file; a duplicate ID aborts the whole import.

## Spell fields

### Mandatory fields

| Field           | Type / constraint                                    | Notes                                                                                                                   |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`            | non-empty string, max 120 chars                      | Stable unique identity. Use a UUID. A value starting with `srd-` is remapped to a fresh UUID and the remap is reported. |
| `name`          | non-empty string, max 120 chars                      | Displayed spell name.                                                                                                   |
| `level`         | integer `0`–`9`                                      | `0` means cantrip.                                                                                                      |
| `school`        | one of the 8 school names below                      | Exact, case-sensitive English name.                                                                                     |
| `castingTime`   | non-empty string, max 500 chars                      | Free text, e.g. `"1 Action"` or `"1 Reaction, which you take when…"`.                                                   |
| `range`         | non-empty string, max 500 chars                      | Free text, e.g. `"Self"`, `"60 feet"`, `"Touch"`.                                                                       |
| `components`    | object with `verbal`, `somatic`, `material` booleans | All three flags are required; see [Components](#components).                                                            |
| `duration`      | non-empty string, max 500 chars                      | Free text, e.g. `"Instantaneous"` or `"1 minute"`.                                                                      |
| `concentration` | boolean                                              | Required even when `false`.                                                                                             |
| `ritual`        | boolean                                              | Required even when `false`.                                                                                             |
| `classes`       | array of unique class names                          | May be empty, but every entry must be one of the 12 exact English core class names below.                               |
| `description`   | array of strings, at least 1 entry                   | Each entry max 20,000 chars; combined length with `higherLevels` max 50,000.                                            |
| `source`        | `"Custom"`                                           | `"SRD-5.2.1"` records are rejected by the importer.                                                                     |

### Optional fields

| Field          | Type / constraint                                    | Notes                                                                                                                                                             |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subclasses`   | array of strings, each max 500 chars, unique         | Recommended format `"<Class>: <Subclass>"`, e.g. `"Wizard: Evoker"`; see [`subclasses.md`](subclasses.md). The parent class does not have to appear in `classes`. |
| `savingThrow`  | `"STR"`, `"DEX"`, `"CON"`, `"INT"`, `"WIS"`, `"CHA"` | Optional game metadata; it is stored but not rendered on the card.                                                                                                |
| `damageTypes`  | array of strings, each max 500 chars                 | Use the canonical lowercase damage slugs below for localized badges. Other strings are displayed verbatim.                                                        |
| `higherLevels` | array of strings, each max 20,000 chars              | Rendered under the localized "Higher Levels" heading.                                                                                                             |
| `sourceLabel`  | string, max 500 chars                                | Replaces the default `Custom` badge text.                                                                                                                         |
| `updatedAt`    | non-negative integer                                 | Optional timestamp in milliseconds; omitting it is fine.                                                                                                          |

### Allowed values

**Schools**

`Abjuration`, `Conjuration`, `Divination`, `Enchantment`, `Evocation`, `Illusion`, `Necromancy`, `Transmutation`

**Core classes** (`classes`)

`Barbarian`, `Bard`, `Cleric`, `Druid`, `Fighter`, `Monk`, `Paladin`, `Ranger`, `Rogue`, `Sorcerer`, `Warlock`, `Wizard`

Class names must match exactly. An unknown class, or a duplicate, fails the entire import.

**Damage types** (recommended `damageTypes` values)

`acid`, `bludgeoning`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `piercing`, `poison`, `psychic`, `radiant`, `slashing`, `thunder`

These values are not enum-validated on import, but canonical lowercase slugs are what the UI localizes into damage-type badges.

### Components

`components` always requires the three boolean flags:

```json
"components": {
  "verbal": true,
  "somatic": true,
  "material": false
}
```

Optional component detail fields:

| Field                       | Notes                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `verbalDescription`         | Short reminder of the verbal component, max 500 chars.                                |
| `somaticDescription`        | Short reminder of the somatic component, max 500 chars.                               |
| `materialDescription`       | Material requirement text, max 500 chars. Only shown when `material` is `true`.       |
| `materialCost`              | Cost text such as `"100 gp"`, max 500 chars. Only relevant when `material` is `true`. |
| `materialConsumed`          | `true` adds the localized "consumed" qualifier to the material line.                  |
| `componentsDisplayOverride` | Replaces the whole `V, S, M` component line, max 500 chars.                           |

### Description text and Markdown

`description` and `higherLevels` are arrays because each entry becomes a text block. The UI joins entries with blank lines and renders them as Markdown. A plain string such as `"description": "text"` is rejected.

- Use separate entries for separate paragraphs.
- Use `[""]` for a spell with no rules text; an empty array is invalid.
- Standard Markdown (emphasis, lists, headings, tables, etc., as supported by the app) is rendered safely. Raw HTML is dropped, and links are rendered as plain text.
- The same content is used when printing; long descriptions paginate automatically.

## Complete example

```json
{
  "type": "custom-spells",
  "spells": [
    {
      "id": "9a6c1e2f-3b4d-5e6f-7a8b-9c0d1e2f3a4b",
      "name": "Frost Lance",
      "level": 2,
      "school": "Evocation",
      "castingTime": "1 Action",
      "range": "60 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "ritual": false,
      "classes": ["Sorcerer", "Wizard"],
      "subclasses": ["Wizard: Evoker"],
      "savingThrow": "DEX",
      "damageTypes": ["cold"],
      "description": [
        "A lance of ice streaks toward a creature within range. Make a ranged spell attack against the target.",
        "On a hit, the target takes **3d8 cold damage**."
      ],
      "higherLevels": [
        "The damage increases by 1d8 for each slot level above 2."
      ],
      "source": "Custom"
    },
    {
      "id": "c1f2a3b4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
      "name": "Ember Ward",
      "level": 1,
      "school": "Abjuration",
      "castingTime": "1 Reaction",
      "range": "Self",
      "components": {
        "verbal": true,
        "somatic": false,
        "material": true,
        "materialDescription": "a pinch of ash",
        "materialCost": "1 cp",
        "materialConsumed": true
      },
      "duration": "1 round",
      "concentration": false,
      "ritual": false,
      "classes": ["Cleric", "Paladin"],
      "savingThrow": "CON",
      "damageTypes": ["fire"],
      "description": [
        "You outline a ward of embers around yourself. Until the start of your next turn, you have resistance to fire damage."
      ],
      "source": "Custom"
    }
  ]
}
```

## Language and translations

Custom spells are **language-agnostic records**, not localized entries. This differs from bundled SRD spells, which exist per language under the same canonical ID and are linked by the app.

- **No locale field.** `Spell` has no `locale`, `language`, `translationGroup`, or similar property. Writing one into a spell record does not create a translation link — unknown keys inside a spell record are silently discarded.
- **The language selector does not affect custom spells.** Switching the spell-data language swaps the bundled SRD dataset and localizes UI terminology. All custom spells stay visible and are displayed exactly as authored in every language.
- **Records are never connected.** Each custom spell is independent. The same `id` means the same record (a collision), not "the same spell in another language"; different IDs mean unrelated records. There is no automatic fallback or variant switching.
- **Decks reference concrete records.** A deck entry stores the custom spell's `id` and name. Switching languages never swaps a deck entry to another custom spell.

If you want the same spell available in two languages, treat it as two independent custom spells:

- Give each version a distinct, meaningful `id`, e.g. `mind-sliver-en` and `mind-sliver-de`.
- Optionally distinguish them visually with a `sourceLabel` such as `"Custom (EN)"` / `"Custom (DE)"`, or with the `name`.
- Add the version you need to the deck; keep separate decks per language if both are needed for printing.

Do not expect **Overwrite existing** to link versions: it replaces the stored record under that `id`. **Keep both** stores the incoming record under a fresh random UUID, which also creates an unrelated spell.

## Import behavior and collisions

- **IDs control identity.** If an imported `id` already exists in your custom spells, it is a collision — regardless of the record's content or language. **Skip** keeps the existing spell, **Keep both** stores the incoming spell under a fresh UUID, and **Overwrite existing** replaces the stored record.
- **`srd-` IDs are reserved.** An imported ID beginning with `srd-` is replaced with a new UUID; the old → new mapping is shown in the import result. Do not use this prefix for custom spells.
- **Collision review is verified at commit.** If an existing spell changes between review and commit, the import aborts and must be reviewed again.
- **No partial imports.** A single invalid record rejects the whole file; fix the reported record and retry.
- **No deck side effects.** Import never adds spells to the active deck, saves a deck, or changes saved decks.

## Optional: SRD component-text overrides

A custom-spell file may also carry SRD spell overrides. These let you attach verbal/somatic notes to bundled SRD spells without modifying `src/data/`:

```json
{
  "type": "custom-spells",
  "spells": [],
  "srdSpellOverrides": [
    {
      "spellId": "srd-fireball",
      "locale": "en",
      "verbalDescription": "Speak the final word with force"
    }
  ]
}
```

Rules:

- `spellId` must be an existing `srd-` ID from the loaded SRD data.
- `locale` must be one of the app's available locales (for example `en` or `de`).
- Only `verbalDescription` and `somaticDescription` are accepted, each max 500 chars, and only for a component the SRD spell actually has enabled.
- An override with both descriptions empty is ignored (it does not delete an existing override).
- If any override is invalid, the entire import aborts with a per-record error.

You can omit `srdSpellOverrides` entirely. Normal app exports always include it, possibly as an empty array.

## Troubleshooting

| Message / symptom                                            | Cause and fix                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The payload must be a JSON object.`                         | The file is a bare array or another JSON value. Wrap the spells in the envelope object.                                                                                                                                                                  |
| `Expected a "custom-spells" payload…`                        | `type` is missing or is not `"custom-spells"` (for example a deck export).                                                                                                                                                                               |
| `Invalid payload on "spells.0.…"`                            | A mandatory field is missing, has the wrong type, is out of range, or uses a non-canonical `school`/`classes`/`savingThrow` value.                                                                                                                       |
| `Duplicate spell ID "…" inside the import file.`             | Give every record a unique `id` — including different-language versions of the same spell.                                                                                                                                                               |
| Same spell in another language reports a collision           | Expected. Custom spells have no language dimension and are not linked; use a distinct `id` per language version. **Skip** discards the incoming record, **Keep both** creates an unrelated random-ID copy, **Overwrite existing** replaces the original. |
| `locale` / `language` in a spell record has no effect        | These fields are not part of the custom spell shape and are silently discarded. Language variants must be separate records with distinct IDs.                                                                                                            |
| `… SRD-sourced records cannot be imported as custom spells.` | Set `"source": "Custom"`. SRD records are not editable through this import.                                                                                                                                                                              |
| `The file exceeds the 5 MiB custom-spell import limit.`      | Split the file into smaller imports.                                                                                                                                                                                                                     |
| Import button disabled                                       | The spell library and SRD validation data are still loading, or loading failed. Wait or reload, then retry.                                                                                                                                              |
| Spell imports but the description is missing                 | Use at least one non-empty description entry; entries are rendered as Markdown and empty entries add no visible text.                                                                                                                                    |
| Class name rejected                                          | Use an exact English core class name from the list above; translations are display-only.                                                                                                                                                                 |

## Related documentation

- [`srd-data-pipeline.md`](srd-data-pipeline.md) — built-in SRD data pipeline and canonical mechanics.
- [`specs/MAIN-spec.md`](specs/MAIN-spec.md) — product specification.
