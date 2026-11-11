package org.bpmnlean.cibseven;

import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.bpmnlean.cibseven.ScenarioProtocol.ConditionStart;
import org.bpmnlean.cibseven.ScenarioProtocol.DirectMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageStart;
import org.bpmnlean.cibseven.ScenarioProtocol.NoneStart;
import org.bpmnlean.cibseven.ScenarioProtocol.OperationMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalStart;
import org.bpmnlean.cibseven.ScenarioProtocol.Start;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerStart;
import org.bpmnlean.cibseven.ScenarioProtocol.UnspecifiedMessageChannel;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;
import org.cibseven.bpm.engine.impl.util.ClockUtil;

/**
 * Starts a root instance of one deployed definition as a start input states it. Single-instance scenarios and the
 * population's instance steps share it; in a population other instances already exist, so the instance an event start
 * created is the one root instance that did not exist before the start.
 */
final class CibSevenStarts {

  private final ProcessEngine engine;
  private final Date logicalEpoch;

  CibSevenStarts(ProcessEngine engine, Date logicalEpoch) {
    this.engine = engine;
    this.logicalEpoch = logicalEpoch;
  }

  /** Starts the root instance as the start input states; `null` when CIB refuses the start. */
  String start(Start start, String definitionId) {
    var runtime = engine.getRuntimeService();
    var variables = ScenarioVariableBindings.toEngineMap(start.variables());
    var businessKey = start.businessKey();
    var before = rootInstances();
    return switch (start.trigger() == null ? new NoneStart() : start.trigger()) {
      case NoneStart ignored ->
          start.startEvent() == null
              ? runtime.startProcessInstanceById(definitionId, businessKey, variables).getId()
              : runtime.createProcessInstanceById(definitionId)
                  .businessKey(businessKey)
                  .startBeforeActivity(start.startEvent())
                  .setVariables(variables)
                  .execute()
                  .getId();
      case MessageStart message -> {
        // A Message start's payload fills the start Event's Data Output, which CIB never parses: it starts without
        // writing it (CIB-LIM-0013). CIB's Message carries only variables, so the payload has no CIB form to send.
        var messageId =
            switch (message.channel()) {
              case DirectMessageChannel direct -> direct.messageId();
              case OperationMessageChannel operation -> operation.messageId();
              case UnspecifiedMessageChannel ignored ->
                  throw new IllegalStateException("A Message start needs a Message");
            };
        var model = engine.getRepositoryService().getBpmnModelInstance(definitionId);
        var name = CibSevenModelAddresses.messageName(model, messageId);
        if (name == null) {
          throw new IllegalStateException("The definition declares no Message " + messageId);
        }
        // CIB's builders refuse a null business key (`ensureNotNull`), so an absent key is left unset.
        var correlation = runtime.createMessageCorrelation(name).processDefinitionId(definitionId);
        if (businessKey != null) {
          correlation.processInstanceBusinessKey(businessKey);
        }
        yield correlation.setVariables(variables).correlateStartMessage().getId();
      }
      case TimerStart timer -> {
        requireNoBusinessKey(start, "timer");
        yield fireTimerStart(start, timer, definitionId);
      }
      case SignalStart signal -> {
        requireNoBusinessKey(start, "Signal");
        // CIB's Signal carries one variable map, so start variables beside the Signal's own have no realization.
        if (!start.variables().isEmpty()) {
          throw new IllegalStateException("Start variables beside a Signal start's own have no realization in this runner");
        }
        runtime.createSignalEvent(signalName(signal, definitionId))
            .setVariables(ScenarioVariableBindings.toEngineMap(signal.variables()))
            .send();
        yield startedAt(start, before, "Signal");
      }
      case ConditionStart ignored -> {
        var evaluation = runtime.createConditionEvaluation().processDefinitionId(definitionId);
        if (businessKey != null) {
          evaluation.processInstanceBusinessKey(businessKey);
        }
        var started = evaluation.setVariables(variables).evaluateStartConditions();
        if (started.isEmpty()) {
          yield null;
        }
        yield startedAt(start, before, "conditional");
      }
    };
  }

  /** The name CIB addresses a Signal start's Signal by: its own, or the one its QName names in the definition. */
  private String signalName(SignalStart signal, String definitionId) {
    if (signal.name() != null) {
      return signal.name();
    }
    var name = CibSevenModelAddresses.signalName(
        engine.getRepositoryService().getBpmnModelInstance(definitionId), signal.signalRef());
    if (name == null) {
      throw new IllegalStateException("The definition declares no named Signal " + signal.signalRef());
    }
    return name;
  }

  private static void requireNoBusinessKey(Start start, String trigger) {
    if (start.businessKey() != null) {
      throw new IllegalStateException("A business key on a " + trigger + " start has no realization in this runner");
    }
  }

  /** The identifiers of every root instance, running or ended. */
  Set<String> rootInstances() {
    return engine.getHistoryService().createHistoricProcessInstanceQuery().list().stream()
        .filter(instance -> instance.getSuperProcessInstanceId() == null)
        .map(HistoricProcessInstance::getId)
        .collect(Collectors.toSet());
  }

  /** The root instances created since `before`, in creation order of their identifiers. */
  List<HistoricProcessInstance> startedSince(Set<String> before) {
    return engine.getHistoryService().createHistoricProcessInstanceQuery().list().stream()
        .filter(instance -> instance.getSuperProcessInstanceId() == null && !before.contains(instance.getId()))
        .sorted((left, right) -> Long.compare(Long.parseLong(left.getId()), Long.parseLong(right.getId())))
        .toList();
  }

  /**
   * The one instance an event start created, which began at the start input's named Start Event when it names one. CIB
   * starts one instance per matching start event, so more than one has no single-instance realization.
   */
  private String startedAt(Start start, Set<String> before, String trigger) {
    var started = startedSince(before);
    if (started.size() != 1) {
      throw new IllegalStateException("A " + trigger + " start created " + started.size() + " instances, not one");
    }
    var instance = started.getFirst();
    if (start.startEvent() != null && !start.startEvent().equals(instance.getStartActivityId())) {
      throw new IllegalStateException("A " + trigger + " start began at " + instance.getStartActivityId()
          + ", not at " + start.startEvent());
    }
    return instance.getId();
  }

  /**
   * A timer start fires only when its job is due at the stated time, by the same controlled-clock rule as a timer wait:
   * the clock advances to the due date, and never runs backwards, so an input already later fires the job late.
   */
  private String fireTimerStart(Start start, TimerStart timer, String definitionId) {
    var management = engine.getManagementService();
    var jobs =
        management.createJobQuery().processDefinitionId(definitionId).activityId(start.startEvent()).timers().list();
    if (jobs.size() != 1
        || jobs.getFirst().getDuedate().getTime() - logicalEpoch.getTime() != timer.logicalTimeMs()) {
      return null;
    }
    var before = rootInstances();
    var due = new Date(logicalEpoch.getTime() + timer.logicalTimeMs());
    if (due.after(ClockUtil.getCurrentTime())) {
      ClockUtil.setCurrentTime(due);
    }
    management.executeJob(jobs.getFirst().getId());
    var started = startedSince(before);
    if (started.size() != 1) {
      throw new IllegalStateException("Timer start did not create exactly one instance");
    }
    return started.getFirst().getId();
  }
}
