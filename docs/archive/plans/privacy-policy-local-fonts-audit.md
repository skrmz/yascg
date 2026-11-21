# Privacy Policy, Self-Hosted Fonts, and Privacy Audit

Date: 2026-11-09

## Scope decisions

- Implement the bilingual Privacy Policy (`Datenschutzerklärung`) in the existing header menu/dialog pattern.
- Self-host every font used by the app and remove all Google Fonts requests.
- Perform and document the privacy/storage/network audit and the Impressum assessment.
- **Do not implement the bulk "Alle lokalen Daten löschen" feature.** Per user direction, remove it
  from the original specification and acceptance criteria.
- **Do not add any bulk deletion or reset functionality.** Do not delete, reset, migrate, or
  otherwise change existing IndexedDB data, `localStorage`, or PWA/offline caches.
- Preserve all existing deletion behavior unchanged: individual custom-spell deletion, saved-deck
  deletion, deck-entry removal/Clear entries, SRD override reset, and language switching.
- The Privacy Policy must accurately document local storage, existing deletion mechanisms, and that
  users can remove all site data through browser settings.
- Impressum: assessment/documentation only. Do not invent identity or address data and do not add
  an Impressum UI in this task; a separate spec exists at
  `docs/specs/todo/impressum-legal_notice-spec.md`.

## Baseline

Before editing, run the available baseline checks and record failures:

```powershell
pnpm run check
pnpm run test
```

Do not treat pre-existing failures as caused by this change; report them separately. Do not run
mutating commands or alter user data while investigating.

## Verified findings

- IndexedDB: one Dexie database named `spell-cards-generator` with `customSpells`, `savedDecks`,
  `activeDeck`, and `srdSpellOverrides` (`src/db/database.ts`). No additional IndexedDB databases
  are created by app code.
- `localStorage`: only `spellCards.language` (`src/services/data/language.ts`). No
  `sessionStorage` usage.
- Cache Storage: Workbox precaches the app shell, JS/CSS, local fonts, language manifest, and
  bundled spell datasets (`src/pwa/register.ts`, `vite.config.ts`). It contains no user-authored
  content.
- `BroadcastChannel` is used for local cross-tab notifications, not network transmission.
- No cookies are set by app code; no authentication, accounts, profiles, analytics, telemetry,
  error-reporting SDK, external APIs, payments, ads, affiliate content, or in-app contact form.
- `fetch` is used only for same-origin static assets (`src/services/data/load.ts`).
- External links (SRD/CC attribution, guide links, Cloudflare policy) are only opened by user
  action. Custom-spell Markdown links are rendered as safe anchors only where explicitly enabled.
- Google Fonts is currently the only automatic third-party runtime request
  (`index.html`: Cormorant Garamond, Karla, IBM Plex Mono, Alegreya Sans, Vollkorn, Barlow Semi
  Condensed). Card fonts Vollkorn/Alegreya Sans are already self-hosted in `src/print/print.css`.
- Cloudflare deployment is static Workers Assets with SPA fallback and no server API/secrets
  (`wrangler.jsonc`, `vite.config.ts`, `docs/cloudflare-deployment-guide.md`). Account-level
  Cloudflare features cannot be verified from the repository.
- Buy Me a Coffee/donations are not integrated; only a separate todo spec exists.

## Implementation tasks

### 1. Update the original specification

Edit `docs/specs/todo/privacy-policy-spec.md` to remove the bulk-deletion feature:

- Objective: remove "and provide users with a way to delete all locally stored application data";
  describe privacy transparency plus accurate documentation of existing deletion mechanisms.
- Section 1 "Privacy Policy Content": in Local Data Storage, add the language preference in
  `localStorage`, the offline Cache Storage (app assets only, no user content), and the existing
  deletion mechanisms. Add a short "Deleting Local Data" subsection covering:
  - Individual custom-spell deletion (also removes matching active-deck entries; saved decks are
    untouched).
  - Individual saved-deck deletion (linked association cleared; active deck content preserved).
  - Individual deck-entry removal and existing Clear entries (name/association retained by Clear).
  - Reset to original for local SRD overrides.
  - Language switching changes the preference.
  - Browser settings can remove all site data, including IndexedDB, `localStorage`, and Cache
    Storage.
  - The app does not provide a central "delete all local data" button.
