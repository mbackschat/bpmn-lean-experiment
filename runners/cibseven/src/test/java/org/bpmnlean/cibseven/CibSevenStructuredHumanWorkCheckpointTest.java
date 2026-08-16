package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.util.ArrayList;
import java.util.List;
import org.bpmnlean.cibseven.CibStateQueryEvidence.ProcessVariableSnapshot;
import org.bpmnlean.cibseven.ScenarioProtocol.BooleanValue;
import org.bpmnlean.cibseven.ScenarioProtocol.IntegerValue;
import org.bpmnlean.cibseven.ScenarioProtocol.StringListValue;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.Assignment;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.AssignmentFormMetadata;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.AssignmentOnlyMetadata;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.Candidate;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.Form;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.FormField;
import org.junit.Test;

/** Exact M6 value-wire, surface-policy, host-carrier, and detachment checkpoint. */
public final class CibSevenStructuredHumanWorkCheckpointTest {

  private static final String PROFILE =
      "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
  private static final String OLD_PROFILE =
      "cibseven-2.2.0-user-task-boolean-completion-data-draft";

  @Test
  public void admitsNewArmsOnlyOnTheM6UserTaskCompletionSurface() {
    var bindings =
        List.of(
            new VariableBinding("notifySubmitter", new BooleanValue(true)),
            new VariableBinding("amount", new IntegerValue(91)),
            new VariableBinding(
                "flags", new StringListValue(List.of("duplicate", "duplicate", "policy"))));

    assertTrue(
        ScenarioVariableValuePolicy.admits(
            PROFILE, ScenarioVariableValuePolicy.Surface.USER_TASK_COMPLETION, bindings));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            PROFILE, ScenarioVariableValuePolicy.Surface.PROCESS_START, bindings));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            PROFILE, ScenarioVariableValuePolicy.Surface.EFFECT_PATCH, bindings));
    assertFalse(
        ScenarioVariableValuePolicy.admits(
            OLD_PROFILE, ScenarioVariableValuePolicy.Surface.USER_TASK_COMPLETION, bindings));
  }

  @Test
  public void rejectsInvalidIntegerAndStringListWireValuesIncludingLexicalNegativeZero()
      throws Exception {
    assertThrows(IllegalArgumentException.class, () -> new IntegerValue(-1));
    assertThrows(
        IllegalArgumentException.class,
        () -> new IntegerValue(ScenarioProtocol.MAX_SAFE_WIRE_INTEGER + 1));
    assertThrows(
        IllegalArgumentException.class,
        () -> new StringListValue(java.util.Collections.nCopies(33, "x")));
    assertThrows(
        IllegalArgumentException.class,
        () -> new StringListValue(List.of("é".repeat(513))));
    assertThrows(
        JsonProcessingException.class,
        () -> ScenarioJson.read(scenarioWithCompletionValue(
            "{\"kind\":\"integer\",\"value\":-0}")));
    assertThrows(
        JsonProcessingException.class,
        () -> ScenarioJson.read(scenarioWithCompletionValue(
            "{\"kind\":\"integer\",\"value\":1.5}")));
    assertThrows(
        JsonProcessingException.class,
        () -> ScenarioJson.read(scenarioWithCompletionValue(
            "{\"kind\":\"integer\",\"value\":9007199254740992}")));
  }

  @Test
  public void mirrorsExactValueBindingAndPatchByteCeilings() {
    assertThrows(
        IllegalArgumentException.class,
        () -> new StringListValue(
            java.util.Collections.nCopies(17, "x".repeat(1_000))));
    assertThrows(
        IllegalArgumentException.class,
        () -> new VariableBinding(
            "n".repeat(6_000),
            new StringListValue(java.util.Collections.nCopies(15, "x".repeat(1_000)))));
    assertThrows(
        IllegalArgumentException.class,
        () -> ScenarioVariableBindings.requireCanonical(
            java.util.stream.IntStream.range(0, 5)
                .mapToObj(index -> new VariableBinding(
                    "v" + index,
                    new StringListValue(
                        java.util.Collections.nCopies(15, "x".repeat(1_000)))))
                .toList(),
            "submittedValues"));
  }

  @Test
  public void keepsLegacyMetadataBytesAndOmitsTheAssignmentOnlyForm()
      throws Exception {
    var assignment = new Assignment(List.of(new Candidate("group", "reviewers")));
    var mapper = JsonMapper.builder().build();
    assertEquals(
        "{\"assignment\":{\"candidates\":[{\"kind\":\"group\",\"id\":\"reviewers\"}]},"
            + "\"form\":{\"fields\":[{\"key\":\"approved\",\"type\":\"boolean\"}]}}",
        mapper.writeValueAsString(new AssignmentFormMetadata(
            assignment,
            new Form(List.of(new FormField("approved", "boolean"))))));
    assertEquals(
        "{\"assignment\":{\"candidates\":[{\"kind\":\"group\",\"id\":\"reviewers\"}]}}",
        mapper.writeValueAsString(new AssignmentOnlyMetadata(assignment)));
  }

  @Test
  public void mapsToDetachedLongAndOrderedDuplicatePreservingListCarriers() {
    var caller = new ArrayList<>(List.of("duplicate", "duplicate", "policy"));
    var listValue = new StringListValue(caller);
    caller.set(0, "mutated");
    assertEquals(List.of("duplicate", "duplicate", "policy"), listValue.value());

    var engineMap =
        ScenarioVariableBindings.toEngineMap(
            List.of(
                new VariableBinding("amount", new IntegerValue(91)),
                new VariableBinding("flags", listValue)));
    assertEquals(Long.valueOf(91), engineMap.get("amount"));
    assertTrue(engineMap.get("amount") instanceof Long);
    assertEquals(List.of("duplicate", "duplicate", "policy"), engineMap.get("flags"));
    assertNotSame(listValue.value(), engineMap.get("flags"));
  }

  @Test
  public void projectsOnlyExactSafeHostCarriersAndDetachesMutableLists() {
    assertEquals(
        new VariableBinding("amount", new IntegerValue(91)),
        ScenarioVariableValueProjection.project(
            new ProcessVariableSnapshot("amount", Long.valueOf(91))));
    assertEquals(
        new VariableBinding("amount", new IntegerValue(91)),
        ScenarioVariableValueProjection.project(
            new ProcessVariableSnapshot("amount", Integer.valueOf(91))));

    var mutable = new ArrayList<>(List.of("duplicate", "duplicate", "policy"));
    var snapshot = new ProcessVariableSnapshot("flags", mutable);
    mutable.set(0, "mutated");
    assertEquals(
        new VariableBinding(
            "flags", new StringListValue(List.of("duplicate", "duplicate", "policy"))),
        ScenarioVariableValueProjection.project(snapshot));

    for (var invalid : List.of(
        Double.valueOf(1),
        Long.valueOf(-1),
        Long.valueOf(ScenarioProtocol.MAX_SAFE_WIRE_INTEGER + 1),
        List.of("valid", Integer.valueOf(1)))) {
      assertThrows(
          IllegalArgumentException.class,
          () -> new ProcessVariableSnapshot("invalid", invalid));
    }
  }

  private static String scenarioWithCompletionValue(String value) {
    return """
        {
          "kind":"scenario","id":"negative-zero","profile":"%s",
          "bpmn":{"id":"bpmn","relativePath":"process.bpmn","sha256":"x"},
          "stimuli":[
            {"kind":"startProcess","commandId":"start","processId":"Process_1","instanceId":"Instance_1","initialVariables":[]},
            {"kind":"completeUserTaskInstance","commandId":"complete","taskId":{"processInstanceId":"Instance_1","elementId":"Task_1","activation":1},"submittedValues":[{"name":"amount","value":%s}]}
          ],
          "observations":[],"provenance":{"normativeRefs":[],"cibRevision":"r","cibRefs":[]}
        }
        """.formatted(PROFILE, value);
  }
}
