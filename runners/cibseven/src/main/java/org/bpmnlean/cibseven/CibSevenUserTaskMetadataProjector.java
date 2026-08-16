package org.bpmnlean.cibseven;

import java.util.LinkedHashMap;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.FormFieldEvidence;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.IdentityLinkEvidence;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.TaskQueryTask;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.Assignment;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.AssignmentFormMetadata;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.AssignmentOnlyMetadata;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.Candidate;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.Form;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.FormField;
import org.bpmnlean.cibseven.UserTaskMetadataProtocol.UserTaskMetadata;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.task.Task;

/** Obtains metadata from public CIB services and constructs its neutral projection. */
final class CibSevenUserTaskMetadataProjector {

  static final String PROFILE =
      "cibseven-2.2.0-user-task-assignment-form-metadata-draft";
  static final String PARALLEL_PROFILE =
      "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft";
  static final String STRUCTURED_HUMAN_WORK_PROFILE =
      "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";

  private final ProcessEngine processEngine;

  CibSevenUserTaskMetadataProjector(ProcessEngine processEngine) {
    this.processEngine = processEngine;
  }

  ProjectedTasks project(
      String profile,
      List<Task> tasks,
      List<OpenUserTask> openUserTasks) {
    if (!isMetadataProfile(profile)) {
      return new ProjectedTasks(
          tasks.stream()
              .map(task -> new TaskQueryTask(task.getTaskDefinitionKey(), task.getName()))
              .toList(),
          openUserTasks);
    }

    var metadataByElement = new LinkedHashMap<String, UserTaskMetadata>();
    var rawTasks =
        tasks.stream()
            .map(
                task -> {
                  var identityLinks =
                      processEngine.getTaskService().getIdentityLinksForTask(task.getId()).stream()
                          .map(
                              link ->
                                  new IdentityLinkEvidence(
                                      link.getType(), link.getUserId(), link.getGroupId()))
                          .toList();
                  var formFields =
                      processEngine.getFormService().getTaskFormData(task.getId()).getFormFields()
                          .stream()
                          .map(field -> new FormFieldEvidence(field.getId(), field.getTypeName()))
                          .toList();
                  metadataByElement.put(
                      task.getTaskDefinitionKey(),
                      requireMetadata(profile, identityLinks, formFields));
                  return new TaskQueryTask(
                      task.getTaskDefinitionKey(), task.getName(), identityLinks, formFields);
                })
            .toList();
    var projectedTasks =
        openUserTasks.stream()
            .map(
                task ->
                    new OpenUserTask(
                        task.id(),
                        task.name(),
                        task.state(),
                        requireElementMetadata(metadataByElement, task.id().elementId())))
            .toList();
    return new ProjectedTasks(rawTasks, projectedTasks);
  }

  static boolean isMetadataProfile(String profile) {
    return PROFILE.equals(profile)
        || PARALLEL_PROFILE.equals(profile)
        || STRUCTURED_HUMAN_WORK_PROFILE.equals(profile);
  }

  private static UserTaskMetadata requireMetadata(
      String profile,
      List<IdentityLinkEvidence> identityLinks,
      List<FormFieldEvidence> formFields) {
    var assignmentOnly = STRUCTURED_HUMAN_WORK_PROFILE.equals(profile);
    if (identityLinks.size() != 1 || formFields.size() != (assignmentOnly ? 0 : 1)) {
      throw new IllegalStateException(
          assignmentOnly
              ? "Structured Human Work requires exactly one identity link and no CIB form field"
              : "Metadata profile requires exactly one identity link and one form field");
    }
    var identityLink = identityLinks.getFirst();
    if (!"candidate".equals(identityLink.type())
        || identityLink.userId() != null
        || !isCandidateId(identityLink.groupId())) {
      throw new IllegalStateException("Metadata profile requires one candidate group link");
    }
    var assignment =
        new Assignment(List.of(new Candidate("group", identityLink.groupId())));
    if (assignmentOnly) {
      return new AssignmentOnlyMetadata(assignment);
    }
    var formField = formFields.getFirst();
    if (!isIdentity(formField.id())
        || !("string".equals(formField.typeName())
            || "boolean".equals(formField.typeName()))) {
      throw new IllegalStateException("Metadata profile requires one exact typed form field");
    }
    return new AssignmentFormMetadata(
        assignment,
        new Form(List.of(new FormField(formField.id(), formField.typeName()))));
  }

  private static UserTaskMetadata requireElementMetadata(
      LinkedHashMap<String, UserTaskMetadata> metadataByElement,
      String elementId) {
    var metadata = metadataByElement.get(elementId);
    if (metadata == null) {
      throw new IllegalStateException("Raw CIB task facts omitted " + elementId);
    }
    return metadata;
  }

  private static boolean isCandidateId(String value) {
    return isIdentity(value)
        && !value.contains(",")
        && !value.contains("${")
        && !value.contains("#{");
  }

  private static boolean isIdentity(String value) {
    if (value == null || value.isEmpty()) {
      return false;
    }
    var codePoints = value.codePoints().toArray();
    for (var codePoint : codePoints) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        return false;
      }
    }
    return !isBoundarySpace(codePoints[0])
        && !isBoundarySpace(codePoints[codePoints.length - 1]);
  }

  private static boolean isBoundarySpace(int codePoint) {
    return codePoint >= 0x0009 && codePoint <= 0x000d
        || codePoint == 0x0020
        || codePoint == 0x0085
        || codePoint == 0x00a0
        || codePoint == 0x1680
        || codePoint >= 0x2000 && codePoint <= 0x200a
        || codePoint == 0x2028
        || codePoint == 0x2029
        || codePoint == 0x202f
        || codePoint == 0x205f
        || codePoint == 0x3000
        || codePoint == 0xfeff;
  }

  record ProjectedTasks(
      List<TaskQueryTask> rawTasks,
      List<OpenUserTask> openUserTasks) {
    ProjectedTasks {
      rawTasks = List.copyOf(rawTasks);
      openUserTasks = List.copyOf(openUserTasks);
    }
  }
}
