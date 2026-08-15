# Platform identity policy foundation

`@bpmn-lean/platform-identity-policy` provides immutable actor snapshots and Product 2 authorization policies. It selects no authentication provider, tenant model, or identifier normalization rule.

## What you can do

Resolve a configured actor for local composition, filter human work by exact candidate-group membership, authorize self-claim and self-audit, and apply one exact operations-group policy to incident surfaces.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-identity-policy test
```

## Learn more

- [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns task authorization behavior.
- [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns Operations authorization behavior.
- [Architecture](../../../docs/ARCHITECTURE.md#foundation-packages) owns the package boundary.
