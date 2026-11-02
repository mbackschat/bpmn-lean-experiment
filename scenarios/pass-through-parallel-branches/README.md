# Pass-through Tasks on Parallel branches scenarios

The [pass-through branch proposal](../../docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-PROPOSAL.md#separating-witnesses) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [office relocation](office-relocation.bpmn) with its [handler](office-relocation-overlay.json) approves a relocation and forks at the root into the declaring Sub-Process *Pack workplace*, whose body runs the Manual Task *Label boxes* before the User Task *Pack boxes*; the Manual Task *Hand over keys*, the mapped Service Task *Book movers* and the plain Task *File movers' confirmation*; and the plain Task *Notify facilities* alone. The branches join before the plain Task *Close relocation ticket*.
- The [invoice settlement](invoice-settlement.bpmn) with its [handler](invoice-settlement-overlay.json) reviews an invoice in a Sub-Process whose body checks it and then forks into the plain Tasks *Archive receipt* and *Notify accounting*, joined before the body's End, and then pays it through a mapped Service Task.

The [source test](../../packages/bpmn-source/test/pass-through-parallel-branches-source.test.ts) compiles both models at the Program and checked levels and refuses the one-fact edits that leave the class.
