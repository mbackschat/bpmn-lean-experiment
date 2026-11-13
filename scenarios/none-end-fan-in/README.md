# None End fan-in scenarios

The [None End fan-in specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the model is a witness for the [`cibseven-2.2.0-scope-chain` profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

The [travel request](travel-request.bpmn) with its [handler](travel-request-overlay.json) assesses a request in the Sub-Process *Assess request*, which copies `decision` and `channel` to the Process. *Route request* then sends a rejection straight to the None End *Request closed*, a phone request to *Call traveller* and otherwise books the travel through a mapped Service Task; *Call traveller* and *Book travel* also flow to *Request closed*, which so has three incoming flows.

The travel request tests of the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) calibrate the same journeys on CIB Seven `2.2.0` with JUEL renditions of the conditions.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Rejected](travel-rejected.scenario.json) ends from *Route request* in the closure that chose.
- [By phone](travel-by-phone.scenario.json) ends from *Call traveller* after its completion.
- [Booked](travel-booked.scenario.json) ends from *Book travel* after its effect result.
