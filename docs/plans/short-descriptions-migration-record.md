# Separation provenance

The standalone toolkit snapshot represents application feature commit 9b8b62682494c0294e7243150e1bf1eae51d2efe. The integration starts from local main cd2ae8ad57c54bfb54a67a22623b389d32e11f86, which includes the unpublished base commit. The reviewed export contains 1 English entry (srd-fireball) and 339 German entries.

| App path | Git blob | SHA-256 |
| --- | --- | --- |
| src/data/spell-languages.json | 472645b602db6a9db3ae644b31a2ebbefd57e5cf | ebd0fdbb99dd8fdb0a8f86246ec996d1d837ac3d7bcbd2bce6b60501954ecfaf |
| src/data/spells.srd.json | 2524bd0455d30c52bde6dec7945dd2cb89454aff | 033199f22c886ba4858cf8f5910486fe37719f44a56ebd9256be58e8c0c50f40 |
| src/data/spells.srd.de.json | e569a729093e3018d838fe69a5955f0c0db7054f | c9b713c58e1bce2cac4fd8f925c95bb6725ff37ead1549cbf24a9dc817b899f7 |
| data/srd/srd-spells-2024.json | 6fd1a5626436f5b98ed7f4971a6d758a2f059a63 | dc7adfcda2088893219595ef771c1452d23c6fe752aad3ecf765978dd1a36f6d |
| data/srd/srd-spells-2024_de.json | 4bb209fd91031b74ee4598eb67202cf78ee57336 | ccbe4c2e32ca587dcf2913d60c41dc55f3c0334523d606dc05b14c3f332360fd |
| data/short-descriptions/en.json | 82435d19c77dbb92d5d13c1edbb093f27c2db76f | 96a167985d55adc6f2887e73db76e64d4cdc344ed25d44e398842420a1da14fa |
| data/short-descriptions/de.json | e14c45f78af586b8877b448ae0c03348c0986bd9 | fdd179d8efc7d5fb939c26a8d80e72b8876a56c3156f0696180fb7385ed9c000 |
| data/reference/short-description-review-decisions.json | 12d740f0866e92efc2d89c83d8614cb93c733d74 | a5f83eb592ef1d51fda5c178d3d2c79d02870a05cd63763d9886e95b81f771ec |
| data/reference/short-description-review.json | a20bc38d708b2db4795414b4597b46ba2d93a9af | fdf477b9fc242f0bc255a2d67d18f52a9a1885213d5ec615f0d630a0e16926e8 |
| src/data/spell-short-descriptions.en.json | c160ab0dae779cfc72263c477cd649ad2e689607 | 07e8e27e948607f8cba9862abde7b324222a283796fea5f51501c8dcb516b6fc |
| src/data/spell-short-descriptions.de.json | c3335ef657377a32c76bbd37a6dfceca1918a8c9 | e0667311ef34f9479530228e863268fc7fc6cff57c53ac08ab5233273b98e14f |

## Verification and recovery

- Runtime/data commits: `7c0492b` and `aee06d63b18c0138ada3cadb9c86135101384b61`. The isolated app worktree passed a frozen offline install, Vite+ check, all 694 unit and integration tests, SRD normalization and hash comparisons, the production build, assets-only Wrangler dry-run, and all 95 Chromium tests against a fresh Workers preview. Both served assets matched the reviewed bytes. Offline, the service worker supplied the reviewed German text for an editable copy. The runtime source and emitted assets passed the scoped authoring/credential boundary check.
- Toolkit preservation starts at `56e7c62` and the standalone export revision is `fe8a9b5eb9d879268e46e5390b49035655f9b034`. A fresh bundle restore passed a frozen offline install, Vite+ check, all 338 tests, the English dry run (338 missing IDs, Fireball skipped), build, validation (340 accepted, zero withheld or invalid), and both output hash comparisons. The history index's archived blob IDs and both abbreviation snapshots were verified. Generation, staged smoke, interactive review, and resolution were exercised with mocks. Historical review and resolution wrapper selections had no matching English entries to process.
- Verification ran with Node 24.11.1 and pnpm 12.11.2, with provider credentials unset. The app's normalization checks consume both pinned source corrections and committed generated datasets.
- The standalone Git backup is `spell-short-descriptions-toolkit.bundle`. SHA-256 `402fe52ca9d35d31945cf2afbbbf9f49c0f0779adb8847b337ca151b86c4bd07`. Restore with `git clone --branch main <bundle> <directory>` and follow the toolkit authoring guide. The [implementation plan](short-descriptions-separation-implementation.md) records the rollback procedure. The [maintainer guide](../short-descriptions-import.md) covers subsequent imports.
