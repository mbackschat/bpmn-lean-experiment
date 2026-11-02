# Exclusive choice arity scenarios

The [Exclusive choice arity specification](../../docs/capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

The [complaint handling](complaint-handling.bpmn) with its [handler](complaint-handling-overlay.json) classifies a complaint in the Sub-Process *Review complaint*, which copies `category` and `priority` to the Process. *Route complaint* then tests, in declaration order, an urgent priority, a billing category and a delivery category, and otherwise answers the customer; a delivery complaint reships the order through a mapped Service Task. After the four branches merge, *Follow-up needed* confirms delivery on its one condition and otherwise closes the complaint.

The [source test](../../packages/bpmn-source/test/exclusive-choice-arity-source.test.ts) compiles the model, locks candidate order to flow declaration order and refuses the one-fact edits that leave the class; the [runtime test](../../packages/bpmn-source/test/exclusive-choice-arity-runtime.test.ts) runs the four schedules of *Route complaint* and the reversed declarations in committed state. The complaint handling tests of the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) calibrate the same four schedules on CIB Seven `2.2.0` with JUEL renditions of the conditions.

Three answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/exclusive-choice-arity-pipeline-cases.ts), each with one seeded mutation:

- [Urgent billing](complaint-urgent-billing.scenario.json) opens *Escalate to supervisor* although the billing candidate is also true, and *Follow-up needed* takes its default. Its mutation opens *Correct invoice* instead, as selecting the last true candidate would.
- [Delivery](complaint-delivery.scenario.json) arms *Reship order* after two false candidates, and its result leads *Follow-up needed* to *Confirm delivery*. Its mutation arms nothing, as evaluation that stops after two candidates would.
- [Product](complaint-product.scenario.json) opens *Answer customer* after three false candidates, and *Follow-up needed* takes its default. Its mutation opens no task, as a no-match that skips the default would.
