# Message-addressed Receive Task scenario

This [answer-free scenario](scenario.json) starts the exact project-authored Receive Task Process, delivers the selected direct Message to the active semantic subscription, and requests the complete canonical observation surface. The [Receive Task specification](../../docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md) owns its semantics, exclusions, and evidence lanes.

The BPMN root Message name `newInvoiceMessage` is required for CIB's public delivery API but is deliberately absent from the canonical channel, whose identity is the source Message ID `Message_NewInvoice`.
