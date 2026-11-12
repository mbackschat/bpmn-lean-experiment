package org.bpmnlean.cibseven;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.BusinessFailure;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectOutcome;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectSuccess;
import org.bpmnlean.cibseven.ScenarioProtocol.TechnicalFailure;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.delegate.BpmnError;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;

/**
 * The runner's one external-effect test double: it answers each Service Task invocation with the scenario's own
 * `effectResult` for that element, so the scenario, not a per-variant probe, decides the outcome.
 *
 * <p>An asynchronous Service Task waits for its job; the runner arms the stimulus's outcome and executes the job. A
 * synchronous one runs inside the command that reaches it, before its `effectResult` stimulus comes up, so it
 * consumes the scenario's next unconsumed `effectResult` for its element, and the runner later skips that stimulus
 * with no trace entry (the differential compensates through `CibCaseRelation.SynchronousFinalState` and
 * `SynchronousBoundaryError`). A synchronous technical failure throws an engine exception from the delegate, which
 * rolls the reaching command back as any failing delegate does (`AbstractBpmnActivityBehavior.java:87-109`); the
 * kernel opens an incident instead (CIB-EXT-0049). Outputs become Activity-local variables, so the model's output
 * mappings, not the adapter, decide what reaches the process.
 */
final class CibSevenScriptedEffect {

  /** The bean tokens the retained models bind (`camunda:delegateExpression`); any other token fails to resolve. */
  static final List<String> HANDLER_BEANS =
      List.of("bpmnLeanEffectHandler", "mappedSuccessHandler", "mappedBoundaryErrorHandler");

  /**
   * The source protocol (`implementation`) of an asynchronous effect and the neutral descriptor its wait publishes:
   * the profile's effect binding for this test double (`effectBindings` in the service-task profiles).
   */
  static final String SOURCE_PROTOCOL = "urn:bpmn-lean:effect:probe-v1";
  static final String EFFECT_PROTOCOL = "urn:bpmn-lean:effect-protocol:activity-v1";
  static final String EFFECT_OPERATION = "urn:bpmn-lean:effect-operation:probe-v1";

  private CibEffectExecutionSchedule schedule = CibEffectExecutionSchedule.PLAIN_SUCCESS;
  private List<EffectResult> pending = new ArrayList<>();
  private final List<String> consumed = new ArrayList<>();
  private final List<MappingExecutionSnapshot> mappings = new ArrayList<>();
  private EffectOutcome armed;
  private String armedElement;
  private String currentCommandId;
  private int invocations;
  private int mutations;
  private int failedOnce;

  void beginScenario(CibEffectExecutionSchedule nextSchedule, List<EffectResult> results) {
    schedule = nextSchedule;
    pending = new ArrayList<>(results);
    consumed.clear();
    mappings.clear();
    armed = null;
    currentCommandId = null;
    invocations = 0;
    mutations = 0;
    failedOnce = 0;
  }

  void beginCommand(String commandId) {
    currentCommandId = commandId;
  }

  /**
   * The outcome the job's own Service Task applies once it succeeds in applying it; cleared then or by
   * {@link #disarm()}. A Service Task the same job reaches synchronously after it answers from the scenario like any
   * synchronous one, so the armed outcome never leaks to another element.
   */
  void arm(String elementId, EffectOutcome outcome) {
    armedElement = Objects.requireNonNull(elementId, "elementId");
    armed = Objects.requireNonNull(outcome, "outcome");
  }

  void disarm() {
    armed = null;
    armedElement = null;
  }

  boolean consumedSynchronously(String commandId) {
    return consumed.contains(commandId);
  }

  /**
   * A Script Task CIB evaluated inside the current command, recorded as an execution of the handler
   * {@code script:<element>} with no arguments or patch: the differential needs only the command it ran in.
   */
  void scriptEvaluated(String elementId) {
    var handler = "script:" + elementId;
    mappings.add(
        new MappingExecutionSnapshot(
            Objects.requireNonNull(currentCommandId, "currentCommandId"),
            handler,
            List.of(),
            List.of(),
            mappings.stream().filter(mapping -> mapping.handler().equals(handler)).count() + 1));
  }

  List<MappingExecutionSnapshot> mappingExecutions() {
    return List.copyOf(mappings);
  }

  int invocations() {
    return invocations;
  }

  int mutations() {
    return mutations;
  }

  /** One delegate instance per bean token, so a mapping snapshot names the token the model bound. */
  JavaDelegate delegate(String handler) {
    return execution -> execute(handler, execution);
  }

  private void execute(String handler, DelegateExecution execution) {
    if (armed != null && execution.getCurrentActivityId().equals(armedElement)) {
      invocations += 1;
      mutations = 1;
      if (schedule == CibEffectExecutionSchedule.FAIL_AFTER_MUTATION_ONCE && failedOnce == 0) {
        failedOnce = 1;
        throw new IllegalStateException("scripted failure after test-local external mutation");
      }
      apply(armed, execution);
      disarm();
      return;
    }
    var result = consumeNext(execution.getCurrentActivityId());
    var arguments = localBindings(execution.getVariablesLocal());
    apply(result.outcome(), execution, handler, arguments);
  }

  private EffectResult consumeNext(String elementId) {
    for (var index = 0; index < pending.size(); index++) {
      var candidate = pending.get(index);
      if (candidate.occurrence().elementId().equals(elementId)
          && !consumed.contains(candidate.commandId())) {
        consumed.add(candidate.commandId());
        return candidate;
      }
    }
    throw new IllegalStateException(
        "Synchronous Service Task " + elementId + " has no scenario effectResult to answer it");
  }

  private void apply(
      EffectOutcome outcome,
      DelegateExecution execution,
      String handler,
      List<VariableBinding> arguments) {
    var outputs =
        switch (outcome) {
          case EffectSuccess success -> success.outputs();
          case BusinessFailure failure -> failure.outputs();
          case TechnicalFailure ignored ->
              throw new ProcessEngineException("scripted synchronous technical failure");
        };
    mappings.add(
        new MappingExecutionSnapshot(
            Objects.requireNonNull(currentCommandId, "currentCommandId"),
            handler,
            arguments,
            outputs,
            mappings.stream().filter(mapping -> mapping.handler().equals(handler)).count() + 1));
    apply(outcome, execution);
  }

  private static void apply(EffectOutcome outcome, DelegateExecution execution) {
    switch (outcome) {
      case EffectSuccess success -> writeLocal(execution, success.outputs());
      case BusinessFailure failure -> {
        writeLocal(execution, failure.outputs());
        throw failure.message() == null
            ? new BpmnError(failure.code())
            : new BpmnError(failure.code(), failure.message());
      }
      case TechnicalFailure ignored -> throw new IllegalStateException("scripted technical failure");
    }
  }

  private static void writeLocal(DelegateExecution execution, List<VariableBinding> outputs) {
    for (var output : outputs) {
      execution.setVariableLocal(
          output.name(), ScenarioVariableValueProjection.toEngineValue(output.value()));
    }
  }

  private static List<VariableBinding> localBindings(Map<String, Object> locals) {
    return locals.entrySet().stream()
        .map(entry -> ScenarioVariableValueProjection.project(
            new ProcessVariableSnapshot(entry.getKey(), entry.getValue())))
        .sorted(Comparator.comparing(VariableBinding::name, WireStrings::compare))
        .toList();
  }
}
