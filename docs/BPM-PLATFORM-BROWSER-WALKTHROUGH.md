# BPM platform browser walkthrough

## Status

Implemented and maintained as a text-first tutorial over the containerized Product 2 evaluation distribution. The screenshots are generated from the same public browser journey and illustrate stable landmarks, but the instructions remain complete when images are unavailable. This is a user guide and evaluation aid, not semantic, compatibility, performance, or production-capacity evidence.

## What you will do

This walkthrough uses one persistent evaluation topology to:

1. inspect the exact capability boundary;
2. deploy and diagram a BPMN definition;
3. start an exact definition version;
4. claim and complete a structured Human Task;
5. inspect semantic History, the terminal Diagram, and exact-version metrics;
6. create two Service Task incidents;
7. retry one incident and cancel the other Process;
8. inspect the resulting Product 2 audit records.

```mermaid
flowchart LR
  About[Inspect capabilities] --> Deploy[Deploy exact BPMN]
  Deploy --> Start[Start exact version]
  Start --> Work[Claim and complete Human Work]
  Work --> Operate[Inspect History, Diagram, and metrics]
  Operate --> Incidents[Retry and cancel incidents]
  Incidents --> Audit[Inspect action audit]
```

The browser talks only to the public Product 2 HTTP API. The API reaches the Temporal-hosted engine through the narrowed engine gateway, while PostgreSQL-backed recovery workers refresh projections outside request handling.

## Seven-minute MUE Preview Alpha live demo

Use this run of show when presenting the project rather than evaluating each workflow manually. It combines one credible business Process with the canonical breadth view and the separate Multi-Instance proof, without implying that every reviewed semantic variant belongs to one executable profile.

Prepare a fresh isolated Product 2 distribution before the audience arrives:

```sh
./scripts/pnpm.sh run demo:prepare
./scripts/pnpm.sh run demo:status
```

Keep the printed `LIVE_DEMO_READY` origin open in Chromium. Then present these acts:

1. **Honest breadth, about 45 seconds.** Open **About**. Show that the evidence-backed summary equals the complete canonical table and point out **Not a conformance claim**. Explain that each row is bound to an exact reviewed profile rather than inferred from a product screen.
2. **Real-world headline, about three minutes.** Run `./scripts/pnpm.sh run demo:mue-headline`. The headed Chromium journey deploys the retained expense-exception Process, shows its BPMN diagram, and pauses at useful forms for **Approve**, **Request changes**, and **Abort** before finishing on committed semantic History. The forms cover text, date, decimal, choice, multi-choice, boolean, conditional required input, and destructive-action confirmation.
3. **Engine Alpha proof, about two minutes.** Run `./scripts/pnpm.sh run demo:mue-preview-alpha`. The headed journey shows natural Sequential Multi-Instance completion and an interrupting Timer Boundary Event over the same mechanism, ending on the committed aggregate in both cases.
4. **Close on evidence, about one minute.** Return to the prepared Product 2 origin and use the detailed walkthrough below to show an exact definition version, engine-published History, a terminal Diagram, or incident operations according to the audience's interest.

The headline and Alpha commands each start their own exact ephemeral Temporal-backed witness so that presenter pacing cannot mutate ordinary evidence. The prepared distribution remains available for free navigation and recovery if either headed command exits.

### Claims and non-claims

- This is **MUE Preview Alpha**, not completion of the current MUE programme.
- The canonical About table demonstrates executable breadth across exact profiles. The expense-exception model demonstrates a coherent real-world Process. Neither is a single all-elements profile.
- Product 2 forms, claims, priorities, and work audit are platform behavior bound to engine-published task identity. They do not add BPMN meaning.
- The demo makes no BPMN conformance, production capacity, high-availability, or benchmark claim.

### Presenter fallback

If the headline browser cannot start, continue from the retained [capability boundary](assets/bpm-platform-browser-walkthrough/01-about-capability-boundary.png), [expense Process diagram](assets/bpm-platform-browser-walkthrough/02-expense-definition-diagram.png), [structured approval form](assets/bpm-platform-browser-walkthrough/04-expense-structured-form.png), and [committed semantic History](assets/bpm-platform-browser-walkthrough/05-completed-process-history.png). If the Alpha witness cannot start, use its retained [natural completion](assets/mue-preview-alpha-demo/01-natural-completion.png), [Timer interruption](assets/mue-preview-alpha-demo/02-timer-interruption.png), and [interrupted completion](assets/mue-preview-alpha-demo/03-interrupted-completion.png) frames. These are fallback illustrations, not substitutes for the executable gates.

## Prerequisites and lifecycle

Install the frozen workspace dependencies and ensure Docker with Compose v2 is available. Reading and performing the walkthrough does not require Lean, Java, the CIB Seven checkout, Playwright, or a host PostgreSQL or Temporal installation.

Start the complete evaluation distribution:

```sh
./scripts/pnpm.sh install --frozen-lockfile
./scripts/pnpm.sh run evaluation:start
```

