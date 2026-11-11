package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.COMMITTED;
import static org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome.REJECTED;

import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.AddresslessHandle;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.JobHandle;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.ProjectedWait;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.SubscriptionHandle;
import org.bpmnlean.cibseven.CibSevenOpenWaitProjector.TaskHandle;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectExecutionSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.CancelIncidentProcess;
import org.bpmnlean.cibseven.ScenarioProtocol.Command;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.Deliver;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.IncidentDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageDelivery;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.RemoveVariables;
import org.bpmnlean.cibseven.ScenarioProtocol.RetryIncident;
import org.bpmnlean.cibseven.ScenarioProtocol.SetVariables;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalDelivery;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.TechnicalFailure;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerFire;
import org.bpmnlean.cibseven.ScenarioProtocol.UnspecifiedMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskDetail;
import org.cibseven.bpm.engine.MismatchingMessageCorrelationException;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.util.ClockUtil;
import org.cibseven.bpm.engine.runtime.MessageCorrelationResult;

/**
 * Executes the five scenario inputs against one engine instance. Every input names an occurrence; the executor
 * resolves it against the projected open waits, so an input whose occurrence is not open with a matching wait kind is
 * rejected without touching the engine, the same identity rule the canonical trace publishes; so is a Message
 * correlation CIB finds no single target for ({@link #deliver}).
 */
final class CibSevenCommandExecutor {

  private static final String DELETE_REASON = "bpmn-lean-incident-root-cancellation";

  private final ProcessEngine engine;
  private final CibSevenStateProjector projector;
  private final CibSevenScriptedEffect effects;
  private final CibEffectExecutionSchedule schedule;
  private final boolean incidentsEnabled;
  private final boolean incidentsCancellable;
  private final Date logicalEpoch;

  CibSevenCommandExecutor(
      ProcessEngine engine,
      CibSevenStateProjector projector,
      CibSevenScriptedEffect effects,
      CibEffectExecutionSchedule schedule,
      ScenarioProtocol.Options options,
      Date logicalEpoch) {
    this.engine = engine;
    this.projector = projector;
    this.effects = effects;
    this.schedule = schedule;
    this.incidentsEnabled = options.incidentsEnabled();
    this.incidentsCancellable = options.incidentsCancellable();
    this.logicalEpoch = logicalEpoch;
  }

  record Execution(CommandOutcome outcome, EffectExecutionSnapshot evidence) {
    static Execution of(CommandOutcome outcome) {
      return new Execution(outcome, null);
    }
  }

  private ProjectedWait open(String engineRootId, String stableRootId, ScenarioProtocol.OccurrenceId occurrence) {
    return projector.openWaits(engineRootId, stableRootId).stream()
        .filter(wait -> wait.openWait().id().equals(occurrence))
        .findFirst()
        .orElse(null);
  }

  Execution command(String engineRootId, String stableRootId, Command command) {
    var wait = open(engineRootId, stableRootId, command.occurrence());
    if (wait == null) {
      return Execution.of(REJECTED);
    }
    var detail = wait.openWait().detail();
    return switch (command.action()) {
      case CompleteUserTask complete -> {
        if (!(detail instanceof UserTaskDetail) || !(wait.handle() instanceof TaskHandle task)) {
          yield Execution.of(REJECTED);
        }
        engine.getTaskService().complete(task.taskId(), ScenarioVariableBindings.toEngineMap(complete.values()));
        yield Execution.of(COMMITTED);
      }
      case RetryIncident retry -> {
        if (!(detail instanceof IncidentDetail incident) || incident.generation() != retry.generation() ||
            !(wait.handle() instanceof JobHandle job)) {
          yield Execution.of(REJECTED);
        }
        engine.getManagementService().setJobRetries(job.jobId(), 1);
        yield Execution.of(COMMITTED);
      }
      case CancelIncidentProcess cancel -> {
        if (!(detail instanceof IncidentDetail incident) || incident.generation() != cancel.generation() ||
            !incidentsCancellable) {
          yield Execution.of(REJECTED);
        }
        engine.getRuntimeService().deleteProcessInstance(engineRootId, DELETE_REASON, false, true);
        yield Execution.of(COMMITTED);
      }
      case SetVariables set -> {
        engine.getRuntimeService().setVariables(executionOf(wait), ScenarioVariableBindings.toEngineMap(set.values()));
        yield Execution.of(COMMITTED);
      }
      case RemoveVariables remove -> {
        engine.getRuntimeService().removeVariables(executionOf(wait), remove.names());
        yield Execution.of(COMMITTED);
      }
    };
  }

