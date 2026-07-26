package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.UserTaskLifecycleState.ACTIVE;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.TreeMap;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenUserTask;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;

/**
 * Projects host tasks into the bounded semantic identity domain without using engine query order.
 *
 * <p>Distinct BPMN elements have an unambiguous first activation in the admitted capsules.
 * Repeated live instances of one element are rejected because CIB task IDs and database order
 * cannot supply a semantic activation ordinal.
 */
final class CibSevenUserTaskProjector {

  record HostUserTask(String elementId, String name) {
    HostUserTask {
      Objects.requireNonNull(elementId, "elementId");
      if (elementId.isBlank()) {
        throw new IllegalArgumentException("User Task element ID must be non-blank");
      }
    }
  }

  List<ActiveWait> activeWaits(List<HostUserTask> tasks) {
    Objects.requireNonNull(tasks, "tasks");
    var multiplicities = new TreeMap<String, Integer>(WireStrings::compare);
    for (var task : tasks) {
      multiplicities.merge(
          Objects.requireNonNull(task, "task").elementId(),
          1,
          Integer::sum);
    }
    return multiplicities.entrySet().stream()
        .map(entry -> new ActiveWait(entry.getKey(), USER_TASK, entry.getValue()))
        .toList();
  }

  List<OpenUserTask> openUserTasks(
      String stableInstanceId,
      List<HostUserTask> tasks) {
    Objects.requireNonNull(stableInstanceId, "stableInstanceId");
    Objects.requireNonNull(tasks, "tasks");
    if (stableInstanceId.isBlank()) {
      throw new IllegalArgumentException(
          "Semantic Process instance ID must be non-blank");
    }

    var elementIds = new HashSet<String>();
    var projected = new ArrayList<OpenUserTask>();
    for (var task : tasks) {
      Objects.requireNonNull(task, "task");
      if (!elementIds.add(task.elementId())) {
        throw new IllegalStateException(
            "Repeated active User Task element requires activation-ordinal derivation: "
                + task.elementId());
      }
      projected.add(
          new OpenUserTask(
              new UserTaskInstanceId(
                  stableInstanceId,
                  task.elementId(),
                  1),
              task.name(),
              ACTIVE));
    }
    projected.sort(
        Comparator.comparing(
                (OpenUserTask task) -> task.id().processInstanceId(),
                WireStrings::compare)
            .thenComparing(
                task -> task.id().elementId(),
                WireStrings::compare)
            .thenComparingLong(task -> task.id().activation()));
    return List.copyOf(projected);
  }
}
