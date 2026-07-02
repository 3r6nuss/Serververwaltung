import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const AXIS = { stroke: '#52525b', fontSize: 11 }
const GRID = '#27272a'

function DarkTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-zinc-300">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-3" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono">
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
            {p.payload?.unit ?? unit ?? ''}
          </span>
        </p>
      ))}
    </div>
  )
}

// Flächendiagramm für eine einzelne Zeitreihe (CPU, RAM, Ping …).
export function AreaSeries({ data, dataKey, name, color = '#f97316', unit = '', domain, height = 200 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS} tickLine={false} minTickGap={24} />
        <YAxis {...AXIS} tickLine={false} width={40} domain={domain} unit={unit} />
        <Tooltip content={<DarkTooltip unit={unit} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Gestapeltes/gruppiertes Balkendiagramm (z.B. Traffic in/out).
export function BarSeries({ data, series, unit = '', height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS} tickLine={false} minTickGap={20} />
        <YAxis {...AXIS} tickLine={false} width={44} unit={unit} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<DarkTooltip unit={unit} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
