package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.ProjectedWait;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.SubscriptionHandle;
import org.bpmnlean.cibseven.CibSevenPopulationRegistry.Registered;
import org.bpmnlean.cibseven.PopulationProtocol.Ambiguous;
import org.bpmnlean.cibseven.PopulationProtocol.BroadcastStep;
import org.bpmnlean.cibseven.PopulationProtocol.Committed;
import org.bpmnlean.cibseven.PopulationProtocol.EvaluateConditionsStep;
import org.bpmnlean.cibseven.PopulationProtocol.FanOut;
import org.bpmnlean.cibseven.PopulationProtocol.NoMatch;
import org.bpmnlean.cibseven.PopulationProtocol.PopulationCommand;
import org.bpmnlean.cibseven.PopulationProtocol.PublishMode;
import org.bpmnlean.cibseven.PopulationProtocol.PublishStep;
import org.bpmnlean.cibseven.PopulationProtocol.Resolution;
import org.bpmnlean.cibseven.PopulationProtocol.Started;
import org.bpmnlean.cibseven.PopulationProtocol.TimerStartStep;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.cibseven.bpm.engine.MismatchingMessageCorrelationException;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;
import org.cibseven.bpm.engine.impl.MessageCorrelationBuilderImpl;
import org.cibseven.bpm.engine.runtime.ProcessInstance;
import org.cibseven.bpm.model.bpmn.instance.SignalEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.StartEvent;

/**
 * Applies a population's commands to CIB through its public API: a publication through `createMessageCorrelation`, a
 * broadcast through `createSignalEvent`, a Conditional start evaluation through `createConditionEvaluation`, and a
 * Timer-start firing by executing the start's job. CIB delivers every receiver of one command in one transaction
 * (M8-LIM-G), so a command has one outcome; the instances it started are named by the derived identities of the
 * population contract §4, mapped from CIB's by their deployment and start activity (M8-OP-A). The instances a thrown
 * Signal started inside the command are no instances it started; the population runner names them as cascades.
 */
final class CibSevenPopulationCommands {

  /** A command's outcome, its resolution when CIB names one, and the roots it started under their identities. */
  record Answer(CommandOutcome outcome, Resolution resolution, Map<String, String> started) {
    static Answer of(CommandOutcome outcome) {
      return new Answer(outcome, null, Map.of());
    }
  }

  /** A projected open wait with the engine identifier of the instance it belongs to. */
  private record Waiting(String engineInstance, ProjectedWait projected) {}

  private final ProcessEngine engine;
  private final CibSevenPopulationRegistry registry;
  private final CibSevenStateProjector projector;
  private final CibSevenStarts starts;
  private final Date logicalEpoch;
  private final CibSevenCascades cascades;
  /** The population's root instances, engine identifier to public identifier, which the population runner keeps. */
  private final Map<String, String> roots;

  CibSevenPopulationCommands(
      ProcessEngine engine,
      CibSevenPopulationRegistry registry,
      CibSevenStateProjector projector,
      CibSevenStarts starts,
      CibSevenCascades cascades,
      Date logicalEpoch,
      Map<String, String> roots) {
    this.engine = engine;
    this.registry = registry;
    this.projector = projector;
    this.starts = starts;
    this.cascades = cascades;
    this.logicalEpoch = logicalEpoch;
    this.roots = roots;
  }

