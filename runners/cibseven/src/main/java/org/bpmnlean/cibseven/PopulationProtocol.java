package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.List;
import java.util.Objects;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.CleanupProjection;
import org.bpmnlean.cibseven.ScenarioProtocol.BpmnResource;
import org.bpmnlean.cibseven.ScenarioProtocol.CanonicalObservation;
import org.bpmnlean.cibseven.ScenarioProtocol.CommandOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.CorrelationMatch;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.OccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.Provenance;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalRef;
import org.bpmnlean.cibseven.ScenarioProtocol.Stimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableValue;

/**
 * Transport types of the population scenario (`contracts/schemas/engine-population-scenario.schema.json`) and of the
 * CIB population result this runner answers it with.
 *
 * <p>The result keeps the shapes of the kernel's population result (`engine-population-result.schema.json`) within
 * CIB's observation boundary (population contract §8): every deployment's outcome and versions, each command's outcome
 * with the delivery target or the instances it started, the instance inputs that did not commit, and every root
 * instance's final state. CIB has no stable refusal codes, so none is written; it delivers every receiver of one
 * command in one transaction (M8-LIM-G), so a command has one outcome and its receivers' deliveries show only in the
 * instances' states.
 */
public final class PopulationProtocol {

  public static final String POPULATION_SCENARIO_KIND = "populationScenario";
  public static final String POPULATION_RESULT_KIND = "cibSevenPopulationResult";

  private PopulationProtocol() {}

  // ---------- scenario ----------

  public record PopulationScenario(
      String kind,
      String id,
      String profile,
      List<PopulationDefinition> definitions,
      List<PopulationStep> steps,
      Provenance provenance) {
    public PopulationScenario {
      if (!POPULATION_SCENARIO_KIND.equals(kind)) {
        throw new IllegalArgumentException("population scenario kind is " + POPULATION_SCENARIO_KIND);
      }
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(profile, "profile");
      definitions = List.copyOf(definitions);
      steps = List.copyOf(steps);
      Objects.requireNonNull(provenance, "provenance");
      if (definitions.isEmpty() || steps.isEmpty()) {
        throw new IllegalArgumentException("a population scenario declares definitions and steps");
      }
    }
  }

