package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.COMPLETED;
import static org.bpmnlean.cibseven.ScenarioProtocol.ProcessStatus.RUNNING;
import static org.bpmnlean.cibseven.ScenarioProtocol.UserTaskLifecycleState.ACTIVE;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;

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
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.CanonicalObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.Diagnostics;
import org.bpmnlean.cibseven.ScenarioProtocol.ObservationKind;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.PhaseTimings;
import org.bpmnlean.cibseven.ScenarioProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioResult;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.StartProcessStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.StateObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.Stimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;
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
  private static final EnumSet<ObservationKind> M0_OBSERVATIONS =
      EnumSet.of(
          ObservationKind.DEPLOYMENT,
          ObservationKind.COMMAND_RESULTS,
          ObservationKind.PROCESS_STATUS,
          ObservationKind.ACTIVE_WAITS,
          ObservationKind.ENABLED_STIMULI,
          ObservationKind.LOGICAL_TIME);
  private static final EnumSet<ObservationKind> USER_TASK_INTERACTION_OBSERVATIONS =
      EnumSet.allOf(ObservationKind.class);

  private final ProcessEngine processEngine;
  private final ProcessEngineConfigurationImpl configuration;
  private final PvmDefinitionProjector pvmProjector;
  private final long startupNanos;
  private boolean closed;

  private CibSevenScenarioRunner(
      ProcessEngine processEngine,
      ProcessEngineConfigurationImpl configuration,
      long startupNanos) {
    this.processEngine = processEngine;
    this.configuration = configuration;
    this.pvmProjector = new PvmDefinitionProjector();
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
    var engine = engineConfiguration.buildProcessEngine();
    return new CibSevenScenarioRunner(
        engine,
        engineConfiguration,
        positiveElapsedSince(startedAt));
  }

  public synchronized ScenarioResult run(ScenarioDefinition scenario, Path projectRoot)
      throws IOException {
    synchronized (PROCESS_GLOBAL_CLOCK_LOCK) {
      return runWithProcessGlobalClock(scenario, projectRoot);
    }
  }

  private ScenarioResult runWithProcessGlobalClock(
      ScenarioDefinition scenario, Path projectRoot) throws IOException {
    ensureOpen();
    validateScenario(scenario);
    Objects.requireNonNull(projectRoot, "projectRoot");

    var bpmnPath = projectRoot.resolve(scenario.bpmn().relativePath()).normalize();
    requireContainedByProject(projectRoot, bpmnPath);
    verifySha256(bpmnPath, scenario.bpmn().sha256());

    var totalStartedAt = System.nanoTime();
    var timings = new MutableTimings();
    var trace = new ArrayList<CanonicalObservation>();
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
      for (var index = 0; index < scenario.stimuli().size(); index++) {
        var stimulus = scenario.stimuli().get(index);
        var remaining = scenario.stimuli().subList(index + 1, scenario.stimuli().size());
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
            trace.add(observeState(scenario, engineInstanceId, stableInstanceId, remaining));
            timings.waitProjectionNanos = positiveElapsedSince(projectionStartedAt);
          }
          case CompleteUserTaskStimulus complete -> {
            requireStarted(engineInstanceId, stableInstanceId);
            var completeStartedAt = System.nanoTime();
            var outcome = completeUserTask(engineInstanceId, complete);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(complete.commandId(), outcome));

            var projectionStartedAt = System.nanoTime();
            trace.add(observeState(scenario, engineInstanceId, stableInstanceId, remaining));
            timings.completionProjectionNanos =
                positiveElapsedSince(projectionStartedAt);
            if (outcome == REJECTED) {
              scenarioOutcome = REJECTED;
              break stimulusLoop;
            }
          }
          case CompleteUserTaskInstanceStimulus complete -> {
            requireStarted(engineInstanceId, stableInstanceId);
            var completeStartedAt = System.nanoTime();
            var outcome =
                completeUserTaskInstance(engineInstanceId, stableInstanceId, complete);
            timings.completeNanos = positiveElapsedSince(completeStartedAt);
            trace.add(new CommandObservation(complete.commandId(), outcome));

            var projectionStartedAt = System.nanoTime();
            trace.add(observeState(scenario, engineInstanceId, stableInstanceId, remaining));
            timings.completionProjectionNanos =
                positiveElapsedSince(projectionStartedAt);
            if (outcome == REJECTED) {
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
        scenario.schemaVersion(),
        scenario.id(),
        new SemanticOutcome(scenarioOutcome),
        trace,
        new Diagnostics(
            CIBSEVEN_VERSION,
            H2_VERSION,
            startupNanos,
            timings.freeze(),
            Objects.requireNonNull(pvmDefinition, "pvmDefinition"),
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
    var isMilestoneZero =
        ScenarioProtocol.SCHEMA_VERSION.equals(scenario.schemaVersion())
            && ScenarioProtocol.SUPPORTED_PROFILE.equals(scenario.profile());
    var isUserTaskInteraction =
        ScenarioProtocol.USER_TASK_INTERACTION_SCHEMA_VERSION.equals(
                scenario.schemaVersion())
            && ScenarioProtocol.USER_TASK_INTERACTION_PROFILE.equals(scenario.profile());
    if (!isMilestoneZero && !isUserTaskInteraction) {
      throw new IllegalArgumentException(
          "Unsupported scenario/profile pair: "
              + scenario.schemaVersion()
              + "/"
              + scenario.profile());
    }
    var expectedObservations =
        isMilestoneZero ? M0_OBSERVATIONS : USER_TASK_INTERACTION_OBSERVATIONS;
    if (scenario.observations().size() != expectedObservations.size()
        || !EnumSet.copyOf(scenario.observations()).equals(expectedObservations)) {
      throw new IllegalArgumentException(
          "Scenario requires its canonical observation kinds exactly once");
    }
    if (scenario.stimuli().size() != 2
        || !(scenario.stimuli().get(0) instanceof StartProcessStimulus)
        || (isMilestoneZero
            && !(scenario.stimuli().get(1) instanceof CompleteUserTaskStimulus))
        || (isUserTaskInteraction
            && !(scenario.stimuli().get(1)
                instanceof CompleteUserTaskInstanceStimulus))) {
      throw new IllegalArgumentException(
          "Scenario supports exactly startProcess followed by its completion command");
    }
  }

  private StartProcessStimulus startStimulus(ScenarioDefinition scenario) {
    return (StartProcessStimulus) scenario.stimuli().getFirst();
  }

  private CommandOutcome completeUserTask(
      String engineInstanceId, CompleteUserTaskStimulus complete) {
    var tasks =
        processEngine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(engineInstanceId)
            .taskDefinitionKey(complete.elementId())
            .list();
    if (tasks.size() != 1) {
      return REJECTED;
    }
    processEngine.getTaskService().complete(tasks.getFirst().getId());
    return COMMITTED;
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

  private StateObservation observeState(
      ScenarioDefinition scenario,
      String engineInstanceId,
      String stableInstanceId,
      List<Stimulus> remainingStimuli) {
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
    var activeWaits = observeActiveWaits(tasks);
    var openUserTasks =
        usesTaskProjection(scenario)
            ? observeOpenUserTasks(stableInstanceId, tasks)
            : null;
    var activeElements =
        activeWaits.stream().map(ActiveWait::elementId).collect(Collectors.toSet());
    var activeTaskIds =
        openUserTasks == null
            ? Set.<UserTaskInstanceId>of()
            : openUserTasks.stream().map(OpenUserTask::id).collect(Collectors.toSet());
    var enabledStimuli =
        remainingStimuli.stream()
            .filter(
                stimulus -> switch (stimulus) {
                  case CompleteUserTaskStimulus complete ->
                      activeElements.contains(complete.elementId());
                  case CompleteUserTaskInstanceStimulus complete ->
                      activeTaskIds.contains(complete.taskId());
                  case StartProcessStimulus ignored -> false;
                })
            .toList();
    var logicalTimeMs = ClockUtil.getCurrentTime().getTime() - LOGICAL_EPOCH.getTime();
    return new StateObservation(
        stableInstanceId,
        isRunning ? RUNNING : COMPLETED,
        activeWaits,
        openUserTasks,
        enabledStimuli,
        logicalTimeMs);
  }

  private List<ActiveWait> observeActiveWaits(
      List<Task> tasks) {
    Map<String, Integer> multiplicities = new TreeMap<>();
    for (var task : tasks) {
      multiplicities.merge(task.getTaskDefinitionKey(), 1, Integer::sum);
    }
    return multiplicities.entrySet().stream()
        .map(entry -> new ActiveWait(entry.getKey(), USER_TASK, entry.getValue()))
        .toList();
  }

  private List<OpenUserTask> observeOpenUserTasks(
      String stableInstanceId,
      List<Task> tasks) {
    if (tasks.size() > 1) {
      throw new IllegalStateException(
          "The User Task interaction capsule supports at most one active task");
    }
    return tasks.stream()
        .map(
            task ->
                new OpenUserTask(
                    new UserTaskInstanceId(
                        stableInstanceId,
                        task.getTaskDefinitionKey(),
                        1),
                    task.getName(),
                    ACTIVE))
        .toList();
  }

  private static boolean usesTaskProjection(ScenarioDefinition scenario) {
    return ScenarioProtocol.USER_TASK_INTERACTION_SCHEMA_VERSION.equals(
        scenario.schemaVersion());
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
