package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.bpmnlean.cibseven.CibSevenUserTaskProjector.HostUserTask;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.AssignmentOnlyMetadata;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

/** Exact-source CIB prefix evidence for M6 assignment-only passive metadata. */
public final class CibSevenStructuredHumanWorkPrefixProbeTest {

  private static final String PROFILE =
      "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
  private static final String PROCESS_ID = "Process_ExpenseExceptionReview";
  private static final Path PROCESS_PATH =
      Path.of("../..", "scenarios/expense-exception-review/process.bpmn")
          .toAbsolutePath()
          .normalize();

  @Test
  public void exactSourceStopsAtTheUserTaskWithOneGroupAndNoCibFormField()
      throws Exception {
    var source = Files.readAllBytes(PROCESS_PATH);
    var engine = CibSevenTestEngine.create("structured-human-work-prefix");
    try {
      try (var deployed = deploy(engine, "expense-exception-review.bpmn", source)) {
        var instance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
        var projected = project(engine, instance.getId());

        assertEquals(1, projected.rawTasks().size());
        var raw = projected.rawTasks().getFirst();
        assertEquals("ReviewException", raw.elementId());
        assertEquals(1, raw.identityLinks().size());
        assertEquals("candidate", raw.identityLinks().getFirst().type());
        assertNull(raw.identityLinks().getFirst().userId());
        assertEquals("reviewers", raw.identityLinks().getFirst().groupId());
        assertEquals(List.of(), raw.formFields());

        var metadata =
            (AssignmentOnlyMetadata) projected.openUserTasks().getFirst().metadata();
        assertEquals("reviewers", metadata.assignment().candidates().getFirst().id());
        assertNull(metadata.form());
        assertEquals(1, engine.getRuntimeService().createProcessInstanceQuery()
            .processInstanceId(instance.getId()).count());
      }
    } finally {
      engine.close();
    }
  }

  @Test
  public void anyCibFormDataMutationIsRejectedByTheAssignmentOnlyProjector()
      throws Exception {
    var exact = Files.readString(PROCESS_PATH, StandardCharsets.UTF_8);
    var mutated = exact.replace(
        "      <bpmn:documentation>Review the expense exception and choose a resolution."
            + "</bpmn:documentation>\n",
        "      <bpmn:documentation>Review the expense exception and choose a resolution."
            + "</bpmn:documentation>\n"
            + "      <bpmn:extensionElements><c7:formData>"
            + "<c7:formField id=\"forbidden\" type=\"string\"/>"
            + "</c7:formData></bpmn:extensionElements>\n");
    var engine = CibSevenTestEngine.create("structured-human-work-cib-form-mutation");
    try {
      try (var deployed = deploy(
          engine,
          "expense-exception-review-form-mutation.bpmn",
          mutated.getBytes(StandardCharsets.UTF_8))) {
        var instance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
        assertThrows(
            IllegalStateException.class,
            () -> project(engine, instance.getId()));
      }
    } finally {
      engine.close();
    }
  }

  private static CibSevenUserTaskMetadataProjector.ProjectedTasks project(
      ProcessEngine engine,
      String processInstanceId) {
    var tasks =
        engine.getTaskService().createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    var hostTasks = tasks.stream()
        .map(task -> new HostUserTask(task.getTaskDefinitionKey(), task.getName()))
        .toList();
    var openTasks = new CibSevenUserTaskProjector()
        .openUserTasks("Instance_ExpenseExceptionReview", hostTasks);
    return new CibSevenUserTaskMetadataProjector(engine)
        .project(PROFILE, tasks, openTasks);
  }

  private static Deployment deploy(
      ProcessEngine engine,
      String resourceName,
      byte[] source) {
    var deployment = engine.getRepositoryService().createDeployment()
        .addInputStream(resourceName, new ByteArrayInputStream(source))
        .deploy();
    return new Deployment(engine, deployment.getId());
  }

  private record Deployment(ProcessEngine engine, String id) implements AutoCloseable {
    @Override
    public void close() {
      engine.getRepositoryService().deleteDeployment(id, true, true, true);
    }
  }
}
