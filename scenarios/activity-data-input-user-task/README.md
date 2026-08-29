# Activity data-input User Task scenarios

This directory contains one exact BPMN 2.0.2 invoice-review source and three answer-free scenarios for the [Activity data-input mediation proposal](../../docs/capsules/ACTIVITY-DATA-INPUT-MEDIATION-PROPOSAL.md). The User Task declares one required scalar `DataInput`, one `InputSet`, one empty `OutputSet`, and one direct `DataInputAssociation` from the Process-owned `Property_ReviewContext`.

The [present scenario](present.scenario.json) starts with a nonempty String review context, so the association executes and the task becomes active carrying that exact value, then completes with no submitted value. The [null scenario](null.scenario.json) starts the same Property as explicit null, which is available data and must reach the same active task with an explicit-null input. The [absent scenario](absent.scenario.json) omits the binding entirely, so the source is unavailable and the Process stays at the task's incoming control place with no open task.

The null and absent pair is the discriminator: an implementation that tests truthiness, erases null, or activates before executing the association collapses two different stable observations into one. No scenario carries an expected result, a Temporal Run identity, or a CIB Data Association target; the recorded CIB reference covers only the reused User Task lifecycle.
