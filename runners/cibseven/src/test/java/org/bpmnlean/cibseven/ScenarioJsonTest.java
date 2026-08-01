package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import com.fasterxml.jackson.core.JsonProcessingException;
import java.util.List;
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

  @Test
  public void roundTripsBothCurrentMessageChannelArms() throws Exception {
    var channels =
        List.<ScenarioMessageProtocol.MessageChannel>of(
            new ScenarioMessageProtocol.OperationMessageChannel(
                "Interface_1", "Operation_1", "Message_1"),
            new ScenarioMessageProtocol.DirectMessageChannel("Message_1"));

    for (var channel : channels) {
      var result =
          new ScenarioProtocol.ScenarioResult(
              ScenarioProtocol.SCENARIO_RESULT_KIND,
              "message-channel-roundtrip",
              new ScenarioProtocol.SemanticOutcome(
                  ScenarioProtocol.CommandOutcome.COMMITTED),
              List.of(
                  new ScenarioProtocol.StateObservation(
                      "Instance_1",
                      ScenarioProtocol.ProcessStatus.RUNNING,
                      List.of(),
                      List.of(),
                      List.of(
                          new ScenarioMessageProtocol.OpenMessageSubscription(
                              new ScenarioMessageProtocol.MessageSubscriptionId(
                                  "Instance_1", "MessageWait_1", 1),
                              channel)),
                      List.of(),
                      List.of(),
                      List.of(),
                      List.of(),
                      0)),
              null);

      assertEquals(result, ScenarioJson.readResult(ScenarioJson.write(result)));
    }
  }
}
