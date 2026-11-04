# Feature Specification: Full UI Localization (English / German)

## Objective

Extend the existing `react-i18next` localization implementation to cover the entire spell card generator application.

Currently, localization is limited primarily to spell-card terminology and the custom-spell form. The goal is to make **all application-controlled, user-facing UI text available in English and German**, using the existing spell-data language selector.

The coding agent must inspect the current codebase, identify all remaining untranslated UI strings, and implement comprehensive localization without changing existing application behavior.

## 1. Reuse Existing Localization Infrastructure

- Continue using the existing `react-i18next` and i18next configuration.
- Reuse the existing `UiLocaleBridge` and language preference (`spellCards.language`).
- Maintain the existing TypeScript translation catalogs in `src/locales/en.ts` and `src/locales/de.ts`.
- Preserve the existing translation type safety and key-parity validation.
- Do not introduce a second localization system, i18next instance, or separate language selector.
- English remains the fallback for unsupported languages.
- Preserve synchronous language initialization to prevent an incorrect-language flash on first render.

Inspect and reuse existing implementation patterns wherever possible.

## 2. Complete UI Localization Coverage

Audit the entire application and localize all remaining application-controlled UI text, including but not limited to:

- Application navigation, headers, and menus.
- Buttons, labels, headings, and descriptive text.
- Spell library controls, filters, sorting options, and dropdowns.
- Search fields, placeholders, and empty states.
- Deck management controls and related UI.
- Dialogs, modals, and confirmation prompts.
- Print settings and print-related UI.
- Tooltips, help text, and instructions.
- Form labels, validation feedback, and error messages.
- Loading indicators, progress messages, and status notifications.
- Toast messages and success/failure feedback.
- Accessibility labels, accessible descriptions, and screen-reader announcements.
- Dynamically generated messages, including text containing variables, counts, or selected values.

Treat this list as illustrative, not exhaustive.

**The agent is responsible for identifying all untranslated UI strings through codebase inspection.**

Do not limit implementation to the components explicitly listed above.

## 3. Translation Catalogs and Terminology

- Extend `src/locales/en.ts` and `src/locales/de.ts` with the necessary keys.
- Organize translation keys logically by feature or UI area.
- Maintain complete English/German key parity and existing type safety.
- Reuse existing translation keys where appropriate.
- Avoid unnecessary duplication of identical terminology.
- Use natural, context-appropriate German translations.
- Keep translations consistent with existing spell-card terminology.
- Use i18next interpolation and pluralization for dynamic messages.
- Avoid constructing translated sentences through concatenation when a complete translation string would be more appropriate.

English is the source language.

## 4. Preserve Canonical Application Data

Localization must affect presentation only.

Do not translate or modify:

- Canonical spell identifiers, enums, and mechanical values.
- Internal application IDs and keys.
- Persisted data formats or storage values.
- Spell dataset structures.
- User-entered content.
- Existing spell names and descriptions beyond their established spell-data language behavior.

For filters, sorting, and other UI selections, translate display labels while preserving underlying canonical values.

Localization must not change filtering, sorting, serialization, spell generation, or other application logic.

Number/date formatting and measurement units (e.g., feet, miles) should follow existing spell-data conventions and do not require localized unit conversion unless already provided by the spell datasets.

## 5. Language Switching and Persistence

The entire localized interface must follow the existing spell-data language selection (`en` / `de`).

Requirements:

- UI translations update immediately when the language changes.
- No application reload is required.
- The selected language persists using the existing preference mechanism.
- The correct language is displayed on initial render.
- Unsupported language codes fall back to English.
- Existing spell-card localization and card-fitting remeasurement continue working correctly.
- No stale translated labels or messages remain after switching languages.

Update `document.documentElement.lang` to reflect the resolved application language, while preserving appropriate language attributes for content intentionally displayed in another language.

### Existing LanguagePicker and Language-Switch Workflow

The application already provides a `LanguagePicker` component used in `Header.tsx`. Language changes are managed through `AppProvider.tsx`, including `requestLanguageSwitch`, `switchToLanguage`, and the existing pending language-switch confirmation workflow.

Inspect and reuse these components and mechanisms. Do not replace or bypass the existing language-switch logic.

Requirements:

