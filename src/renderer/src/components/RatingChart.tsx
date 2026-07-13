import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { CFRatingChange } from '../types';

interface Props {
  data: CFRatingChange[];
}

export default function RatingChart({ data }: Props) {
  const chartData = data.map((d) => ({
    time: d.ratingUpdateTimeSeconds * 1000,
    rating: d.newRating,
    contestName: d.contestName,
    rank: d.rank,
  }));

  if (chartData.length === 0) {
    return <p style={{ color: '#606080', padding: '20px' }}>暂无比赛记录</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#304060" strokeDasharray="3 3" />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => new Date(t).toLocaleDateString()}
          stroke="#606080"
          fontSize={11}
        />
        <YAxis stroke="#606080" fontSize={11} />
        <Tooltip
          contentStyle={{ background: '#16213e', border: '1px solid #304060', borderRadius: '6px' }}
          labelStyle={{ color: '#e0e0e0' }}
          labelFormatter={(t) => new Date(t as number).toLocaleString()}
          formatter={(_value, _name, item) => {
            const d = item?.payload;
            return [
              `${d?.rating} (Rank ${d?.rank}, ${d?.contestName})`,
              'Rating',
            ];
          }}
        />
        <Line
          type="monotone"
          dataKey="rating"
          stroke="#4ecca3"
          strokeWidth={2}
          dot={{ fill: '#4ecca3', r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
