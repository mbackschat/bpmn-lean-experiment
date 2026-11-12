package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.ConditionalDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.DefinitionRef;
import org.bpmnlean.cibseven.ScenarioProtocol.DirectMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.Effect;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.FormField;
import org.bpmnlean.cibseven.ScenarioProtocol.IncidentDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.MessageDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.OccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenWait;
import org.bpmnlean.cibseven.ScenarioProtocol.OperationMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.Recurrence;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.UnspecifiedMessageChannel;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskDetail;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.junit.Test;

/** Wire-decoder guards that must hold before typed scenario construction, and the result codec's round trip. */
public class ScenarioJsonTest {

  private static String scenarioWithInitialValue(String value) {
    return """
        {
          "kind": "scenario",
          "id": "boolean-wire",
          "profile": "profile",
          "bpmn": {"id": "bpmn", "relativePath": "process.bpmn", "sha256": "x"},
          "stimuli": [{
            "kind": "start",
            "commandId": "start",
            "instanceId": "Instance_1",
            "variables": [{"name": "decision", "value": %s}]
          }],
          "provenance": {"normativeRefs": [], "cibRevision": "r", "cibRefs": []}
        }
        """.formatted(value);
  }

  private static ScenarioProtocol.StateObservation state(List<OpenWait> waits) {
    return new ScenarioProtocol.StateObservation(
        "Instance_1", ScenarioProtocol.ProcessStatus.RUNNING, 0, List.of(), null, waits);
  }

  @Test
  public void rejectsNoncanonicalNumbersAtResultAndEvidenceIngress() throws Exception {
    var state = state(List.of());
    var outcome = new ScenarioProtocol.SemanticOutcome(ScenarioProtocol.CommandOutcome.COMMITTED);
    var result = new ScenarioProtocol.ScenarioResult(
        ScenarioProtocol.SCENARIO_RESULT_KIND, "raw-wire", outcome, List.of(state), null);
    var resultJson = ScenarioJson.write(result);
    var evidenceJson = "{\"result\":" + new ObjectMapper().writeValueAsString(
        new ScenarioProtocol.CanonicalResult(outcome, List.of(state))) + "}";
    var path = Files.createTempFile("bpmn-raw-wire-", ".json");
    try {
      for (var token : List.of("1.0000000000000001", "9007199254740991.1", "1e-400", "1e400", "1.0", "1e1", "-0", "9007199254740992", "9007199254740993")) {
        assertThrows(token, JsonProcessingException.class, () -> ScenarioJson.readResult(
            resultJson.replace("\"logicalTimeMs\":0", "\"logicalTimeMs\":" + token)));
        Files.writeString(path, evidenceJson.replace("\"logicalTimeMs\":0", "\"logicalTimeMs\":" + token));
        assertThrows(token, JsonProcessingException.class, () -> ScenarioJson.readEvidenceResult(path));
        assertThrows(token, JsonProcessingException.class, () -> ScenarioJson.read(
            scenarioWithInitialValue("{\"kind\":\"integer\",\"value\":" + token + "}")));
      }
      for (var token : List.of("0", "1", "10", "9007199254740991")) {
        assertEquals(Long.parseLong(token), ((ScenarioProtocol.StateObservation)
            ScenarioJson.readResult(resultJson.replace("\"logicalTimeMs\":0", "\"logicalTimeMs\":" + token)).trace().getFirst()).logicalTimeMs());
        Files.writeString(path, evidenceJson.replace("\"logicalTimeMs\":0", "\"logicalTimeMs\":" + token));
        assertEquals(Long.parseLong(token), ((ScenarioProtocol.StateObservation)
            ScenarioJson.readEvidenceResult(path).trace().getFirst()).logicalTimeMs());
      }
    } finally {
      Files.deleteIfExists(path);
    }
  }

