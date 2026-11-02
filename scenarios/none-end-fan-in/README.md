# None End fan-in scenarios

The [None End fan-in proposal](../../docs/capsules/NONE-END-FAN-IN-PROPOSAL.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

The [travel request](travel-request.bpmn) with its [handler](travel-request-overlay.json) assesses a request in the Sub-Process *Assess request*, which copies `decision` and `channel` to the Process. *Route request* then sends a rejection straight to the None End *Request closed*, a phone request to *Call traveller* and otherwise books the travel through a mapped Service Task; *Call traveller* and *Book travel* also flow to *Request closed*, which so has three incoming flows.

The [source test](../../packages/bpmn-source/test/none-end-fan-in-source.test.ts) compiles the model, locks one `reachNoneEnd` per incoming flow and refuses the one-fact edits that leave the class; the [runtime test](../../packages/bpmn-source/test/none-end-fan-in-runtime.test.ts) runs the three journeys in committed state. The travel request tests of the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) calibrate the same journeys on CIB Seven `2.2.0` with JUEL renditions of the conditions.

Three answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/none-end-fan-in-pipeline-cases.ts), each with one seeded mutation:

- [Rejected](travel-rejected.scenario.json) ends from *Route request* in the closure that chose. Its mutation leaves the Process running, as an End that joins its incoming flows would.
- [By phone](travel-by-phone.scenario.json) ends from *Call traveller* after its completion. Its mutation leaves the Process running, as a lowering of only the first incoming flow would.
- [Booked](travel-booked.scenario.json) ends from *Book travel* after its effect result. Its mutation leaves the Process running, as a lowering of only the first incoming flow would.
