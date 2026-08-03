# Interrupting Activity boundary Timer scenarios

This directory currently contains only the exact BPMN 2.0.2 source for the [interrupting Activity boundary Timer capsule](../../docs/capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md); its answer-free scenario documents are **not yet written**, because a registered scenario requires a differential pipeline case and that case requires the absent Temporal deadline scheduler. One bounded User Task owns one interrupting `PT1S` Timer Boundary Event, and each route reaches its own follow-on User Task, which is what makes the route choice observable at the public boundary.

`cancelActivity` is deliberately omitted from the source rather than written as `true`. The XSD and CMOF default it to `true`, so omission is the admissible interrupting form; lexical `false` is a separate proposition and is rejected.

Lean and the independently implemented TypeScript semantic core already execute this source, and the Temporal adapter is the intended third differential target once it can arm the deadline durably. No CIB boundary-Timer relationship, target, or retained evidence is selected. Target inputs added here must carry no winner annotation and no expected result.
