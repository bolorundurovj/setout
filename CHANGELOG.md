# Changelog

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
