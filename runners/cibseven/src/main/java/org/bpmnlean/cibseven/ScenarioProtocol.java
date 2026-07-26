package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.List;
import java.util.Objects;

/**
 * Current transport types shared by the CIB-seven oracle and its callers.
 *
 * <p>The canonical trace deliberately contains only stable, observable semantic facts. Engine-generated
 * identifiers and the PVM projection belong in diagnostics.
 */
public final class ScenarioProtocol {

  public static final String SCENARIO_KIND = "scenario";
  public static final String SCENARIO_RESULT_KIND = "scenarioResult";
  private static final long MAX_SAFE_WIRE_INTEGER = 9007199254740991L;

  private ScenarioProtocol() {}

  public enum CommandOutcome implements WireValue {
    COMMITTED("committed"),
    ROLLED_BACK("rolledBack"),
    REJECTED("rejected"),
    SEMANTIC_FAILURE("semanticFailure"),
    UNSUPPORTED("unsupported");

    private final String wireValue;

    CommandOutcome(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static CommandOutcome fromWireValue(String value) {
      return WireValue.parse(CommandOutcome.class, value);
    }
  }

  public enum ProcessStatus implements WireValue {
    NOT_STARTED("notStarted"),
    RUNNING("running"),
    COMPLETED("completed");

    private final String wireValue;

    ProcessStatus(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static ProcessStatus fromWireValue(String value) {
      return WireValue.parse(ProcessStatus.class, value);
    }
  }

  public enum WaitKind implements WireValue {
    USER_TASK("userTask"),
    TIMER("timer"),
    EFFECT("effect");

    private final String wireValue;

    WaitKind(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static WaitKind fromWireValue(String value) {
      return WireValue.parse(WaitKind.class, value);
    }
  }

  public enum UserTaskLifecycleState implements WireValue {
    ACTIVE("active");

    private final String wireValue;

    UserTaskLifecycleState(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static UserTaskLifecycleState fromWireValue(String value) {
      return WireValue.parse(UserTaskLifecycleState.class, value);
    }
  }

  public enum ObservationKind implements WireValue {
    DEPLOYMENT("deployment"),
    COMMAND_RESULTS("commandResults"),
    PROCESS_STATUS("processStatus"),
    ACTIVE_WAITS("activeWaits"),
    OPEN_USER_TASKS("openUserTasks"),
    OPEN_TIMERS("openTimers"),
    OPEN_EFFECTS("openEffects"),
    ENABLED_INTERACTIONS("enabledInteractions"),
    LOGICAL_TIME("logicalTime");

    private final String wireValue;

    ObservationKind(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static ObservationKind fromWireValue(String value) {
      return WireValue.parse(ObservationKind.class, value);
    }
  }

  private interface WireValue {
    String wireValue();

    static <E extends Enum<E> & WireValue> E parse(Class<E> type, String value) {
      for (var candidate : type.getEnumConstants()) {
        if (candidate.wireValue().equals(value)) {
          return candidate;
        }
      }
      throw new IllegalArgumentException("Unsupported " + type.getSimpleName() + ": " + value);
    }
  }

  public record ScenarioDefinition(
      String kind,
      String id,
      String profile,
      BpmnResource bpmn,
      List<Stimulus> stimuli,
      List<ObservationKind> observations,
      Provenance provenance) {

    public ScenarioDefinition {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(profile, "profile");
      Objects.requireNonNull(bpmn, "bpmn");
      stimuli = List.copyOf(stimuli);
      observations = List.copyOf(observations);
      Objects.requireNonNull(provenance, "provenance");
    }
  }

  public record BpmnResource(String id, String relativePath, String sha256) {
    public BpmnResource {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(relativePath, "relativePath");
      Objects.requireNonNull(sha256, "sha256");
    }
  }

