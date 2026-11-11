package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.bpmnlean.cibseven.CibSevenPopulationCommands.Answer;
import org.bpmnlean.cibseven.CibSevenScenarioValidator.ValidatedResource;
import org.bpmnlean.cibseven.PopulationProtocol.DeployStep;
import org.bpmnlean.cibseven.PopulationProtocol.InputFailure;
import org.bpmnlean.cibseven.PopulationProtocol.InstanceStep;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationCommand;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationResult;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationScenario;
import org.bpmnlean.cibseven.PopulationProtocol.StepEntry;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.CanonicalObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.Command;
import org.bpmnlean.cibseven.ScenarioProtocol.Deliver;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.Options;
import org.bpmnlean.cibseven.ScenarioProtocol.Start;
import org.bpmnlean.cibseven.ScenarioProtocol.Stimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerFire;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.util.ClockUtil;

/**
 * Runs one population scenario against a warm engine whose tables are at their boot state: its deployments, instance
 * inputs and population commands in step order, on CIB's one process-global clock. The engine scenario runner owns the
 * clock lock, the boot state and the cleanup of {@link #deploymentIds()}.
 *
 * <p>The answer keeps the kernel's population result within CIB's observation boundary (PopulationProtocol). Every root
 * instance is named by the identity the scenario gives it or the population contract derives for it (M8-OP-A); a root
 * the run cannot name fails the run as a harness failure, so no instance is observed under a guessed identity.
 */
final class CibSevenPopulationRunner {

  /** The observation label of the final state projection, whose query snapshots the population result omits. */
  private static final String FINAL_OBSERVATION = "population-final";

  private final ProcessEngine engine;
  private final Date logicalEpoch;
  private final CibSevenScriptedEffect effects;
  private final CibSevenPopulationRegistry registry;
  private final CibSevenStateProjector projector;
  private final CibSevenStarts starts;
  private final CibSevenCommandExecutor executor;
  private final CibSevenCascades cascades;
  private final CibSevenPopulationCommands commands;
  /** Engine identifier to public identifier of every root instance, in start order. */
  private final Map<String, String> roots = new LinkedHashMap<>();

  CibSevenPopulationRunner(ProcessEngine engine, CibSevenScriptedEffect effects, Date logicalEpoch) {
    this.engine = engine;
    this.logicalEpoch = logicalEpoch;
    this.effects = effects;
    this.registry = new CibSevenPopulationRegistry(engine);
    this.projector = new CibSevenStateProjector(engine, logicalEpoch, false, false, registry::calledDefinition);
    this.starts = new CibSevenStarts(engine, logicalEpoch);
    this.executor = new CibSevenCommandExecutor(
        engine, projector, effects, CibEffectExecutionSchedule.PLAIN_SUCCESS, new Options(null), logicalEpoch);
    this.cascades = new CibSevenCascades(engine, registry, projector, roots);
    this.commands = new CibSevenPopulationCommands(engine, registry, projector, starts, cascades, logicalEpoch, roots);
  }

  /** Every CIB deployment the run made, for cleanup, also after a harness failure. */
  List<String> deploymentIds() {
    return registry.deploymentIds();
  }

  CleanupProjection observeCleanup() {
    return projector.observeCleanup();
  }

  /**
   * Runs the population (population contract §2-§4): the definitions no `deploy` step names deploy at 0 in list
   * order, then every step at its logical time, which a step gives as `at` or inherits from the one before (0 for the
   * first). The answer carries no diagnostics; the engine scenario runner adds them after cleanup.
   */
  PopulationResult run(PopulationScenario scenario, Map<String, ValidatedResource> resources) throws IOException {
    var deployedByStep = new HashSet<String>();
    for (var step : scenario.steps()) {
      switch (step) {
        case DeployStep deploy -> deployedByStep.add(known(resources, deploy.definitionRef()));
        case InstanceStep instance -> known(resources, instance.definitionRef());
        case PopulationCommand ignored -> {}
      }
    }
    ClockUtil.setCurrentTime(logicalEpoch);
    for (var definition : scenario.definitions()) {
      if (!deployedByStep.contains(definition.definitionRef())) {
        registry.deploy(definition.definitionRef(), resources.get(definition.definitionRef()), scenario.id());
      }
    }
    var steps = new ArrayList<StepEntry>();
    var failures = new ArrayList<InputFailure>();
    var clock = 0L;
    for (var step : scenario.steps()) {
      var at = step.at() == null ? clock : step.at();
      clock = at;
      setClock(at);
      var before = starts.rootInstances();
      var activities = cascades.activities();
      switch (step) {
        case DeployStep deploy -> {
          registry.deploy(deploy.definitionRef(), resources.get(deploy.definitionRef()), scenario.id());
          adopt(before, activities, Map.of(), null);
        }
        case InstanceStep instance -> {
          var answer = instance(instance);
          if (answer.outcome() != COMMITTED) {
            failures.add(new InputFailure(instance.stimulus().commandId(), answer.outcome()));
          }
          adopt(before, activities, answer.started(), instance.stimulus().commandId());
        }
        case PopulationCommand command -> {
          effects.beginCommand(command.commandId());
          var answer = commands.apply(command, at, activities);
          steps.add(new StepEntry(command.commandId(), steps.size() + 1L, at, answer.outcome(), answer.resolution()));
          adopt(before, activities, answer.started(), command.commandId());
        }
      }
      numberActivations();
    }
    if (starts.rootInstances().size() != roots.size()) {
      throw new IllegalStateException("The population holds a root instance it did not name");
    }
    var states = roots.entrySet().stream()
        .sorted(Map.Entry.<String, String>comparingByValue(WireStrings::compare))
        .<CanonicalObservation>map(
            root -> projector.observe(root.getKey(), root.getValue(), FINAL_OBSERVATION).state())
        .toList();
    return new PopulationResult(
        PopulationProtocol.POPULATION_RESULT_KIND, scenario.id(), registry.entries(), steps, failures, states, null);
  }

