# Exclusive choice arity scenarios

The [Exclusive choice arity specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

The [complaint handling](complaint-handling.bpmn) with its [handler](complaint-handling-overlay.json) classifies a complaint in the Sub-Process *Review complaint*, which copies `category` and `priority` to the Process. *Route complaint* then tests, in declaration order, an urgent priority, a billing category and a delivery category, and otherwise answers the customer; a delivery complaint reships the order through a mapped Service Task. After the four branches merge, *Follow-up needed* confirms delivery on its one condition and otherwise closes the complaint.

The complaint handling tests of the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) calibrate the same four schedules on CIB Seven `2.2.0` with JUEL renditions of the conditions.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Urgent billing](complaint-urgent-billing.scenario.json) opens *Escalate to supervisor* although the billing candidate is also true, and *Follow-up needed* takes its default.
- [Delivery](complaint-delivery.scenario.json) arms *Reship order* after two false candidates, and its result leads *Follow-up needed* to *Confirm delivery*.
- [Product](complaint-product.scenario.json) opens *Answer customer* after three false candidates, and *Follow-up needed* takes its default.
