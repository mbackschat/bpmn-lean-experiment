# BPMN 2.0.2 Message key correlation draft profile

This standards profile selects one context-backed, single-property `CorrelationKey` for one non-instantiating Intermediate Catch Message Event. An earlier directly addressed payload Message writes one non-empty String to the bound Process `Property`; a later global publication extracts the same scalar key from its payload, matches exactly one current Process-instance candidate under the complete immutable semantic-definition address, and advances only that correlated wait.

The exact source graph includes one definitional Collaboration, its two Participants and Message Flows, one Conversation-owned key, one root CorrelationProperty and retrieval expression, and one Process subscription and binding. Every reference is resolved through the pinned parser graph. The selected expression language admits only `payload` and `property:<resolved-id>`, and exact Unicode scalar-value sequence equality neither normalizes nor folds case.

Zero and ambiguous population matches reject without changing any Process. A selected Process independently rechecks its complete address, subscription occurrence, key identities, current Property, and payload; the correlated catch writes no second payload value. Existing directly addressed Message profiles remain separate and unchanged.

`CIB-LIM-0002` records that pinned CIB Seven parses the modeled correlation graph but does not execute its retrieval or Process-context bindings. It is negative calibration only and selects no CIB correlation target.

The exact account, evidence boundary, durable refinement preflight, and reopen conditions belong to the [Message key correlation proposal](../../docs/capsules/MESSAGE-KEY-CORRELATION-PROPOSAL.md). Status remains `draft`; the mandatory semantic checkpoint does not yet claim Temporal ingress, engine API publication, Product 2 routing, retained whole-model evidence, or general BPMN correlation support.
