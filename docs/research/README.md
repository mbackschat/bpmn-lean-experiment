# Research

Research documents explain external systems, standards, implementation precedents, and their consequences for this project. They are evidence and design input, not automatically approved project decisions.

Read the smallest relevant document before changing a boundary:

| Topic | Document |
|---|---|
| BPMN source, executable IR, runtime state, CIB Seven PVM, fUML, and PSSM | [Semantic representations and execution models](SEMANTIC-REPRESENTATIONS.md) |
| Lean semantic capsules, retained evidence, checked non-laws, and specification synchronization | [Process transfer from `a12-kernel-lean`](A12-KERNEL-LEAN-PROCESS-TRANSFER.md) |
| Temporal replay, messaging, retries, versioning, and adapter boundaries | [Temporal execution model](../TEMPORAL-EXECUTION-MODEL.md) |
| TLA+, behavioral equivalence, model checking, and auxiliary formal tools | [TLA+ and bisimulation research](../TLA-AND-BISIMULATION-RESEARCH.md) |
| CIB Seven and Temporal source instrumentation | [Reference instrumentation](../REFERENCE-INSTRUMENTATION.md) |
| Exact source revisions and controlled sibling checkouts | [Sources](../SOURCES.md) |

Research that creates an executable discriminator must have a corresponding record under [experiments](../experiments/README.md). Settled architectural decisions belong in [PROJECT-DESIGN.md](../PROJECT-DESIGN.md) or an explicitly introduced decision record, live sequencing belongs in [PLAN.md](../PLAN.md), and implemented facts belong in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md).