Open [http://localhost:3000](http://localhost:3000). The shell should show Work, Definitions, Operations, and About, plus `Signed in as demo-user`.

PostgreSQL and Temporal state survive an ordinary stop. If you previously used this distribution and want the exact version numbers and empty collections described below, deliberately remove that retained evaluation state before starting:

```sh
./scripts/pnpm.sh run evaluation:reset
./scripts/pnpm.sh run evaluation:start
```

`evaluation:reset` deletes only the evaluation distribution's named PostgreSQL and Temporal volumes. Do not use it when you want to retain prior evaluation data.

## 1. Inspect the honest capability boundary

Open **About**. Confirm that **Coverage boundary** says **Not a conformance claim** and that the evidence-backed-variant summary equals the complete set of rows in the canonical executable element and semantic-variant table. Compare a standards-only row with a row carrying classified CIB Seven evidence.

The table reports exact variants rather than a percentage. BPMN requirement coverage, selected CIB compatibility, and platform functionality remain separate denominators.

![About workspace showing the versioned BPMN capability boundary and non-conformance notice](assets/bpm-platform-browser-walkthrough/01-about-capability-boundary.png)

## 2. Deploy and inspect structured Human Work

1. Open **Definitions** and expand **Add BPMN definition**.
2. Select [`scenarios/expense-exception-review/process.bpmn`](../scenarios/expense-exception-review/process.bpmn).
3. Enter semantic profile ID `bpmn-2.0.2-bpmn-lean-structured-human-work-draft`.
4. Choose **Deploy definition**.

The result should say **Admitted and deployed** for `Process_ExpenseExceptionReview`, version 1 on a clean distribution. Its **Diagram** view says **Generated layout** because the admitted source intentionally contains no BPMN DI. Product 2 retains a digest-bound presentation sidecar and an exact-source-bound Human Task catalog without changing the admitted source or adding form meaning to Product 1.

![Definitions workspace showing the deployed expense-exception Process and generated BPMN diagram](assets/bpm-platform-browser-walkthrough/02-expense-definition-diagram.png)

Choose **Download diagrammed BPMN** if you want a derived document that merges the exact semantic model with validated BPMN DI for use in a BPMN modeller. It is not the admitted source.

## 3. Start the exact definition version

Open the definition's **Start** view and choose **Start version 1**, or the displayed selected version if you retained earlier state. Keep the returned Process-instance ID.

The public identity binds the instance to its Process ID, definition version, exact source digest, and semantic profile. Product 2 keeps the Temporal observation locator private.

## 4. Claim the current task

1. Open **Work** and choose **Refresh** until **Review exception** appears.
2. Confirm candidate group `reviewers`, priority 80, and state **Unclaimed**.
3. Choose **Claim** and confirm **Claimed by demo-user**.
4. Select **Review exception**, then inspect **Details** and **Diagram** if desired.

Claim state, actor policy, priority, and the form catalog are Product 2 concerns. Task occurrence identity and the completion result come only from Product 1's publication.

![Work inbox showing the unclaimed Review exception task, candidate group, and priority](assets/bpm-platform-browser-walkthrough/03-expense-work-inbox.png)

## 5. Complete the structured form

Open the task's **Form** view and enter:

- Request reference: `EXP-WALKTHROUGH-001`
- Expense date: `2026-08-17`
- Approved amount: `4250`
- Cost center: **Engineering**
- Risk flags: **Missing receipt** and **Policy exception**
- Notify requester: **True**

Choose **Approve**. A committed completion closes the detail and, after the background projection refresh, the Work collection reports **No current tasks**. If the response was transport-indeterminate, use the offered **Retry completion** control because it resubmits the retained command identity rather than creating a different completion.

![Claimed Review exception task showing its completed structured approval form](assets/bpm-platform-browser-walkthrough/04-expense-structured-form.png)

For a validation exercise, select **Abort** before entering a required resolution reason. The form should focus the missing field. Product 2 validates the exact catalog-bound request and computes one canonical typed patch before the engine atomically commits or rejects the task occurrence.

## 6. Inspect the completed Process

1. Open **Operations**, then **Process instances**.
2. Search for the retained Process-instance ID and choose **View details**.
3. Confirm status **completed**.
4. Open **History** and inspect the contiguous engine-published `completeUserTaskInstance` record for `ReviewException`.

Semantic History is published by the engine. Product 2 never reconstructs it from Temporal Event History or state differences.

![Completed expense-exception Process showing its committed semantic History](assets/bpm-platform-browser-walkthrough/05-completed-process-history.png)

Open **Diagram** and inspect the terminal committed positions over the retained definition presentation.

![Completed expense-exception Process showing its terminal committed Diagram](assets/bpm-platform-browser-walkthrough/06-completed-process-diagram.png)

## 7. Inspect exact-version metrics

Return to **Definitions**, select `Process_ExpenseExceptionReview` and its deployed version, then open **Flow-node metrics**. Confirm **All retained evidence**, **1 Process instance**, and the frequency and completed-duration table.

Metrics come from complete engine-published flow-node occurrences for one exact-definition population. They are not transition counts or platform request durations.

![Expense-exception definition showing exact-version flow-node frequency metrics](assets/bpm-platform-browser-walkthrough/07-definition-flow-node-metrics.png)

## 8. Create two independently operable incidents

Use [`scenarios/service-task-effect/process.bpmn`](../scenarios/service-task-effect/process.bpmn) twice:

1. Deploy it with profile `cibseven-2.2.0-service-task-incident-draft`, then start that exact version.
2. Deploy the same exact source with profile `cibseven-2.2.0-service-task-incident-cancellation-draft`, then start its new exact version.
3. Open **Operations**, select **Incidents**, and switch between visible Operations tabs until both current incidents appear.

The retry profile publishes only **Retry**. The cancellation profile additionally publishes **Cancel Process**. These controls reflect exact engine-published interactions rather than generic actions inferred from an error state.

![Operations workspace showing Retry-only and cancellable current Service Task incidents](assets/bpm-platform-browser-walkthrough/08-current-incidents.png)

## 9. Retry and cancel

Open the retry-profile incident and choose **Retry**. If the response is transport-indeterminate, use **Submit Retry again** to retain the exact action identity. The incident should leave the current collection when the Process completes.

Open the remaining incident and choose **Cancel Process**. The confirmation dialog initially focuses **Keep Process running** and explains that cancellation removes all remaining live work. Choose **Cancel root Process** only after reviewing that scope.

![Incident detail showing the confirmation dialog for cancelling the incident-bearing root Process](assets/bpm-platform-browser-walkthrough/09-cancel-process-confirmation.png)

The command targets the exact incident-gated hosting root. It does not expose a Temporal Workflow ID or treat native Temporal cancellation as a BPMN fact.

## 10. Inspect incident action audit

Return to the top-level Operations collection, open **Audit**, and filter actor ID to `demo-user`. Refresh until the settled status reports the platform action records and the table shows committed Retry and Cancel Process rows.

The audit stream is Product 2 evidence with its own contiguous source order. It remains distinct from semantic History.

![Incident action audit showing committed Retry and Cancel Process actions for demo-user](assets/bpm-platform-browser-walkthrough/10-incident-action-audit.png)

## Stop or retain the environment

Stop the containers while preserving PostgreSQL and Temporal data:

```sh
./scripts/pnpm.sh run evaluation:stop
```

Run `./scripts/pnpm.sh run evaluation:reset` later only when you deliberately want to remove both retained evaluation volumes. This Compose topology is an evaluation convenience, not a production Temporal deployment or capacity claim.

## Refresh the maintained screenshots

Readers do not need the screenshot tooling. Maintainers regenerate the complete ordered catalog explicitly after a material UI change or for a release candidate:

```sh
./scripts/pnpm.sh run walkthrough:screenshots:refresh
```

The command allocates a dynamic loopback port, starts an isolated Compose project with fresh temporary volumes, drives only public accessible UI landmarks in one Chromium browser, writes the ten 1440 by 900 images, and removes the isolated containers and volumes after success or failure. It does not reuse or delete the ordinary evaluation distribution's state.

Screenshot refresh is not part of ordinary commit CI and performs no pixel comparison. The manual or tagged [evaluation distribution workflow](../.github/workflows/evaluation-distribution.yml) can regenerate and upload the catalog as a review artifact. Direct execution against an already-running origin is an advanced package-level path documented in the [screenshot project README](../showcase/platform-browser-walkthrough/README.md).

## Troubleshooting

- **The public origin does not become healthy:** run `docker compose ps` and `docker compose logs`. Check that port 3000 is free.
- **A task or incident has not appeared yet:** use the visible refresh or tab controls. Shared reads fail closed when their bounded projection is not current; background workers repair it without request-time fleet fan-out.
- **A displayed version differs from this guide:** the evaluation volumes contain prior data. Continue with the selected exact version or deliberately reset the evaluation volumes.
- **The form is unavailable:** structured Work requires exact catalog identity and engine-published task identity to match. Missing, corrupt, or mismatched data fails closed without changing the task.
- **The Diagram says unavailable:** models outside generated-layout scope must contain complete usable source DI or remain honestly unavailable.

## Contract owners

- [BPM platform human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns task discovery, claim, completion, and Work audit behavior.
- [Structured Human Work specification](BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns catalog-bound fields, actions, validation, and typed completion.
- [Incident operations specification](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns current incidents, Retry, Cancel, and incident audit.
- [Operator history and audit export specification](BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md) owns per-instance operator history and canonical audit download.
- [Committed execution publication specification](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) owns semantic History and current Diagram positions.
- [Flow-node occurrence metrics specification](capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) owns frequency and duration facts.
- [Information architecture specification](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) and [UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md) own workspace, interaction, accessibility, and responsive behavior.
- [BPMN diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns source DI, generated sidecars, provenance, and modeller handoff.
