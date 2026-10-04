# CIB Seven runner source map

This contributor map groups the Java runner by source responsibility. Human orientation and commands start in the [README](README.md); compatibility meaning and current evidence remain in the relation register, capsules, and implementation map.

| Source owner | Responsibility |
|---|---|
| [`ScenarioProtocol.java`](src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java), [`ScenarioDiagnosticsProtocol.java`](src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java), and the other `Scenario*Protocol.java` owners | Scenario, canonical observation, interaction, diagnostics, Message, and variable vocabularies |
| [`ScenarioJson.java`](src/main/java/org/bpmnlean/cibseven/ScenarioJson.java) | Strict JSON-lines codec |
| [`CibSevenScenarioRunner.java`](src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | Profile and schedule alignment plus the environment-keyed runner facade |
| [`CibSevenEngineScenarioRunner.java`](src/main/java/org/bpmnlean/cibseven/CibSevenEngineScenarioRunner.java) | Deployment, command execution, public querying, clock control, timing, and cleanup |
| [`CibSevenEngineBundleFactory.java`](src/main/java/org/bpmnlean/cibseven/CibSevenEngineBundleFactory.java) | Isolated engine construction by selected configuration |
| `CibSeven*Projector.java` and `CibSeven*Gateway.java` under [`src/main/java/org/bpmnlean/cibseven/`](src/main/java/org/bpmnlean/cibseven/) | Projection from public engine facts into canonical tasks, messages, timers, effects, incidents, and diagnostics |
| [`PvmDefinitionProjector.java`](src/main/java/org/bpmnlean/cibseven/PvmDefinitionProjector.java) | Read-only diagnostic definition projection |
| [`CibSevenOracleMain.java`](src/main/java/org/bpmnlean/cibseven/CibSevenOracleMain.java) | Persistent JSON-lines process boundary |
| Probe and runner tests under [`src/test/java/org/bpmnlean/cibseven/`](src/test/java/org/bpmnlean/cibseven/) | Bounded calibration witnesses, adversarial controls, and package-level oracle evidence |
| [Sequential MI Sub-Process probe](src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceSubprocessProbeTest.java) | Inner parallel completion, fixed total with current collection lookup, shortening rollback, early completion and empty input; [research boundary](../../docs/research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#sequential-multi-instance-sub-process-account) |
| [Sequential MI business-data probe](src/test/java/org/bpmnlean/cibseven/CibSevenSequentialMultiInstanceDataProbeTest.java) | Human/Service Task data in repeated body scopes, parent shadowing, null and the missing-local-declaration counterexample; [research boundary](../../docs/research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md#repeated-body-data-boundary) |
| [Business effect data probe](src/test/java/org/bpmnlean/cibseven/CibSevenBusinessEffectDataPhaseZeroProbeTest.java) | Outer-scope input lookup, local output precedence, null/missing input and Process separation; [experiment boundary](../../docs/experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md) |
| [Business-failure probe](src/test/java/org/bpmnlean/cibseven/CibSevenBusinessFailurePhaseZeroProbeTest.java) | Caught Error mapping, rework, technical rollback, missing results and unmatched cleanup controls; [experiment boundary](../../docs/experiments/BUSINESS-EFFECT-DATA-EXPERIMENT.md#business-failure-follow-up) |
| [`CibSevenPipelineExportBridge.java`](src/test/java/org/bpmnlean/cibseven/CibSevenPipelineExportBridge.java) | Test-scope bridge used by the Node differential pipeline |
| [`replace-cibseven-evidence.ts`](../../scripts/replace-cibseven-evidence.ts) | Explicit verifier-checked evidence replacement |

Pinned source resources live under [`src/test/resources/`](src/test/resources/). Their provenance and release identities are owned by the [source registry](../../docs/SOURCES.md).
