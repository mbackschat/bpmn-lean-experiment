# MUE Preview Alpha showcase

This package is the executable MUE Preview Alpha acceptance boundary. It deploys the exact retained [Sequential Multi-Instance BPMN source](../../scenarios/sequential-multi-instance/process.bpmn), starts two confirmed instances through the production Product 2 browser, and drives only public Product 1 interactions with an explicit showcase actor.

The natural journey shows exact committed iteration progress and the ordered `accepted`, `flagged`, `archived` aggregate. The interrupted journey waits for the production `PT5S` Boundary Timer, shows the committed `fireTimer` command and published escalation task, and terminates without a partial output collection. Event History is read only after both journeys terminate, solely to verify exact Timer and Update facts and replay every actual Workflow Run.

The harness initializes a fresh Temporal Namespace and selects native Current with the existing deployment initializer before public Start. It then stops the initializer Worker so the browser can still inspect each initial queued execution before polling resumes. Actor observations and replay collection use that same Namespace. This preserves the production enrollment requirement; merely connecting a Worker does not select Current.

The 2026-09-25 bootstrap correction is non-material: it restores the existing acceptance journey without changing engine meaning, admission, or publication. The prior journey failed at public Start before the actor ran; a separate running-Worker probe reproduced the missing-Current refusal. The corrected complete Alpha unit/type, browser and every-Run replay gate passed in 22.84 seconds. Platform-boundary, build-coverage and Alpha/Beta command guards cover the harness boundary.

Run the complete Alpha acceptance gate with `./scripts/pnpm.sh run test:release:mue-preview-alpha`. The visible `MUE Preview Alpha` label is a product-delivery boundary, not a claim that the other seven MUE programmes are implemented or closed.

Run the presenter-paced browser journey with `./scripts/pnpm.sh run demo:mue-preview-alpha`. It uses pinned Playwright Chromium and pauses only after the natural branch has committed its ordered aggregate, while the interrupted branch is already at its committed escalation checkpoint, and after the interrupted terminal result is visible. Ordinary evidence runs keep these pauses disabled.

Refresh the three presentation-only fallback frames with `./scripts/pnpm.sh run demo:mue-preview-alpha:capture`. The command drives the same real journey headlessly and captures only those three safe landmarks at 1600 by 900. The frames are documentation aids, not additional product or semantic evidence.

The same harness also qualifies the separate [Product 2 failed-Process outcome](../../docs/BPM-PLATFORM-FAILED-PROCESS-SPEC.md). That acceptance deploys the exact registered travel-cancellation XML through public HTTP, starts successful and failed executions with explicit data, and uses a labelled test actor for metadata-free published User Tasks. A declared Activity simulation refuses ground-travel cancellation for one explicit snapshot input. Both terminal publications must survive platform restart and remain byte-identical through public export and browser download; every actual Run is replayed. This adds inspection evidence, not a Compensation browser catalog entry or Human Work form.

## Presentation fallback

If the local browser or Temporal process cannot be recovered during a presentation, use the maintained frames in order:

1. [Natural completion and ordered aggregate](../../docs/assets/mue-preview-alpha-demo/01-natural-completion.png)
2. [Timer interruption and escalation task](../../docs/assets/mue-preview-alpha-demo/02-timer-interruption.png)
3. [Interrupted completion without partial output](../../docs/assets/mue-preview-alpha-demo/03-interrupted-completion.png)
