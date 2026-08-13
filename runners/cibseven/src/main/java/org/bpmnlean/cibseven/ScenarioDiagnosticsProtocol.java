package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Objects;

/** Raw CIB observations, PVM diagnostics, timings, and cleanup evidence. */
public final class ScenarioDiagnosticsProtocol {

  private static final long MAX_SAFE_WIRE_INTEGER = 9007199254740991L;

  private ScenarioDiagnosticsProtocol() {}

  public record Diagnostics(
      String engineVersion,
      String databaseVersion,
      long startupNanos,
      PhaseTimings phases,
      PvmDefinitionProjection pvmDefinition,
      List<CibStateQueryEvidence.StateQuerySnapshot> stateQueries,
      List<TaskQuerySnapshot> taskQueries,
      List<CibStateQueryEvidence.MessageSubscriptionSnapshot> messageSubscriptions,
      List<TimerJobSnapshot> timerJobs,
      List<EffectJobSnapshot> effectJobs,
      @JsonInclude(JsonInclude.Include.NON_NULL)
          List<CibSevenIncidentProtocol.IncidentJobSnapshot> incidentJobs,
      List<EffectExecutionSnapshot> effectExecutions,
      List<MappingExecutionSnapshot> mappingExecutions,
      CleanupProjection cleanup) {
    public Diagnostics {
      Objects.requireNonNull(engineVersion, "engineVersion");
      Objects.requireNonNull(databaseVersion, "databaseVersion");
      if (startupNanos <= 0) {
        throw new IllegalArgumentException("startupNanos must be positive");
      }
      Objects.requireNonNull(phases, "phases");
      Objects.requireNonNull(pvmDefinition, "pvmDefinition");
      stateQueries = List.copyOf(stateQueries);
      taskQueries = List.copyOf(taskQueries);
      messageSubscriptions = List.copyOf(messageSubscriptions);
      timerJobs = List.copyOf(timerJobs);
      effectJobs = List.copyOf(effectJobs);
      incidentJobs = incidentJobs == null ? null : List.copyOf(incidentJobs);
      effectExecutions = List.copyOf(effectExecutions);
      mappingExecutions = List.copyOf(mappingExecutions);
      Objects.requireNonNull(cleanup, "cleanup");
    }

    public Diagnostics(
        String engineVersion,
        String databaseVersion,
        long startupNanos,
        PhaseTimings phases,
        PvmDefinitionProjection pvmDefinition,
        List<CibStateQueryEvidence.StateQuerySnapshot> stateQueries,
        List<TaskQuerySnapshot> taskQueries,
        List<CibStateQueryEvidence.MessageSubscriptionSnapshot> messageSubscriptions,
        List<TimerJobSnapshot> timerJobs,
        List<EffectJobSnapshot> effectJobs,
        List<EffectExecutionSnapshot> effectExecutions,
        List<MappingExecutionSnapshot> mappingExecutions,
        CleanupProjection cleanup) {
      this(
          engineVersion,
          databaseVersion,
          startupNanos,
          phases,
          pvmDefinition,
          stateQueries,
          taskQueries,
          messageSubscriptions,
          timerJobs,
          effectJobs,
          null,
          effectExecutions,
          mappingExecutions,
          cleanup);
    }
  }

  /** Raw engine task-query projection retained in producer order. */
  public record TaskQuerySnapshot(String afterCommandId, List<TaskQueryTask> tasks) {
    public TaskQuerySnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      tasks = List.copyOf(tasks);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record TaskQueryTask(
      String elementId,
      String name,
      List<IdentityLinkEvidence> identityLinks,
      List<FormFieldEvidence> formFields) {
    public TaskQueryTask(String elementId, String name) {
      this(elementId, name, null, null);
    }

    public TaskQueryTask {
      Objects.requireNonNull(elementId, "elementId");
      identityLinks = identityLinks == null ? null : List.copyOf(identityLinks);
      formFields = formFields == null ? null : List.copyOf(formFields);
    }
  }

  public record IdentityLinkEvidence(String type, String userId, String groupId) {
    public IdentityLinkEvidence {
      Objects.requireNonNull(type, "type");
    }
  }

  public record FormFieldEvidence(String id, String typeName) {
    public FormFieldEvidence {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(typeName, "typeName");
    }
  }

  /** Raw engine timer-job projection retained before canonical projection. */
  public record TimerJobSnapshot(String afterCommandId, List<TimerJob> jobs) {
    public TimerJobSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      jobs = List.copyOf(jobs);
    }
  }

  public record TimerJob(String elementId, long dueDateDeltaMs, boolean executable) {
    public TimerJob {
      Objects.requireNonNull(elementId, "elementId");
      if (dueDateDeltaMs < 0 || dueDateDeltaMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("dueDateDeltaMs must be a non-negative safe wire integer");
      }
    }
  }

  /** Raw async-before Service Task job projection retained before canonical projection. */
  public record EffectJobSnapshot(String afterCommandId, List<EffectJob> jobs) {
    public EffectJobSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      jobs = List.copyOf(jobs);
    }
  }

  public record EffectJob(
      String elementId,
      long activation,
      String protocol,
      String handler,
      long retries,
      boolean executable,
      boolean dueDatePresent) {
    public EffectJob {
      Objects.requireNonNull(elementId, "elementId");
      Objects.requireNonNull(protocol, "protocol");
      Objects.requireNonNull(handler, "handler");
      if (activation < 1 || activation > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("activation must be a positive safe wire integer");
      }
      if (retries < 0 || retries > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("retries must be a non-negative safe wire integer");
      }
    }
  }

  /** Raw probe and public-retry facts; the project transport key is deliberately absent. */
  public record EffectExecutionSnapshot(
      String afterCommandId,
      String schedule,
      long invocations,
      long mutations,
      long initialRetries,
      Long retriesAfterFirstFailure) {
    public EffectExecutionSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      Objects.requireNonNull(schedule, "schedule");
    }
  }

  public record PhaseTimings(
      long deploymentNanos,
      long definitionProjectionNanos,
      long startNanos,
      long waitProjectionNanos,
      long completeNanos,
      long completionProjectionNanos,
      long cleanupNanos,
      long totalNanos) {}

  public record PvmDefinitionProjection(
      String processId, String initialActivityId, List<PvmActivityProjection> activities) {
    public PvmDefinitionProjection {
      Objects.requireNonNull(processId, "processId");
      Objects.requireNonNull(initialActivityId, "initialActivityId");
      activities = List.copyOf(activities);
    }
  }

  /** The event-scope identity is absent for ordinary PVM flow activities. */
  public record PvmActivityProjection(
      String id,
      String activityType,
      String behaviorType,
      String flowScopeId,
      String eventScopeId,
      List<TransitionProjection> outgoing) {
    public PvmActivityProjection {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(activityType, "activityType");
      Objects.requireNonNull(behaviorType, "behaviorType");
      Objects.requireNonNull(flowScopeId, "flowScopeId");
      outgoing = List.copyOf(outgoing);
    }
  }

  public record TransitionProjection(String id, String targetId) {
    public TransitionProjection {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(targetId, "targetId");
    }
  }

  public record CleanupProjection(
      long deployments,
      long processDefinitions,
      long processInstances,
      long tasks,
      long jobs,
      long incidents,
      long historicProcessInstances) {

    public static CleanupProjection clean() {
      return new CleanupProjection(0, 0, 0, 0, 0, 0, 0);
    }
  }
}
