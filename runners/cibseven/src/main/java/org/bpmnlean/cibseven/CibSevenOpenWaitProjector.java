package org.bpmnlean.cibseven;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.FailedJobIncident;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJob;
import org.bpmnlean.cibseven.CibSevenOccurrences.Instance;
import org.bpmnlean.cibseven.CibStateQueryEvidence.AddresslessReceiveWait;
import org.bpmnlean.cibseven.CibStateQueryEvidence.MessageSubscription;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.EffectJob;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.FormFieldEvidence;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.IdentityLinkEvidence;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TaskQueryTask;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TimerJob;
import org.bpmnlean.cibseven.ScenarioProtocol.ConditionalDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.DirectMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.Effect;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.FormField;
import org.bpmnlean.cibseven.ScenarioProtocol.IncidentDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.OccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenWait;
import org.bpmnlean.cibseven.ScenarioProtocol.OperationMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.Recurrence;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.UnspecifiedMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.persistence.entity.TimerEntity;
import org.cibseven.bpm.engine.runtime.EventSubscription;
import org.cibseven.bpm.engine.runtime.Job;
import org.cibseven.bpm.engine.task.Task;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.Activity;
import org.cibseven.bpm.model.bpmn.instance.BaseElement;
import org.cibseven.bpm.model.bpmn.instance.CatchEvent;
import org.cibseven.bpm.model.bpmn.instance.ConditionalEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.Message;
import org.cibseven.bpm.model.bpmn.instance.MessageEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.Operation;
import org.cibseven.bpm.model.bpmn.instance.ReceiveTask;
import org.cibseven.bpm.model.bpmn.instance.SendTask;
import org.cibseven.bpm.model.bpmn.instance.ServiceTask;
import org.cibseven.bpm.model.bpmn.instance.UserTask;
import org.cibseven.bpm.model.bpmn.instance.cibseven.CamundaInputOutput;
import org.cibseven.bpm.model.bpmn.instance.cibseven.CamundaInputParameter;

/**
 * The one projection from CIB engine state to the canonical `openWaits`, for the running root instance and every
 * called instance below it: User Tasks, Message, Signal and conditional event subscriptions, addressless Receive
 * Tasks, timer jobs, asynchronous Service Task jobs and their failed-job incidents.
 *
 * <p>Each wait keeps the engine handle a command needs to act on it, so command execution resolves a stimulus's
 * occurrence against the same projection the trace publishes. Detail fields CIB does not expose are written from the
 * model where it declares them, else at the kernel's default; the report of this re-cut lists them.
 */
final class CibSevenOpenWaitProjector {

  private static final Comparator<OccurrenceId> OCCURRENCE_ORDER =
      Comparator.comparing(OccurrenceId::processInstanceId, WireStrings::compare)
          .thenComparing(OccurrenceId::elementId, WireStrings::compare)
          .thenComparingLong(OccurrenceId::activation);

  /** The canonical wait order of `canonical-result.schema.json`. */
  static final Comparator<ProjectedWait> WAIT_ORDER =
      Comparator.comparing((ProjectedWait wait) -> wait.openWait().id(), OCCURRENCE_ORDER)
          .thenComparing(wait -> wait.openWait().detail().kindName(), WireStrings::compare);

  // CIB answers the task, identity-link, subscription, job and incident queries without an ORDER BY, so H2 returns
  // rows in the string order of their identifiers. The runner's per-scenario counter issues those identifiers, so the
  // order shifts whenever an unrelated change moves the counter across a digit boundary (#111): every set-valued list
  // the projection records takes one canonical order instead, over all its fields where no key identifies an entry.
  private static final Comparator<String> NULLABLE_WIRE_ORDER = Comparator.nullsFirst(WireStrings::compare);

  private static final Comparator<IdentityLinkEvidence> IDENTITY_LINK_ORDER =
      Comparator.comparing(IdentityLinkEvidence::type, WireStrings::compare)
          .thenComparing(IdentityLinkEvidence::userId, NULLABLE_WIRE_ORDER)
          .thenComparing(IdentityLinkEvidence::groupId, NULLABLE_WIRE_ORDER);

  private static final Comparator<MessageSubscription> SUBSCRIPTION_ORDER =
      Comparator.comparing(MessageSubscription::elementId, WireStrings::compare)
          .thenComparing(MessageSubscription::eventName, WireStrings::compare)
          .thenComparing(MessageSubscription::messageId, WireStrings::compare)
          .thenComparing(MessageSubscription::processInstanceIdMatches)
          .thenComparing(MessageSubscription::executionIdPresent);

