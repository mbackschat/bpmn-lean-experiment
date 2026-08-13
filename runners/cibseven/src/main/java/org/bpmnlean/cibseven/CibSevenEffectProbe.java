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
  private boolean incidentRetryOpened;

  void beginExecution(CibEffectExecutionSchedule nextSchedule) {
    schedule = nextSchedule;
    invocations = 0;
    mutations = 0;
    incidentRetryOpened = false;
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
    }
    switch (schedule) {
      case PLAIN_SUCCESS -> {}
      case FAIL_AFTER_MUTATION_ONCE -> {
        if (invocations == 1) {
          throw new IllegalStateException(
              "scripted failure after test-local external mutation");
        }
      }
      case INCIDENT_REPORT_RETRY_SUCCESS -> {
        if (!incidentRetryOpened) {
          throw new IllegalStateException("scripted incident technical failure");
        }
      }
      case INCIDENT_REPORT_CANCEL ->
          throw new IllegalStateException("scripted incident technical failure");
    }
  }

  void beginIncidentRetry() {
    if (schedule != CibEffectExecutionSchedule.INCIDENT_REPORT_RETRY_SUCCESS
        || incidentRetryOpened) {
      throw new IllegalStateException("incident retry is not enabled exactly once");
    }
    incidentRetryOpened = true;
  }

  int invocations() {
    return invocations;
  }

  int mutations() {
    return mutations;
  }
}