  private String executionOf(ProjectedWait wait) {
    return switch (wait.handle()) {
      case TaskHandle task -> engine.getTaskService().createTaskQuery().taskId(task.taskId()).singleResult()
          .getExecutionId();
      case SubscriptionHandle subscription -> subscription.executionId();
      case AddresslessHandle addressless -> addressless.executionId();
      case JobHandle job -> engine.getManagementService().createJobQuery().jobId(job.jobId()).singleResult()
          .getExecutionId();
    };
  }

  /**
   * A delivery matches its wait's channel exactly. An unspecified delivery signals the execution waiting at an
   * addressless Receive Task (`CIB-OP-0011`); CIB would also accept the signal at a Message-addressed task, which
   * `CIB-INT-0004` refuses instead.
   *
   * <p>The delivery's variables travel with CIB's own delivery call, which installs them (CIB-EXT-0025). Its criteria
   * correlate the Message within the addressed occurrence's instance ({@link CibSevenCriteria}), and CIB must then have
   * delivered to that occurrence. A correlation CIB matches to no execution, or to several, is `rejected`: CIB throws
   * `MismatchingMessageCorrelationException` while it selects the target (`CorrelateMessageCmd.java:86-88`,
   * `DefaultCorrelationHandler.java:46-53`), before it triggers anything, so the input changed no state. A payload
   * fills the catch's Data Output, which CIB never parses (CIB-LIM-0013): CIB's Message carries only variables, so the
   * payload has no CIB form and is not sent.
   */
  Execution deliver(String engineRootId, String stableRootId, Deliver deliver) {
    var wait = open(engineRootId, stableRootId, deliver.occurrence());
    if (wait == null) {
      return Execution.of(REJECTED);
    }
    var runtime = engine.getRuntimeService();
    var variables = ScenarioVariableBindings.toEngineMap(deliver.declaredVariables());
    var criteria = deliver.declaredCorrelation();
    return switch (deliver.trigger()) {
      case MessageDelivery message -> {
        if (!(wait.openWait().detail() instanceof MessageDetail detail) || !detail.channel().equals(message.channel())) {
          yield Execution.of(REJECTED);
        }
        var delivered = true;
        switch (wait.handle()) {
          case AddresslessHandle addressless when message.channel() instanceof UnspecifiedMessageChannel -> {
            if (!criteria.isEmpty()) {
              throw new IllegalStateException("Criteria on an addressless Receive Task have no CIB form");
            }
            runtime.signal(addressless.executionId(), variables);
          }
          case SubscriptionHandle subscription -> {
            var engineInstance = engineInstanceOf(subscription);
            if (criteria.isEmpty()) {
              runtime.messageEventReceived(subscription.eventName(), subscription.executionId(), variables);
            } else {
              delivered = correlate(engineRootId, stableRootId, deliver, subscription, engineInstance, variables);
            }
            if (delivered) {
              projector.occurrences().delivered(
                  engineInstance,
                  deliver.occurrence().elementId(),
                  subscription.subscriptionId(),
                  runtime.createEventSubscriptionQuery()
                          .eventSubscriptionId(subscription.subscriptionId())
                          .count()
                      == 1);
            }
          }
          default -> throw new IllegalStateException("Message wait without a deliverable handle");
        }
        yield Execution.of(delivered ? COMMITTED : REJECTED);
      }
      case SignalDelivery signal -> {
        if (!(wait.openWait().detail() instanceof SignalDetail detail)
            || !(wait.handle() instanceof SubscriptionHandle subscription)
            || !detail.name().equals(signalName(signal, subscription))) {
          yield Execution.of(REJECTED);
        }
        if (!criteria.isEmpty()) {
          throw new IllegalStateException("Criteria on a Signal delivery have no CIB form");
        }
        runtime.signalEventReceived(subscription.eventName(), subscription.executionId(), variables);
        yield Execution.of(COMMITTED);
      }
    };
  }

