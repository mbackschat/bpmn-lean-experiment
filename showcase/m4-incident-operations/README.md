# M4 incident operations showcase

This package is the isolated executable M4 acceptance boundary for Product 2 incident operations. It starts a real local Temporal test service and production platform server, deploys the exact existing [Service Task effect BPMN source](../../scenarios/service-task-effect/process.bpmn) once with each graduated incident profile, and creates both confirmed instances only through public platform HTTP.

The headless Chromium witness drives Operations by accessible roles and names. It proves current incident discovery, response loss after a committed Retry, platform restart and exact action recovery, Cancel confirmation across Worker replacement, exact terminal Process results, current-state refresh, incident and top-level audit, diagram highlighting, Process-instance navigation, recursive private-fact exclusion, and replay of both Temporal histories.

The package uses its own bounded type, static, and Playwright gates. It is intentionally outside `verify.sh`, Product 1 semantic feedback loops, CIB execution, and browser-plugin control.

The maintained [BPM platform browser walkthrough](../../docs/BPM-PLATFORM-BROWSER-WALKTHROUGH.md) includes the corresponding hands-on Retry and root-Process Cancel lab.
