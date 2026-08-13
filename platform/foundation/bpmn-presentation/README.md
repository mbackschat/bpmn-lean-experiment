# BPMN presentation foundation

This Product 2-only package owns generated BPMN DI for admitted source that has no usable source-owned diagram. It privately contains the `bpmn-auto-layout` worker and `bpmn-moddle` presentation graph, and returns only closed DI bytes and fixed provenance. It has no BPMN admission or semantic authority.

## Public registry

- `BpmnPresentationAdapter` distinguishes usable, absent, and unusable source DI, generates bounded presentation DI, and validates exact-source composition.
- `BpmnAutoLayoutPresentationAdapter` implements that boundary with the pinned `bpmn-auto-layout@1.3.0` graph in a killable worker.
- `GeneratedDiagramInterchange` is the deeply immutable DI-only result. No raw moddle object or generated non-DI XML is public.

Definitions owns durable sidecars and presentation resolution. The browser owns rendering. See the [diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) and [Product 2 architecture](../../../docs/ARCHITECTURE.md#user-interface).
