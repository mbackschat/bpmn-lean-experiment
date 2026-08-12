# M2 Process-instance search

This private development package owns the live and browser acceptance witnesses for the [approved Process-instance search account](../../docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-PROPOSAL.md#rules-and-evidence). It composes the production Worker, platform server, and HTTP-only web client through public package roots.

The live witness creates one confirmed Process instance through each current Product 2 producer, proves those exact identities through Temporal test inspection, restarts the platform over the same data directory, and searches only through `GET /api/v1/process-instances`. It covers newest-first cursor stability under a concurrent newer insertion, every exact filter, full deployed-definition identity, an outside-Product-2 direct-start exclusion, and recursive rejection of private host and absent lifecycle facts.

The Chromium witness uses public Product 2 APIs only for setup, then exercises the global `Confirmed Product 2 starts` panel. It checks three distinct semantic identities, exact definition rendering, exact filters, load-more, and private-field exclusion.

Run the focused package gate with:

```sh
./scripts/pnpm.sh run test:showcase:m2-process-instance-search
```

This package does not claim complete engine discovery, lifecycle status, timestamps, origin, total counts, instance detail, tasks, history, cancellation, backfill, recurrence, or new BPMN and Temporal behavior.