  private static final Comparator<TimerJob> TIMER_ORDER =
      Comparator.comparing(TimerJob::elementId, WireStrings::compare)
          .thenComparingLong(TimerJob::dueDateDeltaMs)
          .thenComparing(TimerJob::executable);

  /** An effect's activation numbers it within its element and instance; the instance order breaks the last tie. */
  private static final Comparator<EffectJob> EFFECT_ORDER =
      Comparator.comparing(EffectJob::elementId, WireStrings::compare).thenComparingLong(EffectJob::activation);

  private static final Comparator<IncidentJob> INCIDENT_ORDER =
      Comparator.comparing(IncidentJob::elementId, WireStrings::compare)
          .thenComparing(IncidentJob::publicJobId, WireStrings::compare);

  private final ProcessEngine engine;
  private final Date logicalEpoch;
  private final boolean incidentsCancellable;
  private final CibSevenEffectBindings effectBindings;
  /** Every failed-job incident seen per job within the scenario: the effect's `failures` count. */
  private final Map<String, Set<String>> incidentsByJob = new HashMap<>();

  CibSevenOpenWaitProjector(
      ProcessEngine engine,
      Date logicalEpoch,
      boolean incidentsCancellable,
      CibSevenEffectBindings effectBindings) {
    this.engine = engine;
    this.logicalEpoch = logicalEpoch;
    this.incidentsCancellable = incidentsCancellable;
    this.effectBindings = effectBindings;
  }

  /** What a command acts on: one engine object per wait. */
  sealed interface Handle {}

  record TaskHandle(String taskId) implements Handle {}

  record SubscriptionHandle(String eventName, String executionId, String subscriptionId) implements Handle {}

  record AddresslessHandle(String executionId) implements Handle {}

  record JobHandle(String jobId, String engineInstanceId, String elementId) implements Handle {}

  record ProjectedWait(OpenWait openWait, Handle handle) {}

  record Projection(
      List<ProjectedWait> waits,
      List<TaskQueryTask> tasks,
      List<MessageSubscription> subscriptions,
      List<AddresslessReceiveWait> addressless,
      List<TimerJob> timers,
      List<EffectJob> effects,
      List<IncidentJob> incidents) {}

  Projection project(List<Instance> instances, CibSevenOccurrences occurrences) {
    var projection =
        new Projection(
            new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>(),
            new ArrayList<>(), new ArrayList<>());
    // Called instances arrive in the engine's query order; their stable identifiers order them, and the stable sorts
    // below keep that order among entries of different instances that compare equal.
    var ordered = instances.stream().sorted(Comparator.comparing(Instance::stableId, WireStrings::compare)).toList();
    for (var instance : ordered) {
      projectTasks(instance, occurrences, projection);
      projectSubscriptions(instance, occurrences, projection);
      projectAddressless(instance, occurrences, projection);
      projectJobs(instance, occurrences, projection);
    }
    projection.waits().sort(WAIT_ORDER);
    projection.subscriptions().sort(SUBSCRIPTION_ORDER);
    projection.timers().sort(TIMER_ORDER);
    projection.effects().sort(EFFECT_ORDER);
    projection.incidents().sort(INCIDENT_ORDER);
    return projection;
  }

  private void projectTasks(Instance instance, CibSevenOccurrences occurrences, Projection projection) {
    var taskService = engine.getTaskService();
    var tasks =
        new ArrayList<Task>(
            taskService.createTaskQuery().processInstanceId(instance.engineId()).initializeFormKeys().list());
    var activations = new HashMap<String, Long>();
    for (var task : tasks) {
      activations.put(
          task.getId(), occurrences.activation(instance, task.getTaskDefinitionKey(), task.getExecutionId()));
    }
    tasks.sort(
        Comparator.comparing(Task::getTaskDefinitionKey, WireStrings::compare)
            .thenComparingLong(task -> activations.get(task.getId())));
    for (var task : tasks) {
      var links =
          taskService.getIdentityLinksForTask(task.getId()).stream()
              .map(link -> new IdentityLinkEvidence(link.getType(), link.getUserId(), link.getGroupId()))
              .sorted(IDENTITY_LINK_ORDER)
              .toList();
      var fields =
          engine.getFormService().getTaskFormData(task.getId()).getFormFields().stream()
              .map(field -> new FormFieldEvidence(field.getId(), field.getTypeName()))
              .toList();
      projection.tasks().add(
          links.isEmpty() && fields.isEmpty()
              ? new TaskQueryTask(task.getTaskDefinitionKey(), task.getName())
              : new TaskQueryTask(task.getTaskDefinitionKey(), task.getName(), links, fields));
      long activation = activations.get(task.getId());
      var detail = userTaskDetail(instance.model(), task, links, fields);
      projection.waits().add(
          wait(instance, task.getTaskDefinitionKey(), activation, detail, new TaskHandle(task.getId())));
    }
  }

