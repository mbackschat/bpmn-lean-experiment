# M1 third-party definition deployment

This private development package owns the executable M1 acceptance gate defined by [PLAN.md](../../docs/PLAN.md#m1--a-third-party-deploys-their-own-bpmn-file). It contains composition and test evidence only, with no reusable production behavior and no private alternative API.

The host starts a cached ephemeral Temporal service, the production BPMN Worker, and the production platform server on one Task Queue. Headless Chromium then uses the HTTP-only React client to create exact BPMN bytes at runtime, deploy two versions, render the exact selected source with the required bpmn.io attribution, start version 1 through the public API and concrete Temporal client, and reject an unsupported element without advancing the deployed catalog.

Install the pinned development-only browser once and run the gate:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m1-definition-deployment exec playwright install chromium
./scripts/pnpm.sh run test:showcase:m1
```

Playwright, Chromium, and `@bpmn-lean/temporal-testkit` are development-only dependencies of this acceptance package. They are absent from the web bundle and every production dependency graph.
