# CIB Seven oracle runner

This Java 21 module embeds pinned CIB Seven `2.2.0` as the behavioral oracle for the bounded User Task, normative balanced parallel fork/join, exact `PT1S` Intermediate Catch Timer, and success-only Service Task effect draft profiles. It deploys the exact BPMN resource, invokes public engine services, projects canonical observations, removes all scenario-owned state, and keeps one engine warm across compact JSON-lines requests. The strict Java wire already carries the checkpoint-candidate effect-incident state and commands so current cross-target JSON remains closed, but the ordinary runner rejects those commands until the independently reviewed CIB incident lane adds the configured engine, projector, and executor.

It is calibration infrastructure, not a reusable BPMN semantic kernel. A read-only PVM definition projection explains compilation choices but is never a compatibility key or an input to Lean or the TypeScript semantic core.

Bounded test-only probes sit beside the retained oracle cases. The generated-ID consistency probe checks the host-identity premise of `CIB-OP-0001`. The Process-start/User Task completion-data phase-zero probe records first-task visibility of public start variables for selected [`CIB-EXT-0006`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0006--public-process-start-installs-initial-process-variables) plus task, runtime, and history variable maps for selected [`CIB-EXT-0005`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0005--public-user-task-completion-installs-submitted-process-variables), including present null, no-data, unknown-ID, and stale-ID controls. The schema-valid parallel-gateway probe sends two arrivals through one incoming flow while the other branch remains open and records the resulting downstream activation as candidate deviation [`CIB-DEV-0001`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow). The Sub-Process Error-propagation phase-zero probe runs Trigger-first and Sibling-first against one exact project-authored source and records recovery-route selection at the public Process/task boundary under [`CIB-AGR-0008`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-agr-0008--exact-code-error-propagation-from-an-embedded-sub-process); it cannot expose hidden engine microsteps or internal cancellation representation. The balanced parallel cases calibrate only the normative fork/join slice; they do not turn that negative probe into a CIB parallel-compatibility claim.

The [Boolean Process-data phase-zero probe](src/test/java/org/bpmnlean/cibseven/CibSevenBooleanProcessDataPhaseZeroProbeTest.java) independently proves that public completion, runtime query, and history retain a Java `Boolean` rather than text. The ordinary runner recognizes the tagged Boolean but admits it only for User Task completion under the registered Boolean completion profile and its metadata successor; Process Start, effects, and old profiles retain their exact domains. The answer-free scenario has content-bound retained evidence with raw Java Boolean and canonical tagged Boolean projections.

The [assignment/form phase-zero probe](src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java) calibrates exact namespace, literal-group, public candidate-link, generated-form, and Boolean-completion behavior. The ordinary runner retains raw public Task Service identity links and Form Service field identity/type only under the registered metadata profile, projects their one exact neutral metadata block, and physically omits every metadata property for old profiles.

The [Configured Task exclusion probe](src/test/java/org/bpmnlean/cibseven/CibSevenConfiguredTaskExclusionOracleTest.java) deploys a byte-exact [test copy](src/test/resources/org/bpmnlean/cibseven/CibSevenConfiguredTaskExclusionOracleTest.bpmn) of the approved extension source and retains CIB Seven's immediate transition to the trailing User Task only as an exclusion oracle; it creates no CIB target, compatibility result, or relationship.

The Message-addressed Receive Task phase-zero probe deploys one project-authored payload-free source, observes the public Message subscription's activity, name, execution, and Process-instance facts, consumes it through `messageEventReceived`, and proves subscription removal plus Process completion before any Message-channel wire replacement under [`CIB-AGR-0009`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-agr-0009--message-addressed-receive-task-subscription-lifecycle). The ordinary runner now retains the same subscription lifecycle, derives the direct source Message ID from the deployed Receive Task definition, and maps the generated host subscription to canonical occurrence identity under [`CIB-OP-0005`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-op-0005--cib-message-subscription-mapped-to-project-semantic-subscription-identity). It does not claim that the CIB Message name exposes the BPMN Message ID or establish addressless signal, payload, correlation, or transport semantics.

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
| BPMN Model API | Direct `org.cibseven.bpm.model:cibseven-bpmn-model` at the same release; the main runner uses the typed deployed Receive Task reference and probes use the typed fixture builder |
| Database | H2 `2.3.232`, isolated in memory per runner |
| Java | Release 21 |
| Automatic job executor | Disabled |
| Logical clock | Frozen at Unix epoch per scenario and restored in `finally` |
| History | Audit with `P180D` default TTL; supplies bounded Process-variable evidence only for names introduced by committed start or completion commands |

