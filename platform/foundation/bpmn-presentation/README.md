# BPMN presentation foundation

`@bpmn-lean/platform-bpmn-presentation` generates Product 2 diagram interchange for admitted BPMN source that lacks usable source-authored layout. Its parser and auto-layout graph remain private, and its result has presentation provenance but no admission or semantic authority.

## What you can do

Classify source layout as usable, absent, or unusable, generate bounded DI in a killable worker, and validate the exact-source composition before Definitions stores a sidecar.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-bpmn-presentation test
```

## Learn more

- [Diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns provenance, trust, and composition behavior.
- [UI design specification](../../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md) owns browser rendering and user-visible presentation.
- [Architecture](../../../docs/ARCHITECTURE.md#user-interface) owns the package boundary.
