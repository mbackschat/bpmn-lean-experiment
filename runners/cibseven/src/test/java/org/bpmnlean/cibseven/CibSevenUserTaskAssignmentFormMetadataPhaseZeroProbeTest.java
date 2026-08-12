package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.task.IdentityLink;
import org.cibseven.bpm.engine.task.IdentityLinkType;
import org.cibseven.bpm.engine.task.Task;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.PotentialOwner;
import org.cibseven.bpm.model.bpmn.instance.Resource;
import org.cibseven.bpm.model.bpmn.instance.UserTask;
import org.cibseven.bpm.model.bpmn.instance.cibseven.CamundaFormField;
import org.junit.Test;

/**
 * Calibrates CIB Seven 2.2.0 User Task assignment and generated-form metadata through public APIs.
 */
public final class CibSevenUserTaskAssignmentFormMetadataPhaseZeroProbeTest {

  private static final String CAMUNDA_NAMESPACE = "http://camunda.org/schema/1.0/bpmn";
  private static final String FOREIGN_NAMESPACE = "urn:bpmn-lean:not-camunda";
  private static final String TASK_ID = "UserTask_Review";
  private static final String FIELD_ID = "approved";
  private static final String SELECTED_GROUP = "invoice-approvers";

  @Test
  public void calibratesAssignmentAndGeneratedFormMetadata() {
    var engine = CibSevenTestEngine.create("user-task-assignment-form-metadata-phase-zero");
    try {
      calibrateSelectedLiteralGroupAndBooleanField(engine);
      calibrateNamespaceIdentity(engine);
      calibrateBroaderCandidateGroupSyntax(engine);
      calibrateStandardPotentialOwnerResourceReference(engine);
      calibrateChangedGroupAndFieldType(engine);
    } finally {
      engine.close();
    }
  }

  private static void calibrateSelectedLiteralGroupAndBooleanField(ProcessEngine engine) {
    var processId = "Process_UserTaskAssignmentFormMetadataSelected";
    try (var deployment =
        ProbeDeployment.fromModel(
            engine,
            "selected-assignment-form-metadata.bpmn",
            generatedFormProcess(processId, SELECTED_GROUP, "boolean"))) {
      var projection = deployment.projectUserTask();
      assertEquals(SELECTED_GROUP, projection.candidateGroups());
      assertEquals(FIELD_ID, projection.fieldId());
      assertEquals("boolean", projection.fieldType());
      assertTrue(projection.fieldIdIsUnqualified());
      assertTrue(projection.fieldTypeIsUnqualified());

      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(processId);
      var active = activeTaskEvidence(engine, processInstance.getId());
      assertNull(active.assignee());
      assertEquals(List.of(SELECTED_GROUP), active.candidateGroupIds());
      assertEquals(FIELD_ID, active.formFieldId());
      assertEquals("boolean", active.formFieldTypeName());
      assertEquals("boolean", active.formTypeName());

      engine
          .getTaskService()
          .complete(active.taskId(), Map.of(FIELD_ID, Boolean.TRUE));

      assertEquals(0, liveProcessCount(engine, processInstance.getId()));
      var historicValue =
          engine
              .getHistoryService()
              .createHistoricVariableInstanceQuery()
              .processInstanceId(processInstance.getId())
              .variableName(FIELD_ID)
              .singleResult();
      assertNotNull(historicValue);
      assertTrue(historicValue.getValue() instanceof Boolean);
      assertEquals(Boolean.TRUE, historicValue.getValue());
      assertEquals("boolean", historicValue.getTypeName());
      assertFalse("true".equals(historicValue.getValue()));
    }
  }

