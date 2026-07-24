# CIB Seven oracle runner

This Java 21 module embeds pinned CIB Seven `2.2.0` as the Milestone 0 behavioral oracle. It deploys the content-addressed BPMN resource, invokes public engine commands, projects canonical observations, removes all scenario-owned state, and keeps one engine warm across compact JSON-lines requests.

It is calibration infrastructure, not a reusable BPMN semantic kernel. The read-only PVM definition projection explains engine compilation choices but is never a compatibility key or an input to Lean or the semantic core.

## Run the gate

From the repository root:

```sh
./scripts/test-cibseven-oracle.sh
```

The script uses Homebrew Java 21 by default and the repository-local Maven 3.8.8 wrapper. Its optional environment overrides are:

| Variable | Purpose |
|---|---|
| `BPMN_JAVA_HOME` | Java 21 installation root |
| `BPMN_MAVEN_SETTINGS` | Maven settings file; defaults to the module’s minimal settings |
| `BPMN_MAVEN_REPO_LOCAL` | Isolated Maven artifact cache |

The complete maintained gate is:

```sh
./scripts/verify.sh
```

## Fixed M0.2 environment

| Setting | Value |
|---|---|
| CIB Seven | `org.cibseven.bpm:cibseven-engine:2.2.0` |
| Database | H2 `2.3.232`, isolated in-memory database per runner |
| Java | Release 21 |
| Automatic job executor | Disabled |
| Logical clock | Frozen at Unix epoch for each scenario and restored in `finally` |
| History | Audit level with `P180D` default TTL; excluded from canonical observations |

Exact dependency versions, licenses, and removal boundaries are recorded in [Milestone 0](../../docs/MILESTONE-0-FAST-PIPELINE.md).

## Boundary

The canonical trace includes only stable deployment, command, Process-state, wait, enabled-stimulus, logical-time, model, and semantic-instance facts. Generated deployment, Process-definition, Process-instance, execution, and task IDs never leave the runner as comparison keys.

Diagnostics include engine/database versions, phase timings, the PVM definition projection, and post-run cleanup counts. The PVM projection currently contains activity identity and type, behavior class, flow scope, optional event scope, and ordered outgoing transitions for the sequential model.

`CibSevenOracleMain` implements the provisional JSON-lines server contract. Its transport behavior is locked by sending two compact scenarios through one warm runner in `CibSevenOracleMainTest`; cross-runtime process launching is deferred until the common orchestrator is introduced.

## Source guide

| File | Responsibility |
|---|---|
| [ScenarioProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | Versioned typed scenario, trace, outcome, diagnostics, and PVM projection vocabulary |
| [ScenarioJson.java](src/main/java/org/bpmnlean/cibseven/ScenarioJson.java) | Strict Jackson codec for scenarios, traces, and results |
| [CibSevenScenarioRunner.java](src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | Public-service deploy/start/query/complete runner, clock control, canonical projection, timing, and cleanup |
| [CibSevenPipelineExportBridge.java](src/test/java/org/bpmnlean/cibseven/CibSevenPipelineExportBridge.java) | Explicitly selected test-scope result bridge that reuses Surefire’s approved runtime classpath for the dependency-free Node pipeline harness without entering ordinary test discovery |
| [PvmDefinitionProjector.java](src/main/java/org/bpmnlean/cibseven/PvmDefinitionProjector.java) | Read-only diagnostic projection executed inside a CIB command context |
| [CibSevenOracleMain.java](src/main/java/org/bpmnlean/cibseven/CibSevenOracleMain.java) | Persistent compact JSON-lines boundary |
