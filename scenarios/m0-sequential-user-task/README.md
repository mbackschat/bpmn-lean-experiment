# Milestone 0 sequential User Task scenario

This directory contains the first implementation-neutral walking-skeleton input.

- [process.bpmn](process.bpmn) is actual BPMN 2.0 XML containing an explicitly executable private Process with a None Start Event, User Task, None End Event, and two Sequence Flows.
- [scenario.json](scenario.json) supplies stable identities, ordered external stimuli, requested observations, source provenance, and the content hash of the BPMN resource.

The BPMN resource validates against the locally ingested official BPMN 2.0.2 XSD. It intentionally contains no vendor namespace, extension, expression, variable, diagram-interchange data, or generated runtime identifier.

The expected trace remains `null` until the pinned CIB probe in M0.2 calibrates the observable behavior. Lean and TypeScript must not invent that missing evidence.

The first CIB behavioral precedents are [UserTaskTest](../../../oss/cibseven/cibseven/engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/UserTaskTest.java), which starts a Process and observes the active task through public services, and [TaskAssigneeTest](../../../oss/cibseven/cibseven/engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/TaskAssigneeTest.java), which completes a task and asserts Process completion. The milestone scenario is independently authored and removes their assignment and vendor-specific concerns.
