# BPM platform

This tree contains product 2, the MIT BPM platform. [The implementation architecture](../docs/ARCHITECTURE.md) owns its modular-monolith layout and dependency direction; [the platform proposal](../docs/BPM-PLATFORM-PROPOSAL.md) owns product scope; [the implementation map](../docs/IMPLEMENTATION-MAP.md#bpm-platform) owns exact current status.

Directories here are ownership boundaries, not deployment-service claims. The M1 engine gateway, artifact store, public contracts, and definition deployment module are implemented; the remaining directories may still be tracked scaffolds whose absent behavior is recorded in the [implementation map](../docs/IMPLEMENTATION-MAP.md#bpm-platform). [`dependency-policy.json`](dependency-policy.json) owns the platform's exact reachable external-package budget and license allowlist.

- [Applications](apps/README.md) are deployable composition roots.
- [Contracts](contracts/README.md) own public transport shapes.
- [Foundation](foundation/README.md) owns narrowly reusable infrastructure mechanisms.
- [Modules](modules/README.md) own business capabilities.
- [UI kit](ui-kit/README.md) owns reusable accessible visual components.
- [Workers](workers/README.md) own independently deployed production Workers.
