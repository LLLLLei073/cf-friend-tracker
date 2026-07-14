const RANK_COLORS: Record<string, string> = {
  newbie: '#9CA3AF',
  pupil: '#2BA82B',
  specialist: '#03A89E',
  expert: '#3B6FE0',
  'candidate master': '#9333EA',
  master: '#E8820C',
  'international master': '#E8820C',
  grandmaster: '#E5383B',
  'international grandmaster': '#D92027',
  'legendary grandmaster': '#C4181D',
};

export function getRankColor(rank: string | undefined): string {
  if (!rank) return '#9CA3AF';
  return RANK_COLORS[rank.toLowerCase()] ?? '#9CA3AF';
}

export function getRankLabel(rank: string | undefined): string {
  if (!rank) return 'Unrated';
  return rank
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
