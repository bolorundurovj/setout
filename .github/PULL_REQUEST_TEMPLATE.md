## What this changes

<!-- What it does and why. The diff already says how. -->

## Related issue

<!-- Closes #123, or say why there isn't one. -->

## Checklist

- [ ] `make check` passes: lint, types, tests, coverage floor, SDK drift
- [ ] Tests written with the change, at the layer that fits (unit, integration, contract)
- [ ] Changed a model? A migration is included and `make migrate` was run against a fresh database
- [ ] Changed the API? `make sdk` was run and the regenerated client is committed
- [ ] `packages/api-client/src` was not edited by hand
- [ ] Docs updated if behaviour or configuration changed