  private static void calibrateNamespaceIdentity(ProcessEngine engine) {
    var aliasProcessId = "Process_UserTaskAssignmentAliasPrefix";
    try (var deployment =
        ProbeDeployment.fromXml(
            engine,
            "alias-prefix-assignment-form-metadata.bpmn",
            namespaceControlXml(
                aliasProcessId, "vendor", CAMUNDA_NAMESPACE, SELECTED_GROUP, true))) {
      var projection = deployment.projectUserTask();
      assertEquals(SELECTED_GROUP, projection.candidateGroups());
      assertEquals(FIELD_ID, projection.fieldId());
      assertEquals("boolean", projection.fieldType());

      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(aliasProcessId);
      var active = activeTaskEvidence(engine, processInstance.getId());
      assertEquals(List.of(SELECTED_GROUP), active.candidateGroupIds());
      assertEquals("boolean", active.formTypeName());
    }

    var foreignProcessId = "Process_UserTaskAssignmentForeignNamespace";
    var foreignModel =
        readModel(
            namespaceControlXml(
                foreignProcessId, "twin", FOREIGN_NAMESPACE, SELECTED_GROUP, false));
    UserTask foreignTask = foreignModel.getModelElementById(TASK_ID);
    assertNull(foreignTask.getCamundaCandidateGroups());
    assertTrue(
        foreignTask
            .getDomElement()
            .hasAttribute(FOREIGN_NAMESPACE, "candidateGroups"));
    assertEquals(
        SELECTED_GROUP,
        foreignTask
            .getDomElement()
            .getAttribute(FOREIGN_NAMESPACE, "candidateGroups"));

    try (var deployment =
        ProbeDeployment.fromXml(
            engine,
            "foreign-namespace-assignment-twin.bpmn",
            namespaceControlXml(
                foreignProcessId, "twin", FOREIGN_NAMESPACE, SELECTED_GROUP, false))) {
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(foreignProcessId);
      assertEquals(
          List.of(), activeTaskEvidence(engine, processInstance.getId()).candidateGroupIds());
    }
  }

  private static void calibrateBroaderCandidateGroupSyntax(ProcessEngine engine) {
    var commaProcessId = "Process_UserTaskAssignmentCommaList";
    var commaValue = "accounts-payable,invoice-auditors";
    try (var deployment =
        ProbeDeployment.fromModel(
            engine,
            "comma-list-assignment.bpmn",
            generatedFormProcess(commaProcessId, commaValue, "boolean"))) {
      assertEquals(commaValue, deployment.projectUserTask().candidateGroups());
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(commaProcessId);
      assertEquals(
          List.of("accounts-payable", "invoice-auditors"),
          activeTaskEvidence(engine, processInstance.getId()).candidateGroupIds());
    }

    var expressionProcessId = "Process_UserTaskAssignmentExpression";
    var expressionValue = "${assignmentGroup}";
    try (var deployment =
        ProbeDeployment.fromModel(
            engine,
            "expression-assignment.bpmn",
            generatedFormProcess(expressionProcessId, expressionValue, "boolean"))) {
      assertEquals(expressionValue, deployment.projectUserTask().candidateGroups());
      var processInstance =
          engine
              .getRuntimeService()
              .startProcessInstanceByKey(
                  expressionProcessId, Map.of("assignmentGroup", "dynamic-approvers"));
      assertEquals(
          List.of("dynamic-approvers"),
          activeTaskEvidence(engine, processInstance.getId()).candidateGroupIds());
    }
  }

  private static void calibrateStandardPotentialOwnerResourceReference(ProcessEngine engine) {
    var processId = "Process_UserTaskPotentialOwnerResourceReference";
    try (var deployment =
        ProbeDeployment.fromModel(
            engine,
            "potential-owner-resource-reference.bpmn",
            potentialOwnerResourceReferenceProcess(processId, SELECTED_GROUP))) {
      var model = deployment.model();
      var potentialOwners = List.copyOf(model.getModelElementsByType(PotentialOwner.class));
      assertEquals(1, potentialOwners.size());
      assertEquals(SELECTED_GROUP, potentialOwners.get(0).getResource().getName());
      assertNull(deployment.projectUserTask().candidateGroups());

      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(processId);
      assertEquals(
          List.of(), activeTaskEvidence(engine, processInstance.getId()).candidateGroupIds());
    }
  }

