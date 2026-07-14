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
    return <p style={{ color: '#646b85', padding: '20px' }}>暂无比赛记录</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#262b3c" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => new Date(t).toLocaleDateString()}
          stroke="#646b85"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#262b3c' }}
        />
        <YAxis
          stroke="#646b85"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#262b3c' }}
        />
        <Tooltip
          contentStyle={{
            background: '#1c2030',
            border: '1px solid #333a52',
            borderRadius: '10px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.38)',
          }}
          labelStyle={{ color: '#9aa1b8' }}
          itemStyle={{ color: '#34d399' }}
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
          stroke="#34d399"
          strokeWidth={2.5}
          dot={{ fill: '#34d399', r: 3 }}
          activeDot={{ r: 5, fill: '#5eead4' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
