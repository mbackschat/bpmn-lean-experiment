# Pass-through implicit split and merge scenarios

The [pass-through implicit split and merge specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [claim archiving](claim-archiving.bpmn) with its [handler](claim-archiving-overlay.json) assesses a claim into `decision` and chooses by it: an approved claim goes to *Approve payout*, any other to *Write rejection letter*. Both flow straight into the Manual Task *Archive claim file*, an implicit merge, before the End.
- The [equipment dispatch](equipment-dispatch.bpmn) with its [handler](equipment-dispatch-overlay.json) reserves the equipment into `reservation`, then the Manual Task *Print dispatch note* with two outgoing flows, an implicit split, opens *Pack equipment* and *Book courier*, which a Parallel Gateway joins before the End.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Claim approved](claim-approved.scenario.json) approves the claim and the payout, which passes *Archive claim file* once and completes the Process.
- [Claim rejected](claim-rejected.scenario.json) rejects the claim and writes the letter, which passes *Archive claim file* once through its other incoming flow.
- [Packed first](dispatch-packed-first.scenario.json) returns the reservation, whose closure passes *Print dispatch note* once and opens both User Tasks, then packs before booking the courier.
- [Courier first](dispatch-courier-first.scenario.json) books the courier before packing; the Process completes at the join.
