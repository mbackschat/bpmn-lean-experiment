# Platform audit foundation

`@bpmn-lean/platform-audit` provides append-only Product 2 audit event construction, storage, and canonical cursor search. It owns infrastructure mechanisms, while authorization and business-event meaning remain with their calling modules.

## What you can do

Persist and page Work or incident-action audit events with exact filters, idempotent event identity, and opaque exclusive cursors.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-audit test
```

## Learn more

- [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns Work audit behavior.
- [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns incident-action audit behavior.
- [Architecture](../../../docs/ARCHITECTURE.md#foundation-packages) owns the package boundary.
