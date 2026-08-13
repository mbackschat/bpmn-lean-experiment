package org.bpmnlean.cibseven;

import static org.junit.Assert.assertThrows;

import java.util.List;
import org.bpmnlean.cibseven.CibSevenIncidentCancellationCommandExecutor.CancellationCandidate;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.FailedJobIncident;
import org.bpmnlean.cibseven.CibSevenIncidentProtocol.IncidentJob;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectOccurrenceId;
import org.junit.Test;

/** Locks the exact retries-zero, self-rooted public job/incident partner before deletion. */
public final class CibSevenIncidentCancellationCommandExecutorTest {

  @Test
  public void acceptsOneExactRootPartner() {
    CibSevenIncidentCancellationCommandExecutor.requireExactCandidate(
        candidate("raw-root", "raw-root", List.of(job(0, false))));
  }

  @Test
  public void refusesWrongRootDuplicatePartnerAndNonterminalJob() {
    assertThrows(
        IllegalStateException.class,
        () -> CibSevenIncidentCancellationCommandExecutor.requireExactCandidate(
            candidate("raw-child", "raw-root", List.of(job(0, false)))));
    assertThrows(
        IllegalStateException.class,
        () -> CibSevenIncidentCancellationCommandExecutor.requireExactCandidate(
            candidate("raw-root", "raw-root", List.of(job(0, false), job(0, false)))));
    assertThrows(
        IllegalStateException.class,
        () -> CibSevenIncidentCancellationCommandExecutor.requireExactCandidate(
            candidate("raw-root", "raw-root", List.of(job(1, false)))));
    assertThrows(
        IllegalStateException.class,
        () -> CibSevenIncidentCancellationCommandExecutor.requireExactCandidate(
            candidate("raw-root", "raw-root", List.of(job(0, true)))));
  }

  @Test
  public void refusesMismatchedOrNonSelfRootedIncidentPartner() {
    assertThrows(
        IllegalArgumentException.class,
        () -> new IncidentJob(
            "job-1",
            0,
            false,
            false,
            "raw-root",
            "ServiceTask_Record",
            incident("job-2", "incident-1", "incident-1")));
    assertThrows(
        IllegalArgumentException.class,
        () -> new IncidentJob(
            "job-1",
            0,
            false,
            false,
            "raw-root",
            "ServiceTask_Record",
            incident("job-1", "cause-2", "incident-1")));
  }

  private static CancellationCandidate candidate(
      String rawProcessId, String rawRootId, List<IncidentJob> jobs) {
    return new CancellationCandidate(
        rawProcessId,
        rawRootId,
        new EffectOccurrenceId("Instance_1", "ServiceTask_Record", 1),
        jobs);
  }

  private static IncidentJob job(long retries, boolean executable) {
    return new IncidentJob(
        "job-1",
        retries,
        executable,
        false,
        "raw-root",
        "ServiceTask_Record",
        incident("job-1", "incident-1", "incident-1"));
  }

  private static FailedJobIncident incident(
      String configuration, String cause, String rootCause) {
    return new FailedJobIncident(
        "incident-1",
        "failedJob",
        configuration,
        "raw-root",
        "ServiceTask_Record",
        cause,
        rootCause);
  }
}
