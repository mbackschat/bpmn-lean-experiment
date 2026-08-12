# BPM platform

This tree contains product 2, the MIT BPM platform. [The implementation architecture](../docs/ARCHITECTURE.md) owns its modular-monolith layout and dependency direction; [the platform proposal](../docs/BPM-PLATFORM-PROPOSAL.md) owns product scope; [the implementation map](../docs/IMPLEMENTATION-MAP.md#bpm-platform) owns exact current status.

Directories here are ownership boundaries, not deployment-service claims. M1 is implemented through the engine gateway, artifact store, public contracts, definition deployment and exact-version start workflows, public definition routes, Node server composition root, HTTP-only definition workspace, and the separate executable showcase. M2 additionally instantiates the `operate` module for an exact confirmed-start Process-instance index and search service. M3 checkpoint 1 adds the strict Work contract and durable confirmed-Process registration behind the mandatory review boundary. Checkpoint 2 now includes the exact fake identity policy, append-only audit store, fresh all-or-error Work aggregation, actor filtering, and durable audit-outbox delivery; task detail, mutations, HTTP, and UI remain active work. Direct dependencies belong in their owning package manifest, exact resolution belongs in the committed pnpm lockfile, pnpm reports the production closure, and [`license-policy.json`](license-policy.json) owns only the permitted licences and exact non-standard exceptions.

- [Applications](apps/README.md) are deployable composition roots.
- [Contracts](contracts/README.md) own public transport shapes.
- [Foundation](foundation/README.md) owns narrowly reusable infrastructure mechanisms.
- [Modules](modules/README.md) own business capabilities.
- [UI kit](ui-kit/README.md) owns reusable accessible visual components.
- [Workers](workers/README.md) own independently deployed production Workers.