  /**
   * Correlates the delivery's Message by its criteria within the subscription's instance; false when CIB matches no
   * execution or several. The criteria cannot name another instance than the addressed one, and CIB must deliver to the
   * addressed execution; anything else is a delivery CIB cannot make as addressed, a harness failure.
   */
  private boolean correlate(
      String engineRootId,
      String stableRootId,
      Deliver deliver,
      SubscriptionHandle subscription,
      String engineInstance,
      Map<String, Object> variables) {
    var instances = projector.occurrences().running(engineRootId, stableRootId);
    var builder = engine.getRuntimeService().createMessageCorrelation(subscription.eventName())
        .processInstanceId(engineInstance);
    CibSevenCriteria.apply(builder, deliver.declaredCorrelation(), stableId -> {
      if (!stableId.equals(deliver.occurrence().processInstanceId())) {
        throw new IllegalStateException("A process instance criterion naming another instance has no CIB form");
      }
      return instances.stream()
          .filter(instance -> instance.stableId().equals(stableId))
          .map(CibSevenOccurrences.Instance::engineId)
          .findFirst()
          .orElse(null);
    });
    MessageCorrelationResult result;
    try {
      result = builder.setVariables(variables).correlateWithResult();
    } catch (MismatchingMessageCorrelationException noSingleTarget) {
      return false;
    }
    if (result.getExecution() == null || !subscription.executionId().equals(result.getExecution().getId())) {
      throw new IllegalStateException("CIB correlated the Message to another execution than the addressed one");
    }
    return true;
  }

  /** The name CIB addresses a Signal delivery by: its own, or the one its QName names in the waiting instance's model. */
  private String signalName(SignalDelivery signal, SubscriptionHandle subscription) {
    if (signal.name() != null) {
      return signal.name();
    }
    var runtime = engine.getRuntimeService();
    var instanceId = runtime.createExecutionQuery().executionId(subscription.executionId()).singleResult()
        .getProcessInstanceId();
    var definitionId = runtime.createProcessInstanceQuery().processInstanceId(instanceId).singleResult()
        .getProcessDefinitionId();
    return CibSevenModelAddresses.signalName(
        engine.getRepositoryService().getBpmnModelInstance(definitionId), signal.signalRef());
  }

  /**
   * Advances the controlled clock to the firing's time (`at`, else the deadline), never backwards, and executes the
   * job only after the engine's executable query admits it. A job is executable before the clock moves only when its
   * deadline is not after the current clock (a zero or past Timer, PC-TIMER-01); any other executable job is a
   * harness defect.
   */
  Execution timerFire(String engineRootId, String stableRootId, TimerFire fire) {
    var wait = open(engineRootId, stableRootId, fire.occurrence());
    var nowMs = ClockUtil.getCurrentTime().getTime() - logicalEpoch.getTime();
    if (wait == null
        || !(wait.openWait().detail() instanceof TimerDetail detail)
        || detail.deadlineMs() != fire.logicalTimeMs()
        || !(wait.handle() instanceof JobHandle job)
        || fire.firedAtMs() < fire.logicalTimeMs()
        || fire.firedAtMs() < nowMs) {
      return Execution.of(REJECTED);
    }
    var management = engine.getManagementService();
    if (management.createJobQuery().jobId(job.jobId()).executable().count() != 0
        && detail.deadlineMs() > nowMs) {
      throw new IllegalStateException("Timer job was executable before the controlled clock reached its due date");
    }
    ClockUtil.setCurrentTime(new Date(logicalEpoch.getTime() + fire.firedAtMs()));
    if (management.createJobQuery().jobId(job.jobId()).executable().count() != 1) {
      throw new IllegalStateException("Timer job was not executable when the controlled clock reached its due date");
    }
    var before = timerJobs(job);
    management.executeJob(job.jobId());
    var successors = timerJobs(job).stream().filter(id -> !before.contains(id)).toList();
    projector.occurrences().timerFired(job.engineInstanceId(), job.elementId(), job.jobId(), successors);
    return Execution.of(COMMITTED);
  }

  /** The Timer jobs of the fired job's element in its instance. */
  private List<String> timerJobs(JobHandle job) {
    return engine.getManagementService().createJobQuery().processInstanceId(job.engineInstanceId()).timers().list()
        .stream()
        .filter(candidate -> job.elementId().equals(
            engine.getManagementService().createJobDefinitionQuery()
                .jobDefinitionId(candidate.getJobDefinitionId()).singleResult().getActivityId()))
        .map(org.cibseven.bpm.engine.runtime.Job::getId)
        .toList();
  }

