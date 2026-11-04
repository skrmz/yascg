## Task: Integrate D&D abbreviations into the existing i18n system

Your task is to read `docs/abbreviations.md` and integrate all documented Dungeons & Dragons abbreviations and their corresponding full terms into the application's existing English and German i18n system.

### 1. Inspect the existing architecture

Before making changes:

- Locate and read `abbreviations.md`.
- Identify the existing i18n framework, configuration, translation files, namespaces, and naming conventions.
- Inspect how translations are currently defined, imported, accessed, and typed.
- Follow the established project architecture. Do not introduce another i18n library or a parallel translation system.

### 2. Parse the abbreviations

The Markdown document defines English/German terminology using this format:

`- <full English term> = <English abbreviation> (<full German term> = <German abbreviation>)`

For every entry, extract:

- Full English term
- English abbreviation
- Full German term
- German abbreviation

Preserve the exact terminology, capitalization, special characters, punctuation, and abbreviation spelling specified in the document.

Ignore explanatory notes, headings, and formatting that are not abbreviation definitions.

### 3. Generate i18n translations

Add the extracted terminology to the existing English and German translation resources.

Requirements:

- Provide translations for **both the full term and its abbreviation** in each language.
- Use identical translation key structures across English and German.
- Organize entries logically, preferably under an `abbreviations` namespace or equivalent structure consistent with the existing project.
- Use stable, semantic, language-independent identifiers based on the English full terms, rather than using abbreviations as identifiers.
- Keep full terms and abbreviations individually accessible.
- Preserve all existing translation entries and avoid unnecessary modifications.
- Reuse existing keys where appropriate, without creating conflicting or redundant definitions.
- Keep the format consistent with the existing translation resources (JSON, TypeScript, or whatever the project uses).

For example, the conceptual translation structure could be:

```json
{
  "abbreviations": {
    "armorClass": {
      "full": "Armor Class",
      "short": "AC"
    },
    "hitPoints": {
      "full": "Hit Points",
      "short": "HP"
    }
  }
}
```

The corresponding German resources would contain:

```json
{
  "abbreviations": {
    "armorClass": {
      "full": "Rüstungsklasse",
      "short": "RK"
    },
    "hitPoints": {
      "full": "Trefferpunkte",
      "short": "TP"
    }
  }
}
```

These examples illustrate the desired semantics, not a mandatory file structure. Adapt the implementation to the existing i18n conventions.

### 4. Handle ambiguity and collisions

Some abbreviations may be reused for different concepts, such as `R` for Reaction and Ritual.

- Do not use abbreviations as unique dictionary keys.
- Ensure every concept has its own stable identifier.
- Preserve intentionally identical abbreviations.
- Do not silently rename, reinterpret, or replace entries from `abbreviations.md`.
- If existing translations conflict with the document, identify the conflict and use the document as the source of truth for the new abbreviation entries, without breaking unrelated existing translations.

### 5. Integrate i18n resources without changing application behavior

**Strict requirement: This task is preparation only. Do NOT introduce abbreviation usage into the application UI or existing functionality.**

- Generate and register the English and German abbreviation translations within the existing i18n architecture.
- Make the new translation keys available for future use through the existing translation API.
- Do NOT replace any existing terms, labels, strings, or translations with abbreviations.
- Do NOT modify existing UI components, templates, spell cards, rendering logic, or text formatting to display abbreviations.
- Do NOT modify existing translation keys or values to introduce abbreviated terminology.
- Do NOT automatically abbreviate text anywhere in the application.
- Do NOT introduce abbreviation-related behavior, feature flags, or runtime transformations.
- Only modify i18n resource files, their necessary registration/type definitions, and relevant validation tests or scripts.
- If integration requires changes beyond this permitted scope, report the required changes instead of implementing them.

**Acceptance criterion:** After implementation, the application must look and behave exactly as before. The only functional addition is that the new English and German abbreviation translations are available through the existing i18n system for explicit use in a future task.

### 6. Validate the result

Verify that:

1. Every valid abbreviation entry in `abbreviations.md` is represented.
2. Each entry provides both `full` and `short` values in English and German.
3. Translation keys are identical across both languages.
4. No existing translations were accidentally removed or overwritten.
5. Duplicate abbreviation values do not cause collisions.
6. Special characters and German umlauts are preserved correctly.
7. The generated resources can be loaded successfully by the existing i18n framework.
8. Existing type checks, translation validation, and relevant tests pass.

If appropriate for the existing project, add a lightweight validation test or script that checks completeness and key parity against `abbreviations.md`. Avoid introducing unnecessary dependencies.

### 7. Deliverables

Implement the changes directly in the codebase.

When finished, provide a concise summary containing:

- Files created or modified.
- Total number of abbreviation entries integrated.
- The resulting translation key structure.
- Any detected terminology conflicts or duplicate abbreviations.
- Validation or test results.

**Important:** `abbreviations.md` is the authoritative source for this task. Do not invent additional abbreviations, change their terminology, or add hardcoded language-specific logic. Prioritize compatibility with the existing i18n architecture, maintainability, and completeness.