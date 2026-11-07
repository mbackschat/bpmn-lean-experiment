# Activity host merge scenarios

The [Activity host specification](../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its three Service Tasks to caller-supplied Activity handlers.

The [claim review](claim-review.bpmn) with its [handlers](claim-review-overlay.json) triages a claim into `triage`. An expert claim goes to *Obtain expert opinion*, which writes `opinion`, and any other claim goes straight to the User Task *Review claim*, which the opinion also reaches: *Review claim* merges two incoming flows. *Fetch review outcome* reads the reviewer's decision into `review`, and a reopened claim goes back to *Obtain expert opinion*, which therefore merges too; otherwise the claim is decided. The cycle's only cuts are the two merging Tasks.

The [source test](../../packages/bpmn-source/test/activity-host-merge-source.test.ts) compiles the model and its Service, Send and Link twins at the Program and checked levels and refuses the one-fact edits that leave the class.

Three answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/activity-host-merge-pipeline-cases.ts), each with one seeded mutation:

- [Direct](claim-direct.scenario.json) triages the claim as direct, which opens *Review claim* from the Choice, and accepts it; its mutation leaves *Review claim* closed after the triage, as a merge waiting for every incoming flow would.
- [Expert](claim-expert.scenario.json) triages the claim for an expert, whose opinion opens *Review claim* through its other incoming flow; its mutation leaves *Review claim* closed after the opinion, as a lowering that kept the direct input only would.
- [Direct, reopened](claim-direct-reopened.scenario.json) reopens the directly reviewed claim, so the expert opinion opens *Review claim* a second time, as activation 2; its mutation reopens it as activation 1, as a merge reusing the first arrival's occurrence would.
