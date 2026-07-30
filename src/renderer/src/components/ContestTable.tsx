import type { CFRatingChange } from '../types';
import styles from '../styles/friendDetail.module.css';

interface Props {
  data: CFRatingChange[];
}

export default function ContestTable({ data }: Props) {
  const safeData = data ?? [];
  if (safeData.length === 0) {
    return <p className={styles.emptyText}>暂无比赛记录</p>;
  }

  const reversed = [...safeData].reverse();

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>比赛</th>
          <th>排名</th>
          <th>变化</th>
          <th>新 Rating</th>
          <th>时间</th>
        </tr>
      </thead>
      <tbody>
        {reversed.map((c, i) => {
          const delta = c.newRating - c.oldRating;
          return (
            <tr key={i}>
              <td>
                <a
                  href={`https://codeforces.com/contest/${c.contestId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.contestLink}
                >
                  {c.contestName}
                </a>
              </td>
              <td>{c.rank}</td>
              <td className={delta > 0 ? styles.up : delta < 0 ? styles.down : ''}>
                {delta > 0 ? '+' : ''}{delta}
              </td>
              <td>{c.newRating}</td>
              <td>{new Date(c.ratingUpdateTimeSeconds * 1000).toLocaleDateString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