- Replace section 4 "Delete All Local Data" with "4. Existing Local Data Deletion (Documentation
  Only)" containing the no-new-bulk-deletion constraint, preservation requirement, and the
  documentation/browser-settings requirement.
- Section 3 audit checklist: change "Data retention and deletion" to verify the policy accurately
  describes existing deletion mechanisms and browser-settings deletion.
- Section 6: add "Do not introduce bulk deletion, reset, data migration, or data-clearing behavior."
- Section 7 acceptance: remove all checkboxes for the new bulk-deletion action, confirmation,
  reset, data-not-reappearing, and unrelated-data deletion. Add:
  - The policy accurately documents actual local storage and existing deletion mechanisms.
  - The policy explains browser-settings deletion of all local data.
  - No new bulk deletion/reset functionality is introduced.
  - Existing deletion behavior is preserved and no existing user data is deleted, reset, or
    migrated.
- Section 8: remove "Implement the local data deletion functionality"; add "Document existing
  deletion mechanisms"; include the scope change in the final report.
- Keep the rest of the spec, including privacy policy, local fonts, audit, and Impressum
  assessment.
- Do not edit `docs/archive/`.

### 2. Self-host the remaining fonts

Add local WOFF2 files under `src/assets/fonts/`. Reuse the existing Google Fonts CSS2 latin-subset
files; do not add font packages or runtime dependencies.

Download only the missing UI faces:

- Cormorant Garamond normal, latin subset (same file covers weights 500/600/700):
  `https://fonts.gstatic.com/s/cormorantgaramond/v21/co3bmX5slCNuHLi8bLeY9MK7whWMhyjYqXtK.woff2`
- Karla normal, latin subset (same file covers weights 400/500/700):
  `https://fonts.gstatic.com/s/karla/v33/qkB9XvYC6trAT55ZBi1ueQVIjQTD-JrIH2G7nytkHRyQ8p4wUje6bg.woff2`
- IBM Plex Mono normal 400, latin subset:
  `https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1i8q1w.woff2`
- IBM Plex Mono normal 500, latin subset:
  `https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwlBFgg.woff2`

Suggested names, matching the existing convention:

- `CormorantGaramond-normal-500-700.woff2`
- `Karla-normal-400-700.woff2`
- `IBMPlexMono-normal-400.woff2`
- `IBMPlexMono-normal-500.woff2`

Verify each file is a non-empty WOFF2 (`wOF2` signature). Keep the existing Vollkorn and Alegreya
Sans files.

Create `src/fonts.css` and move all `@font-face` rules there:

- UI faces: Cormorant Garamond 500/600/700, Karla 400/500/700, IBM Plex Mono 400/500.
  Use `font-display: swap`. Replicate the per-weight declarations exactly as the current Google
  CSS does, pointing each weight to the downloaded latin file.
- Card faces: move the existing Vollkorn (normal/italic 600, 700) and Alegreya Sans
  (normal/italic 400, 500, 700) declarations from `src/print/print.css`; keep
  `font-display: block`.
- Use paths relative to `src/fonts.css` (`./assets/fonts/...`).
- Import `./fonts.css` in `src/main.tsx` before `./index.css` and `./print/print.css`.

Update:

- `index.html`: remove the Google Fonts preconnect/stylesheet block and its comment. Keep all other
  metadata/links.
- `src/index.css`: change `--font-card-body` fallback from
  `"Alegreya Sans", "Barlow Semi Condensed", sans-serif` to `"Alegreya Sans", sans-serif`; update
  the Google Fonts comment.
- `src/print/print.css`: remove the moved `@font-face` block and update the comment to reference
  `src/fonts.css`.