  public record Provenance(
      List<String> normativeRefs, String cibRevision, List<String> cibRefs) {
    public Provenance {
      normativeRefs = List.copyOf(normativeRefs);
      Objects.requireNonNull(cibRevision, "cibRevision");
      cibRefs = List.copyOf(cibRefs);
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = StartProcessStimulus.class, name = "startProcess"),
    @JsonSubTypes.Type(
        value = CompleteUserTaskInstanceStimulus.class,
        name = "completeUserTaskInstance"),
    @JsonSubTypes.Type(value = FireTimerStimulus.class, name = "fireTimer")
  })
  public sealed interface Stimulus
      permits StartProcessStimulus,
          CompleteUserTaskInstanceStimulus,
          FireTimerStimulus {
    String commandId();
  }

  public record StartProcessStimulus(
      String commandId, String processId, String instanceId) implements Stimulus {
    public StartProcessStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(processId, "processId");
      Objects.requireNonNull(instanceId, "instanceId");
    }
  }

  public record UserTaskInstanceId(
      String processInstanceId, String elementId, long activation) {
    public UserTaskInstanceId {
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      if (activation < 1 || activation > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("activation must be a positive safe wire integer");
      }
    }
  }

  public record CompleteUserTaskInstanceStimulus(
      String commandId, UserTaskInstanceId taskId) implements Stimulus {
    public CompleteUserTaskInstanceStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(taskId, "taskId");
    }
  }

  public record TimerOccurrenceId(
      String processInstanceId, String elementId, long activation) {
    public TimerOccurrenceId {
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      if (activation < 1 || activation > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("activation must be a positive safe wire integer");
      }
    }
  }

  public record FireTimerStimulus(
      String commandId, TimerOccurrenceId timerId, long logicalTimeMs)
      implements Stimulus {
    public FireTimerStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(timerId, "timerId");
      if (logicalTimeMs < 0 || logicalTimeMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("logicalTimeMs must be a non-negative safe wire integer");
      }
    }
  }

  public record OpenUserTask(
      UserTaskInstanceId id, String name, UserTaskLifecycleState state) {
    public OpenUserTask {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(state, "state");
    }
  }

  public record OpenTimer(TimerOccurrenceId id, long deadlineMs) {
    public OpenTimer {
      Objects.requireNonNull(id, "id");
      if (deadlineMs < 0 || deadlineMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("deadlineMs must be a non-negative safe wire integer");
      }
    }
  }

  public record EffectDescriptor(String protocol, String handler) {
    public EffectDescriptor {
      Objects.requireNonNull(protocol, "protocol");
      Objects.requireNonNull(handler, "handler");
    }
  }

  public record EffectOccurrenceId(
      String processInstanceId, String elementId, long activation) {
    public EffectOccurrenceId {
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      if (activation < 1 || activation > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("activation must be a positive safe wire integer");
      }
    }
  }

  public record OpenEffect(EffectOccurrenceId id, EffectDescriptor descriptor) {
    public OpenEffect {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(descriptor, "descriptor");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(
        value = CompleteUserTaskInstanceInteraction.class,
        name = "completeUserTaskInstance")
  })
  public sealed interface EnabledInteraction
      permits CompleteUserTaskInstanceInteraction {}

  public record CompleteUserTaskInstanceInteraction(UserTaskInstanceId taskId)
      implements EnabledInteraction {
    public CompleteUserTaskInstanceInteraction {
      Objects.requireNonNull(taskId, "taskId");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = DeploymentObservation.class, name = "deployment"),
    @JsonSubTypes.Type(value = CommandObservation.class, name = "command"),
    @JsonSubTypes.Type(value = StateObservation.class, name = "state")
  })
  public sealed interface CanonicalObservation
      permits DeploymentObservation, CommandObservation, StateObservation {}

