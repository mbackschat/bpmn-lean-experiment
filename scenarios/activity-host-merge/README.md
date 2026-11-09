# Activity host merge scenarios

The [Activity host specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its three Service Tasks to caller-supplied Activity handlers.

The [claim review](claim-review.bpmn) with its [handlers](claim-review-overlay.json) triages a claim into `triage`. An expert claim goes to *Obtain expert opinion*, which writes `opinion`, and any other claim goes straight to the User Task *Review claim*, which the opinion also reaches: *Review claim* merges two incoming flows. *Fetch review outcome* reads the reviewer's decision into `review`, and a reopened claim goes back to *Obtain expert opinion*, which therefore merges too; otherwise the claim is decided. The cycle's only cuts are the two merging Tasks.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Direct](claim-direct.scenario.json) triages the claim as direct, which opens *Review claim* from the Choice, and accepts it.
- [Expert](claim-expert.scenario.json) triages the claim for an expert, whose opinion opens *Review claim* through its other incoming flow.
- [Direct, reopened](claim-direct-reopened.scenario.json) reopens the directly reviewed claim, so the expert opinion opens *Review claim* a second time, as activation 2.
