package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.Objects;
import org.bpmnlean.cibseven.CibSevenCommandExecutor.Execution;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.Diagnostics;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectExecutionSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.PhaseTimings;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.CanonicalObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.Command;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.ConditionStart;
import org.bpmnlean.cibseven.ScenarioProtocol.Deliver;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.DirectMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageStart;
import org.bpmnlean.cibseven.ScenarioProtocol.NoneStart;
import org.bpmnlean.cibseven.ScenarioProtocol.OperationMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioResult;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalStart;
import org.bpmnlean.cibseven.ScenarioProtocol.Start;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerFire;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerStart;
import org.bpmnlean.cibseven.ScenarioProtocol.UnspecifiedMessageChannel;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.cibseven.bpm.engine.impl.util.ClockUtil;
import org.cibseven.bpm.model.bpmn.instance.CallActivity;
import org.cibseven.bpm.model.bpmn.instance.Message;

/**
 * Embedded, single-threaded CIB Seven calibration oracle.
 *
 * <p>The engine stays warm across scenarios, while every scenario deploys and removes its own resources. CIB Seven's
 * clock is process-global, so run is synchronized and always restores it. The trace follows the kernel runner's
 * rules ([Kernel.Run](../../../../../../../../Kernel/Run.lean)): a committed input, or a rejected one that is not
 * last, adds its command and state observation and the run continues; the last input's outcome is the scenario's.
 */
final class CibSevenEngineScenarioRunner implements AutoCloseable {

  private static final Date LOGICAL_EPOCH = new Date(0);
  private static final Object PROCESS_GLOBAL_CLOCK_LOCK = new Object();
  private static final String H2_VERSION = "2.3.232";
  private final ProcessEngine processEngine;
  private final CibSevenRelease release;
  private final CibSevenScenarioValidator scenarioValidator;
  private final ProcessEngineConfigurationImpl configuration;
  private final PvmDefinitionProjector pvmProjector;
  private final CibSevenScriptedEffect effects;
  private final boolean incidentCreationEnabled;
  private final long startupNanos;
  private boolean closed;

  private CibSevenEngineScenarioRunner(CibSevenEngineBundleFactory.EngineBundle bundle) {
    this.processEngine = bundle.engine();
    this.release = CibSevenRelease.current();
    this.scenarioValidator = new CibSevenScenarioValidator(release);
    this.configuration = bundle.configuration();
    this.pvmProjector = new PvmDefinitionProjector();
    this.effects = bundle.effects();
    this.incidentCreationEnabled = bundle.incidentCreationEnabled();
    this.startupNanos = bundle.startupNanos();
  }

  static CibSevenEngineScenarioRunner create(boolean incidentCreationEnabled) {
    return new CibSevenEngineScenarioRunner(CibSevenEngineBundleFactory.create(incidentCreationEnabled));
  }

  public synchronized ScenarioResult run(
      ScenarioDefinition scenario, Path projectRoot, CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    synchronized (PROCESS_GLOBAL_CLOCK_LOCK) {
      if (closed) {
        throw new IllegalStateException("Runner is closed");
      }
      if (scenario.declaredOptions().incidentsEnabled() != incidentCreationEnabled) {
        throw new IllegalStateException("Scenario options do not match the engine environment");
      }
      effects.beginScenario(
          effectSchedule,
          scenario.stimuli().stream()
              .filter(EffectResult.class::isInstance)
              .map(EffectResult.class::cast)
              .toList());
      return runWithProcessGlobalClock(scenario, projectRoot, effectSchedule);
    }
  }

