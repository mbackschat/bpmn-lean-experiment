# Activity host split scenarios

The [split proposal](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), with an exact source overlay binding its three Service and Send Tasks to caller-supplied Activity handlers.

The [insurance claim intake](insurance-claim-intake.bpmn) with its [handlers](insurance-claim-intake-overlay.json) splits twice without a gateway. Inside the Sub-Process *Intake*, the mapped Service Task *Register claim* writes `claimNumber` and leaves on two flows: to the User Task *Archive documents* and to the Send Task *Notify broker*, each ending its own branch, so *Intake* completes when both have. The User Task *Review claim* follows and leaves on two flows: to the mapped Service Task *Order assessment*, which writes `assessmentReference`, and to the User Task *Inform customer*; a Parallel join meets them before *Decide claim*.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Archive first](intake-archive-first.scenario.json) completes *Archive documents* before *Notify broker* and *Order assessment* before *Inform customer*.
- [Broker first](intake-broker-first.scenario.json) completes them in the other orders.
