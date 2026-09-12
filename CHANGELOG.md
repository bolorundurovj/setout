# Changelog

## [2.1.0](https://github.com/bolorundurovj/setout/compare/v2.0.1...v2.1.0) (2026-09-12)


### Features

* **land:** link geojson.io in the boundary hint ([2882d35](https://github.com/bolorundurovj/setout/commit/2882d3592c96bf2b292eb43f027f0e5160171f5a))
* **land:** link geojson.io in the boundary hint ([4eb9d4d](https://github.com/bolorundurovj/setout/commit/4eb9d4de8139530c8abb550db56c69ad714d6319))


### Documentation

* add Setout system diagrams ([196d026](https://github.com/bolorundurovj/setout/commit/196d02679ff18edd799a7ab4dc9ad4342052f8de))
* note diagram regeneration and ignore agent skills ([3667213](https://github.com/bolorundurovj/setout/commit/3667213e90ddd417c5e23667df9114054ba44245))


### Build and dependencies

* **deps-dev:** bump ruff from 0.16.3 to 0.16.6 in /apps/api ([#46](https://github.com/bolorundurovj/setout/issues/46)) ([18ac9d1](https://github.com/bolorundurovj/setout/commit/18ac9d19d22c9ab057b4df75364a3283b7ad1ef5))
* **deps:** bump actions/attest-build-provenance from 2 to 4 ([#28](https://github.com/bolorundurovj/setout/issues/28)) ([e08e541](https://github.com/bolorundurovj/setout/commit/e08e541d026ad87f9ada5d1879af6eb655ea5eba))
* **deps:** bump actions/upload-artifact from 4 to 7 ([#30](https://github.com/bolorundurovj/setout/issues/30)) ([2def16a](https://github.com/bolorundurovj/setout/commit/2def16a4deca5fed6ae4a9ec92feb6758cf79cf4))
* **deps:** bump boto3 from 1.43.81 to 1.43.90 in /apps/api ([#47](https://github.com/bolorundurovj/setout/issues/47)) ([fa4024c](https://github.com/bolorundurovj/setout/commit/fa4024c2d2b7b8f6a5999c63de170a39db067e3f))
* **deps:** bump docker/build-push-action from 6 to 7 ([#24](https://github.com/bolorundurovj/setout/issues/24)) ([412e9ce](https://github.com/bolorundurovj/setout/commit/412e9cebf801df8a17821a006f93ee431f1c0916))
* **deps:** bump docker/login-action from 3 to 4 ([#26](https://github.com/bolorundurovj/setout/issues/26)) ([508fa5c](https://github.com/bolorundurovj/setout/commit/508fa5cc1db9ebb2e30de0e1e0be5e3b8dc1a465))
* **deps:** bump docker/metadata-action from 5 to 6 ([#23](https://github.com/bolorundurovj/setout/issues/23)) ([dd497e0](https://github.com/bolorundurovj/setout/commit/dd497e0e39d542ceb2534e7df8b2560067f9e736))

## [2.0.1](https://github.com/bolorundurovj/setout/compare/v2.0.0...v2.0.1) (2026-09-07)


### Bug Fixes

* **storage:** sign S3 presigned URLs with browser-facing host ([dc3fdce](https://github.com/bolorundurovj/setout/commit/dc3fdce98bfd5641e572c0985d5fa2c9634cfacf))

## [2.0.0](https://github.com/bolorundurovj/setout/compare/v1.4.2...v2.0.0) (2026-09-07)


### ⚠ BREAKING CHANGES

* **api:** /scopes becomes /categories, scope_id becomes category_id, planned_amount becomes budgeted_amount, unfiled_count becomes uncategorized_count, auto_scope becomes auto_categorize, and seven SDK methods are renamed. Backups written before this release still restore.

### Features

* **api:** rename scope to category ([#42](https://github.com/bolorundurovj/setout/issues/42)) ([91986db](https://github.com/bolorundurovj/setout/commit/91986db14e2ea20d9b26b73395521f9636cf336a))


### Bug Fixes

* **web:** format every number the same way ([074b3e5](https://github.com/bolorundurovj/setout/commit/074b3e59b8f247e49890928af4d70843a3f8d048))


### Refactoring

* **api:** plain wording in error and import messages ([cdb80be](https://github.com/bolorundurovj/setout/commit/cdb80befec713520175699b6479aaba1c2c31788))
* **api:** plain wording in the exported workbook ([c31dac2](https://github.com/bolorundurovj/setout/commit/c31dac25ba4831fca108414a626e3068e414ef9f))
* **api:** plain wording in the schema descriptions ([5aa9214](https://github.com/bolorundurovj/setout/commit/5aa9214aa8d99b618a41136fcf5e1d7a0d11dbb6))
* **web:** plain wording in the interface ([88efbb2](https://github.com/bolorundurovj/setout/commit/88efbb22404d811b9fb63a5a9188a24311c4b5ff))


### Documentation

* plain wording ([dc74d5c](https://github.com/bolorundurovj/setout/commit/dc74d5c9011945a27a5dcee7e0389e7d17ec3231))

## [1.4.2](https://github.com/bolorundurovj/setout/compare/v1.4.1...v1.4.2) (2026-09-06)


### Refactoring

* Refactor mobile web layout and fix responsive issues ([#38](https://github.com/bolorundurovj/setout/issues/38)) ([6905c98](https://github.com/bolorundurovj/setout/commit/6905c98489724059759b0115cc1883dc20d5773c))

## [1.4.1](https://github.com/bolorundurovj/setout/compare/v1.4.0...v1.4.1) (2026-09-05)


### Build and dependencies

* publish images to Docker Hub as well ([#36](https://github.com/bolorundurovj/setout/issues/36)) ([fd5efd2](https://github.com/bolorundurovj/setout/commit/fd5efd28d6ffebf39afa62c0304d359da4d9df28))

## [1.4.0](https://github.com/bolorundurovj/setout/compare/v1.3.0...v1.4.0) (2026-09-05)


### Features

* **land:** check the pin against the address it was given ([4f6cd2f](https://github.com/bolorundurovj/setout/commit/4f6cd2f9fe7c5d14429d312c487cb108dc58c942))
* **land:** keep what a plot is worth over time ([898b75e](https://github.com/bolorundurovj/setout/commit/898b75eec5e1af1e9d50069ec091f9fd6ab481ff))
* **land:** put a plot on a map ([a88c3c4](https://github.com/bolorundurovj/setout/commit/a88c3c4018de5007761ca1e0e39c0e326ede17b7))
* **land:** read a boundary from a survey traverse ([9fe9b3c](https://github.com/bolorundurovj/setout/commit/9fe9b3c0c2f47973704fee7b9eb5842344539de3))
* **land:** record the country a plot sits in ([177d721](https://github.com/bolorundurovj/setout/commit/177d7213f6158bb323d2f564471007e71a0ca2e6))
* **land:** say what an "other" paper actually is ([19159f3](https://github.com/bolorundurovj/setout/commit/19159f3eb39b5e872838345268021e55e547f6ca))
* **land:** show the pin and the boundary on their own maps ([9e2a645](https://github.com/bolorundurovj/setout/commit/9e2a6455905b5479ec23812a8be9d4b3ec4c0f34))
* **land:** type the corners off a plan ([0673c74](https://github.com/bolorundurovj/setout/commit/0673c7408ed8c9058b7b6665d00b31d7c7520b76))
* **land:** warn when the pin sits outside the edge ([dc45cb5](https://github.com/bolorundurovj/setout/commit/dc45cb58765952c8250619a10a016b57997f2b40))


### Build and dependencies

* free the dev ports with make kill ([4c88bc5](https://github.com/bolorundurovj/setout/commit/4c88bc56d0a31cf9bdd4a612e078909e8f0c2dd9))
* hold the working tree to LF ([4e6cf26](https://github.com/bolorundurovj/setout/commit/4e6cf26a26073dd0f31255c56c85681fafc2c6d3))
* run the backend suite across the cores ([c7e4ae2](https://github.com/bolorundurovj/setout/commit/c7e4ae2a3b0bc0055f8db3e057defab734ac3ed1))

## [1.3.0](https://github.com/bolorundurovj/setout/compare/v1.2.0...v1.3.0) (2026-08-31)


### Features

* auto-assign scope when history is unambiguous ([04f0e41](https://github.com/bolorundurovj/setout/commit/04f0e41062e55e3749fbe533178a6c63c5d218d5))
* bulk-file unfiled expenses to a scope ([9256f6a](https://github.com/bolorundurovj/setout/commit/9256f6af3ffe4e081d2881b25f15aea0632f61cf))
* suggest scope from item or vendor history ([99ade00](https://github.com/bolorundurovj/setout/commit/99ade0094e932e0179dce42d17751ca5e3762701))


### Bug Fixes

* **land:** style land name color ([5479b35](https://github.com/bolorundurovj/setout/commit/5479b35e47ba9b618ae0313f5a628405b7e4076a))

## [1.2.0](https://github.com/bolorundurovj/setout/compare/v1.1.1...v1.2.0) (2026-08-31)


### Features

* **land:** record a plot, its papers and what is built on it ([460be57](https://github.com/bolorundurovj/setout/commit/460be57c1ee27c3bef386f51650b27443f2b730b))


### Bug Fixes

* **api:** write decimals in plain notation, not scientific ([2a103d4](https://github.com/bolorundurovj/setout/commit/2a103d405170735386973a2e42b90bb94f75298f))

## [1.1.1](https://github.com/bolorundurovj/setout/compare/v1.1.0...v1.1.1) (2026-08-30)


### Build and dependencies

* **deps:** bump actions/checkout from 4 to 7 ([#5](https://github.com/bolorundurovj/setout/issues/5)) ([a7f3edd](https://github.com/bolorundurovj/setout/commit/a7f3edde34c62d03f7c60b4ca375a3d99f8a81a5))
* **deps:** resolve Dependabot alerts and bump API version to 1.1.0 ([#19](https://github.com/bolorundurovj/setout/issues/19)) ([90b92c1](https://github.com/bolorundurovj/setout/commit/90b92c167bbe315cc919b525172af49b9974c8bd))

## [1.1.0](https://github.com/bolorundurovj/setout/compare/v1.0.0...v1.1.0) (2026-08-30)


### Features

* **ui:** pick from long lists with a searchable picker ([e2dcefe](https://github.com/bolorundurovj/setout/commit/e2dcefeab355b403cec74de289217adac783b94a))


### Bug Fixes

* **docker:** serve index.html when a client route is refreshed ([3d67d6e](https://github.com/bolorundurovj/setout/commit/3d67d6e2590efeffab58e3bcac644343b9f8457c))
* **routing:** keep inputs a route never sets at their declared defaults ([bc90147](https://github.com/bolorundurovj/setout/commit/bc9014763d3751afbe757b4054e6385bf84fc585))


### Build and dependencies

* raise the web bundle budgets above the current size ([30f06f2](https://github.com/bolorundurovj/setout/commit/30f06f21473954e00b1ded209e5471d496ed18a8))

## [1.0.0](https://github.com/bolorundurovj/setout/compare/v0.1.0...v1.0.0) (2026-08-22)


### Features

* **agreements:** record contract prices, advances and deliveries ([6785f94](https://github.com/bolorundurovj/setout/commit/6785f9410414bea959984ad2ba797848c746e427))
* **attachments:** store receipts by content hash, local or s3 ([21371da](https://github.com/bolorundurovj/setout/commit/21371da0dbe3f4ca9d93d78732ad81b5d34e4d14))
* **auth:** single-user login with cookie sessions ([950bc22](https://github.com/bolorundurovj/setout/commit/950bc2242a934a625ed6efb2823f60e59f73874a))
* **dashboard:** budget versus spend, with pagination and counts ([0a884a4](https://github.com/bolorundurovj/setout/commit/0a884a40ca10f0075d9cd767e25faedcf5cd8ffc))
* **docker:** one compose stack for postgres and minio ([ef335ad](https://github.com/bolorundurovj/setout/commit/ef335ad4154087388be5d9e5bf42177b504c5846))
* **expenses:** record spend, and track items, vendors and people ([44adb3e](https://github.com/bolorundurovj/setout/commit/44adb3e638d28ccfece42a37367f8895f4b3ffbe))
* **import,export:** read a spreadsheet by its headings and write it back ([e179dac](https://github.com/bolorundurovj/setout/commit/e179dacb2c1106072eae2171426ca465ead336a5))
* **projects:** create projects with an immutable currency ([538dedd](https://github.com/bolorundurovj/setout/commit/538dedd3cf5dcda5bb2bee82c2b35c5e83497ed2))
* **scopes:** plan budgets by scope, keyed by short ids ([d1df508](https://github.com/bolorundurovj/setout/commit/d1df5088fc1ced97c24fce04bf667b761d14a4b3))
* **search:** search across the record ([6d4c758](https://github.com/bolorundurovj/setout/commit/6d4c758b9ca03af194faf343f9c894db6a9aa785))
* **settings:** manage scopes, account, backup and restore ([178fa48](https://github.com/bolorundurovj/setout/commit/178fa48a6ccdefe9aea111045c4a1d162b24a4c4))


### Bug Fixes

* **ci:** force the version through a Release-As footer and fix the digest upload ([c74e3f4](https://github.com/bolorundurovj/setout/commit/c74e3f4dae4ab1b771486142a986afb215e90622))
* **ci:** run the release with a token that can write to a protected branch ([1780c31](https://github.com/bolorundurovj/setout/commit/1780c316b60db996a951ca69ae4471554ee632f2))
* **ci:** say what to change when the Release-As push is blocked ([a7a7f7d](https://github.com/bolorundurovj/setout/commit/a7a7f7d36f4d7c91782316c1041efa7001975d43))


### Documentation

* add contributing, conduct and security policies ([8adae83](https://github.com/bolorundurovj/setout/commit/8adae8359ddefcbb035a9fa746f5897313a9da20))
* describe releasing, image tags and commit conventions ([8e34440](https://github.com/bolorundurovj/setout/commit/8e34440c5a7f66f05fda37f1fcc78e78e7634ec4))
* write guides for running and working on setout ([ed03239](https://github.com/bolorundurovj/setout/commit/ed03239712297a0b5d8b7a58d809d19a786bcbc0))


### Build and dependencies

* cut releases and publish the image from the commit history ([23ee07f](https://github.com/bolorundurovj/setout/commit/23ee07f43b5432542eca60d2268d26d9b8bcef5c))
* generate SDK during Docker builds ([5d02b8b](https://github.com/bolorundurovj/setout/commit/5d02b8bed796d1cd5ea859f6ca7c6539f72ac89c))


### Chores

* release 1.0.0 ([caf133f](https://github.com/bolorundurovj/setout/commit/caf133fbaf26094c2fbf12536b2c2dd38c09cb49))

## Changelog