## Semantic boundary

Canonical traces include only stable deployment, command, Process state, wait, open semantic User Task, Timer, or effect occurrence, enabled interaction, Process variables, and logical time. The runner maps generated CIB task IDs to project identity `(Process instance, BPMN element, activation ordinal)` and retains BPMN task names. Under the metadata profile only, it obtains exact candidate-link facts through Task Service and exact field identity/type through Form Service before constructing the neutral open-task metadata. Distinct active elements become distinct semantic occurrences sorted by semantic identity, and active waits preserve per-element multiplicity. The timer lane fixes the engine clock, proves the exact timer job ineligible before due time and eligible at due time, and executes it only after eligibility. The Service Task lane derives activity, protocol, and handler from public job-definition/deployed-model state, maps the singleton host wait to adapter-decided activation `1`, and records retry/invocation/mutation facts only as raw host evidence. Repeated live instances of one BPMN element remain rejected because deriving their activation ordinals from engine order would invent semantics. Generated deployment, definition, instance, execution, task, and job IDs never become comparison keys.

A wrong semantic occurrence is rejected by the oracle adapter before CIB host-task completion and leaves the task active. A stale completion is rejected after no matching live task remains. These mappings are classified in the [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION-REGISTER.md), not mislabeled as raw CIB or BPMN identity semantics.

Diagnostics include engine/database versions, phase timings, the PVM definition projection, raw task-query, Message-subscription, timer-job, effect-job, effect-execution, and state-query snapshots, and post-run cleanup counts. Retained metadata task rows preserve public identity-link and form-field facts in producer order. The verifier independently reconstructs active waits, open tasks and their optional metadata, open Message subscriptions, open timers, open effects, enabled interactions, and the bounded Process-variable projection and therefore detects omitted tasks or subscriptions, candidate/key/type drift, direct Message drift, timer-deadline drift, effect-handler drift, Boolean stringification, and final-variable drift while treating raw query order as non-semantic. Variable names enter that projection only after the corresponding semantic start or completion command has committed, so a future, rejected, wrong-activation, or stale submitted patch cannot influence the current observation.

Ordinary verification never rewrites retained evidence. The explicit replacement operation is:

```sh
./scripts/pnpm.sh run replace:cib-evidence
```

The package script supplies the exact replacement opt-in. The command executes every registered answer-free CIB scenario through its pinned `2.2.0` or `2.0.0` runner, verifies producer identity and cleanup, and replaces only content-bound CIB evidence artifacts.

## Source guide

