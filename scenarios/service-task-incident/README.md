# Service Task incident and retry scenario

The answer-free [scenario](scenario.json) reuses the exact [Service Task effect BPMN source](../service-task-effect/process.bpmn) without copying it. Its explicit semantic schedule reports one literal generation-1 technical effect failure, retries that exact incident once, and then completes the restored effect successfully.

The report command ID is content-bound to the effect occurrence and generation. The schedule contains no expected observations, CIB job or incident identity, retry count, Temporal attempt, host exception, or Product 2 fact. Expected target results and raw CIB evidence remain outside the scenario.
