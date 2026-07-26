package org.bpmnlean.cibseven;

import java.util.Objects;

/** Exact, non-normalizing Unicode scalar-value ordering for canonical wire identifiers. */
final class WireStrings {

  private WireStrings() {}

  static int compare(String left, String right) {
    Objects.requireNonNull(left, "left");
    Objects.requireNonNull(right, "right");
    requireUnicodeScalars(left);
    requireUnicodeScalars(right);
    var leftIndex = 0;
    var rightIndex = 0;
    while (leftIndex < left.length() && rightIndex < right.length()) {
      var leftScalar = left.codePointAt(leftIndex);
      var rightScalar = right.codePointAt(rightIndex);
      if (leftScalar != rightScalar) {
        return Integer.compare(leftScalar, rightScalar);
      }
      leftIndex += Character.charCount(leftScalar);
      rightIndex += Character.charCount(rightScalar);
    }
    return Integer.compare(left.length() - leftIndex, right.length() - rightIndex);
  }

  private static void requireUnicodeScalars(String value) {
    for (var index = 0; index < value.length(); index++) {
      var unit = value.charAt(index);
      if (Character.isHighSurrogate(unit)) {
        if (index + 1 >= value.length()
            || !Character.isLowSurrogate(value.charAt(index + 1))) {
          throw new IllegalArgumentException("wire string contains an unpaired Unicode surrogate");
        }
        index++;
      } else if (Character.isLowSurrogate(unit)) {
        throw new IllegalArgumentException("wire string contains an unpaired Unicode surrogate");
      }
    }
  }
}
