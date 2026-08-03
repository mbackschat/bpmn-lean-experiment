# Interrupting Activity boundary Timer scenarios

This directory contains one exact BPMN 2.0.2 source and the answer-free scenarios for the [interrupting Activity boundary Timer capsule](../../docs/capsules/ACTIVITY-BOUNDARY-TIMER-PROPOSAL.md). One bounded User Task owns one interrupting `PT1S` Timer Boundary Event, and each route reaches its own follow-on User Task, which is what makes the route choice observable at the public boundary.

`cancelActivity` is deliberately omitted from the source rather than written as `true`. The XSD and CMOF default it to `true`, so omission is the admissible interrupting form; lexical `false` is a separate proposition and is rejected.

Lean, the independently implemented TypeScript semantic core, and the Temporal adapter are the differential targets. No CIB boundary-Timer relationship, target, or retained evidence is selected. The target inputs carry no winner annotation and no expected result.