  @Test
  public void retainsDecodedKeyAndUnicodeRefusalAtRawScenarioIngress() throws Exception {
    for (var value : List.of(
        "{\"kind\":\"string\",\"value\":\"\\uD800\"}",
        "{\"kind\":\"string\",\"value\":\"one\",\"\\u0076alue\":\"two\"}",
        "{\"kind\":\"string\",\"value\":\"valid\",\"__proto__\":{\"polluted\":true}}")) {
      assertThrows(JsonProcessingException.class, () -> ScenarioJson.read(scenarioWithInitialValue(value)));
    }
    var unicode = ScenarioJson.read(scenarioWithInitialValue("{\"kind\":\"string\",\"value\":\"𝄞\"}"));
    assertEquals(unicode, ScenarioJson.read(ScenarioJson.writeScenario(unicode)));
  }

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
          "provenance": {"normativeRefs": [], "cibRevision": "r", "cibRefs": []}
        }
        """;

    assertThrows(JsonProcessingException.class, () -> ScenarioJson.read(duplicateKind));
  }

  @Test
  public void rejectsMissingAndNullBooleanPayloads() {
    for (var malformed : List.of("{\"kind\":\"boolean\"}", "{\"kind\":\"boolean\",\"value\":null}")) {
      assertThrows(JsonProcessingException.class, () -> ScenarioJson.read(scenarioWithInitialValue(malformed)));
    }
  }

  /**
   * The scenario schema refuses a negative Integer, a Decimal scale above 6 and a number spelled as text, and so does
   * this decoder. A Decimal coefficient past the signed 64-bit range is schema-valid but refused here, so only the
   * kernel answers its witness; a root String over 1,024 UTF-8 bytes is decoded and reaches CIB (CIB-LIM-0014).
   */
  @Test
  public void refusesOutOfDomainScalarsAndKeepsALongRootString() throws Exception {
    for (var value : List.of(
        "{\"kind\":\"integer\",\"value\":-1}",
        "{\"kind\":\"decimal\",\"coefficient\":\"1\",\"scale\":7}",
        "{\"kind\":\"decimal\",\"coefficient\":\"9223372036854775808\",\"scale\":0}",
        "{\"kind\":\"integer\",\"value\":\"1\"}",
        "{\"kind\":\"decimal\",\"coefficient\":\"1\",\"scale\":\"0\"}")) {
      assertThrows(value, JsonProcessingException.class, () -> ScenarioJson.read(scenarioWithInitialValue(value)));
    }
    var accented = "é".repeat(600);
    var scenario = ScenarioJson.read(scenarioWithInitialValue("{\"kind\":\"string\",\"value\":\"" + accented + "\"}"));
    var start = (ScenarioProtocol.Start) scenario.stimuli().getFirst();
    assertEquals(new StringValue(accented), start.variables().getFirst().value());
  }

  /** Codec truth for this runner: every wait detail kind and every channel arm survives write and read. */
  @Test
  public void roundTripsEveryOpenWaitKind() throws Exception {
    var id = new OccurrenceId("Instance_1", "Element_1", 1);
    var effect = new Effect("protocol", "operation", List.of(), 1, null);
    var details = List.of(
        new UserTaskDetail(
            "Approve", null, List.of(), List.of("reviewers"), null, List.of(new FormField("approved", "boolean")),
            null, null, null, List.of(new VariableBinding("input", new StringValue("value")))),
        new MessageDetail(new OperationMessageChannel("Interface_1", "Operation_1", "Message_1"), false, List.of()),
        new MessageDetail(new DirectMessageChannel("Message_1"), true, List.of()),
        new MessageDetail(new UnspecifiedMessageChannel(), false, List.of()),
        new SignalDetail("Signal_1", false),
        new ConditionalDetail("amount", List.of("update"), null),
        new TimerDetail(1000, new Recurrence(60000L, null, 3L)),
        new EffectDetail(effect),
        new IncidentDetail(effect, 1, true));
    var waits = details.stream()
        .map(detail -> new OpenWait(id, new DefinitionRef("Called", null, null, null, null, null), detail))
        .toList();
    var result = new ScenarioProtocol.ScenarioResult(
        ScenarioProtocol.SCENARIO_RESULT_KIND, "wait-roundtrip",
        new ScenarioProtocol.SemanticOutcome(ScenarioProtocol.CommandOutcome.COMMITTED),
        List.of(state(waits)), null);

    var json = ScenarioJson.write(result);
    assertEquals(result, ScenarioJson.readResult(json));
    var tree = new ObjectMapper().readTree(json).at("/trace/0/openWaits");
    assertEquals("command", tree.get(0).get("input").asText());
    assertEquals(true, tree.get(5).get("input").isNull());
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

  /** The evidence schema requires a task's `name` as an explicit null for an unnamed User Task (run 43279665960). */
  @Test
  public void anUnnamedTaskKeepsItsNullName() throws JsonProcessingException {
    assertEquals(
        "{\"elementId\":\"Hold\",\"name\":null}",
        new ObjectMapper().writeValueAsString(new ScenarioDiagnosticsProtocol.TaskQueryTask("Hold", null)));
  }
}
