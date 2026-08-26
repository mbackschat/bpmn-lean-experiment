# Platform showcases

This tree contains executable Product 2 milestone acceptance gates. Showcases configure and drive production packages but contain no reusable production behavior and no private alternative API. The [showcase milestone ladder](../docs/SHOWCASE-MILESTONE-LADDER-DECISION.md#showcase-milestone-ladder) owns the milestone order and exit gates.

| Showcase | Acceptance boundary |
|---|---|
| [M1 third-party definition deployment](m1-definition-deployment/README.md) | Exact BPMN deployment and admission |
| [M2 exact-version definition scheduling](m2-definition-scheduling/README.md) | Durable exact-version Timer Start scheduling |
| [M2 exact-version Message Start ingress](m2-message-start-ingress/README.md) | Durable content-bound Message Start publication |
| [M2 Process-instance search](m2-process-instance-search/README.md) | Global public exact-identity search |
| [M3 Human Work](m3-human-work/README.md) | Task inbox, assignment, structured forms, and audit |
| [M4 incident operations](m4-incident-operations/README.md) | Current incidents, retry, root cancellation, and action audit |
| [MUE Preview Alpha](mue-preview-alpha/README.md) | Sequential Multi-Instance natural and Timer-interrupted branches |
| [Guided live demo](guided-live-demo/README.md) | Deterministic audience state composed from the reviewed boundaries above |
| [Product 2 UI-quality lane](platform-ui-quality/README.md) | Responsive, focus, reduced-motion, capability-disclosure, visual-regression, committed-execution History/Diagram/export, and per-instance Operator evidence without starting Temporal |
| [Platform browser walkthrough](platform-browser-walkthrough/README.md) | Documentation-only Playwright capture from a containerized public origin |