  private ScenarioResult runWithProcessGlobalClock(
      ScenarioDefinition scenario, Path projectRoot, CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    var validated = scenarioValidator.validate(scenario, projectRoot);
    var options = scenario.declaredOptions();
    var projector =
        new CibSevenStateProjector(
            processEngine, LOGICAL_EPOCH, options.incidentsEnabled(), options.incidentsCancellable());
    var executor =
        new CibSevenCommandExecutor(processEngine, projector, effects, effectSchedule, options, LOGICAL_EPOCH);
    var totalStartedAt = System.nanoTime();
    var timings = new MutableTimings();
    var trace = new ArrayList<CanonicalObservation>();
    var observations = new CibSevenObservationEvidence();
    var effectExecutions = new ArrayList<EffectExecutionSnapshot>();
    String deploymentId = null;
    String engineRootId = null;
    String stableRootId = null;
    PvmDefinitionProjection pvmDefinition = null;
    CleanupProjection cleanup = null;
    CommandOutcome scenarioOutcome = COMMITTED;

    ClockUtil.setCurrentTime(LOGICAL_EPOCH);
    try {
      var deploymentStartedAt = System.nanoTime();
      try (InputStream bpmn = Files.newInputStream(validated.bpmnPath())) {
        deploymentId =
            processEngine.getRepositoryService().createDeployment()
                .name(scenario.id())
                .addInputStream(validated.bpmnPath().getFileName().toString(), bpmn)
                .deploy()
                .getId();
      }
      timings.deploymentNanos = positiveElapsedSince(deploymentStartedAt);
      trace.add(new DeploymentObservation(COMMITTED, null));

      var definitionId = rootDefinitionId(deploymentId);
      var processId =
          processEngine.getRepositoryService().getProcessDefinition(definitionId).getKey();
      var definitionProjectionStartedAt = System.nanoTime();
      pvmDefinition = pvmProjector.project(configuration, definitionId, processId);
      timings.definitionProjectionNanos = positiveElapsedSince(definitionProjectionStartedAt);

      var stimuli = scenario.stimuli();
      for (var index = 0; index < stimuli.size(); index++) {
        var stimulus = stimuli.get(index);
        effects.beginCommand(stimulus.commandId());
        if (stimulus instanceof EffectResult && effects.consumedSynchronously(stimulus.commandId())) {
          continue;
        }
        var startedAt = System.nanoTime();
        CommandOutcome outcome;
        if (stimulus instanceof Start start) {
          engineRootId = start(start, definitionId);
          stableRootId = engineRootId == null ? null : start.instanceId();
          outcome = engineRootId == null ? REJECTED : COMMITTED;
        } else if (engineRootId == null) {
          outcome = REJECTED;
        } else {
          var execution = execute(executor, engineRootId, stableRootId, stimulus);
          outcome = execution.outcome();
          if (execution.evidence() != null) {
            effectExecutions.add(execution.evidence());
          }
        }
        var commandNanos = positiveElapsedSince(startedAt);
        trace.add(new CommandObservation(stimulus.commandId(), outcome));
        var projectionNanos = 0L;
        if (engineRootId != null) {
          var projectionStartedAt = System.nanoTime();
          var observed = projector.observe(engineRootId, stableRootId, stimulus.commandId());
          trace.add(observed.state());
          observations.add(observed);
          projectionNanos = positiveElapsedSince(projectionStartedAt);
        }
        if (stimulus instanceof Start) {
          timings.startNanos = commandNanos;
          timings.waitProjectionNanos = projectionNanos;
        } else {
          timings.completeNanos = commandNanos;
          timings.completionProjectionNanos = projectionNanos;
        }
        scenarioOutcome = outcome;
        if (outcome == REJECTED && index + 1 < stimuli.size()) {
          scenarioOutcome = COMMITTED;
        }
      }
    } finally {
      try {
        var cleanupStartedAt = System.nanoTime();
        if (deploymentId != null) {
          processEngine.getRepositoryService().deleteDeployment(deploymentId, true, true, true);
        }
        cleanup = projector.observeCleanup();
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
            observations.stateQueries(),
            observations.taskQueries(),
            observations.messageSubscriptions(),
            observations.timerJobs(),
            observations.effectJobs(),
            options.incidentsEnabled() ? observations.incidentJobs() : null,
            observations.historicProcessStates(),
            effectExecutions,
            effects.mappingExecutions(),
            Objects.requireNonNull(cleanup, "cleanup")));
  }

