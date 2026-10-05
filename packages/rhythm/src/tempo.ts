/** Choose a whole-number pulse tempo; a non-fixed range avoids consecutive repeats. */
export function selectPulseBpm(minBpm: number, maxBpm: number, previousBpm?: number, random: () => number = Math.random): number {
  if (!Number.isInteger(minBpm) || !Number.isInteger(maxBpm) || minBpm <= 0 || maxBpm < minBpm || maxBpm > 1000) {
    throw new RangeError('Invalid pulse tempo range.');
  }
  if (minBpm === maxBpm) return minBpm;
  const exclude = previousBpm !== undefined && Number.isInteger(previousBpm) && previousBpm >= minBpm && previousBpm <= maxBpm;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random value must be in [0, 1).');
  const selected = minBpm + Math.floor(value * (maxBpm - minBpm + 1 - Number(exclude)));
  return exclude && selected >= previousBpm! ? selected + 1 : selected;
}