  /**
   * Applies `command` at the logical time `atMs`, to which the clock is already set; `activities` are the activity
   * instances before it ({@link CibSevenCascades#activities}). A Message CIB correlates to no
   * candidate, or to several, rolls the command back with `noMatch` or `ambiguous` (`CorrelateMessageCmd.java:57-95`,
   * `DefaultCorrelationHandler.java:46-71`); any other CIB failure rolls it back without a resolution.
   */
  Answer apply(PopulationCommand command, long atMs, Set<String> activities) {
    try {
      return switch (command) {
        case PublishStep publish -> publish(publish);
        case BroadcastStep broadcast -> broadcast(broadcast, activities);
        case EvaluateConditionsStep evaluation -> evaluate(evaluation);
        case TimerStartStep timer -> timerStart(timer, atMs);
      };
    } catch (MismatchingMessageCorrelationException mismatch) {
      // CIB words its two several-candidate refusals "to a single execution" and "to a single process definition"
      // (`CommandLogger.java:192-206`, codes 030 and 031); every other mismatch is a correlation without a candidate.
      var several = String.valueOf(mismatch.getMessage()).contains("to a single");
      return new Answer(CibSevenEngineScenarioRunner.rolledBack(mismatch), several ? new Ambiguous() : new NoMatch(),
          Map.of());
    } catch (RuntimeException failed) {
      return Answer.of(CibSevenEngineScenarioRunner.rolledBack(failed));
    }
  }

  /**
   * Publishes a Message. A selector becomes CIB's process-definition restriction, which CIB accepts only for a
   * start-only correlation (`MessageCorrelationBuilderImpl#ensureProcessDefinitionIdNotSet`): a selector on a
   * publication that may reach a waiting instance has no CIB form (CIB-INT-0032) and fails as a harness failure. The
   * payload fills a catch's or start's Data Output, which CIB never parses (CIB-LIM-0013); CIB's Message carries only
   * variables, so the payload is not sent.
   */
  private Answer publish(PublishStep publish) {
    var address = publish.address();
    Registered selected = null;
    if (address.definition() != null) {
      selected = registry.selected(address.definition());
      if (selected == null) {
        return Answer.of(REJECTED);
      }
      if (publish.mode() != PublishMode.START_ONLY) {
        throw new IllegalStateException("A definition selector outside a start-only publication has no CIB form");
      }
    }
    var name = address.name() != null ? address.name() : registry.messageName(address.channel());
    var waits = openWaits();
    var builder = (MessageCorrelationBuilderImpl) engine.getRuntimeService().createMessageCorrelation(name);
    switch (publish.mode()) {
      case EXECUTIONS_ONLY -> builder.executionsOnly();
      case START_ONLY -> builder.startMessageOnly();
      case ANY -> {}
    }
    if (selected != null) {
      builder.processDefinitionId(selected.rootDefinitionId());
    }
    // CIB's builders refuse a null business key (`ensureNotNull`), so an absent key is left unset.
    if (publish.businessKey() != null) {
      builder.processInstanceBusinessKey(publish.businessKey());
    }
    CibSevenCriteria.apply(builder, publish.criteria(), this::engineInstanceOf);
    var result = builder.setVariables(ScenarioVariableBindings.toEngineMap(publish.variables())).correlateWithResult();
    return switch (result.getResultType()) {
      case Execution -> delivered(result.getExecution().getId(), name, waits);
      case ProcessDefinition ->
          started(publish.commandId(), List.of(result.getProcessInstance().getId()));
    };
  }

  /**
   * The publication CIB delivered to the waiting execution `executionId`: the one open wait subscribed to `name` there
   * before the delivery, numbered like a delivery input's ({@link CibSevenOccurrences#delivered}).
   */
  private Answer delivered(String executionId, String name, List<Waiting> waits) {
    var hit = waits.stream()
        .filter(waiting -> waiting.projected().handle() instanceof SubscriptionHandle subscription
            && subscription.executionId().equals(executionId)
            && subscription.eventName().equals(name))
        .toList();
    if (hit.size() != 1) {
      throw new IllegalStateException(
          "CIB delivered Message " + name + " to an execution with " + hit.size() + " waits");
    }
    var waiting = hit.getFirst();
    var subscription = (SubscriptionHandle) waiting.projected().handle();
    var target = waiting.projected().openWait().id();
    projector.occurrences().delivered(
        waiting.engineInstance(),
        target.elementId(),
        subscription.subscriptionId(),
        engine.getRuntimeService().createEventSubscriptionQuery()
                .eventSubscriptionId(subscription.subscriptionId())
                .count()
            == 1);
    return new Answer(COMMITTED, new Committed(target), Map.of());
  }

