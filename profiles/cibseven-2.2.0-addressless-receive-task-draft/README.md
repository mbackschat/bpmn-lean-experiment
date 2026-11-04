# Addressless Receive Task draft profile

This draft profile selects one private executable None Start → payload-free Receive Task without a Message → None End Process against CIB Seven `2.2.0`. The [addressless Receive Task account](../../docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md) owns its semantics and exclusions.

[`CIB-INT-0004`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0004--a-receive-task-without-a-message-waits-for-an-occurrence-addressed-trigger) classifies the wait CIB resumes by execution signal; [`CIB-OP-0011`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-op-0011-cib-execution-waiting-at-an-addressless-receive-task-mapped-to-the-project-occurrence) maps the waiting execution to the project occurrence and its field-free `unspecifiedMessage` channel.
