# Research

Research documents explain external systems, standards, implementation precedents, and their consequences for this project. They are evidence and design input, not automatically approved project decisions.

Read the smallest relevant document before changing a boundary:

| Topic | Document |
|---|---|
| BPMN source, executable definition, runtime state, CIB Seven PVM, fUML, and PSSM | [Semantic representations and execution models](SEMANTIC-REPRESENTATIONS-RESEARCH.md) and the adopted [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) |
| Declarative semantics, reference interpreters, SpecTec mechanization experiments, portable conformance scripts, and transferable WebAssembly practices | [WebAssembly semantics architecture and BPMN transfer](WEBASSEMBLY-SEMANTICS-RESEARCH.md) |
| Lean semantic capsules, retained evidence, checked non-laws, and specification synchronization | [Process transfer from `a12-kernel-lean`](A12-KERNEL-LEAN-PROCESS-RESEARCH.md) |
| Camunda/CIB Seven BPMN extensions, Java delegates and beans, expressions, scripts, FEEL, external tasks, and compatibility levels | [CIB Seven extensions and execution APIs](CIB-SEVEN-EXTENSIONS-RESEARCH.md) |
| A12 Workflows product corpus, delegate/API surface, downstream blueprint, and migration priorities | [A12 Workflows compatibility ledger](A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) |
| CIB Seven `2.0.0` versus `2.2.0` on the exact A12 `CreateDocument` path and broader product boundary | [CIB Seven 2.0 A12 target baseline](CIB-SEVEN-A12-BASELINE-RESEARCH.md) |
| CIB Seven `2.2.0` core BPMN fixture breadth and mechanism-ordering signals | [CIB Seven 2.2.0 executable BPMN breadth](CIB-SEVEN-BPMN-BREADTH-RESEARCH.md) |
| Executable project models, external whole-model candidates, clone-family deduplication, and blocker ranking | [Executable BPMN model corpus](EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md) |
| Executable BPMN element profile a shippable engine needs, and the execute/preserve/reject admission split | [Minimal but useful BPMN 2.0 execution profile](MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) |
| Call Activity, multi-instance, Event Sub-Process, and non-interrupting Boundary Events as a follow-up profile | [High-priority BPMN 2.0 execution extensions](HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) |
| What Temporal, Camunda 8, and CIB Seven built their operator surfaces from, and the MIT-compatible component-library and data-grid candidate set | [BPM platform technology stack](BPM-PLATFORM-STACK-RESEARCH.md) |
| Recurring BPM work, form, diagram, definition, instance, navigation, and responsive-layout patterns across CIB Seven, Camunda 8, Flowable, Bonita, IBM BAW, Appian, ServiceNow, and ProcessMaker | [BPM platform UI/UX and information architecture](BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) |
| Useful Human Task forms, regular values and flat arrays, resolution actions, conditional input, and the bounded M6 recommendation | [Human Tasks, forms, and resolution actions](HUMAN-TASKS-AND-FORMS-RESEARCH.md) |
| Vendor-by-vendor enterprise process-orchestration landscape used as the primary external market input | [Enterprise process orchestration competitive landscape dossier](ENTERPRISE-PROCESS-ORCHESTRATION-COMPETITIVE-LANDSCAPE-RESEARCH.md) |
| Full competitive scope for product 2, its alignment with the initial platform proposal, and the recommended growth horizon | [BPM platform competitive scope](BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md) |
| Temporal replay, messaging, retries, versioning, and adapter boundaries | [Temporal execution model](TEMPORAL-EXECUTION-RESEARCH.md) |
| TLA+, behavioral equivalence, model checking, and auxiliary formal tools | [TLA+ and bisimulation research](TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven and Temporal source instrumentation | [Reference instrumentation](../REFERENCE-INSTRUMENTATION-POLICY.md) |
| Exact source revisions and controlled sibling checkouts | [Sources](../SOURCES.md) |

Research that creates an executable discriminator must have a corresponding record under [experiments](../experiments/README.md). Settled architectural decisions belong in [PROJECT-DESIGN.md](../PROJECT-DESIGN.md) or an explicitly introduced decision record, live sequencing belongs in [PLAN.md](../PLAN.md), and implemented facts belong in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md).
