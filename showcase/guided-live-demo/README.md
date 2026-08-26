# Guided live demo

This evaluation-only package prepares the Product 2 audience walkthrough from existing reviewed Product 1 and Product 2 contracts. It deploys and starts five exact scenarios through the public platform API, drives the two completed Sequential Multi-Instance outcomes only through published Product 1 interactions, and waits until PostgreSQL-backed public projections expose the complete presenter state.

The prepared audience state contains:

- one unclaimed expense-exception task with the structured real-world form;
- one naturally completed purchase-order batch review with the ordered `accepted`, `flagged`, `archived` aggregate;
- one deadline-interrupted batch review that completes through escalation without a partial aggregate;
- one retry-only current Service Task incident;
- one current Service Task incident that also permits safe root-Process cancellation.

Run `./scripts/pnpm.sh run demo:prepare` from a clean committed checkout to rebuild the isolated Docker stack and seed fresh state. Run `./scripts/pnpm.sh run demo:reset` to recreate the same audience state later from matching cached images without building or pulling. The launcher prints the exact `?audience=demo` URL after public readiness succeeds.

The seed actor is a demonstration client, not a semantic authority. It introduces no BPMN behavior, uses no private platform store, and reports readiness only from the same public Product 2 projections the browser consumes.
