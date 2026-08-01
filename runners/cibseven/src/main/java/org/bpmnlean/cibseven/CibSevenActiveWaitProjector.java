package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.EFFECT;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.MESSAGE;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.TIMER;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenEffect;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenTimer;
import org.bpmnlean.cibseven.ScenarioProtocol.WaitKind;

/**
 * Assembles canonical waits while refusing repeated timers whose activation ordinals the bounded
 * CIB adapter cannot derive.
 */
final class CibSevenActiveWaitProjector {

  List<ActiveWait> project(
      List<ActiveWait> userTaskWaits,
      List<ActiveWait> messageWaits,
      List<OpenTimer> openTimers,
      List<OpenEffect> openEffects) {
    var projected = new ArrayList<>(userTaskWaits);
    projected.addAll(messageWaits);
    var timerElements = new HashSet<String>();
    for (var timer : openTimers) {
      var elementId = timer.id().elementId();
      requireDistinctElement(timerElements, TIMER, elementId);
      projected.add(new ActiveWait(elementId, TIMER, 1));
    }
    // CibSevenEffectProjector already rejects multiple live jobs for one effect element.
    for (var effect : openEffects) {
      var elementId = effect.id().elementId();
      projected.add(new ActiveWait(elementId, EFFECT, 1));
    }
    projected.sort(
        Comparator.comparingInt((ActiveWait wait) -> kindRank(wait.kind()))
            .thenComparing(ActiveWait::elementId, WireStrings::compare));
    return List.copyOf(projected);
  }

  private static void requireDistinctElement(
      HashSet<String> elements,
      WaitKind kind,
      String elementId) {
    if (!elements.add(elementId)) {
      throw new IllegalStateException(
          "Repeated active "
              + kind.wireValue()
              + " element requires activation-ordinal derivation: "
              + elementId);
    }
  }

  private static int kindRank(WaitKind kind) {
    return switch (kind) {
      case USER_TASK -> 0;
      case MESSAGE -> 1;
      case TIMER -> 2;
      case EFFECT -> 3;
    };
  }
}
