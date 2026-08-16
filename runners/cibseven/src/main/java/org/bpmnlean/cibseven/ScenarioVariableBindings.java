package org.bpmnlean.cibseven;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;

/** Validates and projects the scenario protocol's closed canonical variable-binding lists. */
final class ScenarioVariableBindings {

  private ScenarioVariableBindings() {}

  static List<VariableBinding> requireCanonical(
      List<VariableBinding> bindings, String fieldName) {
    Objects.requireNonNull(bindings, fieldName);
    var immutable = List.copyOf(bindings);
    for (var index = 1; index < immutable.size(); index++) {
      if (WireStrings.compare(
              immutable.get(index - 1).name(), immutable.get(index).name())
          >= 0) {
        throw new IllegalArgumentException(
            fieldName + " names must be unique and canonically ordered");
      }
    }
    ScenarioVariableValueProjection.requirePatchSize(immutable, fieldName);
    return immutable;
  }

  static Map<String, Object> toEngineMap(Iterable<VariableBinding> bindings) {
    var variables = new LinkedHashMap<String, Object>();
    for (var binding : bindings) {
      variables.put(
          binding.name(), ScenarioVariableValueProjection.toEngineValue(binding.value()));
    }
    return variables;
  }
}
