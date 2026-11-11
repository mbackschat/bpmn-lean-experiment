package org.bpmnlean.cibseven;

import java.util.List;
import java.util.function.Function;
import org.bpmnlean.cibseven.ScenarioProtocol.BusinessKeyTarget;
import org.bpmnlean.cibseven.ScenarioProtocol.CorrelationMatch;
import org.bpmnlean.cibseven.ScenarioProtocol.LocalVariableTarget;
import org.bpmnlean.cibseven.ScenarioProtocol.ProcessInstanceTarget;
import org.bpmnlean.cibseven.ScenarioProtocol.ProcessVariableTarget;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableValue;
import org.cibseven.bpm.engine.runtime.MessageCorrelationBuilder;

/**
 * The CIB form of the scenario contract's correlation criteria (CIB-EXT-0025): each target becomes the builder call that
 * matches it, and each expected value the Java object this runner stores for that value
 * ({@link ScenarioVariableValueProjection#toEngineValue}). CIB's variable query matches a plain `Long` only against
 * `Long`-typed variables, the cross-type numeric comparison applying only to an abstract `NumberValue`
 * (`QueryVariableValue.java:58-66`), so a criterion compares like with like with the variables this runner wrote; a
 * witness that stores another type is a case CIB answers, not a runner choice (m8-message A3).
 */
final class CibSevenCriteria {

  private CibSevenCriteria() {}

  /**
   * Adds `criteria` to `builder`. `engineInstanceOf` maps a public instance identifier to its engine identifier, null
   * for one the run does not know. A business key or instance criterion whose expected value is not a String, or an
   * instance criterion naming no known instance, has no CIB form and fails as a harness failure.
   */
  static void apply(
      MessageCorrelationBuilder builder, List<CorrelationMatch> criteria, Function<String, String> engineInstanceOf) {
    for (var criterion : criteria) {
      var expected = criterion.expected();
      switch (criterion.target()) {
        case ProcessVariableTarget variable ->
            builder.processInstanceVariableEquals(variable.name(), ScenarioVariableValueProjection.toEngineValue(expected));
        case LocalVariableTarget variable ->
            builder.localVariableEquals(variable.name(), ScenarioVariableValueProjection.toEngineValue(expected));
        case BusinessKeyTarget ignored -> builder.processInstanceBusinessKey(text(expected, "business key"));
        case ProcessInstanceTarget ignored -> {
          var engineId = engineInstanceOf.apply(text(expected, "process instance"));
          if (engineId == null) {
            throw new IllegalStateException("A process instance criterion names no instance of this run");
          }
          builder.processInstanceId(engineId);
        }
      }
    }
  }

  private static String text(VariableValue expected, String target) {
    if (expected instanceof StringValue string) {
      return string.value();
    }
    throw new IllegalStateException("A " + target + " criterion other than a String has no CIB form");
  }
}
