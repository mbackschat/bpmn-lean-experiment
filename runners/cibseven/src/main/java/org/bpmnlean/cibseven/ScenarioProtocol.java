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
  static final long MAX_SAFE_WIRE_INTEGER = 9007199254740991L;

  private ScenarioProtocol() {}

  public enum CommandOutcome implements ScenarioWireValue {
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
      return ScenarioWireValue.parse(CommandOutcome.class, value);
    }
  }

  public enum ProcessStatus implements ScenarioWireValue {
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
      return ScenarioWireValue.parse(ProcessStatus.class, value);
    }
  }

  public enum WaitKind implements ScenarioWireValue {
    USER_TASK("userTask"),
    MESSAGE("message"),
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
      return ScenarioWireValue.parse(WaitKind.class, value);
    }
  }

  public enum UserTaskLifecycleState implements ScenarioWireValue {
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
      return ScenarioWireValue.parse(UserTaskLifecycleState.class, value);
    }
  }

  public enum ObservationKind implements ScenarioWireValue {
    DEPLOYMENT("deployment"),
    COMMAND_RESULTS("commandResults"),
    PROCESS_STATUS("processStatus"),
    ACTIVE_WAITS("activeWaits"),
    OPEN_USER_TASKS("openUserTasks"),
    OPEN_TIMERS("openTimers"),
    OPEN_EFFECTS("openEffects"),
    VARIABLES("variables"),
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
      return ScenarioWireValue.parse(ObservationKind.class, value);
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

  public record BpmnResource(
      String id,
      String relativePath,
      String sha256,
      SourceOverlayIdentity sourceOverlay) {
    public BpmnResource {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(relativePath, "relativePath");
      Objects.requireNonNull(sha256, "sha256");
    }
  }

  public record SourceOverlayIdentity(String id, String sha256) {
    public SourceOverlayIdentity {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(sha256, "sha256");
      if (id.isEmpty() || !sha256.matches("[0-9a-f]{64}")) {
        throw new IllegalArgumentException(
            "source overlay identity requires a nonempty id and lowercase SHA-256");
      }
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
    @JsonSubTypes.Type(
        value = ScenarioMessageProtocol.DeliverMessageStimulus.class,
        name = "deliverMessage"),
    @JsonSubTypes.Type(value = FireTimerStimulus.class, name = "fireTimer"),
    @JsonSubTypes.Type(value = CompleteEffectStimulus.class, name = "completeEffect")
  })
  public sealed interface Stimulus
      permits StartProcessStimulus,
          CompleteUserTaskInstanceStimulus,
          ScenarioMessageProtocol.DeliverMessageStimulus,
          FireTimerStimulus,
          CompleteEffectStimulus {
    String commandId();
  }

  public record StartProcessStimulus(
      String commandId,
      String processId,
      String instanceId,
      List<VariableBinding> initialVariables) implements Stimulus {
    public StartProcessStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(processId, "processId");
      Objects.requireNonNull(instanceId, "instanceId");
      initialVariables =
          ScenarioVariableBindings.requireCanonical(initialVariables, "initialVariables");
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
      String commandId,
      UserTaskInstanceId taskId,
      List<VariableBinding> submittedValues) implements Stimulus {
    public CompleteUserTaskInstanceStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(taskId, "taskId");
      submittedValues =
          ScenarioVariableBindings.requireCanonical(submittedValues, "submittedValues");
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

  public record EffectDescriptor(String protocol, String operation) {
    public EffectDescriptor {
      Objects.requireNonNull(protocol, "protocol");
      Objects.requireNonNull(operation, "operation");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = StringValue.class, name = "string"),
    @JsonSubTypes.Type(value = BooleanValue.class, name = "boolean"),
    @JsonSubTypes.Type(value = NullValue.class, name = "null")
  })
  public sealed interface VariableValue permits StringValue, BooleanValue, NullValue {}

  public record StringValue(String value) implements VariableValue {
    public StringValue {
      Objects.requireNonNull(value, "value");
    }
  }

  public record BooleanValue(Boolean value) implements VariableValue {
    public BooleanValue {
      Objects.requireNonNull(value, "value");
    }
  }

  public record NullValue() implements VariableValue {}

  public record VariableBinding(String name, VariableValue value) {
    public VariableBinding {
      if (name == null || name.isEmpty()) {
        throw new IllegalArgumentException("variable binding name must be non-empty");
      }
      Objects.requireNonNull(value, "value");
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

  public record OpenEffect(
      EffectOccurrenceId id,
      EffectDescriptor descriptor,
      List<VariableBinding> arguments) {
    public OpenEffect {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(descriptor, "descriptor");
      arguments = List.copyOf(arguments);
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = SuccessfulEffectResult.class, name = "success"),
    @JsonSubTypes.Type(value = BpmnErrorEffectResult.class, name = "bpmnError")
  })
  public sealed interface EffectExecutionResult
      permits SuccessfulEffectResult, BpmnErrorEffectResult {}

  public record SuccessfulEffectResult(List<VariableBinding> localPatch)
      implements EffectExecutionResult {
    public SuccessfulEffectResult {
      localPatch = List.copyOf(localPatch);
    }
  }

  public record BpmnErrorEffectResult(
      String code,
      String message,
      List<VariableBinding> localPatch)
      implements EffectExecutionResult {
    public BpmnErrorEffectResult {
      if (code == null || code.isEmpty()) {
        throw new IllegalArgumentException("BPMN Error code must be non-empty");
      }
      if (message != null && message.isEmpty()) {
        throw new IllegalArgumentException(
            "BPMN Error message must be null or non-empty");
      }
      localPatch = List.copyOf(localPatch);
    }
  }

  public record CompleteEffectStimulus(
      String commandId,
      EffectOccurrenceId effectId,
      EffectExecutionResult result) implements Stimulus {
    public CompleteEffectStimulus {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(effectId, "effectId");
      Objects.requireNonNull(result, "result");
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
      List<ScenarioMessageProtocol.OpenMessageSubscription> openMessageSubscriptions,
      List<OpenTimer> openTimers,
      List<OpenEffect> openEffects,
      List<VariableBinding> variables,
      List<ScenarioInteractionProtocol.EnabledInteraction> enabledInteractions,
      long logicalTimeMs)
      implements CanonicalObservation {
    public StateObservation {
      Objects.requireNonNull(instanceId, "instanceId");
      Objects.requireNonNull(status, "status");
      activeWaits = List.copyOf(activeWaits);
      openUserTasks = List.copyOf(openUserTasks);
      openMessageSubscriptions = List.copyOf(openMessageSubscriptions);
      openTimers = List.copyOf(openTimers);
      openEffects = List.copyOf(openEffects);
      variables = List.copyOf(variables);
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
      ScenarioDiagnosticsProtocol.Diagnostics diagnostics) {
    public ScenarioResult {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(scenarioId, "scenarioId");
      Objects.requireNonNull(outcome, "outcome");
      trace = List.copyOf(trace);
    }
  }

}
