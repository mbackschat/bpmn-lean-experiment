package org.bpmnlean.cibseven;

import static org.junit.Assert.assertThrows;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.junit.Test;

/** Wire-decoder guards that must survive before typed scenario construction. */
public class ScenarioJsonTest {

  @Test
  public void rejectsDuplicateObjectKeys() {
    var duplicateKind =
        """
        {
          "kind": "scenario",
          "kind": "scenario",
          "id": "scenario",
          "profile": "profile",
          "bpmn": {"id": "bpmn", "relativePath": "process.bpmn", "sha256": "x"},
          "stimuli": [],
          "observations": [],
          "provenance": {"normativeRefs": [], "cibRevision": "r", "cibRefs": []}
        }
        """;

    assertThrows(
        JsonProcessingException.class,
        () -> ScenarioJson.read(duplicateKind));
  }
}