| File | Responsibility |
|---|---|
| [ScenarioProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | Current typed scenario, trace, outcome, and semantic observation vocabulary |
| [ScenarioDiagnosticsProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java) | Diagnostics, raw task/timer/effect evidence, PVM projection, timing, and cleanup vocabulary |
| [ScenarioInteractionProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioInteractionProtocol.java) | Closed canonical interaction union |
| [ScenarioMessageProtocol.java](src/main/java/org/bpmnlean/cibseven/ScenarioMessageProtocol.java) | Message stimulus, channel, subscription, and interaction vocabulary |
| [ScenarioJson.java](src/main/java/org/bpmnlean/cibseven/ScenarioJson.java) | Strict Jackson codec |
| [ScenarioVariableBindings.java](src/main/java/org/bpmnlean/cibseven/ScenarioVariableBindings.java) | Canonical typed binding-list validation and CIB engine-map projection shared by start and completion |
| [ScenarioVariableValuePolicy.java](src/main/java/org/bpmnlean/cibseven/ScenarioVariableValuePolicy.java) | Exact profile/surface admission for string, null, and registered-profile Boolean values |
| [CibSevenScenarioRunner.java](src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | Deploy/start/query/complete runner, clock control, projection, timing, and cleanup |
| [CibSevenUserTaskProjector.java](src/main/java/org/bpmnlean/cibseven/CibSevenUserTaskProjector.java) | Engine-task-to-semantic-occurrence projection, deterministic sorting, and per-element wait multiplicity |
| [CibSevenUserTaskMetadataProjector.java](src/main/java/org/bpmnlean/cibseven/CibSevenUserTaskMetadataProjector.java) | Public Task/Form Service evidence and exact raw-to-neutral metadata projection |
| [UserTaskMetadataProtocol.java](src/main/java/org/bpmnlean/cibseven/UserTaskMetadataProtocol.java) | Neutral immutable assignment and form metadata vocabulary |
| [CibSevenMessageSubscriptionGateway.java](src/main/java/org/bpmnlean/cibseven/CibSevenMessageSubscriptionGateway.java) | Public Message-subscription query and delivery with generated host identity kept local |
| [CibSevenMessageProjector.java](src/main/java/org/bpmnlean/cibseven/CibSevenMessageProjector.java) | Exact Receive Task subscription, active-wait, direct-channel, and delivery-interaction projection |
| [CibSevenPipelineExportBridge.java](src/test/java/org/bpmnlean/cibseven/CibSevenPipelineExportBridge.java) | Explicit test-scope bridge used by the Node pipeline |
| [CibSevenConsistencyProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenConsistencyProbeTest.java) | Bounded generated-ID rejection consistency witness |
| [CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.java) | Public User Task variable read, completion merge, present-null, final-history, no-data, unknown-ID, and stale-ID calibration |
| [CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest.java) | Candidate-group namespace, broader-syntax, public identity-link, generated-form, and Boolean-completion calibration |
| [CibSevenUserTaskMetadataCheckpointTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenUserTaskMetadataCheckpointTest.java) | Retained raw public facts, neutral metadata, Boolean composition, and old-profile omission checkpoint |
| [CibSevenParallelGatewayProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.java) | Bounded duplicate-same-incoming-flow Parallel Gateway discriminator |
| [CibSevenIntermediateCatchTimerTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenIntermediateCatchTimerTest.java) | Controlled-clock timer wait, due-date, eligibility, firing, completion, and cleanup witness |
| [CibSevenEffectProjector.java](src/main/java/org/bpmnlean/cibseven/CibSevenEffectProjector.java) | Public job-definition/deployed-model projection for the exact effect wait |
| [CibSevenEffectProbe.java](src/main/java/org/bpmnlean/cibseven/CibSevenEffectProbe.java) | Test-local plain and fail-after-mutation Service Task delegate behavior |
| [CibSevenServiceTaskScenarioRunnerTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskScenarioRunnerTest.java) | Ordinary plain-success and raw retry/re-execution scenario-runner evidence |
| [frozen CibSevenBoundaryErrorPhaseZeroProbeTest.java](../../adoption/a12/legacy/source-tree/runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenBoundaryErrorPhaseZeroProbeTest.java) | Retained packaged `2.0.0` A12 boundary-error calibration, including the caught output-mapping and unmatched rollback counterexamples |
| [CibSevenSubProcessErrorPropagationPhaseZeroProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenSubProcessErrorPropagationPhaseZeroProbeTest.java) | Packaged `2.2.0` exact-source Trigger-first/Sibling-first Error-propagation calibration at the public Process/task boundary |
| [CibSevenReceiveTaskPhaseZeroProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenReceiveTaskPhaseZeroProbeTest.java) | Packaged `2.2.0` public Message-subscription creation, exact public delivery, removal, and Process-completion calibration for one project-authored Receive Task source |
| [CibSevenExclusiveGatewayModels.java](src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayModels.java) | Typed CIB Model API fixture restricted to the exact two-condition-plus-default profile shape |
| [CibSevenExclusiveGatewayJuelProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenExclusiveGatewayJuelProbeTest.java) | Fourteen packaged-`2.0.0` Exclusive Gateway probes covering declaration order, exact-profile first/second/default routing, short circuit, delimiters, tagged-domain source cases, result typing, deployment admission, language-as-script routing, failure, and command rollback |
| [CibSevenIsolatedJuelRuntimeProbeTest.java](src/test/java/org/bpmnlean/cibseven/CibSevenIsolatedJuelRuntimeProbeTest.java) | Direct pinned-JUEL feasibility probe for immutable root/array/list/map data with no Process Engine, bean, function, method, or writable-property surface |
| [CibSevenTestEngine.java](src/test/java/org/bpmnlean/cibseven/CibSevenTestEngine.java) | Shared isolated test-engine configuration for the bounded probes |
| [PvmDefinitionProjector.java](src/main/java/org/bpmnlean/cibseven/PvmDefinitionProjector.java) | Read-only diagnostic definition projection |
| [CibSevenOracleMain.java](src/main/java/org/bpmnlean/cibseven/CibSevenOracleMain.java) | Persistent JSON-lines boundary |
| [replace-cibseven-evidence.ts](../../scripts/replace-cibseven-evidence.ts) | Explicit verifier-checked replacement of retained CIB evidence |
