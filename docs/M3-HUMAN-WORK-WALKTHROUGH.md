# M3 human-work browser walkthrough

## Status

Implemented. This walkthrough exercises the maintained M3 Product 2 path through the production platform server, web client, Temporal-hosted engine, generated form, and BPMN diagram presentation boundary. It is a user guide, not semantic or compatibility evidence.

## What you will experience

You will deploy the repository's metadata-bearing User Task model, inspect its generated diagram, download a modeller-ready BPMN presentation copy, start one exact definition version, claim and complete the resulting Boolean task, and find the confirmed Process instance. An optional second deployment demonstrates source-authored BPMN DI.

The showcase uses the configured development identity `demo-user` in candidate group `reviewers`. It starts an ephemeral local Temporal service and stores platform data in a temporary directory. Stopping the showcase removes that data.

## Prerequisites

Complete the [contributor setup](CONTRIBUTOR-SETUP-GUIDE.md#clean-clone-path). The browser walkthrough itself does not require Playwright or the ChatGPT browser plugin. Any current browser can open the local web application.

Build the two required Product 2 surfaces once:

```sh
./scripts/pnpm.sh run build:platform-server
./scripts/pnpm.sh run build:platform-web
```

## Start the local product

In terminal 1, start the ephemeral Temporal service, production Worker, and Product 2 API server:

```sh
PLATFORM_PARSER_DEADLINE_MS=5000 \
PLATFORM_PORT=3203 \
PLATFORM_TEMPORAL_TASK_QUEUE=bpmn-m3-human-work \
./scripts/pnpm.sh run showcase:m3-human-work:host
```

Wait for `M3 Human Work showcase ready at http://127.0.0.1:3203`. A first run may take longer while the pinned Temporal test server is prepared.

In terminal 2, start the web development server and point its API proxy at that host:

```sh
PLATFORM_API_ORIGIN=http://127.0.0.1:3203 \
./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite \
  --host 127.0.0.1 --port 4276 --strictPort
```

Open [http://127.0.0.1:4276](http://127.0.0.1:4276). The shell should show Work, Definitions, and Process instances in the primary navigation and `Signed in as demo-user`.

## Deploy and inspect the M3 model

1. Open **Definitions**.
2. Expand **Add BPMN definition**.
3. For **BPMN XML file**, select [`scenarios/user-task-assignment-form-metadata/process.bpmn`](../scenarios/user-task-assignment-form-metadata/process.bpmn).
4. Enter semantic profile ID `cibseven-2.2.0-user-task-assignment-form-metadata-draft`.
5. Choose **Deploy definition**.

The result should say **Admitted and deployed** for `Process_UserTaskMetadata`, version 1. The Diagram tab should show **Generated layout** because the exact admitted source intentionally contains no BPMN DI. The platform generated and retained a digest-bound presentation sidecar without changing the admitted source.

Choose **Download diagrammed BPMN** to obtain a complete derived BPMN XML document containing the exact semantic model plus validated BPMN DI. The download is suitable for opening in a BPMN DI-capable modeller. It is clearly labeled as a derived presentation copy, not admitted source.

## Start a Process instance

1. In the same definition detail, open **Start**.
2. Choose **Start version 1**.
3. Retain the displayed Process-instance ID if you want to use it as an exact search filter later.

The start result binds the new instance to `Process_UserTaskMetadata`, version 1. Product 2 privately registers the engine observation locator while exposing only public Process identity.

## Claim and complete the task

1. Open **Work**.
2. If needed, choose **Refresh**.
3. Find task **Approve** for Process `Process_UserTaskMetadata`. It should show candidate group `reviewers` and state **Unclaimed**.
4. Choose **Claim**. The row should change to **Claimed by demo-user**.
5. Select the task name to open the full-width task workspace.
6. Open **Diagram** to see the same generated Process presentation with the exact `UserTask_Approve` occurrence highlighted.
7. Open **Details** to compare the task Process-instance identity, hosting root Process-instance identity, element ID, activation, and candidate group.
8. Return to **Form**, choose **True** or **False** for `approved`, and choose **Complete task**.

After the engine commits the exact occurrence completion, the task detail closes and the inbox reports **No current tasks**. Claim state and audit belong to Product 2; the task occurrence, form metadata, typed value, and completion outcome come from the engine's published contract.

## Find the confirmed Process instance

1. Open **Process instances**.
2. Enter the retained Process-instance ID, or enter Process ID `Process_UserTaskMetadata`.
3. Choose **Search**.

The result shows the public Process-instance ID, exact definition version, source identity and digest, and semantic profile. M3 does not yet provide a Process-instance detail or Event History view, so this surface deliberately does not invent lifecycle, task, or Temporal facts.

## Compare source-authored BPMN DI

To see the other presentation arm, deploy [`scenarios/user-task-preserved-notation/process.bpmn`](../scenarios/user-task-preserved-notation/process.bpmn) with semantic profile ID `bpmn-2.0.2-user-task-preserved-notation-draft`.

Its Diagram tab should say **Source layout** and retain the authored Collaboration, pool, lane, annotation, and association. That model is a notation-preservation witness, not an M3 claimable-work model, because it intentionally publishes no assignment or form metadata.

## Edit a generated layout in a modeller

The internal sidecar is not a standalone modeller file. Use **Download diagrammed BPMN** to obtain the merged, complete BPMN document.

Open that file in a standards-oriented BPMN modeller, adjust the layout, and save it. Deploying the saved document creates an ordinary new definition version with new exact source bytes. If the saved BPMN contains complete usable embedded DI and still satisfies the selected semantic profile, the new version resolves through **Source layout**. It never overwrites the original admitted source or mutates its generated sidecar.

## Troubleshooting

- **The API host does not start:** check whether port 3203 is already in use. If you choose another API port, use the same origin in `PLATFORM_API_ORIGIN` for the Vite command.
- **The web server reports a port conflict:** choose another Vite port and open that address in the browser.
- **No task appears:** deploy and start the metadata model with the exact metadata profile above, confirm the shell says `demo-user`, and choose **Refresh**. Metadata-free User Tasks are intentionally hidden by the M3 fake policy.
- **The diagram says unavailable:** the M3 metadata model is inside the generated-layout scope. Other models with multiple root Processes, unsupported presentation constructs, incomplete embedded DI, or failed integrity checks must provide usable source DI or remain honestly unavailable.
- **The Process instance disappears after restart:** this showcase deliberately uses a temporary data directory. Use the production server's configured persistent directory for retained platform data.
- **You want an automated run:** use `./scripts/pnpm.sh run test:showcase:m3-human-work`. Playwright remains a Product 2 acceptance harness and is not part of Product 1 semantic verification.

## Contract owners

- [BPM platform human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns task discovery, claim, form, completion, and audit behavior.
- [BPM platform information architecture specification](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) owns navigation and collection-to-detail flow.
- [BPM platform UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md) owns responsive and interaction behavior.
- [BPMN diagram presentation decision](BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns source DI, generated sidecars, provenance, and modeller handoff.