  private static void calibrateChangedGroupAndFieldType(ProcessEngine engine) {
    var changedGroup = "invoice-auditors";
    var changedGroupProcessId = "Process_UserTaskChangedCandidateGroup";
    try (var deployment =
        ProbeDeployment.fromModel(
            engine,
            "changed-candidate-group.bpmn",
            generatedFormProcess(changedGroupProcessId, changedGroup, "boolean"))) {
      var projection = deployment.projectUserTask();
      assertNotEquals(SELECTED_GROUP, projection.candidateGroups());
      assertEquals(changedGroup, projection.candidateGroups());
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(changedGroupProcessId);
      assertEquals(
          List.of(changedGroup),
          activeTaskEvidence(engine, processInstance.getId()).candidateGroupIds());
    }

    var stringFieldProcessId = "Process_UserTaskStringFormField";
    try (var deployment =
        ProbeDeployment.fromModel(
            engine,
            "string-form-field.bpmn",
            generatedFormProcess(stringFieldProcessId, SELECTED_GROUP, "string"))) {
      var projection = deployment.projectUserTask();
      assertNotEquals("boolean", projection.fieldType());
      assertEquals("string", projection.fieldType());
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(stringFieldProcessId);
      var active = activeTaskEvidence(engine, processInstance.getId());
      assertEquals("string", active.formFieldTypeName());
      assertEquals("string", active.formTypeName());
      assertNotEquals("boolean", active.formTypeName());
    }
  }

  private static BpmnModelInstance generatedFormProcess(
      String processId, String candidateGroups, String fieldType) {
    return Bpmn.createExecutableProcess(processId)
        .startEvent("StartEvent_Probe")
        .userTask(TASK_ID)
        .camundaCandidateGroups(candidateGroups)
        .camundaFormField()
        .camundaId(FIELD_ID)
        .camundaType(fieldType)
        .camundaFormFieldDone()
        .endEvent("EndEvent_Probe")
        .done();
  }

  private static BpmnModelInstance potentialOwnerResourceReferenceProcess(
      String processId, String resourceName) {
    var model =
        Bpmn.createExecutableProcess(processId)
            .startEvent("StartEvent_Probe")
            .userTask(TASK_ID)
            .endEvent("EndEvent_Probe")
            .done();
    var resource = model.newInstance(Resource.class);
    resource.setId("Resource_SelectedGroupTwin");
    resource.setName(resourceName);
    model.getDefinitions().getRootElements().add(resource);
    var potentialOwner = model.newInstance(PotentialOwner.class);
    potentialOwner.setId("PotentialOwner_ResourceReference");
    potentialOwner.setResource(resource);
    UserTask userTask = model.getModelElementById(TASK_ID);
    userTask.getResourceRoles().add(potentialOwner);
    return model;
  }

  private static ActiveTaskEvidence activeTaskEvidence(
      ProcessEngine engine, String processInstanceId) {
    Task task =
        engine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(processInstanceId)
            .singleResult();
    assertNotNull(task);
    var candidateGroupIds =
        engine
            .getTaskService()
            .getIdentityLinksForTask(task.getId())
            .stream()
            .filter(link -> IdentityLinkType.CANDIDATE.equals(link.getType()))
            .filter(link -> link.getGroupId() != null)
            .map(IdentityLink::getGroupId)
            .sorted()
            .toList();
    var formFields = engine.getFormService().getTaskFormData(task.getId()).getFormFields();
    var fieldId = formFields.isEmpty() ? null : formFields.get(0).getId();
    var fieldTypeName = formFields.isEmpty() ? null : formFields.get(0).getTypeName();
    var formTypeName =
        formFields.isEmpty() || formFields.get(0).getType() == null
            ? null
            : formFields.get(0).getType().getName();
    return new ActiveTaskEvidence(
        task.getId(), task.getAssignee(), candidateGroupIds, fieldId, fieldTypeName, formTypeName);
  }

  private static long liveProcessCount(ProcessEngine engine, String processInstanceId) {
    return engine
        .getRuntimeService()
        .createProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .count();
  }