- The existing `LanguagePicker` remains the sole control for selecting the spell-data and application UI language.
- Preserve the existing asynchronous dataset loading, deck-impact calculation, confirmation workflow, and error handling.
- Synchronize the UI locale with the successfully applied application language, not with a merely requested or pending selection. UI translations update immediately once the language change is confirmed and applied, without requiring an application reload.
- If a language switch requires confirmation, preserve the current language until the switch is confirmed and successfully applied.
- If a language switch is cancelled or fails, retain the previous application and UI language.
- Localize the entire language-switch interface, including confirmation dialogs, affected-entry descriptions, buttons, notices, loading states, and error messages.
- Ensure existing language-switch notices do not remain in the previous language after a successful language change. Prefer translation keys and interpolation parameters for messages stored in application state where appropriate.
- Preserve the existing dataset-loading and deck-integrity behavior.
- Do not introduce additional language state or duplicate the existing switching infrastructure.

Extend automated tests to cover successful, cancelled, failed, and confirmation-required language switches, verifying that the UI language always matches the active application language.

## 6. Implementation Guidelines

- Use `useTranslation()` in React components.
- Use the initialized i18next instance for translations outside React components when necessary.
- Avoid translating strings at module evaluation time. When outside React components, functions or lookup tables must evaluate translations dynamically at execution time (e.g., getter functions or passing the translation function) to ensure reactivity.
- Keep translated text reactive to language changes, including text derived through memoization or other caching.
- Avoid introducing unnecessary dependencies or architectural complexity.
- Preserve existing UI layout, styling, workflows, and behavior.
- Ensure both English and German text render correctly, including longer German labels.
- Do not modify bundled or generated SRD datasets to achieve UI localization.
- Avoid unrelated refactoring.

Review shared UI components, application providers, utility functions, and dynamically generated messages—not just React component JSX—to identify all user-facing text requiring localization.

## 7. Testing and Validation

Extend existing localization tests and add coverage where necessary.

Verify:

- English and German translations are available across all UI areas.
- No untranslated application-controlled English UI strings remain when German is selected.
- Language switching updates visible UI immediately.
- Language changes persist across reloads.
- Unknown language codes fall back to English.
- Translation catalogs maintain key parity.
- Interpolated messages and pluralization work correctly.
- Filters and other controls retain canonical internal values.
- Forms, validation messages, dialogs, and notifications display the correct language.
- Accessibility labels and descriptions are translated.
- Initial rendering does not flash the wrong language.
- Spell-card fitting behaves correctly after language changes.
- Longer German text does not cause significant layout regressions.

Run the project's established validation commands:

- `pnpm exec vp check`
- `pnpm exec vp test`
- `pnpm build`
- Existing Playwright tests, plus additional localization coverage where appropriate.

Investigate and resolve any failures caused by the implementation. Report unrelated pre-existing failures separately.

## 8. Documentation

Update `README.md` (overview) and `docs/DEVELOPMENT.md` (technical localization details) to reflect the completed full-UI localization support.

Replace the previous description that limits localization to spell cards and the custom-spell form.

Document:

- Full application UI localization coverage.
- Supported languages and fallback behavior.
- Integration with the existing language selector.
- Translation catalog structure and maintenance.
- Presentation-only translation of canonical values.
- Language persistence and initialization.
- Any intentional localization exclusions that remain.

Avoid duplicating unnecessary implementation details.

## 9. Acceptance Criteria

The feature is complete when:

1. All application-controlled UI text is localized into English and German, except documented intentional exclusions.
2. The existing language selector controls both spell-data language and application UI language.
3. Switching languages updates the interface without reloading.
4. The correct persisted language is displayed on initial render.
5. Canonical values, persisted data, and application behavior remain unchanged.
6. Translation catalogs are complete, consistent, and type-safe.
7. Existing localization functionality remains operational.
8. Automated tests and production build pass, apart from clearly documented unrelated pre-existing failures.
9. The README accurately describes the implemented feature.

## 10. Implementation Approach

Before modifying code:

1. Review the existing localization architecture and relevant application components.
2. Identify all remaining hardcoded user-facing strings and localization gaps.
3. Determine appropriate translation keys and reuse existing patterns.

Then implement the feature across the application, update tests and documentation, and run the validation commands.

Make reasonable implementation decisions based on the existing architecture. Do not request clarification for issues that can be resolved through codebase inspection.

After implementation, provide a concise summary of the changes, testing results, and any remaining intentional exclusions or limitations.