  private UserTaskDetail userTaskDetail(
      BpmnModelInstance model,
      Task task,
      List<IdentityLinkEvidence> links,
      List<FormFieldEvidence> fields) {
    var declared = (UserTask) model.getModelElementById(task.getTaskDefinitionKey());
    var candidates = links.stream().filter(link -> "candidate".equals(link.type())).toList();
    return new UserTaskDetail(
        task.getName(),
        task.getAssignee(),
        // CIB lists candidate identity links in no stable order (two runs of one scenario in one engine differ), and
        // the canonical result compares candidates as multisets, so the projection fixes one order for its evidence.
        candidates.stream().map(IdentityLinkEvidence::userId).filter(id -> id != null)
            .sorted(WireStrings::compare).toList(),
        candidates.stream().map(IdentityLinkEvidence::groupId).filter(id -> id != null)
            .sorted(WireStrings::compare).toList(),
        task.getFormKey(),
        fields.stream().map(field -> new FormField(field.id(), field.typeName())).toList(),
        instant(task.getDueDate()),
        instant(task.getFollowUpDate()),
        // CIB gives every task a priority; the kernel publishes one only where the model declares it.
        declared.getCamundaPriority() == null ? null : (long) task.getPriority(),
        inputs(declared, task.getExecutionId()));
  }

  /** The task's declared input parameters, read from its execution's local variables. */
  private List<VariableBinding> inputs(Activity declared, String executionId) {
    var names = new LinkedHashSet<String>();
    var extensions = declared.getExtensionElements();
    if (extensions != null) {
      for (var io : extensions.getElementsQuery().filterByType(CamundaInputOutput.class).list()) {
        io.getCamundaInputParameters().stream().map(CamundaInputParameter::getCamundaName).forEach(names::add);
      }
    }
    var locals = engine.getRuntimeService().getVariablesLocal(executionId);
    return names.stream()
        .filter(locals::containsKey)
        .map(name -> ScenarioVariableValueProjection.project(new ProcessVariableSnapshot(name, locals.get(name))))
        .sorted(Comparator.comparing(VariableBinding::name, WireStrings::compare))
        .toList();
  }

  private void projectSubscriptions(Instance instance, CibSevenOccurrences occurrences, Projection projection) {
    var subscriptions =
        engine.getRuntimeService().createEventSubscriptionQuery().processInstanceId(instance.engineId()).list();
    for (var subscription : subscriptions) {
      var elementId = subscription.getActivityId();
      var handle =
          new SubscriptionHandle(
              subscription.getEventName(), subscription.getExecutionId(), subscription.getId());
      var detail =
          switch (subscription.getEventType()) {
            case "message" -> messageDetail(instance, subscription, projection);
            case "signal" -> new SignalDetail(subscription.getEventName(), false);
            case "conditional" -> conditionalDetail(instance.model(), elementId);
            // A compensation subscription is retention, not a wait.
            case "compensate" -> null;
            default -> throw new IllegalStateException(
                "Unsupported CIB event subscription type " + subscription.getEventType());
          };
      if (detail != null) {
        var activation =
            occurrences.subscriptionActivation(
                instance, elementId, subscription.getExecutionId(), subscription.getId());
        projection.waits().add(wait(instance, elementId, activation, detail, handle));
      }
    }
  }

  private MessageDetail messageDetail(Instance instance, EventSubscription subscription, Projection projection) {
    var element = instance.model().getModelElementById(subscription.getActivityId());
    var channel = channel(element);
    var messageId =
        switch (channel) {
          case DirectMessageChannel direct -> direct.messageId();
          case OperationMessageChannel operation -> operation.messageId();
          case UnspecifiedMessageChannel ignored ->
              throw new IllegalStateException("CIB Message subscription without a Message");
        };
    projection.subscriptions().add(
        new MessageSubscription(
            subscription.getActivityId(),
            subscription.getEventName(),
            messageId,
            instance.engineId().equals(subscription.getProcessInstanceId()),
            subscription.getExecutionId() != null));
    return new MessageDetail(channel, writesPayload(element), List.of());
  }

  /** Whether the catching element writes the delivered payload: it declares a data output association. */
  private static boolean writesPayload(Object element) {
    return switch (element) {
      case CatchEvent event -> !event.getDataOutputAssociations().isEmpty();
      case Activity activity -> !activity.getDataOutputAssociations().isEmpty();
      default -> false;
    };
  }

