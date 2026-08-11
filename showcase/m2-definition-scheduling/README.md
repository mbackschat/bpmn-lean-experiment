# M2 exact-version definition scheduling

This private development package owns the live Temporal refinement and cancellation witness required by the [definition-scheduling proposal](../../docs/BPM-PLATFORM-DEFINITION-SCHEDULING-PROPOSAL.md#required-evidence) for the [M2 showcase](../../docs/PLAN.md#m2--the-file-runs-its-real-shape). It contains test composition only and adds no production API or behavior.

The witness uses only the public platform server, platform contracts, and Temporal testkit package roots. It deploys two exact Timer Start versions through HTTP, survives a platform restart and Worker absence, proves the one Schedule action remains bound to version 1, completes and replays the resulting Process, exercises the action-wins cancellation race, and proves durable pre-start cancellation creates no Workflow. Temporal Schedule, Workflow, and Run identities remain test-only evidence and are rejected from every captured public JSON response.

Run the focused gate against the cached pinned Temporal CLI:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/showcase-m2-definition-scheduling test
```
