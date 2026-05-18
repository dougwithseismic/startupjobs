export interface RankedItem {
  id: string;
  rank: number;
}

export interface ChannelInput {
  name: string;
  weight: number;
  items: RankedItem[];
}

export interface FusedResult {
  id: string;
  score: number;
  channelRanks: Record<string, number>;
}

const DEFAULT_K = 60;

export function weightedRRF(
  channels: ChannelInput[],
  k: number = DEFAULT_K,
): FusedResult[] {
  const scoreMap = new Map<string, { score: number; ranks: Record<string, number> }>();

  for (const channel of channels) {
    for (const item of channel.items) {
      const existing = scoreMap.get(item.id) ?? { score: 0, ranks: {} };
      existing.score += channel.weight / (k + item.rank);
      existing.ranks[channel.name] = item.rank;
      scoreMap.set(item.id, existing);
    }
  }

  return Array.from(scoreMap.entries())
    .map(([id, { score, ranks }]) => ({
      id,
      score,
      channelRanks: ranks,
    }))
    .sort((a, b) => b.score - a.score);
}