  /** The engine process instance an event subscription belongs to. */
  private String engineInstanceOf(SubscriptionHandle subscription) {
    return engine.getRuntimeService().createEventSubscriptionQuery()
        .eventSubscriptionId(subscription.subscriptionId()).singleResult().getProcessInstanceId();
  }

  /**
   * Executes an open effect's job with the stimulus's outcome. A technical failure runs the job until CIB exhausts
   * its retries and opens the failed-job incident; it needs the scenario's `options.incidents`.
   */
  Execution effectResult(String engineRootId, String stableRootId, EffectResult result) {
    var wait = open(engineRootId, stableRootId, result.occurrence());
    if (wait == null
        || !(wait.openWait().detail() instanceof EffectDetail)
        || !(wait.handle() instanceof JobHandle job)) {
      return Execution.of(REJECTED);
    }
    var management = engine.getManagementService();
    var initialRetries = management.createJobQuery().jobId(job.jobId()).singleResult().getRetries();
    Long retriesAfterFirstFailure = null;
    effects.arm(result.occurrence().elementId(), result.outcome());
    try {
      if (result.outcome() instanceof TechnicalFailure) {
        if (!incidentsEnabled) {
          throw new IllegalStateException("A technical failure needs the scenario's options.incidents");
        }
        retriesAfterFirstFailure = failUntilIncident(job);
      } else {
        retriesAfterFirstFailure = executeToCompletion(job, initialRetries);
      }
    } finally {
      effects.disarm();
    }
    return new Execution(
        COMMITTED,
        new EffectExecutionSnapshot(
            result.commandId(),
            schedule.wireValue(),
            effects.invocations(),
            effects.mutations(),
            initialRetries,
            retriesAfterFirstFailure));
  }

  private Long executeToCompletion(JobHandle job, int initialRetries) {
    var management = engine.getManagementService();
    Long retriesAfterFirstFailure = null;
    try {
      management.executeJob(job.jobId());
    } catch (RuntimeException failure) {
      if (schedule != CibEffectExecutionSchedule.FAIL_AFTER_MUTATION_ONCE) {
        throw failure;
      }
      var failed = management.createJobQuery().jobId(job.jobId()).singleResult();
      if (failed == null || failed.getRetries() != initialRetries - 1) {
        throw new IllegalStateException("CIB did not retain and decrement the failed Service Task job", failure);
      }
      retriesAfterFirstFailure = (long) failed.getRetries();
      management.executeJob(job.jobId());
    }
    if (management.createJobQuery().jobId(job.jobId()).count() != 0) {
      throw new IllegalStateException("CIB retained the Service Task job after its result");
    }
    return retriesAfterFirstFailure;
  }

  private Long failUntilIncident(JobHandle job) {
    var management = engine.getManagementService();
    Long retriesAfterFirstFailure = null;
    while (true) {
      var current = Objects.requireNonNull(
          management.createJobQuery().jobId(job.jobId()).singleResult(), "technical failure completed the job");
      if (current.getRetries() == 0) {
        break;
      }
      var before = current.getRetries();
      try {
        management.executeJob(job.jobId());
      } catch (RuntimeException expected) {
        CibSevenEngineScenarioRunner.requireNoIntegrityViolation(expected);
        var failed = management.createJobQuery().jobId(job.jobId()).singleResult();
        if (failed == null || failed.getRetries() != before - 1) {
          throw new IllegalStateException("CIB did not decrement the failed public job", expected);
        }
        if (retriesAfterFirstFailure == null) {
          retriesAfterFirstFailure = (long) failed.getRetries();
        }
        continue;
      }
      // A boundary whose Error code names the failure's exception class or a superclass catches it and completes the
      // job (`ErrorEventDefinition#catchesException`, `BpmnExceptionHandler#propagateExceptionAsError`): CIB's answer.
      if (management.createJobQuery().jobId(job.jobId()).count() != 0) {
        throw new IllegalStateException("A scripted technical failure neither failed nor completed the job");
      }
      return retriesAfterFirstFailure;
    }
    var incidents =
        engine.getRuntimeService().createIncidentQuery().processInstanceId(job.engineInstanceId()).list().stream()
            .filter(incident -> job.jobId().equals(incident.getConfiguration()))
            .toList();
    if (incidents.size() != 1) {
      throw new IllegalStateException("CIB did not open one failed-job incident: " + List.copyOf(incidents));
    }
    return retriesAfterFirstFailure;
  }
}