  private static Execution execute(
      CibSevenCommandExecutor executor, String engineRootId, String stableRootId, ScenarioProtocol.Stimulus stimulus) {
    return switch (stimulus) {
      case Command command -> executor.command(engineRootId, stableRootId, command);
      case Deliver deliver -> executor.deliver(engineRootId, stableRootId, deliver);
      case TimerFire fire -> executor.timerFire(engineRootId, stableRootId, fire);
      case EffectResult result -> executor.effectResult(engineRootId, stableRootId, result);
      case Start ignored -> throw new IllegalStateException("A scenario starts exactly once");
    };
  }

  /** The deployed executable process no Call Activity of the same deployment calls. */
  private String rootDefinitionId(String deploymentId) {
    var repository = processEngine.getRepositoryService();
    var definitions = repository.createProcessDefinitionQuery().deploymentId(deploymentId).list();
    var called = new HashSet<String>();
    for (var definition : definitions) {
      repository.getBpmnModelInstance(definition.getId()).getModelElementsByType(CallActivity.class).stream()
          .map(CallActivity::getCalledElement)
          .filter(Objects::nonNull)
          .map(element -> element.substring(element.indexOf(':') + 1))
          .forEach(called::add);
    }
    var roots = definitions.stream().filter(definition -> !called.contains(definition.getKey())).toList();
    if (roots.size() != 1) {
      throw new IllegalStateException("Deployment has no unique root process: " + roots.size());
    }
    return roots.getFirst().getId();
  }

  /** Starts the root instance as the start input states; `null` when CIB refuses the start. */
  private String start(Start start, String definitionId) {
    var runtime = processEngine.getRuntimeService();
    var variables = ScenarioVariableBindings.toEngineMap(start.variables());
    if (start.businessKey() != null) {
      throw new IllegalStateException("A start business key has no realization in this runner yet");
    }
    return switch (start.trigger() == null ? new NoneStart() : start.trigger()) {
      case NoneStart ignored ->
          start.startEvent() == null
              ? runtime.startProcessInstanceById(definitionId, variables).getId()
              : runtime.createProcessInstanceById(definitionId)
                  .startBeforeActivity(start.startEvent())
                  .setVariables(variables)
                  .execute()
                  .getId();
      case MessageStart message -> {
        if (message.payload() != null) {
          throw new IllegalStateException("A Message start payload has no realization in this runner yet");
        }
        var messageId =
            switch (message.channel()) {
              case DirectMessageChannel direct -> direct.messageId();
              case OperationMessageChannel operation -> operation.messageId();
              case UnspecifiedMessageChannel ignored ->
                  throw new IllegalStateException("A Message start needs a Message");
            };
        var model = processEngine.getRepositoryService().getBpmnModelInstance(definitionId);
        var name = ((Message) model.getModelElementById(messageId)).getName();
        yield runtime.createMessageCorrelation(name)
            .processDefinitionId(definitionId)
            .setVariables(variables)
            .correlateStartMessage()
            .getId();
      }
      case TimerStart timer -> fireTimerStart(start, timer, definitionId);
      case SignalStart ignored ->
          throw new IllegalStateException("A Signal start has no realization in this runner yet");
      case ConditionStart ignored ->
          throw new IllegalStateException("A conditional start has no realization in this runner yet");
    };
  }

  /** A timer start fires only at its job's due date, by the same controlled-clock rule as a timer wait. */
  private String fireTimerStart(Start start, TimerStart timer, String definitionId) {
    var management = processEngine.getManagementService();
    var jobs =
        management.createJobQuery().processDefinitionId(definitionId).activityId(start.startEvent()).timers().list();
    if (jobs.size() != 1
        || jobs.getFirst().getDuedate().getTime() - LOGICAL_EPOCH.getTime() != timer.logicalTimeMs()) {
      return null;
    }
    ClockUtil.setCurrentTime(new Date(LOGICAL_EPOCH.getTime() + timer.logicalTimeMs()));
    management.executeJob(jobs.getFirst().getId());
    var started =
        processEngine.getRuntimeService().createProcessInstanceQuery().processDefinitionId(definitionId).list();
    if (started.size() != 1) {
      throw new IllegalStateException("Timer start did not create exactly one instance");
    }
    return started.getFirst().getId();
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

  private static long positiveElapsedSince(long startedAt) {
    return Math.max(1, System.nanoTime() - startedAt);
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
