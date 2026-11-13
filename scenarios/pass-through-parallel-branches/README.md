# Pass-through Tasks on Parallel branches scenarios

The [pass-through branch specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the models are witnesses for the [`cibseven-2.2.0-scope-chain` profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [office relocation](office-relocation.bpmn) with its [handler](office-relocation-overlay.json) approves a relocation and forks at the root into the declaring Sub-Process *Pack workplace*, whose body runs the Manual Task *Label boxes* before the User Task *Pack boxes*; the Manual Task *Hand over keys*, the mapped Service Task *Book movers* and the plain Task *File movers' confirmation*; and the plain Task *Notify facilities* alone. The branches join before the plain Task *Close relocation ticket*.
- The [invoice settlement](invoice-settlement.bpmn) with its [handler](invoice-settlement-overlay.json) reviews an invoice in a Sub-Process whose body checks it and then forks into the plain Tasks *Archive receipt* and *Notify accounting*, joined before the body's End, and then pays it through a mapped Service Task.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Packing first](relocation-packing-first.scenario.json) completes *Pack boxes* before the *Book movers* result.
- [Movers first](relocation-movers-first.scenario.json) takes the *Book movers* result before *Pack boxes*.
- [Invoice settled](invoice-settled.scenario.json) checks the invoice and pays it.
