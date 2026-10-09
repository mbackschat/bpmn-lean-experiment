package org.bpmnlean.cibseven;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.task.Task;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Calibrates CIB-EXT-0011/0012 through public TaskService and FormService on exact composed sources.
 * The CIB extension-calibration row in docs/BUSINESS-PROCESS-PUBLIC-DELIVERY-PROPOSAL.md selects
 * metadata observations, not whole-profile execution equivalence: public startBeforeActivity
 * isolates each task without interpreting the project's conditional language or business handlers.
 */
public final class CibSevenBusinessPublicDeliveryMetadataTest {
  private static final Path SOURCE_ROOT = Path.of("../..")
      .toAbsolutePath().normalize()
      .resolve("packages/bpmn-source/test/fixtures/business-public-delivery");
  private static ProcessEngine engine;

  @BeforeClass
  public static void createEngine() {
    engine = CibSevenTestEngine.create("business-public-delivery-metadata");
  }

  @AfterClass
  public static void closeEngine() {
    engine.close();
  }

  @Test
  public void publicServicesObserveSerialTaskMetadataFromExactBytesWithoutExecutingEffects()
      throws Exception {
    verifySource("serial-invoice.bpmn", List.of("Review", "Finalize"));
  }

  @Test
  public void publicServicesObserveReworkTaskMetadataWithoutInterpretingConditionalControl()
      throws Exception {
    verifySource("invoice-rework.bpmn", List.of("Review", "Finalize"));
  }

  @Test
  public void publicServicesObserveEveryErrorRecoveryTaskWithoutExecutingErrorRoutes()
      throws Exception {
    verifySource("invoice-error-recovery.bpmn",
        List.of("Review", "CorrectData", "ReviewPolicy", "Finalize"));
  }

  @Test
  public void literalCandidateOracleRejectsPublicIdentityLinkDrift() throws Exception {
    byte[] changed = mutateSource("serial-invoice.bpmn",
        "camunda:candidateGroups=\"reviewers\"", "camunda:candidateGroups=\"other-reviewers\"");
    try (var deployment = new DeploymentScope("serial-invoice.bpmn", changed)) {
      var task = deployment.instantiateTask("Review");
      assertEquals("other-reviewers",
          engine.getTaskService().getIdentityLinksForTask(task.getId()).getFirst().getGroupId());
      assertThrows(AssertionError.class, () -> assertReviewMetadata(task));
    }
  }

  @Test
  public void literalFieldOracleRejectsPublicFormFieldDrift() throws Exception {
    byte[] changed = mutateSource("invoice-error-recovery.bpmn",
        "camunda:formField id=\"request\"", "camunda:formField id=\"otherRequest\"");
    try (var deployment = new DeploymentScope("invoice-error-recovery.bpmn", changed)) {
      var task = deployment.instantiateTask("CorrectData");
      assertEquals("otherRequest",
          engine.getFormService().getTaskFormData(task.getId()).getFormFields().getFirst().getId());
      assertThrows(AssertionError.class, () -> assertReviewMetadata(task));
    }
  }

  private static void verifySource(String resource, List<String> elements) throws Exception {
    byte[] bytes = Files.readAllBytes(SOURCE_ROOT.resolve(resource));
    try (var deployment = new DeploymentScope(resource, bytes)) {
      for (String element : elements) {
        var task = deployment.instantiateTask(element);
        assertReviewMetadata(task);
        engine.getRuntimeService().deleteProcessInstance(task.getProcessInstanceId(),
            "Metadata calibration complete");
      }
    }
  }

  private static void assertReviewMetadata(Task task) {
    var links = engine.getTaskService().getIdentityLinksForTask(task.getId());
    assertEquals(1, links.size());
    var candidate = links.getFirst();
    assertEquals("candidate", candidate.getType());
    assertNull(candidate.getUserId());
    assertEquals("reviewers", candidate.getGroupId());

    var fields = engine.getFormService().getTaskFormData(task.getId()).getFormFields();
    assertEquals(1, fields.size());
    var field = fields.getFirst();
    assertEquals("request", field.getId());
    assertEquals("string", field.getTypeName());
  }

  private static byte[] mutateSource(String resource, String original, String replacement)
      throws Exception {
    String xml = Files.readString(SOURCE_ROOT.resolve(resource), StandardCharsets.UTF_8);
    assertTrue("Mutation must change the deployed source", xml.contains(original));
    return xml.replace(original, replacement).getBytes(StandardCharsets.UTF_8);
  }

  private static void assertEmptyEngine() {
    assertEquals(0, engine.getRepositoryService().createDeploymentQuery().count());
    assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().count());
    assertEquals(0, engine.getTaskService().createTaskQuery().count());
    assertEquals(0, engine.getManagementService().createJobQuery().count());
    assertEquals(0, engine.getRuntimeService().createIncidentQuery().count());
    assertEquals(0, engine.getHistoryService().createHistoricProcessInstanceQuery().count());
    assertEquals(0, engine.getHistoryService().createHistoricActivityInstanceQuery().count());
    assertEquals(0, engine.getHistoryService().createHistoricVariableInstanceQuery().count());
  }

  private static final class DeploymentScope implements AutoCloseable {
    private final String deploymentId;
    private final String definitionId;

    private DeploymentScope(String resource, byte[] bytes) throws Exception {
      assertEmptyEngine();
      var deployment = engine.getRepositoryService().createDeployment()
          .addInputStream(resource, new ByteArrayInputStream(bytes)).deploy();
      deploymentId = deployment.getId();
      try {
        try (var retained = engine.getRepositoryService().getResourceAsStream(deploymentId, resource)) {
          assertArrayEquals(bytes, retained.readAllBytes());
        }
        var definition = engine.getRepositoryService().createProcessDefinitionQuery()
            .deploymentId(deploymentId).singleResult();
        assertNotNull(definition);
        definitionId = definition.getId();
      } catch (Exception | Error failure) {
        engine.getRepositoryService().deleteDeployment(deploymentId, true);
        throw failure;
      }
    }

    private Task instantiateTask(String element) {
      String instanceId = engine.getRuntimeService().createProcessInstanceById(definitionId)
          .startBeforeActivity(element).execute().getId();
      var tasks = engine.getTaskService().createTaskQuery().processInstanceId(instanceId).list();
      assertEquals(1, tasks.size());
      var task = tasks.getFirst();
      assertEquals(element, task.getTaskDefinitionKey());
      assertEquals(0, engine.getManagementService().createJobQuery().processInstanceId(instanceId).count());
      return task;
    }

    @Override
    public void close() {
      engine.getRepositoryService().deleteDeployment(deploymentId, true);
      assertEmptyEngine();
    }
  }
}
