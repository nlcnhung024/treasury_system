import React, { useState } from 'react';

export interface TreemapItem {
  id: string;
  name: string;
  shortName?: string;
  value: number;
  percentage: number;
  loansCount?: number;
  wair?: number;
  colorGradient: string;
  textColor?: string;
  badge?: string;
}

interface TreemapChartProps {
  items: TreemapItem[];
  height?: number | string;
  formatValue?: (val: number) => string;
  emptyMessage?: string;
  theme?: 'indigo' | 'emerald' | 'mixed';
}

interface CalculatedRect extends TreemapItem {
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  w: number; // percentage 0 - 100
  h: number; // percentage 0 - 100
}

/**
 * Computes a balanced 2D Treemap partition with minimum visual guarantee
 * so small slices (e.g. < 2%) remain readable and interactive.
 */
function computeTreemapLayout(items: TreemapItem[]): CalculatedRect[] {
  if (!items || items.length === 0) return [];

  const totalValue = items.reduce((sum, it) => sum + (it.value || 0), 0);
  if (totalValue <= 0) return [];

  // Sort descending
  const sorted = [...items].sort((a, b) => b.value - a.value);

  // Apply layout dampening: guarantee minimum 3.5% weight for layout geometry
  // while preserving the true mathematical percentage for display
  const minLayoutVal = totalValue * 0.035;
  const layoutItems = sorted.map((it) => ({
    ...it,
    layoutVal: Math.max(it.value, minLayoutVal),
  }));

  const partition = (
    nodes: Array<TreemapItem & { layoutVal: number }>,
    x: number,
    y: number,
    w: number,
    h: number
  ): CalculatedRect[] => {
    if (nodes.length === 0) return [];
    if (nodes.length === 1) {
      const node = nodes[0];
      return [
        {
          ...node,
          x,
          y,
          w,
          h,
        },
      ];
    }

    const subTotal = nodes.reduce((sum, n) => sum + n.layoutVal, 0);
    const half = subTotal / 2.0;

    let running = 0.0;
    let splitIdx = 1;
    let bestDiff = subTotal;

    for (let i = 0; i < nodes.length; i++) {
      running += nodes[i].layoutVal;
      const diff = Math.abs(running - half);
      if (diff < bestDiff) {
        bestDiff = diff;
        splitIdx = i + 1;
      } else if (running > half && i > 0) {
        break;
      }
    }

    let g1 = nodes.slice(0, splitIdx);
    let g2 = nodes.slice(splitIdx);
    if (g2.length === 0) {
      g1 = nodes.slice(0, -1);
      g2 = nodes.slice(-1);
    }

    const s1 = g1.reduce((sum, n) => sum + n.layoutVal, 0);

    if (w >= h) {
      const w1 = (s1 / subTotal) * w;
      const w2 = w - w1;
      return [...partition(g1, x, y, w1, h), ...partition(g2, x + w1, y, w2, h)];
    } else {
      const h1 = (s1 / subTotal) * h;
      const h2 = h - h1;
      return [...partition(g1, x, y, w, h1), ...partition(g2, x, y + h1, w, h2)];
    }
  };

  return partition(layoutItems, 0, 0, 100, 100);
}

export const TreemapChart: React.FC<TreemapChartProps> = ({
  items,
  height = 360,
  formatValue = (v) => `${Number(v).toLocaleString('vi-VN')} ₫`,
  emptyMessage = 'Chưa có dữ liệu phân bổ.',
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!items || items.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400"
      >
        {emptyMessage}
      </div>
    );
  }

  const rects = computeTreemapLayout(items);

  return (
    <div
      style={{ height }}
      className="relative w-full rounded-xl overflow-hidden bg-slate-100 p-1 border border-slate-200 shadow-inner select-none"
    >
      {rects.map((rect) => {
        const isHovered = hoveredId === rect.id;
        const isSmallBox = rect.w < 18 || rect.h < 22;
        const isVerySmallBox = rect.w < 14 || rect.h < 15;

        return (
          <div
            key={rect.id}
            onMouseEnter={() => setHoveredId(rect.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              left: `calc(${rect.x}% + 2px)`,
              top: `calc(${rect.y}% + 2px)`,
              width: `calc(${rect.w}% - 4px)`,
              height: `calc(${rect.h}% - 4px)`,
            }}
            className={`absolute rounded-lg transition-all duration-200 flex flex-col justify-between p-2.5 overflow-hidden cursor-pointer shadow-xs border border-white/30 ${
              rect.colorGradient
            } ${isHovered ? 'z-20 scale-[1.01] shadow-lg ring-2 ring-white/80' : 'z-10'}`}
          >
            {/* Top row: Name & Badge */}
            <div className="w-full min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span
                  className="font-bold text-white text-xs sm:text-sm tracking-tight truncate drop-shadow-xs"
                  title={rect.name}
                >
                  {isVerySmallBox && rect.shortName ? rect.shortName : rect.name}
                </span>
                {rect.badge && !isVerySmallBox && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/20 text-white backdrop-blur-xs flex-shrink-0">
                    {rect.badge}
                  </span>
                )}
              </div>
            </div>

            {/* Middle / Main: Percentage Below Name */}
            <div className="my-auto text-center w-full">
              <div className="inline-flex flex-col items-center">
                <span
                  className={`font-black tracking-tight text-white drop-shadow-md ${
                    isVerySmallBox ? 'text-xs' : isSmallBox ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'
                  }`}
                >
                  {rect.percentage.toFixed(1)}%
                </span>
                {!isSmallBox && (
                  <span className="text-[11px] font-semibold text-white/90 drop-shadow-xs truncate max-w-full">
                    {formatValue(rect.value)}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom row: WAIR & Loan count (if space permits) */}
            {!isSmallBox && (
              <div className="w-full flex items-center justify-between text-[10px] text-white/85 pt-1 border-t border-white/20">
                {rect.loansCount !== undefined ? (
                  <span>{rect.loansCount} HĐ</span>
                ) : (
                  <span />
                )}
                {rect.wair !== undefined && (
                  <span className="font-medium bg-black/20 px-1.5 py-0.5 rounded text-white">
                    WAIR: {rect.wair.toFixed(2)}%
                  </span>
                )}
              </div>
            )}

            {/* Hover Tooltip Overlay for Rich Information */}
            {isHovered && (
              <div className="absolute inset-0 bg-slate-900/90 text-white p-3 flex flex-col justify-center animate-in fade-in duration-150 backdrop-blur-xs z-30">
                <p className="font-bold text-xs line-clamp-2 text-amber-300">
                  {rect.name}
                </p>
                <div className="mt-1.5 space-y-1 text-[11px]">
                  <div className="flex justify-between border-b border-white/10 pb-0.5">
                    <span className="text-slate-300">Tỷ trọng:</span>
                    <strong className="text-emerald-400">{rect.percentage.toFixed(2)}%</strong>
                  </div>
                  <div className="flex justify-between border-b border-white/10 pb-0.5">
                    <span className="text-slate-300">Dư nợ:</span>
                    <strong className="text-white">{formatValue(rect.value)}</strong>
                  </div>
                  {rect.loansCount !== undefined && (
                    <div className="flex justify-between border-b border-white/10 pb-0.5">
                      <span className="text-slate-300">Số khoản vay:</span>
                      <strong>{rect.loansCount} hợp đồng</strong>
                    </div>
                  )}
                  {rect.wair !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-300">Lãi suất BQ:</span>
                      <strong className="text-purple-300">{rect.wair.toFixed(2)}%/năm</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
