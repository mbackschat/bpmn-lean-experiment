package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.List;
import java.util.Objects;

/**
 * Transport types of the scenario and canonical-result contracts
 * (`contracts/schemas/scenario.schema.json`, `canonical-result.schema.json`).
 *
 * <p>The canonical trace contains only stable, observable semantic facts. Engine-generated identifiers and the PVM
 * projection belong in diagnostics.
 */
public final class ScenarioProtocol {

  public static final String SCENARIO_KIND = "scenario";
  public static final String SCENARIO_RESULT_KIND = "scenarioResult";
  public static final String SCENARIO_HARNESS_FAILURE_KIND = "scenarioHarnessFailure";
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
    RUNNING("running"),
    COMPLETED("completed"),
    CANCELLED("cancelled"),
    FAILED("failed");

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

  /** The input that closes an open wait; a conditional wait has none. */
  public enum InputKind implements ScenarioWireValue {
    COMMAND("command"),
    DELIVER("deliver"),
    TIMER_FIRE("timerFire"),
    EFFECT_RESULT("effectResult");

    private final String wireValue;

    InputKind(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static InputKind fromWireValue(String value) {
      return ScenarioWireValue.parse(InputKind.class, value);
    }
  }

  // ---------- scenario ----------

  public record ScenarioDefinition(
      String kind,
      String id,
      String profile,
      BpmnResource bpmn,
      List<Stimulus> stimuli,
      @JsonInclude(JsonInclude.Include.NON_NULL) Options options,
      Provenance provenance) {

    public ScenarioDefinition {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(profile, "profile");
      Objects.requireNonNull(bpmn, "bpmn");
      stimuli = List.copyOf(stimuli);
      Objects.requireNonNull(provenance, "provenance");
    }

    Options declaredOptions() {
      return options == null ? new Options(null) : options;
    }
  }

  /** Host-environment options a target runner needs to realize the scenario; never an expected answer. */
  public record Options(@JsonInclude(JsonInclude.Include.NON_NULL) Incidents incidents) {
    boolean incidentsEnabled() {
      return incidents != null;
    }

    boolean incidentsCancellable() {
      return incidents != null && incidents.cancellable();
    }
  }

  public record Incidents(boolean cancellable) {}

  /** The model resource; `decisions` names the DMN resources deployed with it, absent rather than empty. */
  public record BpmnResource(
      String id,
      String relativePath,
      String sha256,
      SourceOverlayIdentity sourceOverlay,
      @JsonInclude(JsonInclude.Include.NON_NULL) List<DecisionResource> decisions) {
    public BpmnResource {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(relativePath, "relativePath");
      Objects.requireNonNull(sha256, "sha256");
      if (decisions != null && decisions.isEmpty()) {
        throw new IllegalArgumentException("decisions is absent rather than empty");
      }
      decisions = decisions == null ? null : List.copyOf(decisions);
    }

    List<DecisionResource> declaredDecisions() {
      return decisions == null ? List.of() : decisions;
    }
  }

  /** One DMN resource bound by its exact bytes (`scenario.schema.json#/$defs/decisionResource`). */
  public record DecisionResource(String relativePath, String sha256) {
    public DecisionResource {
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

  public record OccurrenceId(String processInstanceId, String elementId, long activation) {
    public OccurrenceId {
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      if (activation < 1 || activation > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("activation must be a positive safe wire integer");
      }
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = OperationMessageChannel.class, name = "operationMessage"),
    @JsonSubTypes.Type(value = DirectMessageChannel.class, name = "directMessage"),
    @JsonSubTypes.Type(value = UnspecifiedMessageChannel.class, name = "unspecifiedMessage")
  })
  public sealed interface MessageChannel
      permits OperationMessageChannel, DirectMessageChannel, UnspecifiedMessageChannel {}

  public record OperationMessageChannel(
      String interfaceId, String interfaceOperationId, String messageId) implements MessageChannel {
    public OperationMessageChannel {
      Objects.requireNonNull(interfaceId, "interfaceId");
      Objects.requireNonNull(interfaceOperationId, "interfaceOperationId");
      Objects.requireNonNull(messageId, "messageId");
    }
  }

  public record DirectMessageChannel(String messageId) implements MessageChannel {
    public DirectMessageChannel {
      Objects.requireNonNull(messageId, "messageId");
    }
  }

