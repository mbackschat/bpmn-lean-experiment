package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.List;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.CibSevenProcessTerminationProjector.HistoricProcessFact;
import org.bpmnlean.cibseven.CibSevenProcessTerminationProjector.TerminationFacts;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;
import org.junit.Test;

/** Refuses every absence-only or preservation-free cancellation projection. */
public final class CibSevenProcessTerminationProjectorTest {

  @Test
  public void projectsOnlyExternallyTerminatedRootWithPreservedCommittedData() {
    var projected =
        CibSevenProcessTerminationProjector.projectFacts(
            "Instance_1", "cancel", List.of("preserved"), 0, 0, validFacts());

    assertEquals("cancelled", projected.state().status().wireValue());
    assertEquals(
        HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED,
        projected.historicProcessState().state());
    assertEquals("preserved", projected.state().variables().getFirst().name());
  }

  @Test
  public void refusesRuntimePresenceAndAbsenceWithoutExactTerminatedHistory() {
    var live = validFacts();
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            1, 0, 0, 0, 0, live.rawRootId(), live.historicProcesses(), live.variables())));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0, 1, 0, 0, 0, live.rawRootId(), live.historicProcesses(), live.variables())));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0, 0, 1, 0, 0, live.rawRootId(), live.historicProcesses(), live.variables())));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0, 0, 0, 1, 0, live.rawRootId(), live.historicProcesses(), live.variables())));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0, 0, 0, 0, 1, live.rawRootId(), live.historicProcesses(), live.variables())));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0, 0, 0, 0, 0, live.rawRootId(), List.of(), live.variables())));
  }

  @Test
  public void refusesCompletedOrWrongHistoricRoot() {
    var valid = validFacts();
    assertThrows(
        IllegalStateException.class,
        () -> project(withHistory("raw-root", "raw-root", HistoricProcessInstance.STATE_COMPLETED)));
    assertThrows(
        IllegalStateException.class,
        () -> project(withHistory("another-process", "raw-root",
            HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED)));
    assertThrows(
        IllegalStateException.class,
        () -> project(withHistory("raw-root", "another-root",
            HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED)));
    assertEquals("raw-root", valid.rawRootId());
  }

  @Test
  public void refusesMissingDuplicateOrChangedPreservedVariable() {
    var valid = validFacts();
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0, 0, 0, 0, 0, valid.rawRootId(), valid.historicProcesses(), List.of())));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0,
            0,
            0,
            0,
            0,
            valid.rawRootId(),
            valid.historicProcesses(),
            List.of(
                new ProcessVariableSnapshot("preserved", "before-cancel"),
                new ProcessVariableSnapshot("preserved", "before-cancel")))));
    assertThrows(
        IllegalStateException.class,
        () -> project(new TerminationFacts(
            0,
            0,
            0,
            0,
            0,
            valid.rawRootId(),
            valid.historicProcesses(),
            List.of(new ProcessVariableSnapshot("preserved", "changed")))));
  }

  private static void project(TerminationFacts facts) {
    CibSevenProcessTerminationProjector.projectFacts(
        "Instance_1", "cancel", List.of("preserved"), 0, 0, facts);
  }

  private static TerminationFacts withHistory(String id, String rootId, String state) {
    return new TerminationFacts(
        0,
        0,
        0,
        0,
        0,
        "raw-root",
        List.of(new HistoricProcessFact(id, rootId, state)),
        List.of(new ProcessVariableSnapshot("preserved", "before-cancel")));
  }

  private static TerminationFacts validFacts() {
    return withHistory(
        "raw-root", "raw-root", HistoricProcessInstance.STATE_EXTERNALLY_TERMINATED);
  }
}
