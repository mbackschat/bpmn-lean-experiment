# CIB Seven oracle runner

This Java 21 module embeds pinned CIB Seven `2.2.0` as the behavioral oracle for the bounded User Task draft profile. It deploys the exact BPMN resource, invokes public engine services, projects canonical observations, removes all scenario-owned state, and keeps one engine warm across compact JSON-lines requests.

It is calibration infrastructure, not a reusable BPMN semantic kernel. A read-only PVM definition projection explains compilation choices but is never a compatibility key or an input to Lean or the TypeScript semantic core.

## Run

```sh
./scripts/test-cibseven-oracle.sh
```

The script uses Homebrew Java 21 by default and the repository Maven wrapper.

| Variable | Purpose |
|---|---|
| `BPMN_JAVA_HOME` | Java 21 installation root |
| `BPMN_MAVEN_SETTINGS` | Maven settings file |
| `BPMN_MAVEN_REPO_LOCAL` | Isolated Maven artifact cache |

## Pinned environment

| Setting | Value |
|---|---|
| CIB Seven | `org.cibseven.bpm:cibseven-engine:2.2.0` |
| Database | H2 `2.3.232`, isolated in memory per runner |
| Java | Release 21 |
| Automatic job executor | Disabled |
| Logical clock | Frozen at Unix epoch per scenario and restored in `finally` |
| History | Audit with `P180D` default TTL; excluded from canonical observations |

## Semantic boundary

Canonical traces include only stable deployment, command, Process state, wait, open semantic User Task, enabled interaction, and logical time. The runner maps the one generated CIB task ID to project identity `(Process instance, BPMN element, activation ordinal)` and retains the BPMN task name. Generated deployment, definition, instance, execution, and task IDs never become comparison keys.

A wrong semantic occurrence is rejected by the oracle adapter before CIB host-task completion and leaves the task active. A stale completion is rejected after no matching live task remains. These mappings are classified in the [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION.md), not mislabeled as raw CIB or BPMN identity semantics.

Diagnostics include engine/database versions, phase timings, the PVM definition projection, and post-run cleanup counts. The persistent JSON-lines boundary preserves request identity and cleanup across all three scenarios.

## Source guide

| File | Responsibility |
|---|---|
| [ScenarioProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | Current typed scenario, trace, outcome, diagnostics, and PVM vocabulary |
| [ScenarioJson.java](src/main/java/org/bpmnlean/cibseven/ScenarioJson.java) | Strict Jackson codec |
| [CibSevenScenarioRunner.java](src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | Deploy/start/query/complete runner, clock control, projection, timing, and cleanup |
| [CibSevenPipelineExportBridge.java](src/test/java/org/bpmnlean/cibseven/CibSevenPipelineExportBridge.java) | Explicit test-scope bridge used by the Node pipeline |
| [PvmDefinitionProjector.java](src/main/java/org/bpmnlean/cibseven/PvmDefinitionProjector.java) | Read-only diagnostic definition projection |
| [CibSevenOracleMain.java](src/main/java/org/bpmnlean/cibseven/CibSevenOracleMain.java) | Persistent JSON-lines boundary |
