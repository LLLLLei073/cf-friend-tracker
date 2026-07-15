const RANK_COLORS: Record<string, string> = {
  newbie: '#9CA3AF',
  pupil: '#4A7C3A',
  specialist: '#0E7C6B',
  expert: '#3B6FE0',
  'candidate master': '#7B3FB5',
  master: '#E8820C',
  'international master': '#E8820C',
  grandmaster: '#C41E3A',
  'international grandmaster': '#A8152E',
  'legendary grandmaster': '#8B1024',
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