  /**
   * Broadcasts a Signal; its discovery order is not CIB's to follow (PopulationProtocol.Receiver). CIB starts every
   * current deployment's Signal start of that name, which the broadcast names; an instance another start began inside
   * the broadcast's transaction is a cascaded intent, which {@link CibSevenCascades} names. When a receiver rethrows the
   * broadcast's own Signal, CIB starts each such start twice, and which instance which delivery started cannot be told.
   */
  private Answer broadcast(BroadcastStep broadcast, Set<String> activities) {
    var name = registry.signalName(broadcast.address());
    var before = starts.rootInstances();
    engine.getRuntimeService().createSignalEvent(name)
        .setVariables(ScenarioVariableBindings.toEngineMap(broadcast.variables()))
        .send();
    if (!cascades.throwsOf(name, activities).isEmpty()) {
      throw new IllegalStateException("A receiver of broadcast " + broadcast.commandId() + " rethrew its Signal " + name
          + "; the instances each delivery started cannot be told apart");
    }
    var own = starts.startedSince(before).stream()
        .filter(instance -> signalStart(instance, name))
        .map(HistoricProcessInstance::getId)
        .toList();
    return started(broadcast.commandId(), own);
  }

  /** Whether `instance` began at a Signal start of the Signal `name`. */
  private boolean signalStart(HistoricProcessInstance instance, String name) {
    return engine.getRepositoryService().getBpmnModelInstance(instance.getProcessDefinitionId())
            .getModelElementById(instance.getStartActivityId()) instanceof StartEvent start
        && start.getEventDefinitions().stream()
            .anyMatch(definition -> definition instanceof SignalEventDefinition signal
                && signal.getSignal() != null
                && name.equals(signal.getSignal().getName()));
  }

  /** Evaluates the Conditional starts of one deployment, or of every current one, against the given variables. */
  private Answer evaluate(EvaluateConditionsStep evaluation) {
    var builder = engine.getRuntimeService().createConditionEvaluation();
    if (evaluation.definition() != null) {
      var selected = registry.selected(evaluation.definition());
      if (selected == null) {
        return Answer.of(REJECTED);
      }
      builder.processDefinitionId(selected.rootDefinitionId());
    }
    if (evaluation.businessKey() != null) {
      builder.processInstanceBusinessKey(evaluation.businessKey());
    }
    var started = builder.setVariables(ScenarioVariableBindings.toEngineMap(evaluation.variables()))
        .evaluateStartConditions().stream()
        .map(ProcessInstance::getId)
        .toList();
    return started(evaluation.commandId(), started);
  }

  /**
   * Fires the Timer-start occurrence of a deployment due at `dueMs`, at `atMs`. CIB keeps one job per Timer start, due
   * at its next occurrence, and removes a superseded deployment's jobs (`BpmnDeployer.java:251-258`), so the firing
   * needs that job, due at `dueMs`, and a time not before it; anything else is rejected without reaching the engine.
   * The started instance is named by the occurrence (`timer:` identity, population contract §4).
   */
  private Answer timerStart(TimerStartStep timer, long atMs) {
    var deployment = registry.byOrdinal(timer.deploymentId());
    if (deployment == null || atMs < timer.dueMs()) {
      return Answer.of(REJECTED);
    }
    var management = engine.getManagementService();
    var jobs = management.createJobQuery()
        .processDefinitionId(deployment.rootDefinitionId()).activityId(timer.startEvent()).timers().list();
    if (jobs.size() != 1 || jobs.getFirst().getDuedate().getTime() - logicalEpoch.getTime() != timer.dueMs()) {
      return Answer.of(REJECTED);
    }
    var before = starts.rootInstances();
    management.executeJob(jobs.getFirst().getId());
    var started = starts.startedSince(before).stream()
        .filter(instance -> timer.startEvent().equals(instance.getStartActivityId()))
        .toList();
    if (started.size() != 1) {
      throw new IllegalStateException(
          "Timer start " + timer.startEvent() + " started " + started.size() + " instances");
    }
    var instance = started.getFirst();
    var definition = engine.getRepositoryService().getProcessDefinition(instance.getProcessDefinitionId());
    var id = timerInstanceId(timer.deploymentId(), timer.startEvent(), timer.dueMs());
    return new Answer(
        COMMITTED,
        new FanOut(List.of(new Started(id, timer.deploymentId(), definition.getVersion(), timer.startEvent()))),
        Map.of(instance.getId(), id));
  }

