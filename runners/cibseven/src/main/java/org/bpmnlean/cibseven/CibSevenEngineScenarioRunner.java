package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.ROLLED_BACK;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.UNSUPPORTED;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Date;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.bpmnlean.cibseven.CibSevenCommandExecutor.Execution;
import org.bpmnlean.cibseven.PopulationProtocol.InstanceStep;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationDiagnostics;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationResult;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationScenario;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.Diagnostics;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectExecutionSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.PhaseTimings;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.PvmDefinitionProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.CanonicalObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.Command;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.cibseven.bpm.dmn.engine.DmnEngineException;
import org.cibseven.bpm.dmn.feel.impl.FeelException;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.bpmnlean.cibseven.ScenarioProtocol.Deliver;
import org.bpmnlean.cibseven.ScenarioProtocol.DeploymentObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioDefinition;
import org.bpmnlean.cibseven.ScenarioProtocol.ScenarioResult;
import org.bpmnlean.cibseven.ScenarioProtocol.SemanticOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.Start;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerFire;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.ManagementServiceImpl;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.cibseven.bpm.engine.impl.util.ClockUtil;

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
  private final CibSevenStarts starts;
  private final CibSevenScriptedEffect effects;
  private final CibSevenEngineBundleFactory.ScenarioIds ids;
  private final boolean incidentCreationEnabled;
  private final long startupNanos;
  private final Map<String, Long> bootTables;
  private boolean closed;

  private CibSevenEngineScenarioRunner(CibSevenEngineBundleFactory.EngineBundle bundle) {
    this.processEngine = bundle.engine();
    this.release = CibSevenRelease.current();
    this.scenarioValidator = new CibSevenScenarioValidator(release);
    this.configuration = bundle.configuration();
    this.pvmProjector = new PvmDefinitionProjector();
    this.starts = new CibSevenStarts(processEngine, LOGICAL_EPOCH);
    this.effects = bundle.effects();
    this.ids = bundle.ids();
    this.incidentCreationEnabled = bundle.incidentCreationEnabled();
    this.startupNanos = bundle.startupNanos();
    this.bootTables = Map.copyOf(processEngine.getManagementService().getTableCount());
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

  /**
   * Runs a population scenario ({@link CibSevenPopulationRunner}) under the same clock lock and boot-state discipline
   * as a single-instance scenario, then deletes every deployment it made and records the cleanup.
   */
  public synchronized PopulationResult runPopulation(PopulationScenario scenario, Path projectRoot) throws IOException {
    synchronized (PROCESS_GLOBAL_CLOCK_LOCK) {
      if (closed) {
        throw new IllegalStateException("Runner is closed");
      }
      if (incidentCreationEnabled) {
        throw new IllegalStateException("A population runs in the default engine environment");
      }
      var resources = scenarioValidator.validatePopulation(scenario, projectRoot);
      restoreBootTables();
      ids.restart();
      var results = scenario.steps().stream()
          .filter(InstanceStep.class::isInstance)
          .map(step -> ((InstanceStep) step).stimulus())
          .filter(EffectResult.class::isInstance)
          .map(EffectResult.class::cast)
          .toList();
      // The scripted effect answers a synchronous Service Task with the next result for its element, whichever
      // instance runs it, so results for one element in several instances could answer the wrong one.
      var instancesByElement = results.stream().collect(Collectors.groupingBy(
          result -> result.occurrence().elementId(),
          Collectors.mapping(result -> result.occurrence().processInstanceId(), Collectors.toSet())));
      if (instancesByElement.values().stream().anyMatch(instances -> instances.size() > 1)) {
        throw new IllegalStateException("Effect results of one element in several instances have no realization");
      }
      effects.beginScenario(CibEffectExecutionSchedule.PLAIN_SUCCESS, results);
      var population = new CibSevenPopulationRunner(processEngine, effects, LOGICAL_EPOCH);
      PopulationResult answer;
      CleanupProjection cleanup;
      RuntimeException undeletable = null;
      try {
        answer = population.run(scenario, resources);
      } finally {
        try {
          for (var deploymentId : population.deploymentIds()) {
            var failure = deleteDeployment(deploymentId);
            undeletable = undeletable == null ? failure : undeletable;
          }
          cleanup = population.observeCleanup();
        } finally {
          ClockUtil.reset();
        }
      }
      if (undeletable != null) {
        throw new IllegalStateException(
            "CIB could not delete the population's deployments; the engine was purged", undeletable);
      }
      return new PopulationResult(
          answer.kind(),
          answer.scenarioId(),
          answer.deployments(),
          answer.steps(),
          answer.inputFailures(),
          answer.processStates(),
          new PopulationDiagnostics(release.version(), H2_VERSION, cleanup));
    }
  }

  private ScenarioResult runWithProcessGlobalClock(
      ScenarioDefinition scenario, Path projectRoot, CibEffectExecutionSchedule effectSchedule)
      throws IOException {
    var validated = scenarioValidator.validate(scenario, projectRoot);
    restoreBootTables();
    ids.restart();
    var options = scenario.declaredOptions();
    var projector =
        new CibSevenStateProjector(
            processEngine,
            LOGICAL_EPOCH,
            options.incidentsEnabled(),
            options.incidentsCancellable(),
            CibSevenOccurrences::keyOnly);
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
    RuntimeException undeletable = null;
    CommandOutcome scenarioOutcome = COMMITTED;

    ClockUtil.setCurrentTime(LOGICAL_EPOCH);
    try {
      var deploymentStartedAt = System.nanoTime();
      try (InputStream bpmn = Files.newInputStream(validated.bpmnPath())) {
        var deployment =
            processEngine.getRepositoryService().createDeployment()
                .name(scenario.id())
                .addInputStream(validated.bpmnPath().getFileName().toString(), bpmn);
        // The DMN resources go into the same deployment, as CIB binds a decisionRef by its key at execution time.
        for (var decisionPath : validated.decisionPaths()) {
          deployment.addInputStream(
              decisionPath.getFileName().toString(), new ByteArrayInputStream(Files.readAllBytes(decisionPath)));
        }
        deploymentId = deployment.deploy().getId();
      } catch (ProcessEngineException | DmnEngineException refused) {
        requireNoIntegrityViolation(refused);
        // CIB refusing the model at deployment is the oracle's admission answer: like the kernel's refused program,
        // only an unsupported deployment is observed and no stimulus runs (canonical-result trace rule).
        timings.deploymentNanos = positiveElapsedSince(deploymentStartedAt);
        trace.add(new DeploymentObservation(UNSUPPORTED, null));
        scenarioOutcome = UNSUPPORTED;
      }
      if (deploymentId != null) {
        timings.deploymentNanos = positiveElapsedSince(deploymentStartedAt);
        trace.add(new DeploymentObservation(COMMITTED, null));

        var definitionId = rootDefinitionId(processEngine, deploymentId, Files.readAllBytes(validated.bpmnPath()));
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
          try {
            if (!advanceClock(stimulus)) {
              outcome = REJECTED;
            } else if (stimulus instanceof Start start) {
              engineRootId = starts.start(start, definitionId);
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
          } catch (RuntimeException failed) {
            outcome = rolledBack(failed);
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
          // The kernel's trace rule: only a committed input, or a rejected one that is not last, lets the run continue.
          if (scenarioOutcome != COMMITTED) {
            break;
          }
        }
      }
    } finally {
      try {
        var cleanupStartedAt = System.nanoTime();
        if (deploymentId != null) {
          undeletable = deleteDeployment(deploymentId);
        }
        cleanup = projector.observeCleanup();
        timings.cleanupNanos = positiveElapsedSince(cleanupStartedAt);
      } finally {
        timings.totalNanos = positiveElapsedSince(totalStartedAt);
        ClockUtil.reset();
      }
    }

    if (undeletable != null) {
      throw new IllegalStateException("CIB could not delete the scenario's deployment; the engine was purged", undeletable);
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
            pvmDefinition,
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

  /**
   * The outcome of a command CIB failed: its transaction rolled back. An engine exception inside the command rolls it
   * back; the runner's own harness exceptions are none of these and are rethrown as harness failures. A DMN evaluation
   * failure is a DmnEngineException or, from the FEEL engine, a FeelException (`ScalaFeelLogger`), neither a
   * ProcessEngineException, and rolls back the same way. CIB also lets unchecked JDK exceptions escape its own code
   * unwrapped, such as the NumberFormatException of a text cardinality (`MultiInstanceActivityBehavior:148-151`); the
   * command's transaction rolls back alike.
   */
  static CommandOutcome rolledBack(RuntimeException failed) {
    var engineFailure =
        failed instanceof ProcessEngineException || failed instanceof DmnEngineException || failed instanceof FeelException;
    if (!engineFailure && !thrownByCib(failed)) {
      throw failed;
    }
    requireNoIntegrityViolation(failed);
    return ROLLED_BACK;
  }

  /**
   * Advances the controlled clock to an input's logical time (`Kernel.Step.advanceClock`); false for a time before the
   * clock, which the input is rejected for without reaching the engine. A Timer firing's time is the executor's to
   * apply, since it must first find the job due.
   */
  static boolean advanceClock(ScenarioProtocol.Stimulus stimulus) {
    if (stimulus instanceof TimerFire || stimulus.at() == null) {
      return true;
    }
    var nowMs = ClockUtil.getCurrentTime().getTime() - LOGICAL_EPOCH.getTime();
    if (stimulus.at() < nowMs) {
      return false;
    }
    ClockUtil.setCurrentTime(new Date(LOGICAL_EPOCH.getTime() + stimulus.at()));
    return true;
  }

  static Execution execute(
      CibSevenCommandExecutor executor, String engineRootId, String stableRootId, ScenarioProtocol.Stimulus stimulus) {
    return switch (stimulus) {
      case Command command -> executor.command(engineRootId, stableRootId, command);
      case Deliver deliver -> executor.deliver(engineRootId, stableRootId, deliver);
      case TimerFire fire -> executor.timerFire(engineRootId, stableRootId, fire);
      case EffectResult result -> executor.effectResult(engineRootId, stableRootId, result);
      case Start ignored -> throw new IllegalStateException("A scenario starts exactly once");
    };
  }

  /**
   * The deployed definition of the document's root process ({@link CibSevenModelAddresses#rootProcessId}); a root the
   * deployment does not hold (a non-executable process) has no CIB realization.
   */
  static String rootDefinitionId(ProcessEngine engine, String deploymentId, byte[] bpmn) {
    var key = CibSevenModelAddresses.rootProcessId(bpmn);
    var definitions = engine.getRepositoryService().createProcessDefinitionQuery()
        .deploymentId(deploymentId).processDefinitionKey(key).list();
    if (definitions.size() != 1) {
      throw new IllegalStateException("Deployment holds no executable root process " + key);
    }
    return definitions.getFirst().getId();
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

  /**
   * Deletes a scenario's deployment with its instances and history, or, when CIB's cascade delete itself throws, purges
   * the engine and returns that failure so the scenario fails as a harness failure. CIB Seven `2.2.0` throws for an
   * instance stopped inside a Transaction's compensation (`PvmAtomicOperationDeleteCascade` reaching
   * `CompensationBehavior#getParentActivityInstanceId`, line 82); without the purge its residue would sit under every
   * later scenario of the same engine and fail their cleanup check.
   */
  private RuntimeException deleteDeployment(String deploymentId) {
    try {
      processEngine.getRepositoryService().deleteDeployment(deploymentId, true, true, true);
      return null;
    } catch (RuntimeException failure) {
      ((ManagementServiceImpl) processEngine.getManagementService()).purge();
      return failure;
    }
  }

  /**
   * Fails the run as a harness failure when an engine exception stems from a database integrity violation. Every
   * scenario reuses the boot identifiers (`ScenarioIds`), so a row an earlier scenario left behind collides on its
   * primary key, a defect of this harness and never CIB's answer to the scenario. H2 reports a batched insert's
   * violation as the next exception of its `BatchUpdateException`, not as a cause, so both chains are searched.
   */
  static void requireNoIntegrityViolation(RuntimeException failure) {
    for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
      for (var link = cause; link != null; link = link instanceof SQLException sql ? sql.getNextException() : null) {
        if (link instanceof SQLIntegrityConstraintViolationException) {
          throw new IllegalStateException("An engine write violated database integrity", failure);
        }
      }
    }
  }

  /**
   * Returns the engine to the table contents it had at boot before a scenario reuses the boot identifiers. A scenario's
   * deployment cascade removes what CIB's services own, but not every row: CIB Seven `2.2.0`'s condition-start evaluation
   * leaves its serialized start variable's runtime byte array without an owner (observed 2026-11-10). Only a purge
   * reaches such a row; one that survives the purge fails the scenario as a harness failure.
   */
  private void restoreBootTables() {
    var management = processEngine.getManagementService();
    if (management.getTableCount().equals(bootTables)) {
      return;
    }
    ((ManagementServiceImpl) management).purge();
    var after = management.getTableCount();
    if (!after.equals(bootTables)) {
      throw new IllegalStateException("Engine tables differ from their boot state after a purge: " + after);
    }
  }

  /**
   * Whether an exception was raised by CIB engine code: its first frame outside the JDK belongs to CIB. A failure the
   * runner's own code raises, its effect delegate included, has a runner frame there and stays a harness failure.
   */
  static boolean thrownByCib(Throwable failure) {
    for (var frame : failure.getStackTrace()) {
      var owner = frame.getClassName();
      if (owner.startsWith("java.") || owner.startsWith("jdk.") || owner.startsWith("sun.")) {
        continue;
      }
      return owner.startsWith("org.cibseven.bpm.");
    }
    return false;
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
