# User Task Process data with preserved notation scenario

The [answer-free composition scenario](scenario.json) reuses the exact [preserved-notation BPMN source](../user-task-preserved-notation/process.bpmn) while selecting the named CIB Seven Process-data preservation profile. It starts with two String bindings, overwrites one String value on User Task completion, adds one present Null value, and reaches Process completion.

The independently authored [executed-only twin](../user-task-discovery-completion/process.bpmn) is compiled under the same profile. After normalizing only exact source identity, both sources must produce the same checked execution projection, Semantic Process program, and semantic trace. The Process-data predecessor continues to reject the notation-bearing source, while the preservation predecessor continues to reject this scenario's nonempty variable writes.

The witness composes already-selected behavior only. Diagram Interchange, Collaboration presentation, lanes, artifacts, Documentation, and standard Definitions provenance remain in exact source bytes and acquire no execution or observation meaning.