  private static MessageChannel channel(Object element) {
    Message message = null;
    Operation operation = null;
    if (element instanceof ReceiveTask receive) {
      message = receive.getMessage();
      operation = receive.getOperation();
    } else if (element instanceof CatchEvent event) {
      for (var definition : event.getEventDefinitions()) {
        if (definition instanceof MessageEventDefinition messageDefinition) {
          message = messageDefinition.getMessage();
          operation = messageDefinition.getOperation();
        }
      }
    }
    if (operation != null) {
      var carried = message != null ? message : operation.getInMessage();
      return new OperationMessageChannel(
          ((BaseElement) operation.getParentElement()).getId(), operation.getId(), carried.getId());
    }
    return message == null ? new UnspecifiedMessageChannel() : new DirectMessageChannel(message.getId());
  }

  private static ConditionalDetail conditionalDetail(BpmnModelInstance model, String elementId) {
    var element = model.getModelElementById(elementId);
    if (element instanceof CatchEvent event) {
      for (var definition : event.getEventDefinitions()) {
        if (definition instanceof ConditionalEventDefinition conditional) {
          return new ConditionalDetail(
              conditional.getCamundaVariableName(), conditional.getCamundaVariableEventsList(), null);
        }
      }
    }
    throw new IllegalStateException("Conditional subscription " + elementId + " has no conditional definition");
  }

  /**
   * A Receive Task without a Message keeps no event subscription in CIB Seven `2.2.0` (`CIB-OP-0011`): its wait is
   * each activity instance of such a task.
   */
  private void projectAddressless(Instance instance, CibSevenOccurrences occurrences, Projection projection) {
    for (var receive : instance.model().getModelElementsByType(ReceiveTask.class)) {
      if (receive.getMessage() != null || receive.getOperation() != null) {
        continue;
      }
      for (var node : CibSevenOccurrences.activityInstances(instance.tree(), receive.getId())) {
        var executionId = node.getExecutionIds()[0];
        projection.addressless().add(new AddresslessReceiveWait(receive.getId()));
        projection.waits().add(
            wait(
                instance,
                receive.getId(),
                occurrences.ordinal(instance.engineId(), receive.getId(), node.getId()),
                new MessageDetail(new UnspecifiedMessageChannel(), false, List.of()),
                new AddresslessHandle(executionId)));
      }
    }
  }

  private void projectJobs(Instance instance, CibSevenOccurrences occurrences, Projection projection) {
    var management = engine.getManagementService();
    for (var job : management.createJobQuery().processInstanceId(instance.engineId()).list()) {
      var definition =
          management.createJobDefinitionQuery().jobDefinitionId(job.getJobDefinitionId()).singleResult();
      if (definition == null) {
        throw new IllegalStateException("Job has no public JobDefinition " + job.getJobDefinitionId());
      }
      var elementId = definition.getActivityId();
      var executable = management.createJobQuery().jobId(job.getId()).executable().count() == 1;
      var handle = new JobHandle(job.getId(), instance.engineId(), elementId);
      if (job instanceof TimerEntity timer) {
        var deadlineMs = job.getDuedate().getTime() - logicalEpoch.getTime();
        projection.timers().add(new TimerJob(elementId, deadlineMs, executable));
        var activation =
            occurrences.subscriptionActivation(instance, elementId, job.getExecutionId(), job.getId());
        var recurrence =
            remaining(recurrence(timer.getRepeat()), occurrences.chainFirings(instance.engineId(), job.getId()));
        projection.waits().add(
            wait(instance, elementId, activation, new TimerDetail(deadlineMs, recurrence), handle));
      } else if (instance.model().getModelElementById(elementId) instanceof ServiceTask task) {
        projectEffect(instance, occurrences, projection, job,
            new DelegatedTask(
                task.getId(), task.getImplementation(), task.getAttributeValue("implementation"),
                task.getCamundaDelegateExpression()),
            executable, handle);
      } else if (instance.model().getModelElementById(elementId) instanceof SendTask task) {
        projectEffect(instance, occurrences, projection, job,
            new DelegatedTask(
                task.getId(), task.getImplementation(), task.getAttributeValue("implementation"),
                task.getCamundaDelegateExpression()),
            executable, handle);
      } else {
        throw new IllegalStateException("Unsupported asynchronous continuation at " + elementId);
      }
    }
  }

