# Service Task incident root cancellation scenario

The answer-free [scenario](scenario.json) reuses the exact [Service Task effect BPMN source](../service-task-effect/process.bpmn) without copying it. It starts with the committed string Process variable `preserved = "before-cancel"`, reports one literal generation-1 effect incident, and submits the exact root Process cancellation command published beside Retry.

The schedule contains no expected observation, raw CIB identity, deletion reason, Temporal host identity, or Product 2 fact. Retained target results and positive CIB history evidence remain outside the scenario.
