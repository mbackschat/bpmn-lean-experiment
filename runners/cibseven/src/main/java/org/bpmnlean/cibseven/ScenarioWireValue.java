package org.bpmnlean.cibseven;

/** Shared strict wire decoding for the closed scenario-protocol enums. */
interface ScenarioWireValue {
  String wireValue();

  static <E extends Enum<E> & ScenarioWireValue> E parse(Class<E> type, String value) {
    for (var candidate : type.getEnumConstants()) {
      if (candidate.wireValue().equals(value)) {
        return candidate;
      }
    }
    throw new IllegalArgumentException("Unsupported " + type.getSimpleName() + ": " + value);
  }
}
