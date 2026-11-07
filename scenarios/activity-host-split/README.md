# Activity host split scenarios

The [split proposal](../../docs/capsules/ACTIVITY-HOST-SPLIT-PROPOSAL.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its three Service and Send Tasks to caller-supplied Activity handlers.

The [insurance claim intake](insurance-claim-intake.bpmn) with its [handlers](insurance-claim-intake-overlay.json) splits twice without a gateway. Inside the Sub-Process *Intake*, the mapped Service Task *Register claim* writes `claimNumber` and leaves on two flows: to the User Task *Archive documents* and to the Send Task *Notify broker*, each ending its own branch, so *Intake* completes when both have. The User Task *Review claim* follows and leaves on two flows: to the mapped Service Task *Order assessment*, which writes `assessmentReference`, and to the User Task *Inform customer*; a Parallel join meets them before *Decide claim*.

The [source test](../../packages/bpmn-source/test/activity-host-split-source.test.ts) compiles the model and its Send Task twin at the Program and checked levels and refuses the one-fact edits that leave the class, each beside an admitted control.

Two answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/activity-host-split-pipeline-cases.ts); together they complete each split's branches in both orders, each with one seeded mutation:

- [Archive first](intake-archive-first.scenario.json) completes *Archive documents* before *Notify broker* and *Order assessment* before *Inform customer*; its mutation leaves *Notify broker* closed after *Register claim* completes, as a host taking its first output only would.
- [Broker first](intake-broker-first.scenario.json) completes them in the other orders; its mutation leaves *Inform customer* closed after *Review claim* completes, as a host taking its first output only would.