  /**
   * The instances a command started, each named `start:` by the command, its deployment and its start Event, and
   * ordered by deployment and start Event: CIB's order comes from a `HashSet` (population contract §6), which a
   * witness compared with CIB never depends on.
   */
  private Answer started(String commandId, List<String> engineIds) {
    var entries = new ArrayList<Started>();
    var mapped = new LinkedHashMap<String, String>();
    for (var engineId : engineIds) {
      var instance = engine.getHistoryService().createHistoricProcessInstanceQuery()
          .processInstanceId(engineId).singleResult();
      var definition = engine.getRepositoryService().getProcessDefinition(instance.getProcessDefinitionId());
      var startEvent = instance.getStartActivityId();
      var deploymentId = registry.ordinalOf(definition.getDeploymentId());
      var id = startedInstanceId(commandId, deploymentId, startEvent);
      entries.add(new Started(id, deploymentId, definition.getVersion(), startEvent));
      mapped.put(engineId, id);
    }
    entries.sort(Comparator.comparingLong(Started::deploymentId)
        .thenComparing(Started::startEvent, WireStrings::compare));
    return new Answer(COMMITTED, new FanOut(List.copyOf(entries)), mapped);
  }

  /** Every running instance's open waits, before a publication changes them. */
  private List<Waiting> openWaits() {
    var waits = new ArrayList<Waiting>();
    roots.forEach((engineRoot, stableRoot) -> {
      var instances = projector.occurrences().running(engineRoot, stableRoot);
      for (var wait : projector.openWaits(engineRoot, stableRoot)) {
        var instance = instances.stream()
            .filter(candidate -> candidate.stableId().equals(wait.openWait().id().processInstanceId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("An open wait belongs to no running instance"));
        waits.add(new Waiting(instance.engineId(), wait));
      }
    });
    return waits;
  }

  /** The engine identifier of a root, running or ended, or of a running called instance; null for another one. */
  private String engineInstanceOf(String stableId) {
    for (var root : roots.entrySet()) {
      if (root.getValue().equals(stableId)) {
        return root.getKey();
      }
    }
    for (var root : roots.entrySet()) {
      for (var instance : projector.occurrences().running(root.getKey(), root.getValue())) {
        if (instance.stableId().equals(stableId)) {
          return instance.engineId();
        }
      }
    }
    return null;
  }

  /**
   * The identity of the instance a command starts at a deployment's start Event (population contract §4,
   * `startedInstanceId` in `packages/kernel/src/population/contract.ts`): each part prefixed by its UTF-8 byte length.
   */
  static String startedInstanceId(String commandId, long deploymentId, String startEvent) {
    var deployment = Long.toString(deploymentId);
    return "start:" + length(commandId) + ":" + commandId + ":" + length(deployment) + ":" + deployment + ":"
        + length(startEvent) + ":" + startEvent;
  }

  /**
   * The identity of the instance a Timer-start occurrence starts, bound to the occurrence rather than a command
   * (`timerInstanceId` in `packages/kernel/src/population/timers.ts`).
   */
  static String timerInstanceId(long deploymentId, String startEvent, long dueMs) {
    var deployment = Long.toString(deploymentId);
    return "timer:" + length(deployment) + ":" + deployment + ":" + length(startEvent) + ":" + startEvent + ":" + dueMs;
  }

  private static int length(String part) {
    return part.getBytes(UTF_8).length;
  }
}
