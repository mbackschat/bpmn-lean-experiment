# MUE Preview Alpha showcase

This package is the executable MUE Preview Alpha acceptance boundary. It deploys the exact retained [Sequential Multi-Instance BPMN source](../../scenarios/sequential-multi-instance/process.bpmn), starts two confirmed instances through the production Product 2 browser, and drives only public Product 1 interactions with an explicit showcase actor.

The natural journey shows exact committed iteration progress and the ordered `accepted`, `flagged`, `archived` aggregate. The interrupted journey waits for the production `PT1S` Boundary Timer, shows the committed `fireTimer` command and published escalation task, and terminates without a partial output collection. Event History is read only after both journeys terminate, solely to verify exact Timer and Update facts and replay every actual Workflow Run.

Run the complete Alpha acceptance gate with `./scripts/pnpm.sh run test:release:mue-preview-alpha`. The visible `MUE Preview Alpha` label is a product-delivery boundary, not a claim that the other seven MUE programmes are implemented or closed.

Run the presenter-paced browser journey with `./scripts/pnpm.sh run demo:mue-preview-alpha`. It uses pinned Playwright Chromium and pauses only after the natural branch has committed its ordered aggregate, while the interrupted branch is already at its committed escalation checkpoint, and after the interrupted terminal result is visible. Ordinary evidence runs keep these pauses disabled.
