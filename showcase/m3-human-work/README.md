# M3 Human Work showcase

This package is the executable M3 acceptance boundary for Product 2 Human Work. It composes only production package roots and drives one metadata-bearing direct start plus metadata-free Timer Schedule and Message Start controls.

The live gate proves exact three-producer equality across Definitions confirmation, Operate identity, and Work registration, actor filtering, typed Boolean detail and completion, claim and platform restart durability, Worker replacement, response-loss retry, append-only audit, private-field exclusion, exact Temporal history facts, and replay. The Chromium gate verifies that the Boolean field begins without a selected value, explicitly selects true, claims and completes the same task through the global CSS-Modules React panel, and verifies the public audit through HTTP.

The [single-review corpus journey](e2e/corpus-user-task-journey.spec.ts) and [parallel-review corpus journey](e2e/parallel-user-task-metadata-journey.spec.ts) use unmodified retained assignment/form BPMN. Both enter through Definitions, start exact version 1, and prove task detail and completion are unavailable before claim. The parallel journey additionally claims and inspects both metadata-bearing tasks, preserves the live sibling after the first completion, verifies the running then completed Operations states and contiguous engine-published History, and checks the exact Work-audit chain for each occurrence.

The [structured Human Work journey](e2e/structured-human-work-journey.spec.ts) deploys the retained expense-exception model, proves priority ordering and claim-first interaction, exercises Text, multiline Text, Boolean, Integer, Date, Single choice, and Multiple choice controls, and completes Approve, Request changes, and Abort. It separates client and server rejection, canonical list retry, changed-action conflict, conditional reason input, terminal History, exact Work audit, and 1280/1600 containment. All real-host Chromium acceptance serves the already-built web bundle through `vite preview`; the release graph is prepared once and reused.

Run both gates with `./scripts/pnpm.sh run test:showcase:m3-human-work`. The test owns the sole permitted M3 Event History inspection; production platform code never imports or derives Work from Temporal history.

To experience the product manually, follow the maintained [human-work browser walkthrough](../../docs/HUMAN-WORK-WALKTHROUGH.md).
