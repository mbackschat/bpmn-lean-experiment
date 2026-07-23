# Milestone 0 sequential User Task scenario

This directory contains the first implementation-neutral walking-skeleton input.

- [process.bpmn](process.bpmn) is actual BPMN 2.0 XML containing an explicitly executable private Process with a None Start Event, User Task, None End Event, and two Sequence Flows.
- [scenario.json](scenario.json) supplies stable identities, ordered external stimuli, requested observations, source provenance, and the content hash of the BPMN resource.

The BPMN resource validates against the locally ingested official BPMN 2.0.2 XSD. It intentionally contains no vendor namespace, extension, expression, variable, diagram-interchange data, or generated runtime identifier.

The expected trace is calibrated by the pinned CIB Seven M0.2 oracle. It records successful deployment, committed start, one active User Task with one enabled completion stimulus, committed completion, and completed Process status at unchanged logical time. The Java test parses this artifact back into the typed canonical vocabulary before comparing it with two isolated engine runs.

The first CIB behavioral precedents are [`UserTaskTest`](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/UserTaskTest.java), which starts a Process and observes the active task through public services, and [`TaskAssigneeTest`](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/usertask/TaskAssigneeTest.java), which completes a task and asserts Process completion. The milestone scenario is independently authored and removes their assignment and vendor-specific concerns.