  private static String known(Map<String, ValidatedResource> resources, String definitionRef) {
    if (!resources.containsKey(definitionRef)) {
      throw new IllegalArgumentException("population-unknown-definition: " + definitionRef);
    }
    return definitionRef;
  }

  /**
   * Sets CIB's one clock to a step's time. Step times never decrease (`population-time-backward`); an instance input's
   * own later `at` advances the clock past the population's, and a later step before it would run the one clock
   * backwards, a population this runner refuses the same way.
   */
  private void setClock(long atMs) {
    var nowMs = ClockUtil.getCurrentTime().getTime() - logicalEpoch.getTime();
    if (atMs < nowMs) {
      throw new IllegalArgumentException("population-time-backward: step at " + atMs + " after clock " + nowMs);
    }
    ClockUtil.setCurrentTime(new Date(logicalEpoch.getTime() + atMs));
  }

  /**
   * Applies an instance step to its instance (`deploymentFor` in `packages/kernel/src/population.ts`): a start begins a
   * new instance in its definition's latest deployment, rejected for an instance that exists; any other input reaches
   * an existing instance, rejected for one that does not.
   */
  private Answer instance(InstanceStep step) {
    var stimulus = timed(step);
    effects.beginCommand(stimulus.commandId());
    if (stimulus instanceof EffectResult && effects.consumedSynchronously(stimulus.commandId())) {
      return Answer.of(COMMITTED);
    }
    var engineRoot = roots.entrySet().stream()
        .filter(root -> root.getValue().equals(step.instanceId()))
        .map(Map.Entry::getKey)
        .findFirst()
        .orElse(null);
    try {
      if (!CibSevenEngineScenarioRunner.advanceClock(stimulus)) {
        return Answer.of(REJECTED);
      }
      if (stimulus instanceof Start start) {
        var deployment = registry.latestOf(step.definitionRef());
        if (engineRoot != null || deployment == null) {
          return Answer.of(REJECTED);
        }
        var started = starts.start(start, deployment.rootDefinitionId());
        return started == null
            ? Answer.of(REJECTED)
            : new Answer(COMMITTED, null, Map.of(started, step.instanceId()));
      }
      if (engineRoot == null) {
        return Answer.of(REJECTED);
      }
      var execution = CibSevenEngineScenarioRunner.execute(executor, engineRoot, step.instanceId(), stimulus);
      return Answer.of(execution.outcome());
    } catch (RuntimeException failed) {
      return Answer.of(CibSevenEngineScenarioRunner.rolledBack(failed));
    }
  }

  /**
   * An instance step's input as the kernel reads it (`instanceInput` in `packages/kernel/src/run/population.ts`): its
   * own `at` must equal the step's when both are given (`population-time-mismatch`), and a step `at` it lacks becomes
   * its own. A start must start the step's instance.
   */
  private static Stimulus timed(InstanceStep step) {
    var stimulus = step.stimulus();
    if (stimulus instanceof Start start && !start.instanceId().equals(step.instanceId())) {
      throw new IllegalArgumentException("Step of " + step.instanceId() + " starts " + start.instanceId());
    }
    if (step.at() == null || stimulus.at() != null) {
      if (step.at() != null && !step.at().equals(stimulus.at())) {
        throw new IllegalArgumentException(
            "population-time-mismatch: stimulus at " + stimulus.at() + ", step at " + step.at());
      }
      return stimulus;
    }
    var at = step.at();
    return switch (stimulus) {
      case Start start -> new Start(start.commandId(), start.instanceId(), start.startEvent(), start.trigger(),
          start.businessKey(), start.variables(), at);
      case Command command -> new Command(command.commandId(), command.occurrence(), command.action(), at);
      case Deliver deliver -> new Deliver(deliver.commandId(), deliver.occurrence(), deliver.trigger(),
          deliver.correlation(), deliver.payload(), deliver.variables(), at);
      case TimerFire fire -> new TimerFire(fire.commandId(), fire.occurrence(), fire.logicalTimeMs(), at);
      case EffectResult result -> new EffectResult(result.commandId(), result.occurrence(), result.outcome(), at);
    };
  }

  /**
   * Names the root instances a step started, in creation order, under identities no other root holds: those the step
   * started itself by the names it gives (`started`), and each other one as a cascade of the step's command
   * ({@link CibSevenCascades#identify}), whose emitter may be an instance the same step started earlier. A deploy step
   * has no command (`commandId` null) and starts nothing.
   */
  private void adopt(Set<String> before, Set<String> activities, Map<String, String> started, String commandId) {
    var created = starts.startedSince(before);
    var named = 0;
    for (var instance : created) {
      var own = started.get(instance.getId());
      named += own == null ? 0 : 1;
      var id = own != null ? own : cascades.identify(instance, commandId, activities);
      if (roots.containsValue(id)) {
        throw new IllegalStateException("Step " + commandId + " started a second root instance " + id);
      }
      roots.put(instance.getId(), id);
    }
    if (named != started.size()) {
      throw new IllegalStateException("Step " + commandId + " names a root instance it did not start");
    }
  }

  /**
   * Projects every running root after each step, so that each activation is numbered by the step that began it, as an
   * observation after every input numbers it in a single-instance scenario (CibSevenOccurrences).
   */
  private void numberActivations() {
    roots.entrySet().stream()
        .sorted(Map.Entry.<String, String>comparingByValue(WireStrings::compare))
        .forEach(root -> projector.openWaits(root.getKey(), root.getValue()));
  }
}
