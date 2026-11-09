import { WORKSHOP_TIERS } from '../core/arenaV41Growth.js';

const rarePoints = { none: 0, A: 2, B: 4, C: 6 };

export function workshopPerks(level) {
  const { discount, riskReduction, rarity } = WORKSHOP_TIERS[level - 1] ?? WORKSHOP_TIERS[0];
  return { discount, riskReduction, rareBonus: rarePoints[rarity] };
}
