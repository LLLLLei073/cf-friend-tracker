const RANK_COLORS: Record<string, string> = {
  newbie: '#9aa1b8',
  pupil: '#5ee887',
  specialist: '#22c5c0',
  expert: '#6ba3ff',
  'candidate master': '#c77dff',
  master: '#ffa552',
  'international master': '#ff944d',
  grandmaster: '#ff5a5f',
  'international grandmaster': '#ff4757',
  'legendary grandmaster': '#ff2d4f',
};

export function getRankColor(rank: string | undefined): string {
  if (!rank) return '#9aa1b8';
  return RANK_COLORS[rank.toLowerCase()] ?? '#9aa1b8';
}

export function getRankLabel(rank: string | undefined): string {
  if (!rank) return 'Unrated';
  return rank
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
