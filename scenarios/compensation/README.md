# Confirmed travel cancellation

[travel-cancellation.bpmn](travel-cancellation.bpmn) confirms a hotel, ground travel, and insurance itinerary before reversing the confirmed arrangements. Its display names explain the business work; its identities, topology, declarations and limits retain the reviewed source checkpoint. The [profile](../../profiles/bpmn-2.0.2/README.md) and [trigger account](../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md) own the bounded semantics.

A is hotel reservation, B is ground travel, and C is insurance. Ground travel depends on the hotel reservation; insurance is independent. Compensation reverses that dependency, so B and C become active together and A becomes active only after B succeeds.

| Neutral scenario | Forward completion order | Handler results |
|---|---|---|
| [Success B/C/A](success-b-c-a.scenario.json) | A, B, C | B, C, A succeed |
| [Success B/A/C](success-b-a-c.scenario.json) | C, A, B | B, A, C succeed |
| [Success C/B/A](success-c-b-a.scenario.json) | A, C, B | C, B, A succeed |
| [Hotel failure](failure-a.scenario.json) | A, B, C | B succeeds, A fails while C remains active |
| [Ground-travel failure](failure-b.scenario.json) | A, B, C | B fails while C remains active and A remains pending |
| [Insurance failure](failure-c.scenario.json) | A, B, C | C fails while B remains active and A remains pending |

Every scenario retries its first completed User Task occurrence under a new command ID immediately after success. All handler outcomes are explicit neutral inputs with empty local patches and production content-bound completion IDs; expected observations are absent. The ground-travel handler receives the retained itinerary through its direct restored input binding.

The scenarios declare no CIB counterpart (`cibRevision` `not-applicable`): CIB Seven cannot deploy the model, whose compensation Service Tasks carry no CIB implementation attribute, and open-row witnesses with CIB answers cover the same behavior, as recorded in the [compensation semantics](../../docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md). Lean, the TypeScript kernel and ordered real Temporal Activities consume the same scenario inputs, with exact semantic comparison and primary-history replay.

Run the focused artifact, chronology, identity and comparator checks from the repository root after building the workspace:

```sh
node --test packages/differential/test/compensation-pipeline-cases.test.ts
```

These scenarios supplement the private finite cross-product without replacing it. Browser eligibility remains false until Product 2 supports the typed failed-Process contract. No Transaction or broader Compensation capability is selected.
