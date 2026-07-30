package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.EFFECT;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.TIMER;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Date;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.bpmnlean.cibseven.CibSevenUserTaskProjector.HostUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.CanonicalObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteEffectStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.Diagnostics;
import org.bpmnlean.cibseven.ScenarioProtocol.EnabledInteraction;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectExecutionSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectJobSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.FireTimerStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.ObservationKind;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenTimer;
import org.bpmnlean.cibseven.ScenarioProtocol.PhaseTimings;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioResult;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StartProcessStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.TaskQuerySnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.TaskQueryTask;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerJob;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerJobSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerOccurrenceId;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineConfiguration;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.cibseven.bpm.engine.impl.util.ClockUtil;
import org.cibseven.bpm.engine.task.Task;

/**
 * Embedded, single-threaded CIB-seven calibration oracle.
 *
 * <p>The engine stays warm across scenarios, while every scenario deploys and removes its own
 * resources. CIB-seven's clock is process-global, so run is synchronized and always restores it.
 */
public final class CibSevenScenarioRunner implements AutoCloseable {

  private static final Date LOGICAL_EPOCH = new Date(0);
  private static final Object PROCESS_GLOBAL_CLOCK_LOCK = new Object();
  private static final String CREATE_DOCUMENT_PROFILE =
      "cibseven-2.0.0-a12-create-document-draft";
  private static final String BOUNDARY_ERROR_PROFILE =
      "cibseven-2.0.0-a12-boundary-error-draft";
  private static final String H2_VERSION = "2.3.232";
  private static final EnumSet<ObservationKind> SUPPORTED_OBSERVATIONS =
      EnumSet.of(
          ObservationKind.DEPLOYMENT,
          ObservationKind.COMMAND_RESULTS,
          ObservationKind.PROCESS_STATUS,
          ObservationKind.ACTIVE_WAITS,
          ObservationKind.OPEN_USER_TASKS,
          ObservationKind.OPEN_TIMERS,
          ObservationKind.OPEN_EFFECTS,
          ObservationKind.VARIABLES,
          ObservationKind.ENABLED_INTERACTIONS,
          ObservationKind.LOGICAL_TIME);

  private final ProcessEngine processEngine;
  private final CibSevenRelease release;
  private final ProcessEngineConfigurationImpl configuration;
  private final PvmDefinitionProjector pvmProjector;
  private final CibSevenScenarioCommandExecutor commandExecutor;
  private final CibSevenScenarioStateProjector stateProjector;
  private final CibSevenEffectProbe effectProbe;
  private final CibSevenCreateDocumentProbe createDocumentProbe;
  private final CibSevenBoundaryErrorProbe boundaryErrorProbe;
  private final long startupNanos;
  private boolean closed;

  private CibSevenScenarioRunner(
      ProcessEngine processEngine,
      ProcessEngineConfigurationImpl configuration,
      CibSevenEffectProbe effectProbe,
      CibSevenCreateDocumentProbe createDocumentProbe,
      CibSevenBoundaryErrorProbe boundaryErrorProbe,
      long startupNanos) {
    this.processEngine = processEngine;
    this.release = CibSevenRelease.current();
    this.configuration = configuration;
    this.pvmProjector = new PvmDefinitionProjector();
    this.effectProbe = effectProbe;
    this.createDocumentProbe = createDocumentProbe;
    this.boundaryErrorProbe = boundaryErrorProbe;
    var userTaskProjector = new CibSevenUserTaskProjector();
    var effectProjector = new CibSevenEffectProjector();
    var activeWaitProjector = new CibSevenActiveWaitProjector();
    this.commandExecutor =
        new CibSevenScenarioCommandExecutor(
            processEngine, effectProjector, effectProbe, LOGICAL_EPOCH);
    this.stateProjector =
        new CibSevenScenarioStateProjector(
            processEngine,
            userTaskProjector,
            effectProjector,
            activeWaitProjector,
            LOGICAL_EPOCH);
    this.startupNanos = startupNanos;
  }

