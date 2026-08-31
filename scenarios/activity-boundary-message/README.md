# Interrupting Activity boundary Message scenarios

This directory contains one exact [BPMN 2.0.2 source](process.bpmn) and two answer-free schedules for the [interrupting Activity boundary Message specification](../../docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md). One User Task owns one omission-only interrupting, payload-free, operation-addressed Message Boundary Event, and its normal and boundary routes reach distinct follow-on User Tasks.

The [task-wins schedule](task-wins.scenario.json) completes the review, proves that only the normal follow-on is open, delivers the now-stale withdrawal Message and preserves the complete state on rejection, then completes the normal follow-on. The [Message-wins schedule](message-wins.scenario.json) delivers the withdrawal, proves that only the boundary follow-on is open, submits the now-stale review completion and preserves the complete state on rejection, then completes the boundary follow-on.

Lean, the independently implemented TypeScript semantic core, and the Temporal adapter execute the same source bytes and compare exact canonical traces. The cases select no CIB target or retained CIB answer. Target inputs carry no winner annotation or expected result; their ordered stimuli are the explicit semantic schedules.
