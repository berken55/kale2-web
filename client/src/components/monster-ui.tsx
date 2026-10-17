import { MONSTER_ELEMENTS, MONSTER_RACES, MONSTER_RANKS, labelOf } from '@shared/constants';

const RANK_COLORS: Record<string, string> = {
  NORMAL: '#c7ccd6',
  ELITE: '#4ea3ff',
  BOSS: '#ffad33',
  KING: '#ff6b5a',
  STONE: '#b86cff',
  NPC: '#5fd068',
};

export const rankColor = (rank: string) => RANK_COLORS[rank] ?? RANK_COLORS.NORMAL;

export function RankBadge({ rank }: { rank: string }) {
  const color = rankColor(rank);
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {labelOf(MONSTER_RANKS, rank)}
    </span>
  );
}

export const raceLabel = (race: string) => (race ? labelOf(MONSTER_RACES, race) : '—');
export const elementLabel = (element: string) => (element ? labelOf(MONSTER_ELEMENTS, element) : '—');

/** "+15%" / "-30%" biçiminde gösterir */
export const signedPct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;
