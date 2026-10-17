import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "../i18n";

const dayLabel = (value: string, lang: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" });
};

export function MessageAreaChart({ data, height = 280 }: { data: any[]; height?: number }) {
  const { L, lang, n } = useI18n();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c8df0" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#0c8df0" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="#e8eef6" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value) => dayLabel(value, lang)} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip
            labelFormatter={(value) => dayLabel(String(value), lang)}
            formatter={(value: any, name: any) => [n(Number(value)), name]}
          />
          <Area type="monotone" dataKey="incoming" name={L("واردة", "Incoming")} stroke="#0c8df0" strokeWidth={2.2} fill="url(#colorIn)" dot={false} activeDot={{ r: 3.5 }} />
          <Area type="monotone" dataKey="outgoing" name={L("صادرة", "Outgoing")} stroke="#10b981" strokeWidth={2.2} fill="url(#colorOut)" dot={false} activeDot={{ r: 3.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CustomersBarChart({ data, height = 220 }: { data: any[]; height?: number }) {
  const { L, lang, n } = useI18n();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#e8eef6" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value) => dayLabel(value, lang)} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip labelFormatter={(value) => dayLabel(String(value), lang)} formatter={(value: any) => [n(Number(value)), L("عملاء جدد", "New customers")]} />
          <Bar dataKey="new_customers" fill="#36a9ff" radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ series }: { series: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {series.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function SimpleBarChart({
  data,
  dataKey = "unanswered",
  name,
  color = "#f59e0b",
  height = 210,
}: {
  data: any[];
  dataKey?: string;
  name: string;
  color?: string;
  height?: number;
}) {
  const { lang, n } = useI18n();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#e8eef6" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value) => dayLabel(value, lang)} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <Tooltip labelFormatter={(value) => dayLabel(String(value), lang)} formatter={(value: any) => [n(Number(value)), name]} />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
