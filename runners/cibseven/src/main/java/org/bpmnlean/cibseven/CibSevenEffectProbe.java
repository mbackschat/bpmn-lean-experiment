package org.bpmnlean.cibseven;

import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;

/**
 * Test-only external-effect stand-in behind the exact admitted bean token.
 *
 * <p>The counters model one isolated execution store. Retry state stays in CIB; this probe records
 * only public delegate invocations and one logical external mutation.
 */
final class CibSevenEffectProbe implements JavaDelegate {

  private CibEffectExecutionSchedule schedule = CibEffectExecutionSchedule.PLAIN_SUCCESS;
  private int invocations;
  private int mutations;

  void beginExecution(CibEffectExecutionSchedule nextSchedule) {
    schedule = nextSchedule;
    invocations = 0;
    mutations = 0;
    requireEmpty();
  }

  void requireEmpty() {
    if (invocations != 0 || mutations != 0) {
      throw new IllegalStateException("CIB effect probe store was not empty at execution start");
    }
  }

  @Override
  public void execute(DelegateExecution execution) {
    invocations += 1;
    if (mutations == 0) {
      mutations += 1;
      if (schedule == CibEffectExecutionSchedule.FAIL_AFTER_MUTATION_ONCE) {
        throw new IllegalStateException(
            "scripted failure after test-local external mutation");
      }
    }
  }

  int invocations() {
    return invocations;
  }

  int mutations() {
    return mutations;
  }
}
