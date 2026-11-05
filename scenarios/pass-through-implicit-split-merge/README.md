# Pass-through implicit split and merge scenarios

The [pass-through implicit split and merge specification](../../docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#separating-witnesses) owns the bounded account; the models are witnesses for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), each with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

- The [claim archiving](claim-archiving.bpmn) with its [handler](claim-archiving-overlay.json) assesses a claim into `decision` and chooses by it: an approved claim goes to *Approve payout*, any other to *Write rejection letter*. Both flow straight into the Manual Task *Archive claim file*, an implicit merge, before the End.
- The [equipment dispatch](equipment-dispatch.bpmn) with its [handler](equipment-dispatch-overlay.json) reserves the equipment into `reservation`, then the Manual Task *Print dispatch note* with two outgoing flows, an implicit split, opens *Pack equipment* and *Book courier*, which a Parallel Gateway joins before the End.

The [source test](../../packages/bpmn-source/test/pass-through-implicit-split-merge-source.test.ts) compiles both models and their Abstract Task and None Throw twins at the Program and checked levels and refuses the one-fact edits that leave the class, and the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) calibrates both models and their twins on CIB Seven `2.2.0`.

Four answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/pass-through-implicit-split-merge-pipeline-cases.ts), each with one seeded mutation:

- [Claim approved](claim-approved.scenario.json) approves the claim and the payout, which passes *Archive claim file* once and completes the Process; its mutation leaves the Process running there, as a merge waiting for every incoming flow would.
- [Claim rejected](claim-rejected.scenario.json) rejects the claim and writes the letter, which passes *Archive claim file* once through its other incoming flow; its mutation leaves the Process running there, as a waiting merge would.
- [Packed first](dispatch-packed-first.scenario.json) returns the reservation, whose closure passes *Print dispatch note* once and opens both User Tasks, then packs before booking the courier; its mutation opens one User Task after the reservation, as a split read as a choice would.
- [Courier first](dispatch-courier-first.scenario.json) books the courier before packing; the Process completes at the join. Its mutation leaves nothing open once the courier is booked, as a choice that took the courier flow alone would.