- `src/cards/fonts.ts`: update the comment to state card faces are self-hosted via
  `src/fonts.css`.

Do not load Cormorant italic, Karla italic, IBM Plex Mono italic, or Barlow Semi Condensed; none
are used by the UI. Dropping Barlow only changes the fallback behind the locally hosted Alegreya
Sans.

Add `src/data/font-licenses.txt` with the full SIL OFL 1.1 text and the upstream copyright
notices, copied from the upstream repositories:

- Cormorant Garamond: `Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)`
- Karla: `Copyright 2019 The Karla Project Authors (https://github.com/googlefonts/karla)`
- IBM Plex Mono: `Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"`
- Alegreya Sans: `Copyright 2013 The Alegreya Sans Project Authors (https://github.com/huertatipografica/Alegreya-Sans)`
- Vollkorn: `Copyright 2017 The Vollkorn Project Authors (https://github.com/FAlthausen/Vollkorn-Typeface)`

Link the license file from `README.md` and `docs/privacy-and-legal.md`; it is served at
`/font-licenses.txt` by the existing `publicDir: "src/data"` configuration. Do not add it to the
Workbox manifest unless needed; it is not a runtime requirement.

### 3. Privacy Policy UI

Add `src/components/PrivacyDialog.tsx`, modeled on `CustomSpellsGuideDialog.tsx`:

- Import raw policy docs and select by `toUiLocale(i18n.resolvedLanguage)`.
- Use `parseMarkdown(source, { links: "anchor" })` and `BlockList`.
- Replace `{{controllerName}}`, `{{controllerEmail}}`, and `{{lastUpdated}}` tokens from
  `src/legal/config.ts`.
- Render with the existing `Dialog`/`DialogContent` pattern, wide/scrollable body, and
  `lang={locale}`.
- Include a footer Close button using `common.close`.
- No delete/reset action and no button named "Alle lokalen Daten löschen" or "Delete all local
  data".

Add `src/legal/config.ts`:

```ts
export const LEGAL_CONFIG = {
  controllerName: "[FULL_LEGAL_NAME]",
  controllerEmail: "[CONTACT_EMAIL]",
  lastUpdated: "2026-11-09",
} as const;
```

Do not invent controller details. These placeholders are release blockers.

Add the menu entry in `src/components/HeaderMenu.tsx` with a Lucide `ShieldCheck` icon, after the
Custom Spells Guide entry. Add `menu.privacyPolicy` and `privacy.title` to
`src/locales/en.ts` / `src/locales/de.ts`:

- English: "Privacy Policy"
- German: "Datenschutzerklärung"

Add `docs/privacy-policy.md` and `docs/privacy-policy.de.md`. The German document is authoritative;
the English document is a translation and should say so.

Required policy content (both languages):

- General statement: the application itself sets no cookies, uses no accounts, analytics, or
  tracking, loads no external fonts or third-party content, and external links open only on user
  action. Do not make an absolute claim about Cloudflare account-level cookies.
- Local data storage: IndexedDB via Dexie for custom spells, saved decks, active deck, and SRD
  overrides; `localStorage` for the language preference; Cache Storage for offline app assets,
  fonts, and bundled datasets containing no user-authored content. State that user content is not
  transmitted to the operator, Cloudflare, or third parties, and the operator cannot access or
  recover it.
- Legal basis: § 25 Abs. 2 Nr. 2 TDDDG for storing/accessing information on the user's device.
  Preserve the exact legal reference and its meaning.
- Retention/loss: data remains until deleted in the app or removed via browser settings; loss
  scenarios (cleared browser data, different browser/device, browser reset).
- Technical hosting: Cloudflare processes technically necessary connection data (IP address,
  request time/destination, browser/device information) for secure, stable, efficient delivery;
  legal basis Art. 6 Abs. 1 lit. f DSGVO; recipient Cloudflare, Inc., 101 Townsend St, San
  Francisco, CA 94107, United States; non-EU processing cannot be ruled out; link to
  `https://www.cloudflare.com/de-de/privacypolicy/` (German) /
  `https://www.cloudflare.com/privacypolicy/` (English).
