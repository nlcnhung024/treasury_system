import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, RotateCcw, Eye, X, Filter } from 'lucide-react';
import { ColumnConfig } from '../../types/grid';

export interface TableGridToolbarProps {
  columns: ColumnConfig[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (field: string) => void;
  onShowAllColumns: () => void;
  onResetColumns: () => void;
  filteredCount: number;
  totalCount: number;
  activeFilterCount?: number;
  onClearAllFilters?: () => void;
  extraActions?: React.ReactNode;
  className?: string;
}

export const TableGridToolbar: React.FC<TableGridToolbarProps> = ({
  columns,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  onResetColumns,
  filteredCount,
  totalCount,
  activeFilterCount = 0,
  onClearAllFilters,
  extraActions,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const visibleCount = columns.filter((c) => visibleColumns[c.field] !== false).length;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 mb-2.5 ${className}`}
    >
      {/* Left side: Record count & Filter status */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="font-medium text-slate-700">
          Hiển thị <span className="font-bold text-indigo-700">{filteredCount}</span>
          {filteredCount !== totalCount && (
            <span> / <span className="text-slate-500">{totalCount}</span></span>
          )}{' '}
          bản ghi
        </span>

        {activeFilterCount > 0 && (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-medium text-[11px]">
            <Filter className="w-3 h-3 text-indigo-600" />
            <span>Đang lọc {activeFilterCount} cột</span>
            {onClearAllFilters && (
              <button
                type="button"
                onClick={onClearAllFilters}
                className="ml-1 p-0.5 hover:bg-indigo-200 rounded-full text-indigo-700 transition-colors"
                title="Xóa toàn bộ bộ lọc cột"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {activeFilterCount > 0 && onClearAllFilters && (
          <button
            type="button"
            onClick={onClearAllFilters}
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-600 transition-colors font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Xóa lọc</span>
          </button>
        )}
      </div>

      {/* Right side: Column Visibility Picker & Extra actions */}
      <div className="flex items-center gap-2 relative">
        {extraActions}

        {/* Column Picker Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors focus:outline-none ${
              isOpen
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            title="Quản lý hiển thị ẩn/hiện cột"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span>Tùy chỉnh cột ({visibleCount}/{columns.length})</span>
          </button>

          {isOpen && (
            <div className="absolute right-0 z-40 mt-1.5 w-60 bg-white rounded-lg shadow-xl border border-slate-200 p-2.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 font-semibold text-slate-800">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Ẩn / Hiện Cột</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onShowAllColumns}
                    className="text-[10px] text-indigo-600 hover:underline px-1"
                  >
                    Tất cả
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={onResetColumns}
                    className="text-[10px] text-slate-500 hover:underline px-1"
                  >
                    Mặc định
                  </button>
                </div>
              </div>

              {/* Column list with checkboxes */}
              <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                {columns.map((col) => {
                  const isVisible = visibleColumns[col.field] !== false;
                  return (
                    <label
                      key={col.field}
                      className={`flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer select-none transition-colors ${
                        col.disableHide ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      <span className="truncate mr-2 font-medium text-slate-700">
                        {col.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={isVisible}
                        disabled={col.disableHide}
                        onChange={() => !col.disableHide && onToggleColumn(col.field)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
