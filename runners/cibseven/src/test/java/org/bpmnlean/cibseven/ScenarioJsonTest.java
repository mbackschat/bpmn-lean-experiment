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

  @Test
  public void serializesDiagnosticsWithStableFieldShape() throws Exception {
    var result =
        new ScenarioProtocol.ScenarioResult(
            ScenarioProtocol.SCENARIO_RESULT_KIND,
            "diagnostics-shape",
            new ScenarioProtocol.SemanticOutcome(
                ScenarioProtocol.CommandOutcome.COMMITTED),
            List.of(),
            new ScenarioDiagnosticsProtocol.Diagnostics(
                "2.2.0",
                "2.3.232",
                1,
                new ScenarioDiagnosticsProtocol.PhaseTimings(1, 2, 3, 4, 5, 6, 7, 8),
                new ScenarioDiagnosticsProtocol.PvmDefinitionProjection(
                    "Process_1", "StartEvent_1", List.of()),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                ScenarioDiagnosticsProtocol.CleanupProjection.clean()));

    assertEquals(
        "{\"kind\":\"scenarioResult\",\"scenarioId\":\"diagnostics-shape\",\"outcome\":{\"kind\":\"semantic\",\"outcome\":\"committed\"},\"trace\":[],\"diagnostics\":{\"engineVersion\":\"2.2.0\",\"databaseVersion\":\"2.3.232\",\"startupNanos\":1,\"phases\":{\"deploymentNanos\":1,\"definitionProjectionNanos\":2,\"startNanos\":3,\"waitProjectionNanos\":4,\"completeNanos\":5,\"completionProjectionNanos\":6,\"cleanupNanos\":7,\"totalNanos\":8},\"pvmDefinition\":{\"processId\":\"Process_1\",\"initialActivityId\":\"StartEvent_1\",\"activities\":[]},\"stateQueries\":[],\"taskQueries\":[],\"messageSubscriptions\":[],\"timerJobs\":[],\"effectJobs\":[],\"effectExecutions\":[],\"mappingExecutions\":[],\"cleanup\":{\"deployments\":0,\"processDefinitions\":0,\"processInstances\":0,\"tasks\":0,\"jobs\":0,\"incidents\":0,\"historicProcessInstances\":0}}}",
        ScenarioJson.write(result));
  }
}