- Data controller: `{{controllerName}}` and `{{controllerEmail}}`; a sentence that data-protection
  questions can be sent to that address. Do not invent an address.
- Existing deletion mechanisms (documentation only): individual custom-spell deletion (also
  removes matching active-deck entries; saved decks unchanged), individual saved-deck deletion
  (association cleared if linked; active deck content unchanged), individual deck-entry removal
  and existing Clear entries (Clear keeps name/association), SRD override "Reset to original",
  language switching, and browser-settings deletion of all site data. State that the app currently
  has no central button to delete all local data.
- Last updated: `{{lastUpdated}}`.

### 4. Audit and legal documentation

Create `docs/privacy-and-legal.md` containing:

- Verified vs. unverified behavior, matching the findings above.
- Storage inventory: IndexedDB database/stores, `localStorage` key, Cache Storage, BroadcastChannel;
  what each contains and how it is removed.
- Network/external-resource inventory: same-origin assets only after the font change; outbound
  links are user-initiated; no APIs/telemetry.
- Existing deletion mechanisms, explicitly stating they were not modified and no bulk deletion was
  added.
- Font hosting and license notes.
- Impressum assessment: no monetization currently; the planned Buy Me a Coffee integration is not
  implemented; § 5 DDG assessment is uncertain for a free/private app and must not be presented as
  a definitive exemption. Recommend the separate Impressum spec before publication or donation
  integration. Do not invent identity/address data.
- Cloudflare manual verification checklist: Web Analytics, Zaraz, Bot Management/cookies,
  Turnstile, Access, Workers Logs/Logpush, security headers, retention, DPA/SCCs/EU
  representative.
- Release blockers: controller name/email (and likely postal address), legal review, Cloudflare
  dashboard settings, future donation integration.
- State clearly that technical implementation is not a claim of full GDPR compliance.

Update `README.md`:

- Extend "Offline behavior and data safety" with the Privacy Policy menu entry, local font
  hosting/no external font requests, existing deletion mechanisms, browser-settings deletion, and
  the absence of a bulk-delete action.
- Add `docs/privacy-and-legal.md` and the policy docs to the Documentation list.
- Add font license attribution/link in "Attribution and licensing".

Update `docs/DEVELOPMENT.md`:

- Module map: `src/components/PrivacyDialog.tsx`, `src/legal/config.ts`, `src/fonts.css`,
  `docs/privacy-policy*.md`, `docs/privacy-and-legal.md`.
- Update the card-font note to say `src/fonts.css` self-hosts all UI and card families.
- Add a short privacy/local-data section: policy doc loading, legal config placeholders, storage
  inventory, existing deletion mechanisms, no bulk deletion, and the privacy E2E test.

Update `docs/specs/MAIN-spec.md`:

- §3 Typography: all UI/card fonts are self-hosted WOFF2; no Google Fonts requests.
- §11: replace the "Application-shell Google Fonts are progressive enhancement..." bullet with
  fully self-hosted fonts; add a bullet for the bilingual privacy policy, local-data transparency,
  existing deletion mechanisms, browser-settings deletion, and no bulk-delete action.
- Verification matrix: update B1 to include first-load no-external-requests; update P5/P9 to
  require self-hosted faces; add an O7 row for privacy-policy access/accuracy and existing-deletion
  preservation.

Update `AGENTS.md` documentation ownership table with rows for the legal policy text and the
privacy audit, pointing to the new docs. Keep the existing ownership rules intact.

### 5. Tests

Add/adjust tests without changing existing deletion behavior:

- `src/components/HeaderMenu.test.tsx`: add a test that opens the Privacy Policy from the menu in
  English and German; assert the dialog title and key content; assert there is no bulk-delete
  action.
