# Activity data-input/output User Task source

This directory contains the exact BPMN 2.0.2 claim-assessment source for the [Activity data-input/output mediation proposal](../../docs/capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-PROPOSAL.md). The User Task declares one required scalar `DataInput` in one `InputSet`, one required scalar `DataOutput` in one `OutputSet`, and two direct associations connecting distinct Process-owned Properties to the two ends of one Activity lifetime.

The required independent semantic-checkpoint review separates this source witness from answer-free schedules. Positive, explicit-null, unavailable-input, and invalid-output schedules belong to the later closure lane authorized by that verdict.

The two Properties, data items, and associations use distinct identifiers so parser-reference resolution, copied-input publication, submitted-output matching, and association-routed Process writes cannot agree by name coincidence. The model carries no CIB Data Association target; the closure profile's CIB relationships will cover only the reused User Task lifecycle and exact occurrence-addressed completion boundary.
