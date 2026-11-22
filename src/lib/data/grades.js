/**
 * Grade band classification based on Swiss scale 1–6 and configured bands.
 *
 * Returns 'low', 'mid', or 'high' depending on where the grade falls
 * relative to the gradeBands configuration (gradeBands.midMin, gradeBands.highMin).
 */

export function gradeBand(grade, bands) {
  if (grade === null || grade === undefined) return 'mid';
  const midMin = bands?.midMin ?? 2.5;
  const highMin = bands?.highMin ?? 4;
  if (grade < midMin) return 'low';
  if (grade >= highMin) return 'high';
  return 'mid';
}