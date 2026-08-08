# User Task with preserved notation scenario

This directory contains one [answer-free standards-profile witness](scenario.json) for [preserve-only admission](../../docs/PRESERVE-ONLY-ADMISSION-SPEC.md). Its executed Process is exactly `None Start Event → User Task → None End Event`, and the source additionally carries a pool, a lane, Process documentation, a text annotation, an association, and complete Diagram Interchange.

None of that notation executes. The source is the deliberate counterpart of [the executed-only twin](../user-task-discovery-completion/process.bpmn): the two carry the same flow elements and different bytes, and the compiler must reach the same checked graph and the same lowered program from both once exact-source identity is normalized away. The twin is written by hand rather than produced by stripping this file with the classifier, so agreement between them is evidence about the classifier and not a restatement of it.

The scenario starts the Process with no variables, completes the resulting User Task occurrence with no submitted values, and reaches Process completion. Variables are deliberately absent: this witness exists to separate admission from execution, and adding data would make a difference in the trace attributable to two causes instead of one.

CIB Seven does not run this scenario and supplies no retained result. Preservation resolves no CIB-specific choice, the source requires no `camunda:*` extension, and CIB's observation boundary does not expose Diagram Interchange, so the profile names BPMN 2.0.2 as its only authority.
