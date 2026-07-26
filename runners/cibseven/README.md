# CIB Seven oracle runner

This Java 21 module embeds pinned CIB Seven `2.2.0` as the behavioral oracle for the bounded User Task draft profile and the normative balanced parallel fork/join draft profile. It deploys the exact BPMN resource, invokes public engine services, projects canonical observations, removes all scenario-owned state, and keeps one engine warm across compact JSON-lines requests.

It is calibration infrastructure, not a reusable BPMN semantic kernel. A read-only PVM definition projection explains compilation choices but is never a compatibility key or an input to Lean or the TypeScript semantic core.

Two test-only probes sit beside the retained sequential and balanced-parallel oracle cases. The generated-ID consistency probe checks the host-identity premise of `CIB-OP-0001`. The schema-valid parallel-gateway probe sends two arrivals through one incoming flow while the other branch remains open and records the resulting downstream activation as candidate deviation [`CIB-DEV-0001`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow). The balanced parallel cases calibrate only the normative fork/join slice; they do not turn that negative probe into a CIB parallel-compatibility claim.

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

Canonical traces include only stable deployment, command, Process state, wait, open semantic User Task, enabled interaction, and logical time. The runner maps generated CIB task IDs to project identity `(Process instance, BPMN element, activation ordinal)` and retains BPMN task names. Distinct active elements become distinct semantic occurrences sorted by semantic identity, and active waits preserve per-element multiplicity. Repeated live instances of one BPMN element remain rejected because deriving their activation ordinals from engine order would invent semantics. Generated deployment, definition, instance, execution, and task IDs never become comparison keys.

A wrong semantic occurrence is rejected by the oracle adapter before CIB host-task completion and leaves the task active. A stale completion is rejected after no matching live task remains. These mappings are classified in the [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION-REGISTER.md), not mislabeled as raw CIB or BPMN identity semantics.

Diagnostics include engine/database versions, phase timings, the PVM definition projection, raw task-query snapshots, and post-run cleanup counts. Retained evidence stores the raw producer observations beside the canonical projection; the verifier independently reconstructs active waits, open tasks, and enabled interactions and therefore detects omitted tasks while treating raw query order as non-semantic. The persistent JSON-lines boundary preserves request identity and cleanup across all six scenarios.

Ordinary verification never rewrites retained evidence. The explicit replacement operation is:

```sh
./scripts/pnpm.sh run replace:cib-evidence -- --replace
```

The command refuses to run without the exact opt-in, executes the five answer-free scenarios through the pinned runner, verifies producer identity and cleanup, and replaces only content-bound CIB evidence artifacts.

## Source guide

| File | Responsibility |
|---|---|
| [ScenarioProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | Current typed scenario, trace, outcome, diagnostics, and PVM vocabulary |
| [ScenarioJson.java](src/main/java/org/bpmnlean/cibseven/ScenarioJson.java) | Strict Jackson codec |
| [CibSevenScenarioRunner.java](src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | Deploy/start/query/complete runner, clock control, projection, timing, and cleanup |
| [CibSevenUserTaskProjector.java](src/main/java/org/bpmnlean/cibseven/CibSevenUserTaskProjector.java) | Engine-task-to-semantic-occurrence projection, deterministic sorting, and per-element wait multiplicity |
| [CibSevenPipelineExportBridge.java](src/test/java/org/bpmnlean/cibseven/CibSevenPipelineExportBridge.java) | Explicit test-scope bridge used by the Node pipeline |
| [CibSevenConsistencyProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenConsistencyProbeTest.java) | Bounded generated-ID rejection consistency witness |
| [CibSevenParallelGatewayProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.java) | Bounded duplicate-same-incoming-flow Parallel Gateway discriminator |
| [CibSevenTestEngine.java](src/test/java/org/bpmnlean/cibseven/CibSevenTestEngine.java) | Shared isolated test-engine configuration for the bounded probes |
| [PvmDefinitionProjector.java](src/main/java/org/bpmnlean/cibseven/PvmDefinitionProjector.java) | Read-only diagnostic definition projection |
| [CibSevenOracleMain.java](src/main/java/org/bpmnlean/cibseven/CibSevenOracleMain.java) | Persistent JSON-lines boundary |
| [replace-cibseven-evidence.mjs](../../scripts/replace-cibseven-evidence.mjs) | Explicit verifier-checked replacement of retained CIB evidence |
