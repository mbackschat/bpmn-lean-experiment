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
  private static final String CIBSEVEN_VERSION = "2.2.0";
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
          ObservationKind.ENABLED_INTERACTIONS,
          ObservationKind.LOGICAL_TIME);

  private final ProcessEngine processEngine;
  private final ProcessEngineConfigurationImpl configuration;
  private final PvmDefinitionProjector pvmProjector;
  private final CibSevenUserTaskProjector userTaskProjector;
  private final CibSevenEffectProjector effectProjector;
  private final CibSevenEffectProbe effectProbe;
  private final long startupNanos;
  private boolean closed;

  private CibSevenScenarioRunner(
      ProcessEngine processEngine,
      ProcessEngineConfigurationImpl configuration,
      CibSevenEffectProbe effectProbe,
      long startupNanos) {
    this.processEngine = processEngine;
    this.configuration = configuration;
    this.pvmProjector = new PvmDefinitionProjector();
    this.userTaskProjector = new CibSevenUserTaskProjector();
    this.effectProjector = new CibSevenEffectProjector();
    this.effectProbe = effectProbe;
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
    engineConfiguration.setBeans(
        Map.of(CibSevenEffectProjector.HANDLER_BEAN, effectProbe));
    var engine = engineConfiguration.buildProcessEngine();
    return new CibSevenScenarioRunner(
        engine,
        engineConfiguration,
        effectProbe,
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

            var projectionStartedAt = System.nanoTime();
            var observed =
                observeState(
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
                completeUserTaskInstance(engineInstanceId, stableInstanceId, complete);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(complete.commandId(), outcome));

            var projectionStartedAt = System.nanoTime();
            var observed =
                observeState(
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
                fireTimer(engineInstanceId, stableInstanceId, fire);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(fire.commandId(), outcome));

            var projectionStartedAt = System.nanoTime();
            var observed =
                observeState(
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
            var completeStartedAt = System.nanoTime();
            var execution =
                completeEffect(
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
                observeState(
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
        cleanup = observeCleanup();
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
            CIBSEVEN_VERSION,
            H2_VERSION,
            startupNanos,
            timings.freeze(),
            Objects.requireNonNull(pvmDefinition, "pvmDefinition"),
            taskQueries,
            timerJobs,
            effectJobs,
            effectExecutions,
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

  private CommandOutcome completeUserTaskInstance(
      String engineInstanceId,
      String stableInstanceId,
      CompleteUserTaskInstanceStimulus complete) {
    var taskId = complete.taskId();
    if (!taskId.processInstanceId().equals(stableInstanceId)
        || taskId.activation() != 1) {
      return REJECTED;
    }
    var tasks =
        processEngine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(engineInstanceId)
            .taskDefinitionKey(taskId.elementId())
            .list();
    if (tasks.size() != 1) {
      return REJECTED;
    }
    processEngine.getTaskService().complete(tasks.getFirst().getId());
    return COMMITTED;
  }

  /**
   * Advances the controlled clock only after proving the selected timer job is ineligible, then
   * executes it only after the engine's executable query admits the same job.
   */
  private CommandOutcome fireTimer(
      String engineInstanceId,
      String stableInstanceId,
      FireTimerStimulus fire) {
    var timerId = fire.timerId();
    if (!timerId.processInstanceId().equals(stableInstanceId)
        || timerId.activation() != 1) {
      return REJECTED;
    }
    var jobs =
        processEngine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(engineInstanceId)
            .activityId(timerId.elementId())
            .timers()
            .list();
    if (jobs.size() != 1) {
      return REJECTED;
    }
    var job = jobs.getFirst();
    var dueDateDeltaMs = job.getDuedate().getTime() - LOGICAL_EPOCH.getTime();
    if (dueDateDeltaMs != fire.logicalTimeMs()) {
      return REJECTED;
    }
    var management = processEngine.getManagementService();
    if (management.createJobQuery().jobId(job.getId()).executable().count() != 0) {
      throw new IllegalStateException(
          "Timer job was executable before the controlled clock reached its due date");
    }
    ClockUtil.setCurrentTime(new Date(LOGICAL_EPOCH.getTime() + fire.logicalTimeMs()));
    var executable =
        management.createJobQuery().jobId(job.getId()).executable().singleResult();
    if (executable == null) {
      throw new IllegalStateException(
          "Timer job was not executable when the controlled clock reached its due date");
    }
    management.executeJob(executable.getId());
    return COMMITTED;
  }

  private EffectCompletion completeEffect(
      String engineInstanceId,
      String stableInstanceId,
      CompleteEffectStimulus complete,
      CibEffectExecutionSchedule schedule) {
    var submitted = complete.effectId();
    if (!submitted.processInstanceId().equals(stableInstanceId)
        || submitted.activation() != 1) {
      return new EffectCompletion(REJECTED, null);
    }
    var waits = effectProjector.project(processEngine, engineInstanceId, stableInstanceId);
    if (waits.size() != 1
        || !waits.getFirst().openEffect().id().equals(submitted)) {
      return new EffectCompletion(REJECTED, null);
    }
    var wait = waits.getFirst();
    var management = processEngine.getManagementService();
    var initialRetries = wait.evidence().retries();
    Long retriesAfterFirstFailure = null;
    try {
      management.executeJob(wait.jobId());
    } catch (RuntimeException failure) {
      if (schedule != CibEffectExecutionSchedule.FAIL_AFTER_MUTATION_ONCE) {
        throw failure;
      }
      var failedJob = management.createJobQuery().jobId(wait.jobId()).singleResult();
      if (failedJob == null || failedJob.getRetries() != initialRetries - 1) {
        throw new IllegalStateException(
            "CIB did not retain and decrement the failed Service Task job",
            failure);
      }
      retriesAfterFirstFailure = (long) failedJob.getRetries();
      if (management.createJobQuery().jobId(wait.jobId()).executable().count() != 1) {
        throw new IllegalStateException(
            "CIB failed Service Task job was not publicly executable",
            failure);
      }
      management.executeJob(wait.jobId());
    }
    if (management.createJobQuery().jobId(wait.jobId()).count() != 0) {
      throw new IllegalStateException("CIB retained the Service Task job after success");
    }
    return new EffectCompletion(
        COMMITTED,
        new EffectExecutionSnapshot(
            complete.commandId(),
            schedule.wireValue(),
            effectProbe.invocations(),
            effectProbe.mutations(),
            initialRetries,
            retriesAfterFirstFailure));
  }

  private ObservedState observeState(
      String engineInstanceId,
      String stableInstanceId,
      String afterCommandId) {
    var isRunning =
        processEngine
                .getRuntimeService()
                .createProcessInstanceQuery()
                .processInstanceId(engineInstanceId)
                .count()
            == 1;
    var tasks =
        isRunning
            ? processEngine
                .getTaskService()
                .createTaskQuery()
                .processInstanceId(engineInstanceId)
                .list()
            : List.<Task>of();
    var hostTasks =
        tasks.stream()
            .map(task -> new HostUserTask(task.getTaskDefinitionKey(), task.getName()))
            .toList();
    var taskQuery =
        new TaskQuerySnapshot(
            afterCommandId,
            hostTasks.stream()
                .map(task -> new TaskQueryTask(task.elementId(), task.name()))
                .toList());
    var activeWaits = userTaskProjector.activeWaits(hostTasks);
    var openUserTasks =
        userTaskProjector.openUserTasks(stableInstanceId, hostTasks);
    var enabledInteractions =
        openUserTasks.stream()
            .<EnabledInteraction>map(
                task -> new CompleteUserTaskInstanceInteraction(task.id()))
            .toList();
    var timerJobSnapshot = observeTimerJobs(engineInstanceId, afterCommandId, isRunning);
    var openTimers =
        timerJobSnapshot.jobs().stream()
            .map(
                job ->
                    new OpenTimer(
                        new TimerOccurrenceId(
                            stableInstanceId,
                            job.elementId(),
                            1),
                        job.dueDateDeltaMs()))
            .toList();
    var timerWaits =
        openTimers.stream()
            .map(timer -> new ScenarioProtocol.ActiveWait(
                timer.id().elementId(), TIMER, 1))
            .toList();
    var projectedEffects =
        isRunning
            ? effectProjector.project(
                processEngine, engineInstanceId, stableInstanceId)
            : List.<CibSevenEffectProjector.ProjectedEffectWait>of();
    var openEffects =
        projectedEffects.stream().map(CibSevenEffectProjector.ProjectedEffectWait::openEffect).toList();
    var effectWaits =
        openEffects.stream()
            .map(effect -> new ScenarioProtocol.ActiveWait(
                effect.id().elementId(), EFFECT, 1))
            .toList();
    var allWaits = new ArrayList<>(activeWaits);
    allWaits.addAll(timerWaits);
    allWaits.addAll(effectWaits);
    allWaits.sort(
        (left, right) -> WireStrings.compare(left.elementId(), right.elementId()));
    var logicalTimeMs = ClockUtil.getCurrentTime().getTime() - LOGICAL_EPOCH.getTime();
    return new ObservedState(
        new StateObservation(
            stableInstanceId,
            isRunning ? RUNNING : COMPLETED,
            allWaits,
            openUserTasks,
            openTimers,
            openEffects,
            enabledInteractions,
            logicalTimeMs),
        taskQuery,
        timerJobSnapshot,
        new EffectJobSnapshot(
            afterCommandId,
            projectedEffects.stream()
                .map(CibSevenEffectProjector.ProjectedEffectWait::evidence)
                .toList()));
  }

  private TimerJobSnapshot observeTimerJobs(
      String engineInstanceId,
      String afterCommandId,
      boolean isRunning) {
    if (!isRunning) {
      return new TimerJobSnapshot(afterCommandId, List.of());
    }
    var management = processEngine.getManagementService();
    var jobs =
        management
            .createJobQuery()
            .processInstanceId(engineInstanceId)
            .timers()
            .list();
    var projected =
        jobs.stream()
            .map(
                job -> {
                  var definition =
                      management
                          .createJobDefinitionQuery()
                          .jobDefinitionId(job.getJobDefinitionId())
                          .singleResult();
                  if (definition == null) {
                    throw new IllegalStateException(
                        "Timer job has no job definition " + job.getJobDefinitionId());
                  }
                  return new TimerJob(
                      definition.getActivityId(),
                      job.getDuedate().getTime() - LOGICAL_EPOCH.getTime(),
                      management
                              .createJobQuery()
                              .jobId(job.getId())
                              .executable()
                              .count()
                          == 1);
                })
            .sorted((left, right) -> WireStrings.compare(left.elementId(), right.elementId()))
            .toList();
    return new TimerJobSnapshot(afterCommandId, projected);
  }

  private CleanupProjection observeCleanup() {
    return new CleanupProjection(
        processEngine.getRepositoryService().createDeploymentQuery().count(),
        processEngine.getRepositoryService().createProcessDefinitionQuery().count(),
        processEngine.getRuntimeService().createProcessInstanceQuery().count(),
        processEngine.getTaskService().createTaskQuery().count(),
        processEngine.getManagementService().createJobQuery().count(),
        processEngine.getRuntimeService().createIncidentQuery().count(),
        processEngine
            .getHistoryService()
            .createHistoricProcessInstanceQuery()
            .count());
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

  private record ObservedState(
      StateObservation state,
      TaskQuerySnapshot taskQuery,
      TimerJobSnapshot timerJobs,
      EffectJobSnapshot effectJobs) {}

  private record EffectCompletion(
      CommandOutcome outcome, EffectExecutionSnapshot evidence) {}

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
