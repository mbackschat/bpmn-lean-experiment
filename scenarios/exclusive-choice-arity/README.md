# Exclusive choice arity scenarios

The [Exclusive choice arity proposal](../../docs/capsules/EXCLUSIVE-CHOICE-ARITY-PROPOSAL.md#separating-witnesses) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

The [complaint handling](complaint-handling.bpmn) with its [handler](complaint-handling-overlay.json) classifies a complaint in the Sub-Process *Review complaint*, which copies `category` and `priority` to the Process. *Route complaint* then tests, in declaration order, an urgent priority, a billing category and a delivery category, and otherwise answers the customer; a delivery complaint reships the order through a mapped Service Task. After the four branches merge, *Follow-up needed* confirms delivery on its one condition and otherwise closes the complaint.

The [source test](../../packages/bpmn-source/test/exclusive-choice-arity-source.test.ts) compiles the model, locks candidate order to flow declaration order and refuses the one-fact edits that leave the class; the [runtime test](../../packages/bpmn-source/test/exclusive-choice-arity-runtime.test.ts) runs the four schedules of *Route complaint* and the reversed declarations in committed state.
