# BPMN definition projection foundation

`@bpmn-lean/platform-bpmn-definition-projection` projects Product 2 definition artifacts from exact admitted BPMN source. It generates diagram interchange when usable source-authored layout is absent and projects a source-bound Human Task catalog from the one supported project Rendering extension. Its parser and auto-layout graph remain private, and neither result has admission or semantic authority.

## What you can do

Classify source layout as usable, absent, or unusable, generate bounded DI in a killable worker, validate the exact-source composition before Definitions stores a sidecar, and project a strict source-ordered Human Task catalog with closed provenance.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-bpmn-definition-projection test
```

## Learn more

- [Diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns provenance, trust, and composition behavior.
- [Structured Human Work specification](../../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the Human Task catalog, source placement, and Product 2-only validation boundary.
- [UI design specification](../../../docs/BPM-PLATFORM-UI-DESIGN-SPEC.md) owns browser rendering and user-visible presentation.
- [Architecture](../../../docs/ARCHITECTURE.md#user-interface) owns the package boundary.
