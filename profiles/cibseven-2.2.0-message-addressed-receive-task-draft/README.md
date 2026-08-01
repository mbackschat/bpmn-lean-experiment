# Message-addressed Receive Task draft profile

This immutable draft profile selects one private executable None Start → payload-free Message-addressed Receive Task → None End Process against CIB Seven `2.2.0`. The exact semantics and exclusions are owned by the [Receive Task specification](../../docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md).

The retained CIB lane observes one public Message subscription and completion after public delivery under [`CIB-AGR-0009`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-agr-0009--message-addressed-receive-task-subscription-lifecycle). [`CIB-OP-0005`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-op-0005--cib-message-subscription-mapped-to-project-semantic-subscription-identity) owns the bounded mapping from generated host subscription identity to the project occurrence and direct Message channel. The root Message name remains source-admission and CIB-delivery data; it is not canonical Message identity.
