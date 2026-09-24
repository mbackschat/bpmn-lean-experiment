# Travel cancellation Compensation profile

[profile.json](profile.json) registers the exact checked-source Compensation account under its unchanged draft identity. The [public registration amendment](../../docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#public-registration-amendment) owns its meaning and exclusions; the [travel cancellation scenarios](../../scenarios/compensation/README.md) exercise success, handler failure, and stale-task refusal.

BPMN 2.0.2 is the Compensation authority. `CIB-AGR-0002` and `CIB-OP-0001` concern only reused ordinary User Task discovery/completion and occurrence mapping. The profile selects no CIB Compensation behavior or execution target.

Process start requires the Program-derived `Property_TravelDetails` String binding. User Task submitted values and handler-result local patches are empty. Single-effect handlers preserve the admitted dependency and snapshot account: ground travel and insurance compensation start together, while hotel compensation waits for ground travel compensation. Handler failure commits the capsule's typed fail-fast Process outcome.

Run the focused registration checks from the repository root after building the workspace:

```sh
node --test packages/differential/test/compensation-pipeline-cases.test.ts
```

Registration does not widen element identities, source topology, fixed limits, handler bodies or dependencies. Transactions, generic Compensation, and Product 2 failed-Process support remain excluded; browser-catalog eligibility is false.
