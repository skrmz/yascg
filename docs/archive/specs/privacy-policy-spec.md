# Feature Specification: Privacy Policy and Local Data Management

## Objective

Implement a **Privacy Policy** ("Datenschutz") section in the web application, ensure that all Google Fonts are hosted locally, and accurately document the existing local-data storage and deletion mechanisms. Do not add new bulk-deletion functionality.

Before implementation, inspect the existing codebase, dependencies, storage mechanisms, network requests, deployment configuration, and relevant UI patterns. Run the available checks and ensure the privacy policy accurately reflects the application's actual behavior.

Do not assume that privacy statements are correct without verification.

Status: implemented. Remaining release checks are tracked in
[`privacy-policy-checks.md`](privacy-policy-checks.md).

## 1. Privacy Policy

Create a publicly accessible **Privacy Policy** page or section, consistent with the application's existing design and navigation.

The privacy policy is intended for a German audience and references German and EU privacy legislation. Preserve the German legal references and their meaning. The German document is authoritative; the English document is a translation that follows the UI language.

### Privacy Policy Content

The implemented policy is authoritative and lives in
[`docs/privacy-policy.de.md`](../../privacy-policy.de.md) (German, authoritative) and
[`docs/privacy-policy.md`](../../privacy-policy.md) (English translation). This specification does
not duplicate the policy text. Keep the policy aligned with the verified behavior and the release
checks in [`privacy-policy-checks.md`](privacy-policy-checks.md).

## 2. Host Google Fonts Locally

Ensure that the application does not request Google Fonts from external Google servers.

Implementation requirements:

1. Identify all Google Fonts currently used by the application.
2. Download the required font families, styles, and weights.
3. Store the fonts locally within the project as `.woff2` files.
4. Register the fonts using local CSS `@font-face` declarations.
5. Update existing styles and components to reference the locally hosted fonts.
6. Remove all references to:
   - `fonts.googleapis.com`
   - `fonts.gstatic.com`
7. Preserve the application's existing typography and visual appearance.
8. Avoid downloading unnecessary font families, weights, or character subsets.
9. Verify that all fonts load successfully without external network requests.
10. Preserve applicable font licenses and attribution requirements.

## 3. Privacy Compliance Audit

Before finalizing the privacy policy, inspect the application for the following features and behaviors.

If any item applies, determine whether the privacy policy needs to be updated.

### Audit Checklist

- [ ] **Cookies:** Does the application or any third-party integration set cookies?
- [ ] **Local storage:** Are additional data types stored in IndexedDB, `localStorage`, or `sessionStorage` beyond the user-generated content described above?
- [ ] **User accounts:** Does the application support registration, authentication, user profiles, or external identity providers?
- [ ] **Data transmission:** Are user inputs or locally stored content transmitted to a server, Cloudflare Worker, or third party?
- [ ] **Analytics and telemetry:** Are Cloudflare Web Analytics, Zaraz, usage statistics, or custom telemetry enabled?
- [ ] **Error reporting:** Are crash reports, application logs, or application state transmitted to services such as Sentry?
- [ ] **External resources:** Does the application load fonts, images, scripts, videos, or other resources from third-party domains?
- [ ] **External APIs:** Is data transmitted to external APIs, translation services, or AI services?
- [ ] **Cloud functionality:** Does the application support cloud synchronization, server-side backups, or cross-device data storage?
- [ ] **Sharing and exporting:** Is content transmitted through generated links, email integrations, or other services?
- [ ] **Contact and support:** Can users submit messages, files, or application content through support or contact functionality?
- [ ] **Payments and advertising:** Does the application include advertisements, affiliate content, donations, or payment providers?
- [ ] **Cloudflare configuration:** Are additional Cloudflare features such as Workers Logs, Logpush, Turnstile, or Browser Insights enabled?
- [ ] **Data retention and deletion:** Does the privacy policy accurately describe the existing deletion mechanisms and deletion of all site data through browser settings?

### Audit Requirements

- Inspect the source code, dependencies, configuration files, and available deployment settings.
- Identify all client-side persistence mechanisms.
- Inspect relevant network requests and external integrations.
- Distinguish between verified behavior and behavior that cannot be verified from the repository.
- Do not claim that analytics, tracking, cookies, or third-party data transmission are absent unless supported by the audit.
- Update the proposed privacy policy where necessary to reflect verified functionality.
- Flag findings that require manual verification, particularly Cloudflare account-level settings not available in the repository.
- Do not introduce new analytics, tracking, external services, or unnecessary dependencies.

## 4. Existing Local Data Deletion (Documentation Only)

