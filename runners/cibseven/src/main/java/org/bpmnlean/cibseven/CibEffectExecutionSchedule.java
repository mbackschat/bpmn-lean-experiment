package org.bpmnlean.cibseven;

/** Explicit harness schedule for the bounded Service Task effect probe. */
public enum CibEffectExecutionSchedule {
  PLAIN_SUCCESS("plainSuccess"),
  FAIL_AFTER_MUTATION_ONCE("failAfterMutationOnce");

  private final String wireValue;

  CibEffectExecutionSchedule(String wireValue) {
    this.wireValue = wireValue;
  }

  public String wireValue() {
    return wireValue;
  }

  public static CibEffectExecutionSchedule fromWireValue(String value) {
    for (var candidate : values()) {
      if (candidate.wireValue.equals(value)) {
        return candidate;
      }
    }
    throw new IllegalArgumentException("Unsupported CIB effect schedule: " + value);
  }
}