  public record DeploymentObservation(CommandOutcome outcome) implements CanonicalObservation {
    public DeploymentObservation {
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  public record CommandObservation(String commandId, CommandOutcome outcome)
      implements CanonicalObservation {
    public CommandObservation {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  public record StateObservation(
      String instanceId,
      ProcessStatus status,
      List<ActiveWait> activeWaits,
      List<OpenUserTask> openUserTasks,
      List<OpenTimer> openTimers,
      List<OpenEffect> openEffects,
      List<EnabledInteraction> enabledInteractions,
      long logicalTimeMs)
      implements CanonicalObservation {
    public StateObservation {
      Objects.requireNonNull(instanceId, "instanceId");
      Objects.requireNonNull(status, "status");
      activeWaits = List.copyOf(activeWaits);
      openUserTasks = List.copyOf(openUserTasks);
      openTimers = List.copyOf(openTimers);
      openEffects = List.copyOf(openEffects);
      enabledInteractions = List.copyOf(enabledInteractions);
      if (logicalTimeMs < 0 || logicalTimeMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("logicalTimeMs must be a non-negative safe wire integer");
      }
    }

  }

  public record ActiveWait(String elementId, WaitKind kind, long multiplicity) {
    public ActiveWait {
      Objects.requireNonNull(elementId, "elementId");
      Objects.requireNonNull(kind, "kind");
      if (multiplicity < 1 || multiplicity > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("multiplicity must be a positive safe wire integer");
      }
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = SemanticOutcome.class, name = "semantic"),
    @JsonSubTypes.Type(value = HarnessFailure.class, name = "harnessFailure"),
    @JsonSubTypes.Type(value = InfrastructureFailure.class, name = "infrastructureFailure")
  })
  public sealed interface ScenarioOutcome
      permits SemanticOutcome, HarnessFailure, InfrastructureFailure {}

  public record SemanticOutcome(CommandOutcome outcome) implements ScenarioOutcome {
    public SemanticOutcome {
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  public record HarnessFailure() implements ScenarioOutcome {}

  public record InfrastructureFailure() implements ScenarioOutcome {}

  public record CanonicalResult(
      ScenarioOutcome outcome, List<CanonicalObservation> trace) {
    public CanonicalResult {
      Objects.requireNonNull(outcome, "outcome");
      trace = List.copyOf(trace);
    }
  }

  /** Diagnostics are optional because a harness or infrastructure failure may precede collection. */
  public record ScenarioResult(
      String kind,
      String scenarioId,
      ScenarioOutcome outcome,
      List<CanonicalObservation> trace,
      Diagnostics diagnostics) {
    public ScenarioResult {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(scenarioId, "scenarioId");
      Objects.requireNonNull(outcome, "outcome");
      trace = List.copyOf(trace);
    }
  }

  public record Diagnostics(
      String engineVersion,
      String databaseVersion,
      long startupNanos,
      PhaseTimings phases,
      PvmDefinitionProjection pvmDefinition,
      List<TaskQuerySnapshot> taskQueries,
      List<TimerJobSnapshot> timerJobs,
      CleanupProjection cleanup) {
    public Diagnostics {
      Objects.requireNonNull(engineVersion, "engineVersion");
      Objects.requireNonNull(databaseVersion, "databaseVersion");
      if (startupNanos <= 0) {
        throw new IllegalArgumentException("startupNanos must be positive");
      }
      Objects.requireNonNull(phases, "phases");
      Objects.requireNonNull(pvmDefinition, "pvmDefinition");
      taskQueries = List.copyOf(taskQueries);
      timerJobs = List.copyOf(timerJobs);
      Objects.requireNonNull(cleanup, "cleanup");
    }
  }

  /**
   * Raw engine task-query projection retained in producer order for independent evidence
   * reconstruction.
   */
  public record TaskQuerySnapshot(
      String afterCommandId,
      List<TaskQueryTask> tasks) {
    public TaskQuerySnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      tasks = List.copyOf(tasks);
    }
  }

  public record TaskQueryTask(String elementId, String name) {
    public TaskQueryTask {
      Objects.requireNonNull(elementId, "elementId");
    }
  }

  /**
   * Raw engine timer-job projection. The due-date delta is adapter-derived from the controlled
   * epoch; job existence and scheduler eligibility are engine-observed.
   */
  public record TimerJobSnapshot(
      String afterCommandId,
      List<TimerJob> jobs) {
    public TimerJobSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      jobs = List.copyOf(jobs);
    }
  }

  public record TimerJob(
      String elementId,
      long dueDateDeltaMs,
      boolean executable) {
    public TimerJob {
      Objects.requireNonNull(elementId, "elementId");
      if (dueDateDeltaMs < 0 || dueDateDeltaMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("dueDateDeltaMs must be a non-negative safe wire integer");
      }
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