  private static BpmnModelInstance readModel(String xml) {
    return Bpmn.readModelFromStream(
        new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
  }

  /*
   * The typed public Model API owns Camunda extension identity and serializes its registered
   * prefix. It cannot represent an arbitrary foreign-namespace attribute as that typed property,
   * nor preserve a deliberately alternate extension prefix, so these two namespace controls use
   * exact XML bytes.
   */
  private static String namespaceControlXml(
      String processId,
      String extensionPrefix,
      String extensionNamespace,
      String candidateGroups,
      boolean includeGeneratedForm) {
    var extensionElements =
        includeGeneratedForm
            ? """
              <extensionElements>
                <%1$s:formData>
                  <%1$s:formField id="%2$s" type="boolean" />
                </%1$s:formData>
              </extensionElements>
              """.formatted(extensionPrefix, FIELD_ID)
            : "";
    return """
        <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                     xmlns:%1$s="%2$s"
                     targetNamespace="urn:bpmn-lean:phase-zero">
          <process id="%3$s" isExecutable="true">
            <startEvent id="StartEvent_Probe">
              <outgoing>Flow_ToTask</outgoing>
            </startEvent>
            <sequenceFlow id="Flow_ToTask" sourceRef="StartEvent_Probe" targetRef="%4$s" />
            <userTask id="%4$s" %1$s:candidateGroups="%5$s">
              %6$s
              <incoming>Flow_ToTask</incoming>
              <outgoing>Flow_ToEnd</outgoing>
            </userTask>
            <sequenceFlow id="Flow_ToEnd" sourceRef="%4$s" targetRef="EndEvent_Probe" />
            <endEvent id="EndEvent_Probe">
              <incoming>Flow_ToEnd</incoming>
            </endEvent>
          </process>
        </definitions>
        """
        .formatted(
            extensionPrefix,
            extensionNamespace,
            processId,
            TASK_ID,
            candidateGroups,
            extensionElements);
  }

  private record ModelProjection(
      String candidateGroups,
      String fieldId,
      String fieldType,
      boolean fieldIdIsUnqualified,
      boolean fieldTypeIsUnqualified) {}

  private record ActiveTaskEvidence(
      String taskId,
      String assignee,
      List<String> candidateGroupIds,
      String formFieldId,
      String formFieldTypeName,
      String formTypeName) {}

  private record ProbeDeployment(ProcessEngine engine, String deploymentId, String definitionId)
      implements AutoCloseable {

    private static ProbeDeployment fromModel(
        ProcessEngine engine, String resourceName, BpmnModelInstance model) {
      var deployment =
          engine
              .getRepositoryService()
              .createDeployment()
              .addModelInstance(resourceName, model)
              .deploy();
      return deployed(engine, deployment.getId());
    }

    private static ProbeDeployment fromXml(
        ProcessEngine engine, String resourceName, String xml) {
      var deployment =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString(resourceName, xml)
              .deploy();
      return deployed(engine, deployment.getId());
    }

    private static ProbeDeployment deployed(ProcessEngine engine, String deploymentId) {
      var definition =
          engine
              .getRepositoryService()
              .createProcessDefinitionQuery()
              .deploymentId(deploymentId)
              .singleResult();
      assertNotNull(definition);
      return new ProbeDeployment(engine, deploymentId, definition.getId());
    }

    private BpmnModelInstance model() {
      return engine.getRepositoryService().getBpmnModelInstance(definitionId);
    }

    private ModelProjection projectUserTask() {
      var model = model();
      UserTask userTask = model.getModelElementById(TASK_ID);
      assertNotNull(userTask);
      var fields =
          model.getModelElementsByType(CamundaFormField.class).stream()
              .sorted(Comparator.comparing(CamundaFormField::getCamundaId))
              .toList();
      if (fields.isEmpty()) {
        return new ModelProjection(userTask.getCamundaCandidateGroups(), null, null, false, false);
      }
      assertEquals(1, fields.size());
      var field = fields.get(0);
      return new ModelProjection(
          userTask.getCamundaCandidateGroups(),
          field.getCamundaId(),
          field.getCamundaType(),
          field.getDomElement().hasAttribute(null, "id")
              && !field.getDomElement().hasAttribute(CAMUNDA_NAMESPACE, "id"),
          field.getDomElement().hasAttribute(null, "type")
              && !field.getDomElement().hasAttribute(CAMUNDA_NAMESPACE, "type"));
    }

    @Override
    public void close() {
      engine.getRepositoryService().deleteDeployment(deploymentId, true, true, true);
    }
  }
}
