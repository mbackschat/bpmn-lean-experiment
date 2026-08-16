package org.bpmnlean.cibseven;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.IntegerValue;
import org.bpmnlean.cibseven.ScenarioProtocol.NullValue;
import org.bpmnlean.cibseven.ScenarioProtocol.StringListValue;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableValue;

/** Owns exact CIB host-carrier admission and the closed semantic value projection. */
final class ScenarioVariableValueProjection {

  private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
  private static final int MAX_LIST_ITEMS = 32;
  private static final int MAX_MEMBER_BYTES = 1_024;
  private static final int MAX_VALUE_BYTES = 16_384;
  private static final int MAX_BINDING_BYTES = 20_480;
  private static final int MAX_PATCH_BYTES = 65_536;

  private ScenarioVariableValueProjection() {}

  static void requireInteger(long value) {
    if (value < 0 || value > MAX_SAFE_INTEGER) {
      throw new IllegalArgumentException("integer must be a non-negative safe wire integer");
    }
  }

  static List<String> requireStringList(List<String> value) {
    if (value == null || value.size() > MAX_LIST_ITEMS) {
      throw new IllegalArgumentException("stringList has at most 32 members");
    }
    var detached = List.copyOf(value);
    for (var member : detached) {
      requireScalar(member);
      if (member.getBytes(StandardCharsets.UTF_8).length > MAX_MEMBER_BYTES) {
        throw new IllegalArgumentException("stringList member exceeds 1024 UTF-8 bytes");
      }
    }
    return detached;
  }

  static List<String> requireStringListValue(List<String> value) {
    var detached = requireStringList(value);
    requireByteCeiling(
        wireValueShape("stringList", detached),
        MAX_VALUE_BYTES,
        "tagged value exceeds 16384 UTF-8 bytes");
    return detached;
  }

  static void requireWireValue(VariableValue value) {
    switch (value) {
      case IntegerValue integerValue -> requireInteger(integerValue.value());
      case StringListValue listValue -> requireStringList(listValue.value());
      case StringValue ignored -> {}
      case BooleanValue ignored -> {}
      case NullValue ignored -> {}
    }
    requireByteCeiling(
        wireValueShape(value),
        MAX_VALUE_BYTES,
        "tagged value exceeds 16384 UTF-8 bytes");
  }

  static void requireBindingSize(String name, VariableValue value) {
    requireByteCeiling(
        Map.of("name", name, "value", wireValueShape(value)),
        MAX_BINDING_BYTES,
        "binding exceeds 20480 UTF-8 bytes");
  }

  static void requirePatchSize(List<VariableBinding> bindings, String fieldName) {
    var wireBindings = bindings.stream()
        .map(binding -> Map.of(
            "name", binding.name(),
            "value", wireValueShape(binding.value())))
        .toList();
    requireByteCeiling(
        wireBindings,
        MAX_PATCH_BYTES,
        fieldName + " patch exceeds 65536 UTF-8 bytes");
  }

  static Object toEngineValue(VariableValue value) {
    return switch (value) {
      case StringValue stringValue -> stringValue.value();
      case BooleanValue booleanValue -> booleanValue.value();
      case IntegerValue integerValue -> Long.valueOf(integerValue.value());
      case StringListValue listValue -> new ArrayList<>(listValue.value());
      case NullValue ignored -> null;
    };
  }

  static Object requireHostValue(Object value) {
    return switch (value) {
      case null -> null;
      case String stringValue -> stringValue;
      case Boolean booleanValue -> booleanValue;
      case Long longValue -> {
        requireInteger(longValue);
        yield longValue;
      }
      case Integer integerValue -> {
        requireInteger(integerValue.longValue());
        yield integerValue;
      }
      case List<?> list -> requireHostStringList(list);
      default -> throw new IllegalArgumentException(
          "Process variable snapshot has an unsupported host carrier");
    };
  }

  static VariableBinding project(ProcessVariableSnapshot variable) {
    var value = switch (variable.value()) {
      case null -> new NullValue();
      case String stringValue -> new StringValue(stringValue);
      case Boolean booleanValue -> new BooleanValue(booleanValue);
      case Long longValue -> new IntegerValue(longValue);
      case Integer integerValue -> new IntegerValue(integerValue.longValue());
      case List<?> list -> new StringListValue(requireHostStringList(list));
      default -> throw new IllegalArgumentException(
          "Process variable snapshot has an unsupported host carrier");
    };
    return new VariableBinding(variable.name(), value);
  }

  private static List<String> requireHostStringList(List<?> value) {
    var strings = new ArrayList<String>(value.size());
    for (var member : value) {
      if (!(member instanceof String stringMember)) {
        throw new IllegalArgumentException("Process variable string list is heterogeneous");
      }
      strings.add(stringMember);
    }
    return requireStringList(strings);
  }

  private static void requireScalar(String value) {
    for (var index = 0; index < value.length(); index++) {
      var unit = value.charAt(index);
      if (Character.isHighSurrogate(unit)) {
        if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
          throw new IllegalArgumentException("stringList member contains an unpaired surrogate");
        }
        index++;
      } else if (Character.isLowSurrogate(unit)) {
        throw new IllegalArgumentException("stringList member contains an unpaired surrogate");
      }
    }
  }

  private static Map<String, Object> wireValueShape(VariableValue value) {
    return switch (value) {
      case StringValue stringValue -> wireValueShape("string", stringValue.value());
      case BooleanValue booleanValue -> wireValueShape("boolean", booleanValue.value());
      case IntegerValue integerValue -> wireValueShape("integer", integerValue.value());
      case StringListValue listValue -> wireValueShape("stringList", listValue.value());
      case NullValue ignored -> Map.of("kind", "null");
    };
  }

  private static Map<String, Object> wireValueShape(String kind, Object value) {
    return Map.of("kind", kind, "value", value);
  }

  private static void requireByteCeiling(Object value, int ceiling, String message) {
    if (ScenarioJson.canonicalByteLength(value) > ceiling) {
      throw new IllegalArgumentException(message);
    }
  }
}
