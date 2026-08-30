# Message payload catch mediation source

This directory retains the exact BPMN source selected by the [Message payload catch mediation capsule](../../docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-PROPOSAL.md). One Intermediate Catch Message Event owns one required scalar DataOutput and direct DataOutputAssociation into a distinct Process Property; the Message and DataOutput resolve to the same ItemDefinition object, while the output, association, Property, Message, and surrounding control route retain distinct identities.

Three answer-free scenarios are registered for the full Lean/core/Temporal differential:

- [supplied-scalar.scenario.json](supplied-scalar.scenario.json) supplies one String.
- [supplied-null.scenario.json](supplied-null.scenario.json) supplies explicit null.
- [absent-payload.scenario.json](absent-payload.scenario.json) sends a payload-free delivery that must be refused while the Message subscription stays live.

The supplied-scalar schedule also binds the retained settlement-confirmation whole model, capability inventory, generated corpus map, Product 2 About-page disclosure, and Product 1 runnable example. Temporal evidence covers payload-sensitive command and recovery identity, forced continuation, Worker replacement, refusal preservation, the routed write, terminal receipts, and replay.