  public static CibSevenScenarioRunner create() {
    var startedAt = System.nanoTime();
    var databaseName = "bpmn_lean_cibseven_" + UUID.randomUUID().toString().replace("-", "");
    var engineConfiguration =
        (ProcessEngineConfigurationImpl)
            ProcessEngineConfiguration.createStandaloneInMemProcessEngineConfiguration();
    engineConfiguration.setProcessEngineName("bpmn-lean-cibseven-oracle");
    engineConfiguration.setJdbcUrl(
        "jdbc:h2:mem:" + databaseName + ";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000");
    engineConfiguration.setJobExecutorActivate(false);
    engineConfiguration.setHistory(ProcessEngineConfiguration.HISTORY_AUDIT);
    engineConfiguration.setHistoryTimeToLive("P180D");
    engineConfiguration.setEnforceHistoryTimeToLive(true);
    var effectProbe = new CibSevenEffectProbe();
    var createDocumentProbe = new CibSevenCreateDocumentProbe();
    var boundaryErrorProbe = new CibSevenBoundaryErrorProbe();
    engineConfiguration.setBeans(
        Map.of(
            CibSevenEffectProjector.HANDLER_BEAN,
            effectProbe,
            CibSevenCreateDocumentProbe.HANDLER_BEAN,
            createDocumentProbe,
            CibSevenBoundaryErrorProbe.HANDLER_BEAN,
            boundaryErrorProbe));
    var engine = engineConfiguration.buildProcessEngine();
    return new CibSevenScenarioRunner(
        engine,
        engineConfiguration,
        effectProbe,
        createDocumentProbe,
        boundaryErrorProbe,
        positiveElapsedSince(startedAt));
  }

  public synchronized ScenarioResult run(ScenarioDefinition scenario, Path projectRoot)
      throws IOException {
    return run(scenario, projectRoot, CibEffectExecutionSchedule.PLAIN_SUCCESS);
  }

  public synchronized ScenarioResult run(
      ScenarioDefinition scenario,
      Path projectRoot,
      CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    synchronized (PROCESS_GLOBAL_CLOCK_LOCK) {
      effectProbe.beginExecution(effectSchedule);
      createDocumentProbe.beginExecution();
      if (BOUNDARY_ERROR_PROFILE.equals(scenario.profile())) {
        boundaryErrorProbe.beginExecution(scenario);
      }
      return runWithProcessGlobalClock(scenario, projectRoot, effectSchedule);
    }
  }

