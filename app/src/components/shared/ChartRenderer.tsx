import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

interface ChartData {
  type: "line" | "bar";
  data: Record<string, unknown>[];
  xAxisKey: string;
  lines: string[];
}

export function ChartRenderer({ data }: { data: string }) {
  const parsedData = useMemo(() => {
    try {
      const parsed = JSON.parse(data) as ChartData;
      return parsed;
    } catch (e) {
      console.error("Failed to parse chart data", e);
      return null;
    }
  }, [data]);

  if (!parsedData || !parsedData.data || !parsedData.lines) {
    return (
      <div className="p-4 my-6 border border-red-500/50 rounded-lg text-red-500 bg-red-500/10 text-sm">
        Failed to render chart: Invalid JSON format.
        <pre className="mt-2 text-xs opacity-70 overflow-x-auto">{data}</pre>
      </div>
    );
  }

  // Next.js dynamic requires can sometimes be tricky with Recharts, but 
  // typical React component rendering works fine with use client components.
  // Since MarkdownRenderer is mostly used in client components, we assume it's fine.
  
  const ChartComponent = parsedData.type === "bar" ? BarChart : LineChart;
  const DataComponent = parsedData.type === "bar" ? Bar : Line;

  const colors = ["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#8b5cf6"];

  return (
    <div className="w-full h-[400px] my-6 p-4 rounded-xl border border-border bg-card/50">
      <ResponsiveContainer width="100%" height="100%">
        <ChartComponent data={parsedData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis 
            dataKey={parsedData.xAxisKey} 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dx={-10}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))", 
              border: "1px solid hsl(var(--border))", 
              borderRadius: "8px",
              color: "hsl(var(--foreground))"
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} />
          {parsedData.lines.map((item, index) => {
            const dataKey = typeof item === "string" ? item : (item as any).valueKey || (item as any).dataKey || (item as any).key;
            if (!dataKey) return null;
            
            return (
              <DataComponent 
                key={dataKey}
                type="monotone"
                dataKey={dataKey}
                stroke={parsedData.type === "line" ? (typeof item === "object" && (item as any).color ? (item as any).color : colors[index % colors.length]) : undefined}
                fill={parsedData.type === "bar" ? (typeof item === "object" && (item as any).color ? (item as any).color : colors[index % colors.length]) : undefined}
                strokeWidth={(typeof item === "object" && (item as any).strokeWidth) ? (item as any).strokeWidth : 2}
                radius={parsedData.type === "bar" ? ([4, 4, 0, 0] as any) : undefined}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            );
          })}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
