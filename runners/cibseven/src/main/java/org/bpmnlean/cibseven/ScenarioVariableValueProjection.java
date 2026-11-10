package org.bpmnlean.cibseven;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.DecimalValue;
import org.bpmnlean.cibseven.ScenarioProtocol.IntegerValue;
import org.bpmnlean.cibseven.ScenarioProtocol.ListValue;
import org.bpmnlean.cibseven.ScenarioProtocol.MapEntry;
import org.bpmnlean.cibseven.ScenarioProtocol.MapValue;
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
  private static final int MAX_DECIMAL_SCALE = 6;
  private static final Pattern DECIMAL_COEFFICIENT = Pattern.compile("0|-?[1-9][0-9]*");

  private ScenarioVariableValueProjection() {}

  static void requireInteger(long value) {
    if (value < 0 || value > MAX_SAFE_INTEGER) {
      throw new IllegalArgumentException("integer must be a non-negative safe wire integer");
    }
  }

  /** A canonical Decimal: signed 64-bit coefficient, scale 0..6, no trailing zero at a positive scale, zero at scale 0. */
  static void requireDecimal(String coefficient, int scale) {
    if (coefficient == null || !DECIMAL_COEFFICIENT.matcher(coefficient).matches()) {
      throw new IllegalArgumentException("decimal coefficient is not a canonical integer spelling");
    }
    long unscaled;
    try {
      unscaled = Long.parseLong(coefficient);
    } catch (NumberFormatException exception) {
      throw new IllegalArgumentException("decimal coefficient is outside the signed 64-bit range", exception);
    }
    requireCanonicalDecimal(unscaled, scale);
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

  /**
   * The wire shape the scenario and result schemas state: member counts, String members, Map key order, safe Integers.
   * The portable domain's depth, node and byte bounds are the kernel's ingress predicate, not the wire's
   * (DATA-SEMANTICS-SPEC "Values"), so a schema-valid value beyond them reaches CIB as a start or completion value and
   * is observed as CIB stores it; the structured-value-bounds schedules separate exactly those values.
   */
  static void requireWireValue(VariableValue value) {
    switch (value) {
      case IntegerValue integerValue -> requireInteger(integerValue.value());
      case StringListValue listValue -> requireStringList(listValue.value());
      case ListValue ignored -> requireStructuredShape(value);
      case MapValue ignored -> requireStructuredShape(value);
      case DecimalValue ignored -> {}
      case StringValue ignored -> {}
      case BooleanValue ignored -> {}
      case NullValue ignored -> {}
    }
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
      // The carriers CIB-CFG-0009 names: BigDecimal at the canonical scale, ArrayList, LinkedHashMap in wire key
      // order, and every nested Integer as Long through the IntegerValue arm.
      case DecimalValue decimalValue ->
          BigDecimal.valueOf(Long.parseLong(decimalValue.coefficient()), decimalValue.scale());
      case ListValue listValue -> {
        var items = new ArrayList<Object>(listValue.value().size());
        listValue.value().forEach(item -> items.add(toEngineValue(item)));
        yield items;
      }
      case MapValue mapValue -> {
        var entries = new LinkedHashMap<String, Object>();
        mapValue.value().forEach(entry -> entries.put(entry.name(), toEngineValue(entry.value())));
        yield entries;
      }
    };
  }

  static Object requireHostValue(Object value) {
    requireWireValue(projectHost(value, true));
    return value;
  }

  static VariableBinding project(ProcessVariableSnapshot variable) {
    return new VariableBinding(variable.name(), projectHost(variable.value(), true));
  }

  /**
   * The wire value of an engine value. A root List of Strings, the empty List included, is the legacy `stringList`
   * every retained schedule before structured values observes; the engine stores it and a structured `list` of
   * Strings as the same ArrayList, so the runner cannot tell them apart and a schedule that must separate them
   * observes a Boolean-reduced form instead.
   */
  private static VariableValue projectHost(Object value, boolean root) {
    return switch (value) {
      case null -> new NullValue();
      case String stringValue -> new StringValue(stringValue);
      case Boolean booleanValue -> new BooleanValue(booleanValue);
      case Long longValue -> new IntegerValue(longValue);
      case Integer integerValue -> new IntegerValue(integerValue.longValue());
      case BigDecimal decimalValue -> projectDecimal(decimalValue);
      case List<?> list when root && list.stream().allMatch(String.class::isInstance) ->
          new StringListValue(requireHostStringList(list));
      case List<?> list -> new ListValue(list.stream().map(item -> projectHost(item, false)).toList());
      case Map<?, ?> map -> projectMap(map);
      default -> throw new IllegalArgumentException(
          "Process variable snapshot has an unsupported host carrier");
    };
  }

  /**
   * A BigDecimal only in canonical form. Stripping trailing zeros would erase the scale that JUEL equality sees
   * (`BigDecimal.equals`, EXPRESSION-SEMANTICS-SPEC "Evaluation"), so a non-canonical value is outside the domain
   * rather than renormalized as the CIB-CFG-0009 calibration probe does.
   */
  private static DecimalValue projectDecimal(BigDecimal value) {
    if (value.unscaledValue().bitLength() > Long.SIZE - 1) {
      throw new IllegalArgumentException("decimal coefficient is outside the signed 64-bit range");
    }
    var coefficient = value.unscaledValue().longValueExact();
    requireCanonicalDecimal(coefficient, value.scale());
    return new DecimalValue(Long.toString(coefficient), value.scale());
  }

  private static MapValue projectMap(Map<?, ?> map) {
    var entries = new ArrayList<MapEntry>(map.size());
    for (var entry : map.entrySet()) {
      if (!(entry.getKey() instanceof String name)) {
        throw new IllegalArgumentException("Process variable Map has a non-String key");
      }
      entries.add(new MapEntry(name, projectHost(entry.getValue(), false)));
    }
    entries.sort(Comparator.comparing(MapEntry::name, WireStrings::compare));
    return new MapValue(entries);
  }

  private static void requireCanonicalDecimal(long coefficient, int scale) {
    if (scale < 0 || scale > MAX_DECIMAL_SCALE) {
      throw new IllegalArgumentException("decimal scale is outside 0..6");
    }
    if (coefficient == 0 ? scale != 0 : scale > 0 && coefficient % 10 == 0) {
      throw new IllegalArgumentException("decimal is not canonical");
    }
  }

  /** A List or Map tree's wire shape: members per container, nested Strings and Map key order, at every depth. */
  private static void requireStructuredShape(VariableValue value) {
    switch (value) {
      case ListValue listValue -> {
        requireMembers(listValue.value().size());
        listValue.value().forEach(ScenarioVariableValueProjection::requireStructuredShape);
      }
      case MapValue mapValue -> {
        requireMembers(mapValue.value().size());
        String previous = null;
        for (var entry : mapValue.value()) {
          requireMember(entry.name());
          if (previous != null && WireStrings.compare(previous, entry.name()) >= 0) {
            throw new IllegalArgumentException("Map keys must be unique and in Unicode scalar order");
          }
          previous = entry.name();
          requireStructuredShape(entry.value());
        }
      }
      case StringValue stringValue -> requireMember(stringValue.value());
      case StringListValue ignored -> throw new IllegalArgumentException(
          "a legacy stringList is never nested in a structured value");
      case IntegerValue ignored -> {}
      case DecimalValue ignored -> {}
      case BooleanValue ignored -> {}
      case NullValue ignored -> {}
    }
  }

  private static void requireMembers(int members) {
    if (members > MAX_LIST_ITEMS) {
      throw new IllegalArgumentException("structured container has at most 32 members");
    }
  }

  private static void requireMember(String value) {
    requireScalar(value);
    if (value.getBytes(StandardCharsets.UTF_8).length > MAX_MEMBER_BYTES) {
      throw new IllegalArgumentException("structured String exceeds 1024 UTF-8 bytes");
    }
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
          throw new IllegalArgumentException("wire String member contains an unpaired surrogate");
        }
        index++;
      } else if (Character.isLowSurrogate(unit)) {
        throw new IllegalArgumentException("wire String member contains an unpaired surrogate");
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
      case DecimalValue decimalValue -> Map.of(
          "kind", "decimal", "coefficient", decimalValue.coefficient(), "scale", decimalValue.scale());
      case ListValue listValue -> wireValueShape(
          "list", listValue.value().stream().map(ScenarioVariableValueProjection::wireValueShape).toList());
      case MapValue mapValue -> wireValueShape("map", mapValue.value().stream()
          .map(entry -> Map.of("name", entry.name(), "value", wireValueShape(entry.value())))
          .toList());
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