- `src/components/PrivacyDialog.test.tsx`: render both locales; assert TDDDG/GDPR/Cloudflare
  references, the configured controller identity, existing deletion mechanisms, browser-settings
  guidance, and absence of "Alle lokalen Daten löschen"/"Delete all local data".
- `e2e/privacy.spec.ts`:
  - Collect network requests from the first load; assert no `fonts.googleapis.com` or
    `fonts.gstatic.com` requests.
  - Load UI font faces and card faces with `document.fonts.load(...)`/`check(...)`; assert all
    succeed.
  - Open the policy from the header menu in English and German; assert the policy content and
    access without authentication.
  - Assert the policy documents existing deletion mechanisms and browser settings, and that no
    bulk-delete button exists.
  - Run a smoke check that existing deck/custom-spell deletion behavior is unchanged (existing
    specs already cover the detailed cases; do not duplicate them unnecessarily).
- Do not add tests for a bulk-deletion service or component; it must not exist.

### 6. Verification

Run:

```powershell
pnpm run check
pnpm run test
pnpm run build
pnpm exec wrangler deploy --dry-run
pnpm run test:e2e
```

Also verify manually:

- DevTools Network on a fresh load: no requests to Google Fonts or other third-party origins.
- Computed UI and card fonts resolve to the local faces.
- Privacy Policy opens in both UI languages, is keyboard accessible, and works on a narrow
  viewport.
- Existing custom-spell/deck/action deletion flows still behave as before.
- IndexedDB data, `localStorage`, and PWA caches are untouched by opening the privacy policy.
- Offline reload still works; precache includes local WOFF2 files.

Search for leftover source references (excluding `docs/archive/` and the source spec, which
legitimately mentions the removed requirement):

```powershell
rg "fonts\.googleapis\.com|fonts\.gstatic\.com" index.html src vite.config.ts
```

## Final report

Provide a concise report with: files created/modified, features implemented, audit findings and
policy changes, verification results, checks that could not be run, and outstanding legal/Cloudflare
items. Explicitly state the bulk-deletion scope change and that no existing user data was deleted,
reset, or migrated. Do not claim full GDPR compliance.

## Risks and release blockers

- Controller name and email are configured in `src/legal/config.ts`. The policies do not currently
  include a postal address; adding `[Anschrift des Verantwortlichen]` / `[Postal address of the
  controller]` remains an optional TODO pending legal review. A postal address is likely also
  required for the Impressum/Art. 13 GDPR.
- Cloudflare account-level analytics/security/logging/cookie settings, retention, and
  DPA/SCCs/EU-representative details cannot be verified from the repository.
- The Impressum assessment is not a legal determination; the separate spec must be implemented
  before publication or monetization.
- The planned Buy Me a Coffee integration is not implemented; if added later, the policy must be
  updated.
- Do not claim full GDPR compliance based on this implementation.
- Do not modify `docs/archive/`, existing Dexie schema/migrations, storage keys, or existing
  deletion code.

## Files expected to change

Created:

- `src/fonts.css`
- `src/components/PrivacyDialog.tsx`
- `src/components/PrivacyDialog.test.tsx`
- `src/legal/config.ts`
- `docs/privacy-policy.md`
- `docs/privacy-policy.de.md`
- `docs/privacy-and-legal.md`
- `src/data/font-licenses.txt`
- `e2e/privacy.spec.ts`
- four new WOFF2 files under `src/assets/fonts/`

Modified:

- `index.html`
- `src/main.tsx`
- `src/index.css`
- `src/print/print.css`
- `src/cards/fonts.ts`
- `src/components/HeaderMenu.tsx`
- `src/components/HeaderMenu.test.tsx`
- `src/locales/en.ts`
- `src/locales/de.ts`
- `docs/specs/todo/privacy-policy-spec.md`
- `docs/specs/MAIN-spec.md`
- `docs/DEVELOPMENT.md`
- `README.md`
- `AGENTS.md`

No changes to `package.json`, Dexie schema/migrations, `src/db/**` deletion logic, storage keys,
PWA registration behavior, or `docs/archive/`.
