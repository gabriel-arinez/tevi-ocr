export function levenshtein(
  reference: readonly string[],
  hypothesis: readonly string[],
): number {
  const previous =
    new Array<number>(hypothesis.length + 1);

  const current =
    new Array<number>(hypothesis.length + 1);

  for (
    let j = 0;
    j <= hypothesis.length;
    j += 1
  ) {
    previous[j] = j;
  }

  for (
    let i = 1;
    i <= reference.length;
    i += 1
  ) {
    current[0] = i;

    for (
      let j = 1;
      j <= hypothesis.length;
      j += 1
    ) {
      const substitution =
        reference[i - 1] === hypothesis[j - 1]
          ? 0
          : 1;

      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) +
          substitution,
      );
    }

    for (
      let j = 0;
      j <= hypothesis.length;
      j += 1
    ) {
      previous[j] = current[j] ?? 0;
    }
  }

  return previous[hypothesis.length] ?? 0;
}
