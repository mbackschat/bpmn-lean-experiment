# Message payload catch mediation source

This directory retains the exact BPMN source selected by the [Message payload catch mediation proposal](../../docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-PROPOSAL.md). One Intermediate Catch Message Event owns one required scalar DataOutput and direct DataOutputAssociation into a distinct Process Property; the Message and DataOutput resolve to the same ItemDefinition object, while the output, association, Property, Message, and surrounding control route retain distinct identities.

The source/IL checkpoint admits and lowers these bytes under `bpmn-2.0.2-message-payload-catch-draft` but deliberately registers no scenario document or runtime result. Payload delivery, wait arming, publication, schemas, Lean, differential evidence, Temporal hosting, and corpus registration remain downstream of the required semantic-checkpoint review.
