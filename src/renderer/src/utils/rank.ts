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

// 根据 rating 数值推断段位名称(用于缺少 rank 字段时的兜底)
function ratingToRank(rating?: number): string | undefined {
  if (rating == null) return undefined;
  if (rating < 1200) return 'newbie';
  if (rating < 1400) return 'pupil';
  if (rating < 1600) return 'specialist';
  if (rating < 1900) return 'expert';
  if (rating < 2100) return 'candidate master';
  if (rating < 2300) return 'master';
  if (rating < 2400) return 'international master';
  if (rating < 2600) return 'grandmaster';
  if (rating < 3000) return 'international grandmaster';
  return 'legendary grandmaster';
}

// 根据 rating 数值返回段位颜色(与 getRankColor 保持一致)
export function getRatingColor(rating?: number): string {
  return getRankColor(ratingToRank(rating));
}

// 根据 rating 数值返回段位名称
export function getRatingLabel(rating?: number): string {
  return getRankLabel(ratingToRank(rating));
}
