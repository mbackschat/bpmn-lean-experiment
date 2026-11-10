package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.bpmnlean.cibseven.ScenarioProtocol.Recurrence;
import org.junit.Test;

/**
 * A finite cycle's `recurrence.remaining` is its declared count less the chain's earlier firings (CIB-OP-0018). CIB can
 * chain past the count (CIB-DEV-0006), and the observation has no value for a job with fewer than no firings left, so
 * the runner fails that scenario as a harness failure instead of emitting a negative count or clamping it.
 */
public class CibSevenRecurrenceRemainingTest {
  @Test
  public void countsDownFromTheDeclaredCount() {
    assertEquals(Long.valueOf(2), CibSevenOpenWaitProjector.remaining(new Recurrence(20_000L, null, 3L), 1).remaining());
    assertEquals(Long.valueOf(0), CibSevenOpenWaitProjector.remaining(new Recurrence(20_000L, null, 2L), 2).remaining());
  }

  @Test
  public void leavesAnUnboundedOrCronCycleAlone() {
    assertNull(CibSevenOpenWaitProjector.remaining(new Recurrence(20_000L, null, null), 5).remaining());
    assertNull(CibSevenOpenWaitProjector.remaining(null, 5));
  }

  // `R<n>/<start>/<end>` repeats the interval between its two dates (`DurationHelper`), so its period is their distance.
  @Test
  public void readsADatedIntervalsPeriodFromItsTwoDates() {
    var dated = CibSevenOpenWaitProjector.recurrence("R2/1970-01-01T00:01:00Z/1970-01-01T00:01:20Z");
    assertEquals(Long.valueOf(20_000), dated.periodMs());
    assertEquals(Long.valueOf(2), dated.remaining());
    assertEquals(Long.valueOf(20_000), CibSevenOpenWaitProjector.recurrence("R2/1970-01-01T00:01:00Z/PT20S").periodMs());
  }

  @Test
  public void refusesAChainPastItsDeclaredCount() {
    var failure = assertThrows(IllegalStateException.class,
        () -> CibSevenOpenWaitProjector.remaining(new Recurrence(20_000L, null, 2L), 3));
    assertTrue(failure.getMessage(), failure.getMessage().contains("CIB-DEV-0006"));
  }
}
