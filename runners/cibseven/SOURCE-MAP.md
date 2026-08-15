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
| [`CibSevenPipelineExportBridge.java`](src/test/java/org/bpmnlean/cibseven/CibSevenPipelineExportBridge.java) | Test-scope bridge used by the Node differential pipeline |
| [`replace-cibseven-evidence.ts`](../../scripts/replace-cibseven-evidence.ts) | Explicit verifier-checked evidence replacement |

Pinned source resources live under [`src/test/resources/`](src/test/resources/). Their provenance and release identities are owned by the [source registry](../../docs/SOURCES.md).
