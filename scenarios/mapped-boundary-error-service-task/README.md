# Mapped-boundary-Error Service Task scenario

This directory contains the exact admitted BPMN source and one answer-free schedule for the [typed BPMN Error and interrupting boundary-error specification](../../docs/capsules/BOUNDARY-ERROR-SPEC.md). The Service Task returns the typed business-error arm, the matching exact-code boundary Error interrupts the normal route, and execution continues only through the boundary Sequence Flow to its User Task.

The [BPMN fixture](process.bpmn) is project-authored MIT-licensed source under the distinct `cibseven-2.0.0-mapped-boundary-error-service-task-draft` profile.

The [answer-free scenario](scenario.json) carries the effect-completion input without an expected route, code, or trace, and the [retained CIB Seven `2.0.0` evidence](cibseven-evidence.json) is content-bound to the exact scenario and profile digests. Neither establishes general service-fault, incident, unmatched-Error, or propagation behavior; the specification owns those exclusions.