  public record PopulationDefinition(String definitionRef, BpmnResource bpmn) {
    public PopulationDefinition {
      Objects.requireNonNull(definitionRef, "definitionRef");
      Objects.requireNonNull(bpmn, "bpmn");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = InstanceStep.class, name = "instance"),
    @JsonSubTypes.Type(value = DeployStep.class, name = "deploy"),
    @JsonSubTypes.Type(value = PublishStep.class, name = "publish"),
    @JsonSubTypes.Type(value = BroadcastStep.class, name = "broadcast"),
    @JsonSubTypes.Type(value = EvaluateConditionsStep.class, name = "evaluateConditions"),
    @JsonSubTypes.Type(value = TimerStartStep.class, name = "timerStart")
  })
  public sealed interface PopulationStep
      permits InstanceStep, DeployStep, PublishStep, BroadcastStep, EvaluateConditionsStep, TimerStartStep {
    /** The step's logical time; absent, it inherits the previous step's (0 for the first). */
    Long at();
  }

  /** A population command: a step answered with an ordinal, unlike an instance input. */
  public sealed interface PopulationCommand permits PublishStep, BroadcastStep, EvaluateConditionsStep, TimerStartStep {
    String commandId();
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record InstanceStep(String definitionRef, String instanceId, Stimulus stimulus, Long at)
      implements PopulationStep {
    public InstanceStep {
      Objects.requireNonNull(definitionRef, "definitionRef");
      Objects.requireNonNull(instanceId, "instanceId");
      Objects.requireNonNull(stimulus, "stimulus");
      ScenarioProtocol.requireLogicalTime(at);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record DeployStep(String definitionRef, Long at) implements PopulationStep {
    public DeployStep {
      Objects.requireNonNull(definitionRef, "definitionRef");
      ScenarioProtocol.requireLogicalTime(at);
    }
  }

  /** The current deployment of a process key, or one deployment by its deploy ordinal: exactly one of them. */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record DefinitionSelector(String processKey, Long deploymentId) {
    public DefinitionSelector {
      if ((processKey == null) == (deploymentId == null)) {
        throw new IllegalArgumentException("a definition selector names a process key or a deployment");
      }
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PublishAddress(DefinitionSelector definition, MessageChannel channel, String name) {
    public PublishAddress {
      if ((channel == null) == (name == null)) {
        throw new IllegalArgumentException("a publication is addressed by a channel or a name");
      }
    }
  }

  public enum PublishMode implements ScenarioWireValue {
    ANY("any"),
    EXECUTIONS_ONLY("executionsOnly"),
    START_ONLY("startOnly");

    private final String wireValue;

    PublishMode(String wireValue) {
      this.wireValue = wireValue;
    }

    @Override
    @JsonValue
    public String wireValue() {
      return wireValue;
    }

    @JsonCreator
    public static PublishMode fromWireValue(String value) {
      return ScenarioWireValue.parse(PublishMode.class, value);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PublishStep(
      String commandId,
      PublishAddress address,
      List<CorrelationMatch> criteria,
      VariableValue payload,
      List<VariableBinding> variables,
      String businessKey,
      PublishMode mode,
      Long at) implements PopulationStep, PopulationCommand {
    public PublishStep {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(address, "address");
      criteria = List.copyOf(criteria);
      variables = ScenarioVariableBindings.requireCanonical(variables, "variables");
      Objects.requireNonNull(mode, "mode");
      ScenarioProtocol.requireLogicalTime(at);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record BroadcastAddress(String name, SignalRef signalRef) {
    public BroadcastAddress {
      ScenarioProtocol.requireOneSignalAddress(name, signalRef);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record BroadcastStep(
      String commandId, BroadcastAddress address, List<VariableBinding> variables, List<Receiver> order, Long at)
      implements PopulationStep, PopulationCommand {
    public BroadcastStep {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(address, "address");
      variables = ScenarioVariableBindings.requireCanonical(variables, "variables");
      order = order == null ? null : List.copyOf(order);
      ScenarioProtocol.requireLogicalTime(at);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record EvaluateConditionsStep(
      String commandId,
      DefinitionSelector definition,
      List<VariableBinding> variables,
      String businessKey,
      List<Receiver> order,
      Long at) implements PopulationStep, PopulationCommand {
    public EvaluateConditionsStep {
      Objects.requireNonNull(commandId, "commandId");
      variables = ScenarioVariableBindings.requireCanonical(variables, "variables");
      order = order == null ? null : List.copyOf(order);
      ScenarioProtocol.requireLogicalTime(at);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record TimerStartStep(String commandId, long deploymentId, String startEvent, long dueMs, Long at)
      implements PopulationStep, PopulationCommand {
    public TimerStartStep {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(startEvent, "startEvent");
      if (deploymentId < 1 || dueMs < 0) {
        throw new IllegalArgumentException("a Timer start names a positive deployment and a non-negative due time");
      }
      ScenarioProtocol.requireLogicalTime(at);
    }
  }

  /**
   * One receiver of an explicit discovery order. CIB delivers in the hash order of its subscriptions
   * (`EventSubscriptionManager.java:94-105`) and takes no order, so the runner reads it and cannot follow it; a witness
   * compared with CIB depends on no order (population contract §6).
   */
  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = OccurrenceReceiver.class, name = "occurrence"),
    @JsonSubTypes.Type(value = StartReceiver.class, name = "start")
  })
  public sealed interface Receiver permits OccurrenceReceiver, StartReceiver {}

  public record OccurrenceReceiver(OccurrenceId occurrence) implements Receiver {
    public OccurrenceReceiver {
      Objects.requireNonNull(occurrence, "occurrence");
    }
  }

  public record StartReceiver(long deploymentId, String startEvent) implements Receiver {
    public StartReceiver {
      Objects.requireNonNull(startEvent, "startEvent");
    }
  }

  // ---------- result ----------

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PopulationResult(
      String kind,
      String scenarioId,
      List<DeploymentEntry> deployments,
      List<StepEntry> steps,
      List<InputFailure> inputFailures,
      List<CanonicalObservation> processStates,
      PopulationDiagnostics diagnostics) {
    public PopulationResult {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(scenarioId, "scenarioId");
      deployments = List.copyOf(deployments);
      steps = List.copyOf(steps);
      inputFailures = inputFailures == null || inputFailures.isEmpty() ? null : List.copyOf(inputFailures);
      processStates = List.copyOf(processStates);
    }
  }

  public record DeploymentEntry(long deploymentId, String definitionRef, List<VersionEntry> versions,
      DeploymentOutcome outcome) {
    public DeploymentEntry {
      Objects.requireNonNull(definitionRef, "definitionRef");
      versions = List.copyOf(versions);
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  public record VersionEntry(String key, long version) {}

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = Deployed.class, name = "deployed"),
    @JsonSubTypes.Type(value = DeploymentRefused.class, name = "deploymentRefused")
  })
  public sealed interface DeploymentOutcome permits Deployed, DeploymentRefused {}

  public record Deployed() implements DeploymentOutcome {}

  /** CIB refused the deployment; it names no stable code. */
  public record DeploymentRefused() implements DeploymentOutcome {}

  /**
   * One command's answer: its outcome and, when CIB names one, how it resolved. A rolled-back correlation CIB refused
   * for finding no or several candidates carries `noMatch` or `ambiguous`.
   */
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record StepEntry(String commandId, long ordinal, long at, CommandOutcome outcome, Resolution resolution) {
    public StepEntry {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = Committed.class, name = "committed"),
    @JsonSubTypes.Type(value = FanOut.class, name = "fanOut"),
    @JsonSubTypes.Type(value = NoMatch.class, name = "noMatch"),
    @JsonSubTypes.Type(value = Ambiguous.class, name = "ambiguous")
  })
  public sealed interface Resolution permits Committed, FanOut, NoMatch, Ambiguous {}

  /** The waiting occurrence a publication was delivered to. */
  public record Committed(OccurrenceId target) implements Resolution {
    public Committed {
      Objects.requireNonNull(target, "target");
    }
  }

  /** The instances a command started; the receivers it delivered to show in their instances' states. */
  public record FanOut(List<FanOutEntry> entries) implements Resolution {
    public FanOut {
      entries = List.copyOf(entries);
    }
  }

  public record NoMatch() implements Resolution {}

  public record Ambiguous() implements Resolution {}

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
  @JsonSubTypes({@JsonSubTypes.Type(value = Started.class, name = "started")})
  public sealed interface FanOutEntry permits Started {}

  /** An instance a command started, under its derived identity (M8-OP-A). */
  public record Started(String instanceId, long deploymentId, long version, String startEvent) implements FanOutEntry {
    public Started {
      Objects.requireNonNull(instanceId, "instanceId");
      Objects.requireNonNull(startEvent, "startEvent");
    }
  }

  /** An instance input that did not commit. */
  public record InputFailure(String commandId, CommandOutcome outcome) {
    public InputFailure {
      Objects.requireNonNull(commandId, "commandId");
      Objects.requireNonNull(outcome, "outcome");
    }
  }

  public record PopulationDiagnostics(String engineVersion, String databaseVersion, CleanupProjection cleanup) {}
}
