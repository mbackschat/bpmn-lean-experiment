# BPM platform

This tree contains product 2, the MIT BPM platform. [The implementation architecture](../docs/ARCHITECTURE.md) owns its modular-monolith layout and dependency direction; [the platform proposal](../docs/BPM-PLATFORM-PROPOSAL.md) owns product scope; [the implementation map](../docs/IMPLEMENTATION-MAP.md#bpm-platform) owns exact current status.

Directories here are ownership boundaries, not deployment-service claims. The M1 engine gateway, artifact store, public contracts, definition deployment and exact-version start workflows, public definition routes, Node server composition root, and HTTP-only definition workspace are implemented; the UI start action, executable showcase, and later modules remain open as recorded in the [implementation map](../docs/IMPLEMENTATION-MAP.md#bpm-platform). Direct dependencies belong in their owning package manifest, exact resolution belongs in the committed pnpm lockfile, pnpm reports the production closure, and [`license-policy.json`](license-policy.json) owns only the permitted licences and exact non-standard exceptions.

- [Applications](apps/README.md) are deployable composition roots.
- [Contracts](contracts/README.md) own public transport shapes.
- [Foundation](foundation/README.md) owns narrowly reusable infrastructure mechanisms.
- [Modules](modules/README.md) own business capabilities.
- [UI kit](ui-kit/README.md) owns reusable accessible visual components.
- [Workers](workers/README.md) own independently deployed production Workers.
