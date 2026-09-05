export function jobBackoffMilliseconds(
  attemptNumber: number,
  baseMilliseconds: number,
  maximumMilliseconds: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(
    maximumMilliseconds,
    baseMilliseconds * 2 ** Math.max(0, attemptNumber - 1),
  );
  const boundedRandom = Math.min(1, Math.max(0, random()));
  return Math.max(1, Math.round(exponential * (0.8 + boundedRandom * 0.4)));
}
