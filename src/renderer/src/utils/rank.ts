const RANK_COLORS: Record<string, string> = {
  newbie: '#9CA3AF',
  pupil: '#00FF00',
  specialist: '#03A89E',
  expert: '#0000FF',
  'candidate master': '#AA00AA',
  master: '#FF8C00',
  'international master': '#FF8C00',
  grandmaster: '#FF0000',
  'international grandmaster': '#FF0000',
  'legendary grandmaster': '#FF0000',
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
