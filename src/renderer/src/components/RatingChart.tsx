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
    return <p style={{ color: '#B0A99E', padding: '20px' }}>暂无比赛记录</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#E2DED4" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(t) => new Date(t).toLocaleDateString()}
          stroke="#B0A99E"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#E2DED4' }}
        />
        <YAxis
          stroke="#B0A99E"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#E2DED4' }}
        />
        <Tooltip
          contentStyle={{
            background: '#FDFCF8',
            border: '1px solid #E2DED4',
            borderRadius: '12px',
            boxShadow: '0 2px 6px rgba(60,50,30,0.05), 0 8px 20px rgba(60,50,30,0.06)',
          }}
          labelStyle={{ color: '#7A7268' }}
          itemStyle={{ color: '#9A7400' }}
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
          stroke="#F5C518"
          strokeWidth={2.5}
          dot={{ fill: '#F5C518', r: 3 }}
          activeDot={{ r: 5, fill: '#FFD426' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
