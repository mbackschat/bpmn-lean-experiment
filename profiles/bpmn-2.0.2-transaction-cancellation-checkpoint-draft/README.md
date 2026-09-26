# Transaction cancellation profile

[profile.json](profile.json) registers the bounded source account defined by the approved [Transaction cancellation capsule](../../docs/capsules/TRANSACTION-CANCELLATION-SPEC.md). The [reservation withdrawal scenarios](../../scenarios/transaction-cancellation/README.md) bind exact XML bytes and explicit commands to this profile identity.

BPMN 2.0.2 supplies the cancellation and completed-Activity compensation account. `CIB-AGR-0002` and `CIB-OP-0001` concern only reused ordinary User Task discovery/completion and occurrence mapping; no CIB Transaction or Compensation execution target is selected. Scenario provenance records that absence explicitly.

The profile admits the capsule's depth-one Transaction with two linear User Task branches, one Cancel End, one attached Cancel Boundary Event and one eligible compensation subject. Cancellation interrupts ordinary child work, compensates completed eligible work, and releases the parent acknowledgement only after the single handler succeeds. A typed handler failure uses the capsule's fail-fast Process interpretation. Process-start variables, User Task submitted values and handler-result local patches are empty.

Successful protocol-controlled Transactions, hazard recovery, multiple compensation subjects and general Transaction control flow remain excluded. The [RC catalog](../../docs/BPM-PLATFORM-BROWSER-WALKTHROUGH.md#rc-process-showcase-catalog) adds an exact reservation-withdrawal journey with simulated participants and effects; human-work forms remain absent. Registration changes no existing profile or semantic rule.

The focused artifact and comparison gate uses existing workspace build outputs:

```sh
node --test packages/differential/test/transaction-cancellation-pipeline-cases.test.ts
```