Do not add a bulk "delete all local data" action or any equivalent bulk deletion, reset, or data-clearing functionality.

Requirements:

1. Preserve all existing deletion behavior unchanged: individual custom-spell deletion, saved-deck deletion, deck-entry removal and Clear entries, SRD override reset, and language switching.
2. Do not delete, reset, migrate, or otherwise change existing IndexedDB data, `localStorage`, or PWA/offline caches as part of this feature.
3. Document the existing deletion mechanisms accurately in the privacy policy.
4. Explain that users can remove all site data, including IndexedDB, `localStorage`, and Cache Storage, through their browser settings.
5. State that the application currently provides no central button to delete all local data.

The privacy policy must accurately describe the actual deletion behavior.

## 5. Legal Notice (Impressum)

Assess whether the application requires a German legal notice ("Impressum").

Initial consideration:

If the application does not include donations (such as Buy Me a Coffee), advertising, affiliate monetization, or other commercial functionality, it may potentially qualify for an exemption from certain German legal notice requirements.

However, the absence of monetization does not automatically establish that no legal notice is required.

Requirements:

- Review the application's apparent purpose and monetization features.
- Do not assume that an Impressum is unnecessary solely because the application is free.
- Flag any legal uncertainty for manual review.
- Do not invent missing legal identity or address information.
- If an Impressum is implemented, provide placeholders for the legally required information, including the operator's full name and postal address.
- Keep the Impressum separate from the Privacy Policy where appropriate.

Do not present the legal assessment as a definitive determination of compliance.

## 6. Implementation Guidelines

- Follow the application's existing architecture, frameworks, routing conventions, and component structure.
- Reuse existing components and styling wherever practical.
- Keep the implementation minimal and maintainable.
- Avoid introducing unnecessary packages or services.
- Ensure the privacy policy is accessible without requiring authentication.
- Ensure that the privacy policy can be reached through an appropriate, discoverable navigation element, such as the footer or settings.
- Preserve existing functionality and user data during deployment.
- Do not clear or migrate existing databases except when explicitly required and safely handled.
- Maintain responsive design and accessibility.
- Use the application's existing localization strategy. If the application is German-language, render the actual legal content in German; the English text in this specification is for implementation guidance.
- Do not silently enable functionality that contradicts the privacy policy.
- Do not introduce bulk deletion, reset, data migration, or data-clearing behavior.

## 7. Validation and Acceptance Criteria

The feature is complete when:

- [ ] A publicly accessible Privacy Policy section exists.
- [ ] The policy accurately describes the application's verified data handling.
- [ ] The German legal references are preserved correctly.
- [ ] No Google Fonts are loaded from external servers.
- [ ] Required fonts are hosted locally as `.woff2` files.
- [ ] Typography remains visually consistent.
- [ ] All relevant client-side storage mechanisms have been inspected.
- [ ] Relevant external requests and third-party integrations have been audited.
- [ ] The policy accurately documents the actual local storage and existing deletion mechanisms.
- [ ] The policy explains browser-settings deletion of all local data.
- [ ] No new bulk deletion or reset functionality is introduced.
- [ ] Existing deletion behavior is preserved and no existing user data is deleted, reset, or migrated.
- [ ] An Impressum requirement assessment has been documented.
- [ ] Missing legal information and unverifiable infrastructure settings are explicitly reported.
- [ ] Existing automated tests pass.
- [ ] Relevant new tests are added for the implemented functionality.
- [ ] Linting, type checking, and production build checks pass, where available.
- [ ] No unintended regressions or new third-party requests are introduced.

## 8. Execution and Final Report

Execute the work in the following order:

1. Inspect the codebase and existing architecture.
2. Run available baseline checks.
3. Perform the privacy and storage audit.
4. Identify discrepancies between actual behavior and the proposed privacy policy.
5. Implement local font hosting.
6. Implement the Privacy Policy UI and content.
7. Document the existing deletion mechanisms in the privacy policy.
8. Add or update relevant automated tests.
9. Run available linting, type checking, tests, and production build commands.
10. Review changes for regressions and privacy inconsistencies.

Provide a concise final report containing:

- Files created or modified.
- Features implemented.
- Audit findings and any changes made to the proposed policy.
- Verification results, including tests and build status.
- Any checks that could not be completed.
- Outstanding legal questions, missing controller information, or Cloudflare settings requiring manual verification.
- The bulk-deletion scope change and confirmation that no existing user data was deleted, reset, or migrated.

**Important:** Do not claim that the application is fully GDPR-compliant merely because these tasks have been implemented. Technical verification and legal compliance are separate matters.