  private void projectEffect(
      Instance instance,
      CibSevenOccurrences occurrences,
      Projection projection,
      Job job,
      DelegatedTask task,
      boolean executable,
      JobHandle handle) {
    // A token no handler bean carries still waits at its job: CIB resolves the token only when the job runs
    // (`ServiceTaskDelegateExpressionActivityBehavior#performExecution`), so the wait is projected like any other and
    // the job's failure is CIB's answer (CIB-LIM-0051).
    var bound = effectBindings.effect(task.id(), task.declaredImplementation(), task.delegateExpression());
    var activation = occurrences.pendingActivation(instance, task.id(), job.getExecutionId());
    projection.effects().add(
        new EffectJob(
            task.id(), activation, task.implementation(), bound.handler(), job.getRetries(), executable,
            job.getDuedate() != null));
    var incidents =
        engine.getRuntimeService().createIncidentQuery().processInstanceId(instance.engineId()).list().stream()
            .filter(incident -> job.getId().equals(incident.getConfiguration()))
            .toList();
    if (incidents.size() > 1) {
      throw new IllegalStateException("Job " + job.getId() + " has more than one incident");
    }
    var seen = incidentsByJob.computeIfAbsent(job.getId(), ignored -> new LinkedHashSet<>());
    incidents.forEach(incident -> seen.add(incident.getId()));
    // The asynchronous continuation runs the input mappings only when the job executes, so arguments are not
    // observable while the effect waits.
    var effect = new Effect(bound.protocol(), bound.operation(), List.of(), seen.size(), null);
    FailedJobIncident raw = null;
    if (incidents.isEmpty()) {
      projection.waits().add(wait(instance, task.id(), activation, new EffectDetail(effect), handle));
    } else {
      var incident = incidents.getFirst();
      raw =
          new FailedJobIncident(
              incident.getId(), incident.getIncidentType(), incident.getConfiguration(),
              incident.getProcessInstanceId(), incident.getActivityId(), incident.getCauseIncidentId(),
              incident.getRootCauseIncidentId());
      projection.waits().add(
          wait(
              instance, task.id(), activation,
              new IncidentDetail(effect, seen.size(), incidentsCancellable), handle));
    }
    projection.incidents().add(
        new IncidentJob(
            job.getId(), job.getRetries(), executable, job.getDuedate() != null, job.getProcessInstanceId(),
            task.id(), raw));
  }

  /**
   * A Service or Send Task whose delegate expression the runner's effect handler answers. `implementation` is the
   * model API's value, `##WebService` when absent; `declaredImplementation` is the attribute as written, null when
   * absent, which a binding matches exactly as the kernel reader does.
   */
  private record DelegatedTask(
      String id, String implementation, String declaredImplementation, String delegateExpression) {}

  private static ProjectedWait wait(
      Instance instance, String elementId, long activation, ScenarioProtocol.WaitDetail detail, Handle handle) {
    return new ProjectedWait(
        new OpenWait(new OccurrenceId(instance.stableId(), elementId, activation), instance.definition(), detail),
        handle);
  }

  private static String instant(Date date) {
    return date == null ? null : date.toInstant().toString();
  }

  /**
   * The firings left of a finite cycle, including the open one: the declared count less the chain's earlier firings,
   * as the kernel counts them (CIB keeps the declared count on every job of the chain). A chain past its count
   * (CIB-DEV-0006) has no value in the observation, so it fails the scenario rather than report a negative count.
   */
  static Recurrence remaining(Recurrence recurrence, long earlierFirings) {
    if (recurrence == null || recurrence.remaining() == null) {
      return recurrence;
    }
    var left = recurrence.remaining() - earlierFirings;
    if (left < 0) {
      throw new IllegalStateException("CIB chained a finite Timer cycle past its declared count of "
          + recurrence.remaining() + " (CIB-DEV-0006); the observation has no value for its remaining firings");
    }
    return new Recurrence(recurrence.periodMs(), recurrence.cron(), left);
  }

  /**
   * A timer's repetition from CIB's repeat expression: ISO `R[n]/[start/]period` or `R[n]/start/end`, whose period is
   * the distance of its two dates (`DurationHelper`), otherwise a cron expression.
   */
  static Recurrence recurrence(String repeat) {
    if (repeat == null || repeat.isEmpty()) {
      return null;
    }
    if (!repeat.startsWith("R")) {
      return new Recurrence(null, repeat, null);
    }
    var parts = repeat.split("/");
    var count = parts[0].substring(1);
    var last = parts[parts.length - 1];
    var period = last.startsWith("P")
        ? Duration.parse(last).toMillis()
        : Duration.between(OffsetDateTime.parse(parts[1]), OffsetDateTime.parse(last)).toMillis();
    return new Recurrence(period, null, count.isEmpty() ? null : Long.parseLong(count));
  }
}