  /** The field-free channel of a Receive Task without a Message (`CIB-INT-0004`). */
  public record UnspecifiedMessageChannel() implements MessageChannel {}

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = Start.class, name = "start"),
    @JsonSubTypes.Type(value = Command.class, name = "command"),
    @JsonSubTypes.Type(value = Deliver.class, name = "deliver"),
    @JsonSubTypes.Type(value = TimerFire.class, name = "timerFire"),
    @JsonSubTypes.Type(value = EffectResult.class, name = "effectResult")
  })
  public sealed interface Stimulus permits Start, Command, Deliver, TimerFire, EffectResult {
    String commandId();
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Start(
      String commandId,
      String instanceId,
      String startEvent,
      StartTrigger trigger,
      String businessKey,
      List<VariableBinding> variables) implements Stimulus {
    public Start {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(instanceId, "instanceId");
      variables = ScenarioVariableBindings.requireCanonical(variables, "variables");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = NoneStart.class, name = "none"),
    @JsonSubTypes.Type(value = TimerStart.class, name = "timer"),
    @JsonSubTypes.Type(value = MessageStart.class, name = "message"),
    @JsonSubTypes.Type(value = SignalStart.class, name = "signal"),
    @JsonSubTypes.Type(value = ConditionStart.class, name = "condition")
  })
  public sealed interface StartTrigger
      permits NoneStart, TimerStart, MessageStart, SignalStart, ConditionStart {}

  public record NoneStart() implements StartTrigger {}

  public record TimerStart(long logicalTimeMs) implements StartTrigger {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record MessageStart(MessageChannel channel, VariableValue payload) implements StartTrigger {
    public MessageStart {
      Objects.requireNonNull(channel, "channel");
    }
  }

  public record SignalStart(String name, List<VariableBinding> variables) implements StartTrigger {
    public SignalStart {
      Objects.requireNonNull(name, "name");
      variables = List.copyOf(variables);
    }
  }

  public record ConditionStart() implements StartTrigger {}

  public record Command(String commandId, OccurrenceId occurrence, CommandAction action)
      implements Stimulus {
    public Command {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(occurrence, "occurrence");
      Objects.requireNonNull(action, "action");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = CompleteUserTask.class, name = "completeUserTask"),
    @JsonSubTypes.Type(value = RetryIncident.class, name = "retryIncident"),
    @JsonSubTypes.Type(value = CancelIncidentProcess.class, name = "cancelIncidentProcess"),
    @JsonSubTypes.Type(value = SetVariables.class, name = "setVariables"),
    @JsonSubTypes.Type(value = RemoveVariables.class, name = "removeVariables")
  })
  public sealed interface CommandAction
      permits CompleteUserTask, RetryIncident, CancelIncidentProcess, SetVariables, RemoveVariables {}

  public record CompleteUserTask(List<VariableBinding> values) implements CommandAction {
    public CompleteUserTask {
      values = ScenarioVariableBindings.requireCanonical(values, "values");
    }
  }

  /** {@code generation} names the open incident the command resolves; another generation is stale. */
  public record RetryIncident(long generation) implements CommandAction {}

  /** {@code generation} names the open incident the command resolves; another generation is stale. */
  public record CancelIncidentProcess(long generation) implements CommandAction {}

  public record SetVariables(List<VariableBinding> values) implements CommandAction {
    public SetVariables {
      values = ScenarioVariableBindings.requireCanonical(values, "values");
    }
  }

  public record RemoveVariables(List<String> names) implements CommandAction {
    public RemoveVariables {
      names = List.copyOf(names);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record Deliver(
      String commandId,
      OccurrenceId occurrence,
      DeliveryTrigger trigger,
      List<CorrelationMatch> correlation,
      VariableValue payload) implements Stimulus {
    public Deliver {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(occurrence, "occurrence");
      Objects.requireNonNull(trigger, "trigger");
      correlation = correlation == null ? null : List.copyOf(correlation);
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = MessageDelivery.class, name = "message"),
    @JsonSubTypes.Type(value = SignalDelivery.class, name = "signal")
  })
  public sealed interface DeliveryTrigger permits MessageDelivery, SignalDelivery {}

  public record MessageDelivery(MessageChannel channel) implements DeliveryTrigger {
    public MessageDelivery {
      Objects.requireNonNull(channel, "channel");
    }
  }

  public record SignalDelivery(String name) implements DeliveryTrigger {
    public SignalDelivery {
      Objects.requireNonNull(name, "name");
    }
  }

  public record CorrelationMatch(CorrelationTarget target, VariableValue expected) {
    public CorrelationMatch {
      Objects.requireNonNull(target, "target");
      Objects.requireNonNull(expected, "expected");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = ProcessVariableTarget.class, name = "processVariable"),
    @JsonSubTypes.Type(value = LocalVariableTarget.class, name = "localVariable"),
    @JsonSubTypes.Type(value = BusinessKeyTarget.class, name = "businessKey"),
    @JsonSubTypes.Type(value = ProcessInstanceTarget.class, name = "processInstance")
  })
  public sealed interface CorrelationTarget
      permits ProcessVariableTarget, LocalVariableTarget, BusinessKeyTarget, ProcessInstanceTarget {}

  public record ProcessVariableTarget(String name) implements CorrelationTarget {}

  public record LocalVariableTarget(String name) implements CorrelationTarget {}

  public record BusinessKeyTarget() implements CorrelationTarget {}

  public record ProcessInstanceTarget() implements CorrelationTarget {}

  /**
   * `logicalTimeMs` names the deadline fired; `at`, when present, is the later logical time the host woke at (a Timer
   * already due when armed, PC-TIMER-01).
   */
  public record TimerFire(
      String commandId,
      OccurrenceId occurrence,
      long logicalTimeMs,
      @JsonInclude(JsonInclude.Include.NON_NULL) Long at)
      implements Stimulus {
    public TimerFire {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(occurrence, "occurrence");
      if (logicalTimeMs < 0 || logicalTimeMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("logicalTimeMs must be a non-negative safe wire integer");
      }
      if (at != null && (at < 0 || at > MAX_SAFE_WIRE_INTEGER)) {
        throw new IllegalArgumentException("at must be a non-negative safe wire integer");
      }
    }

    public TimerFire(String commandId, OccurrenceId occurrence, long logicalTimeMs) {
      this(commandId, occurrence, logicalTimeMs, null);
    }

    /** The logical time the firing runs at. */
    public long firedAtMs() {
      return at == null ? logicalTimeMs : at;
    }
  }

  public record EffectResult(String commandId, OccurrenceId occurrence, EffectOutcome outcome)
      implements Stimulus {
    public EffectResult {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(occurrence, "occurrence");
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = EffectSuccess.class, name = "success"),
    @JsonSubTypes.Type(value = BusinessFailure.class, name = "businessFailure"),
    @JsonSubTypes.Type(value = TechnicalFailure.class, name = "technicalFailure")
  })
  public sealed interface EffectOutcome permits EffectSuccess, BusinessFailure, TechnicalFailure {}

  public record EffectSuccess(List<VariableBinding> outputs) implements EffectOutcome {
    public EffectSuccess {
      outputs = ScenarioVariableBindings.requireCanonical(outputs, "outputs");
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record BusinessFailure(String code, String message, List<VariableBinding> outputs)
      implements EffectOutcome {
    public BusinessFailure {
      if (code == null || code.isEmpty()) {
        throw new IllegalArgumentException("BPMN Error code must be non-empty");
      }
      if (message != null && message.isEmpty()) {
        throw new IllegalArgumentException("BPMN Error message must be absent or non-empty");
      }
      outputs = ScenarioVariableBindings.requireCanonical(outputs, "outputs");
    }
  }

  public record TechnicalFailure() implements EffectOutcome {}

  // ---------- values ----------

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = StringValue.class, name = "string"),
    @JsonSubTypes.Type(value = BooleanValue.class, name = "boolean"),
    @JsonSubTypes.Type(value = IntegerValue.class, name = "integer"),
    @JsonSubTypes.Type(value = StringListValue.class, name = "stringList"),
    @JsonSubTypes.Type(value = NullValue.class, name = "null"),
    @JsonSubTypes.Type(value = DecimalValue.class, name = "decimal"),
    @JsonSubTypes.Type(value = ListValue.class, name = "list"),
    @JsonSubTypes.Type(value = MapValue.class, name = "map")
  })
  public sealed interface VariableValue
      permits StringValue,
          BooleanValue,
          IntegerValue,
          StringListValue,
          NullValue,
          DecimalValue,
          ListValue,
          MapValue {}

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

  public record IntegerValue(long value) implements VariableValue {
    public IntegerValue {
      ScenarioVariableValueProjection.requireInteger(value);
    }
  }

  public record StringListValue(List<String> value) implements VariableValue {
    public StringListValue {
      value = ScenarioVariableValueProjection.requireStringListValue(value);
    }
  }

  public record NullValue() implements VariableValue {}

  public record DecimalValue(String coefficient, int scale) implements VariableValue {
    public DecimalValue {
      ScenarioVariableValueProjection.requireDecimal(coefficient, scale);
    }
  }

  /** A structured List; its wire shape is checked over the whole root value by the binding. */
  public record ListValue(List<VariableValue> value) implements VariableValue {
    public ListValue {
      value = List.copyOf(value);
    }
  }

  /** A structured Map as entries in Unicode scalar key order, the order the wire schema requires. */
  public record MapValue(List<MapEntry> value) implements VariableValue {
    public MapValue {
      value = List.copyOf(value);
    }
  }

  public record MapEntry(String name, VariableValue value) {
    public MapEntry {
      Objects.requireNonNull(name, "name");
      Objects.requireNonNull(value, "value");
    }
  }

  public record VariableBinding(String name, VariableValue value) {
    public VariableBinding {
      if (name == null || name.isEmpty()) {
        throw new IllegalArgumentException("variable binding name must be non-empty");
      }
      Objects.requireNonNull(value, "value");
      ScenarioVariableValueProjection.requireWireValue(value);
      ScenarioVariableValueProjection.requireBindingSize(name, value);
    }
  }

  // ---------- canonical result ----------

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = DeploymentObservation.class, name = "deployment"),
    @JsonSubTypes.Type(value = CommandObservation.class, name = "command"),
    @JsonSubTypes.Type(value = StateObservation.class, name = "state")
  })
  public sealed interface CanonicalObservation
      permits DeploymentObservation, CommandObservation, StateObservation {}

  public record DeploymentObservation(
      CommandOutcome outcome, @JsonInclude(JsonInclude.Include.NON_NULL) String code)
      implements CanonicalObservation {
    public DeploymentObservation {
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  /** CIB has no stable refusal code, so this runner never writes `code`. */
  public record CommandObservation(
      String commandId, CommandOutcome outcome, @JsonInclude(JsonInclude.Include.NON_NULL) String code)
      implements CanonicalObservation {
    public CommandObservation {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(outcome, "outcome");
    }

    public CommandObservation(String commandId, CommandOutcome outcome) {
      this(commandId, outcome, null);
    }
  }

  public record StateObservation(
      String instanceId,
      ProcessStatus status,
      long logicalTimeMs,
      List<VariableBinding> variables,
      @JsonInclude(JsonInclude.Include.NON_NULL) InstanceFailure failure,
      List<OpenWait> openWaits)
      implements CanonicalObservation {
    public StateObservation {
      Objects.requireNonNull(instanceId, "instanceId");
      Objects.requireNonNull(status, "status");
      if (logicalTimeMs < 0 || logicalTimeMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("logicalTimeMs must be a non-negative safe wire integer");
      }
      variables = List.copyOf(variables);
      openWaits = List.copyOf(openWaits);
    }
  }

  public record InstanceFailure(
      String code, String message, OccurrenceId occurrence, List<RelatedOccurrence> related) {}

  public record RelatedOccurrence(String name, OccurrenceId occurrence) {}

  public record DefinitionRef(
      String key,
      Long version,
      String versionTag,
      String deployment,
      String tenant,
      String sourceSha256) {
    public DefinitionRef {
      Objects.requireNonNull(key, "key");
    }
  }

  /** One open wait; `input` is derived from the detail, so it is written but never read back. */
  @JsonIgnoreProperties(value = "input", allowGetters = true)
  public record OpenWait(OccurrenceId id, DefinitionRef definition, WaitDetail detail) {
    public OpenWait {
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(detail, "detail");
    }

    @JsonProperty("input")
    public InputKind input() {
      return detail.input();
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = UserTaskDetail.class, name = "userTask"),
    @JsonSubTypes.Type(value = MessageDetail.class, name = "message"),
    @JsonSubTypes.Type(value = SignalDetail.class, name = "signal"),
    @JsonSubTypes.Type(value = ConditionalDetail.class, name = "conditional"),
    @JsonSubTypes.Type(value = TimerDetail.class, name = "timer"),
    @JsonSubTypes.Type(value = EffectDetail.class, name = "effect"),
    @JsonSubTypes.Type(value = IncidentDetail.class, name = "incident")
  })
  public sealed interface WaitDetail
      permits UserTaskDetail,
          MessageDetail,
          SignalDetail,
          ConditionalDetail,
          TimerDetail,
          EffectDetail,
          IncidentDetail {
    InputKind input();

    /** The `kind` wire name, the last key of the canonical wait order. */
    String kindName();
  }

  public record FormField(String key, String type) {}

  public record UserTaskDetail(
      String name,
      String assignee,
      List<String> candidateUsers,
      List<String> candidateGroups,
      String formKey,
      List<FormField> formFields,
      String dueDate,
      String followUpDate,
      Long priority,
      List<VariableBinding> inputs)
      implements WaitDetail {
    public UserTaskDetail {
      candidateUsers = List.copyOf(candidateUsers);
      candidateGroups = List.copyOf(candidateGroups);
      formFields = List.copyOf(formFields);
      inputs = List.copyOf(inputs);
    }

    @Override
    public InputKind input() {
      return InputKind.COMMAND;
    }

    @Override
    public String kindName() {
      return "userTask";
    }
  }

  public record MessageDetail(MessageChannel channel, boolean payload, List<String> criteria)
      implements WaitDetail {
    public MessageDetail {
      Objects.requireNonNull(channel, "channel");
      criteria = List.copyOf(criteria);
    }

    @Override
    public InputKind input() {
      return InputKind.DELIVER;
    }

    @Override
    public String kindName() {
      return "message";
    }
  }

  public record SignalDetail(String name, boolean payload) implements WaitDetail {
    @Override
    public InputKind input() {
      return InputKind.DELIVER;
    }

    @Override
    public String kindName() {
      return "signal";
    }
  }

  public record ConditionalDetail(String variableName, List<String> variableEvents, Boolean lastValue)
      implements WaitDetail {
    public ConditionalDetail {
      variableEvents = List.copyOf(variableEvents);
    }

    @Override
    public InputKind input() {
      return null;
    }

    @Override
    public String kindName() {
      return "conditional";
    }
  }

  public record Recurrence(Long periodMs, String cron, Long remaining) {}

  public record TimerDetail(long deadlineMs, Recurrence recurrence) implements WaitDetail {
    public TimerDetail {
      if (deadlineMs < 0 || deadlineMs > MAX_SAFE_WIRE_INTEGER) {
        throw new IllegalArgumentException("deadlineMs must be a non-negative safe wire integer");
      }
    }

    @Override
    public InputKind input() {
      return InputKind.TIMER_FIRE;
    }

    @Override
    public String kindName() {
      return "timer";
    }
  }

  public record SendDescriptor(String recipient, List<VariableBinding> correlation) {}

  /** An effect's descriptor and arguments; `failures` counts the incidents this occurrence has had. */
  public record Effect(
      String protocol,
      String operation,
      List<VariableBinding> arguments,
      long failures,
      SendDescriptor send) {
    public Effect {
      Objects.requireNonNull(protocol, "protocol");
      Objects.requireNonNull(operation, "operation");
      arguments = List.copyOf(arguments);
    }
  }

  public record EffectDetail(
      String protocol,
      String operation,
      List<VariableBinding> arguments,
      long failures,
      SendDescriptor send)
      implements WaitDetail {
    public EffectDetail {
      Objects.requireNonNull(protocol, "protocol");
      Objects.requireNonNull(operation, "operation");
      arguments = List.copyOf(arguments);
    }

    EffectDetail(Effect effect) {
      this(effect.protocol(), effect.operation(), effect.arguments(), effect.failures(), effect.send());
    }

    @Override
    public InputKind input() {
      return InputKind.EFFECT_RESULT;
    }

    @Override
    public String kindName() {
      return "effect";
    }
  }

  public record IncidentDetail(Effect effect, long generation, boolean cancellable)
      implements WaitDetail {
    public IncidentDetail {
      Objects.requireNonNull(effect, "effect");
      if (generation < 1) {
        throw new IllegalArgumentException("incident generation must be positive");
      }
    }

    @Override
    public InputKind input() {
      return InputKind.COMMAND;
    }

    @Override
    public String kindName() {
      return "incident";
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

  public record CanonicalResult(ScenarioOutcome outcome, List<CanonicalObservation> trace) {
    public CanonicalResult {
      Objects.requireNonNull(outcome, "outcome");
      trace = List.copyOf(trace);
    }
  }

  /**
   * The answer for a scenario the runner could not run, a harness failure distinct from every semantic outcome: the
   * runner names it and goes on with the next scenario, because each run deletes its deployment and resets the clock.
   */
  public record ScenarioHarnessFailure(String kind, String scenarioId, String failure) {
    public ScenarioHarnessFailure {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(scenarioId, "scenarioId");
      Objects.requireNonNull(failure, "failure");
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
