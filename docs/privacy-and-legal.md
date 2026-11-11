# Privacy and Legal Audit

Date: 2026-11-09

This document records the privacy, storage, and network audit behind the in-app Privacy Policy
(`docs/privacy-policy.md`, `docs/privacy-policy.de.md`). It distinguishes behavior verified from the
repository and runtime from account-level or legal matters that require manual verification.

Technical implementation is not a claim of full GDPR compliance.

## Verified behavior

### Storage inventory

| Storage | Key / database | Contents | Removed by |
| --- | --- | --- | --- |
| IndexedDB (Dexie) | `spell-cards-generator`, version 5 | `customSpells`, `savedDecks`, `activeDeck`, `srdSpellOverrides` | Individual deletion actions in the app, or browser settings |
| `localStorage` | `spellCards.language` | Selected spell-data/UI language preference | Language switching, or browser settings |
| Cache Storage | Workbox precache | App shell, JS/CSS, local WOFF2 fonts, language manifest, bundled spell datasets | Browser settings or service-worker cache eviction |
| `BroadcastChannel` | In-memory channel | Local cross-tab notifications | Page/tab lifetime |

- The app creates no additional IndexedDB databases and uses no `sessionStorage`.
- The offline cache contains only application assets and bundled datasets. It contains no
  user-authored content.
- `BroadcastChannel` is local to the browser and is not a network transmission.
- Opening the Privacy Policy reads no storage, creates no storage, and changes no stored value.

### Network and external resources

- All runtime `fetch` calls target same-origin static assets (`src/services/data/load.ts`).
- The pre-generated short-description sidecars (`src/data/spell-short-descriptions.<locale>.json`)
  are same-origin static assets cached by the existing service worker. They are authoring output
  reviewed and committed by maintainers; the app never sends user data to a language model and has
  no runtime generation endpoint.
- After the font migration, the application loads no fonts from `fonts.googleapis.com` or
  `fonts.gstatic.com`; all families are self-hosted WOFF2 files under `src/assets/fonts/`.
- External links (SRD/CC attribution, guide links, Cloudflare policy) are rendered as anchors and
  open only on user action.
- Custom-spell Markdown links are rendered as safe anchors only where anchor rendering is
  explicitly enabled.
- No authentication, accounts, profiles, analytics, telemetry, error-reporting SDK, external API,
  payment, advertising, affiliate content, or in-app contact form is implemented.
- No cookies are set by application code. Account-level Cloudflare cookie and analytics behavior is
  tracked in the verification status below.

### Existing deletion mechanisms (unchanged)

The privacy work did not modify deletion behavior and added no bulk deletion:

- `deleteCustomSpell` removes the custom spell and matching active-deck entries atomically. Saved
  decks are not changed.
- `deleteSavedDeck` removes the saved deck and clears the active-deck association when linked. The
  active deck content is preserved.
- Individual deck entries can be removed. The existing Clear entries action removes entries while
  keeping the deck name and association.
- `resetSrdOverride` ("Reset to original") restores the original SRD text.
- Language switching changes the stored language preference.
- Browser settings can remove all site data, including IndexedDB, `localStorage`, and Cache
  Storage.
- The application provides no central "delete all local data" button.

## Font hosting and licenses

All UI and card families are self-hosted as latin-subset WOFF2 files:

- UI: Cormorant Garamond (500/600/700), Karla (400/500/700), IBM Plex Mono (400/500), declared in
  `src/fonts.css` with `font-display: swap`.
- Cards: Vollkorn (600/700 normal and italic) and Alegreya Sans (400/500/700 normal and italic),
  declared in `src/fonts.css` with `font-display: block` so measurement and printing use real faces.

The full SIL Open Font License 1.1 text and upstream copyright notices are in
[font-licenses.txt](../src/data/font-licenses.txt), served at `/font-licenses.txt`. Barlow Semi
Condensed is no longer loaded; it was only a fallback behind the self-hosted Alegreya Sans.

## Impressum assessment

- The application currently has no monetization: no donations, advertising, affiliate content, or
  paid functionality.
- The planned Buy Me a Coffee integration exists only as a separate todo specification and is not
  implemented.
- Whether a free, private application qualifies for an exemption from the German legal-notice
  requirement (§ 5 DDG) is uncertain. The absence of monetization does not by itself establish an
  exemption.
- This document does not present a definitive legal determination and does not invent identity or
  address data.
- Implement the separate specification `docs/specs/todo/impressum-legal_notice-spec.md` before
  publication or before adding donation/monetization functionality.

## Cloudflare verification status

Repository-verifiable behavior is recorded above. Account-level settings were partially verified on
2026-11-10. Current evidence and remaining checks are detailed in
[privacy-policy-checks.md](specs/todo/privacy-policy-checks.md).

- Workers Observability and Workers Traces are disabled; Logpush and OpenTelemetry export are not
  configured. Tail Workers and third-party error tracking remain to be checked.
- HTTP request analytics uses adaptive sampling. The adaptive dataset is available for at least
  31 days; a final retention or deletion period for all connection data is not confirmed.
- Web Analytics, Zaraz, Browser Insights, Bot Management, Turnstile, and any cookies they set remain
  to be verified.
- Cloudflare's DPA and standard contractual clauses apply to the account; subprocessors and any
  EU representative remain to be reviewed.
- Security policies and other account-level settings remain to be checked.

## Release blockers

- The controller name and email are configured in `src/legal/config.ts` and rendered into both
  policy versions. Neither policy currently includes a postal address. Optional TODO: add
  `[Anschrift des Verantwortlichen]` / `[Postal address of the controller]` if the legal review
  requires it; a postal address is likely required for the Impressum and may be required for
  Art. 13 GDPR.
- Legal review of the privacy policy and the Impressum assessment is required.
- Remaining Cloudflare account-level checks in `privacy-policy-checks.md` must be completed and
  reflected in the policy if needed.
- Any future donation or monetization integration requires a policy update and the separate
  Impressum implementation.

## Scope note

The original bulk "delete all local data" requirement was removed by user decision. No bulk
deletion, reset, data migration, or data-clearing behavior was introduced. No existing user data,
storage keys, Dexie schema/migrations, or PWA caches were changed.
