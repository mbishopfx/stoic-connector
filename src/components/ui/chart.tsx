"use client";

import { createContext, useContext, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label: string; color: string }>;

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string;
  color?: string;
  value?: number | string | null;
  payload?: Record<string, unknown>;
};

type ChartTooltipContentProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
  labelFormatter?: (label: string | number | undefined) => ReactNode;
};

const ChartConfigContext = createContext<ChartConfig>({});

export function ChartContainer({
  config,
  className,
  children,
  style,
  ...props
}: React.ComponentProps<"div"> & { config: ChartConfig; children: ReactElement }) {
  const chartVariables = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color]),
  ) as CSSProperties;

  return <ChartConfigContext.Provider value={config}>
    <div
      data-slot="chart"
      className={cn("w-full text-xs", className)}
      style={{ ...style, ...chartVariables }}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  </ChartConfigContext.Provider>;
}

export function ChartTooltipContent({ active, payload, label, labelFormatter }: ChartTooltipContentProps) {
  const config = useContext(ChartConfigContext);
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as { complete?: boolean; recordedWindows?: number; expectedWindows?: number } | undefined;
  const hasCoverage = typeof point?.recordedWindows === "number" && typeof point.expectedWindows === "number";

  return <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
    <p className="mb-2 font-medium">{labelFormatter ? labelFormatter(label) : label}</p>
    <div className="space-y-1.5">
      {payload.map((item, index) => {
        const key = String(item.dataKey ?? item.name ?? index);
        const entry = config[key];
        return <div key={`${key}-${index}`} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: entry?.color || item.color }} />
            {entry?.label || item.name || key}
          </span>
          <span className="font-mono font-medium tabular-nums">{item.value == null ? "—" : Number(item.value).toLocaleString()}</span>
        </div>;
      })}
    </div>
    {hasCoverage && <p className="mt-2 border-t pt-2 text-muted-foreground">
      {point.complete
        ? `${point.recordedWindows} of ${point.expectedWindows} six-hour windows recorded`
        : `${point.recordedWindows} of ${point.expectedWindows} expected six-hour windows recorded; daily totals hidden until coverage is complete`}
    </p>}
  </div>;
}

export { Tooltip as ChartTooltip };
