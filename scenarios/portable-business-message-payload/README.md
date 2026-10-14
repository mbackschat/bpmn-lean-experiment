# Portable business Message payload scenarios

The [profile](../../profiles/bpmn-2.0.2-portable-business-message-payload-draft/README.md) and [capsule amendment](../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#structured-message-payload-consuming-amendment) own the bounded account. [process.bpmn](process.bpmn) is the retained project-authored shipment-manifest intake: a shipment Process starts, waits at the Intermediate Catch Message Event *Manifest received* whose payload is one structured manifest, and the User Task *Review manifest* sees that manifest in public Process data before the Process ends. Neutral stimuli contain no expected answer and select Lean, TypeScript and Temporal with CIB absent.

| Scenario | Journey |
|---|---|
| [Manifest delivered](manifest-delivered.scenario.json) | The delivery carries a Map with two equal and one unequal parcel, a negative scale-two Decimal, a nested consignee Map with a present Null and a Boolean; the Property holds it whole at the Review wait and at termination. |
| [Payload-free delivery refused](manifest-payload-free-refused.scenario.json) | A payload-free delivery is refused with the subscription live and no Process data written, then the same manifest is accepted and reviewed. |

The [registration controls](../../packages/differential/test/portable-message-payload-pipeline-cases.test.ts) check public admission, every Process value at the Review wait and at termination, and the seeded mutations. A root List payload and an over-long root String are typed refusals outside the scenario domain, and a Map holding a legacy String list is malformed at the wire boundary, so they live in the [value-domain matrix](../../packages/differential/test/scenario-value-domain-cases.ts) and the [command tests](../../packages/bpmn-source/test/portable-message-payload.test.ts) instead.