  private ScenarioResult runWithProcessGlobalClock(
      ScenarioDefinition scenario,
      Path projectRoot,
      CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    ensureOpen();
    validateScenario(scenario);
    Objects.requireNonNull(projectRoot, "projectRoot");

    var bpmnPath = projectRoot.resolve(scenario.bpmn().relativePath()).normalize();
    requireContainedByProject(projectRoot, bpmnPath);
    verifySha256(bpmnPath, scenario.bpmn().sha256());

    var totalStartedAt = System.nanoTime();
    var timings = new MutableTimings();
    var trace = new ArrayList<CanonicalObservation>();
    var taskQueries = new ArrayList<TaskQuerySnapshot>();
    var timerJobs = new ArrayList<TimerJobSnapshot>();
    var effectJobs = new ArrayList<EffectJobSnapshot>();
    var effectExecutions = new ArrayList<EffectExecutionSnapshot>();
    var mappingExecutions = new ArrayList<MappingExecutionSnapshot>();
    String deploymentId = null;
    String engineInstanceId = null;
    String stableInstanceId = null;
    PvmDefinitionProjection pvmDefinition = null;
    CleanupProjection cleanup = null;
    CommandOutcome scenarioOutcome = COMMITTED;

    ClockUtil.setCurrentTime(LOGICAL_EPOCH);
    try {
      var deploymentStartedAt = System.nanoTime();
      try (InputStream bpmn = Files.newInputStream(bpmnPath)) {
        deploymentId =
            processEngine
                .getRepositoryService()
                .createDeployment()
                .name(scenario.id())
                .addInputStream(bpmnPath.getFileName().toString(), bpmn)
                .deploy()
                .getId();
      }
      timings.deploymentNanos = positiveElapsedSince(deploymentStartedAt);
      trace.add(new DeploymentObservation(COMMITTED));

      var processId = startStimulus(scenario).processId();
      var deployedDefinition =
          processEngine
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .deploymentId(deploymentId)
              .processDefinitionKey(processId)
              .singleResult();
      if (deployedDefinition == null) {
        throw new IllegalStateException("Deployment did not contain process " + processId);
      }

      var definitionProjectionStartedAt = System.nanoTime();
      pvmDefinition =
          pvmProjector.project(configuration, deployedDefinition.getId(), processId);
      timings.definitionProjectionNanos =
          positiveElapsedSince(definitionProjectionStartedAt);

      stimulusLoop:
      for (var stimulus : scenario.stimuli()) {
        switch (stimulus) {
          case StartProcessStimulus start -> {
            var startedAt = System.nanoTime();
            var processInstance =
                processEngine.getRuntimeService().startProcessInstanceByKey(start.processId());
            timings.startNanos = positiveElapsedSince(startedAt);
            engineInstanceId = processInstance.getId();
            stableInstanceId = start.instanceId();
            trace.add(new CommandObservation(start.commandId(), COMMITTED));
            if (CREATE_DOCUMENT_PROFILE.equals(scenario.profile())) {
              mappingExecutions.add(createDocumentProbe.snapshot(start.commandId()));
            } else if (BOUNDARY_ERROR_PROFILE.equals(scenario.profile())) {
              mappingExecutions.add(boundaryErrorProbe.snapshot(start.commandId()));
            }

            var projectionStartedAt = System.nanoTime();
            var observed =
                stateProjector.observeState(
                    engineInstanceId,
                    stableInstanceId,
                    start.commandId());
            trace.add(observed.state());
            taskQueries.add(observed.taskQuery());
            timerJobs.add(observed.timerJobs());
            effectJobs.add(observed.effectJobs());
            timings.waitProjectionNanos = positiveElapsedSince(projectionStartedAt);
          }
          case CompleteUserTaskInstanceStimulus complete -> {
            requireStarted(engineInstanceId, stableInstanceId);
            var completeStartedAt = System.nanoTime();
            var outcome =
                commandExecutor.completeUserTaskInstance(
                    engineInstanceId, stableInstanceId, complete);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(complete.commandId(), outcome));

            var projectionStartedAt = System.nanoTime();
            var observed =
                stateProjector.observeState(
                    engineInstanceId,
                    stableInstanceId,
                    complete.commandId());
            trace.add(observed.state());
            taskQueries.add(observed.taskQuery());
            timerJobs.add(observed.timerJobs());
            effectJobs.add(observed.effectJobs());
            timings.completionProjectionNanos =
                positiveElapsedSince(projectionStartedAt);
            if (outcome == REJECTED) {
              scenarioOutcome = REJECTED;
              break stimulusLoop;
            }
          }
          case FireTimerStimulus fire -> {
            requireStarted(engineInstanceId, stableInstanceId);
            var completeStartedAt = System.nanoTime();
            var outcome =
                commandExecutor.fireTimer(engineInstanceId, stableInstanceId, fire);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(fire.commandId(), outcome));

            var projectionStartedAt = System.nanoTime();
            var observed =
                stateProjector.observeState(
                    engineInstanceId,
                    stableInstanceId,
                    fire.commandId());
            trace.add(observed.state());
            taskQueries.add(observed.taskQuery());
            timerJobs.add(observed.timerJobs());
            effectJobs.add(observed.effectJobs());
            timings.completionProjectionNanos =
                positiveElapsedSince(projectionStartedAt);
            if (outcome == REJECTED) {
              scenarioOutcome = REJECTED;
              break stimulusLoop;
            }
          }
          case CompleteEffectStimulus complete -> {
            requireStarted(engineInstanceId, stableInstanceId);
            // These profiles execute the effect and mapping synchronously during start, so CIB has
            // no effect-completion command outcome or mid-effect state to observe. The differential
            // harness compensates explicitly through CibCaseRelation.SynchronousFinalState and
            // CibCaseRelation.SynchronousBoundaryError; this break leaves completeEffect a no-op in
            // the CIB trace and continues with the scenario's next stimulus.
            if (CREATE_DOCUMENT_PROFILE.equals(scenario.profile())) {
              requireSynchronousCreateDocumentCompletion(engineInstanceId);
              createDocumentProbe.requireSuccessfulExecution();
              break;
            }
            if (BOUNDARY_ERROR_PROFILE.equals(scenario.profile())) {
              requireSynchronousBoundaryErrorCatch(engineInstanceId);
              boundaryErrorProbe.requireCaughtExecution();
              break;
            }
            var completeStartedAt = System.nanoTime();
            var execution =
                commandExecutor.completeEffect(
                    engineInstanceId,
                    stableInstanceId,
                    complete,
                    effectSchedule);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(complete.commandId(), execution.outcome()));
            if (execution.evidence() != null) {
              effectExecutions.add(execution.evidence());
            }

            var projectionStartedAt = System.nanoTime();
            var observed =
                stateProjector.observeState(
                    engineInstanceId,
                    stableInstanceId,
                    complete.commandId());
            trace.add(observed.state());
            taskQueries.add(observed.taskQuery());
            timerJobs.add(observed.timerJobs());
            effectJobs.add(observed.effectJobs());
            timings.completionProjectionNanos =
                positiveElapsedSince(projectionStartedAt);
            if (execution.outcome() == REJECTED) {
              scenarioOutcome = REJECTED;
              break stimulusLoop;
            }
          }
        }
      }
    } finally {
      try {
        var cleanupStartedAt = System.nanoTime();
        if (deploymentId != null) {
          processEngine
              .getRepositoryService()
              .deleteDeployment(deploymentId, true, true, true);
        }
        cleanup = stateProjector.observeCleanup();
        timings.cleanupNanos = positiveElapsedSince(cleanupStartedAt);
      } finally {
        timings.totalNanos = positiveElapsedSince(totalStartedAt);
        ClockUtil.reset();
      }
    }

    return new ScenarioResult(
        ScenarioProtocol.SCENARIO_RESULT_KIND,
        scenario.id(),
        new SemanticOutcome(scenarioOutcome),
        trace,
        new Diagnostics(
            release.version(),
            H2_VERSION,
            startupNanos,
            timings.freeze(),
            Objects.requireNonNull(pvmDefinition, "pvmDefinition"),
            taskQueries,
            timerJobs,
            effectJobs,
            effectExecutions,
            mappingExecutions,
            Objects.requireNonNull(cleanup, "cleanup")));
  }

  @Override
  public synchronized void close() {
    synchronized (PROCESS_GLOBAL_CLOCK_LOCK) {
      if (!closed) {
        ClockUtil.reset();
        processEngine.close();
        closed = true;
      }
    }
  }

  private void validateScenario(ScenarioDefinition scenario) {
    Objects.requireNonNull(scenario, "scenario");
    release.requireScenarioRevision(scenario);
    if (!ScenarioProtocol.SCENARIO_KIND.equals(scenario.kind())
        || scenario.profile().isBlank()) {
      throw new IllegalArgumentException("Scenario kind and profile identity are required");
    }
    if (scenario.observations().size() != SUPPORTED_OBSERVATIONS.size()
        || !EnumSet.copyOf(scenario.observations()).equals(SUPPORTED_OBSERVATIONS)) {
      throw new IllegalArgumentException(
          "Scenario requires its canonical observation kinds exactly once");
    }
    var startsOnce =
        !scenario.stimuli().isEmpty()
            && scenario.stimuli().getFirst() instanceof StartProcessStimulus;
    var hasExpectedCompletions =
        startsOnce
            && scenario.stimuli().subList(1, scenario.stimuli().size()).stream()
                .allMatch(
                    stimulus ->
                        stimulus instanceof CompleteUserTaskInstanceStimulus
                            || stimulus instanceof FireTimerStimulus
                            || stimulus instanceof CompleteEffectStimulus);
    if (!startsOnce || !hasExpectedCompletions) {
      throw new IllegalArgumentException(
          "Scenario supports startProcess followed by task, timer, or effect completion commands");
    }
  }

  private StartProcessStimulus startStimulus(ScenarioDefinition scenario) {
    return (StartProcessStimulus) scenario.stimuli().getFirst();
  }

  private void requireSynchronousCreateDocumentCompletion(String engineInstanceId) {
    if (processEngine
            .getRuntimeService()
            .createProcessInstanceQuery()
            .processInstanceId(engineInstanceId)
            .count()
        != 0) {
      throw new IllegalStateException(
          "CIB CreateDocument did not complete in the synchronous start command");
    }
  }

  private void requireSynchronousBoundaryErrorCatch(String engineInstanceId) {
    var tasks =
        processEngine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(engineInstanceId)
            .taskDefinitionKey("ExpectedUserTaskAfterBPMNError")
            .list();
    if (tasks.size() != 1) {
      throw new IllegalStateException(
          "CIB boundary Error did not synchronously reach its User Task");
    }
  }

  private static void requireStarted(String engineInstanceId, String stableInstanceId) {
    if (engineInstanceId == null || stableInstanceId == null) {
      throw new IllegalStateException("No process instance has been started");
    }
  }

  private static void requireContainedByProject(Path projectRoot, Path resource)
      throws IOException {
    var realRoot = projectRoot.toRealPath();
    var realResource = resource.toRealPath();
    if (!realResource.startsWith(realRoot)) {
      throw new IllegalArgumentException("BPMN resource escapes project root: " + resource);
    }
  }

  private static void verifySha256(Path path, String expected) throws IOException {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      try (var input = new DigestInputStream(Files.newInputStream(path), digest)) {
        input.transferTo(OutputStream.nullOutputStream());
      }
      var actual = HexFormat.of().formatHex(digest.digest());
      if (!actual.equals(expected)) {
        throw new IllegalArgumentException(
            "BPMN SHA-256 mismatch for " + path + ": expected " + expected + ", got " + actual);
      }
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("Java runtime does not provide SHA-256", impossible);
    }
  }

  private static long positiveElapsedSince(long startedAt) {
    return Math.max(1, System.nanoTime() - startedAt);
  }

  private void ensureOpen() {
    if (closed) {
      throw new IllegalStateException("Runner is closed");
    }
  }

  private static final class MutableTimings {
    private long deploymentNanos;
    private long definitionProjectionNanos;
    private long startNanos;
    private long waitProjectionNanos;
    private long completeNanos;
    private long completionProjectionNanos;
    private long cleanupNanos;
    private long totalNanos;

    private PhaseTimings freeze() {
      return new PhaseTimings(
          deploymentNanos,
          definitionProjectionNanos,
          startNanos,
          waitProjectionNanos,
          completeNanos,
          completionProjectionNanos,
          cleanupNanos,
          totalNanos);
    }
  }
}
