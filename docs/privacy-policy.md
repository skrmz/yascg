# Privacy Policy

This English version is provided for convenience. The German version is authoritative.

## 1. Data Controller

The controller responsible for this application is:

{{controllerName}}  
{{controllerEmail}}

## 2. General Information

This application allows users to create and manage spell cards for Dungeons & Dragons. It does not use user accounts or its own analytics or tracking services. Fonts and application resources are served locally from the website; external content is not loaded automatically.

## 3. Local Data Storage

Custom spells, saved decks, the active deck, and modifications to SRD texts are stored exclusively in the user's browser using a local IndexedDB database. The application uses Dexie.js for this purpose.

The language preference is stored in `localStorage`. The browser cache contains application files, fonts, and bundled spell data for offline use, but no user-created content.

This content is not transmitted to the operator or any third party. The operator cannot access or recover it.

Storage and access to information on the user's device that are strictly necessary for the functions explicitly requested by the user do not require separate consent under Section 25(2)(2) of the German Telecommunications Digital Services Data Protection Act (TDDDG).

## 4. Data Retention and Deletion

Locally stored content generally remains available until it is deleted or reset within the application or removed by clearing website data in the browser.

Custom spells and saved decks can be deleted individually. Deleting a custom spell also removes matching entries from the active deck; saved decks remain unchanged. When a saved deck is deleted, the linked active-deck association is cleared; the active-deck content is preserved. Deck entries can be removed individually. The Clear entries action removes all entries while keeping the deck name and association. Modifications to SRD texts can be reset with Reset to original.

There is no central button to delete all local data. Browser settings can remove all site data, including IndexedDB, `localStorage`, and Cache Storage.

Locally stored content may be lost when browser data is cleared or when switching browsers or devices.

## 5. Hosting by Cloudflare

This application is delivered through Cloudflare.

When the application is accessed, Cloudflare processes technically necessary connection data, particularly the IP address, the time and destination of the request, and browser and device information. This serves to ensure the secure, stable, and reliable delivery of the application.

No registration or provision of additional personal data is required to access the application.

Cloudflare records technical HTTP request data in adaptively sampled form. Under the current configuration, this data is available for at least 31 days. It is not recorded in full for every request.

The legal basis is Article 6(1)(f) of the General Data Protection Regulation (GDPR). The legitimate interest is the secure and functional operation of the application.

The recipient of this data is Cloudflare, Inc., USA.

Personal data may be processed outside the European Economic Area, particularly in the United States. Cloudflare provides contractual data protection safeguards for such transfers, including EU Standard Contractual Clauses.

Further information is available in Cloudflare's Privacy Policy: https://www.cloudflare.com/privacypolicy/

## 6. Data Subject Rights

Where personal data is processed, data subjects have, subject to the applicable legal requirements, rights including access, rectification, erasure, restriction of processing, data portability, and objection.

Data subjects also have the right to lodge a complaint with a competent data protection supervisory authority.

For questions or to exercise these rights, the controller can be contacted at the email address provided above.

The operator has no access to user content stored exclusively in the user's browser.

## 7. Automated Decision-Making

Automated decision-making, including profiling within the meaning of Article 22 GDPR, does not take place.

## 8. Last Updated

Last updated: {{lastUpdated}}