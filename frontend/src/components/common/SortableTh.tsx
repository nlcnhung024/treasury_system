import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Filter, X, Check } from 'lucide-react';
import { SortDirection } from '../../utils/sort';
import { ColumnFilterValue, ColumnType, TextFilterOperator } from '../../types/grid';

export interface SortableThProps {
  field: string;
  currentSortField: string;
  currentSortDirection: SortDirection;
  onSort: (field: string) => void;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  theme?: 'light' | 'dark';
  // Grid Extensions:
  filterType?: ColumnType;
  filterValue?: ColumnFilterValue;
  onFilterChange?: (value: any) => void;
  width?: number;
  minWidth?: number;
  onResize?: (newWidth: number) => void;
  disableFilter?: boolean;
}

export const SortableTh: React.FC<SortableThProps> = ({
  field,
  currentSortField,
  currentSortDirection,
  onSort,
  children,
  align = 'left',
  className = '',
  theme = 'light',
  filterType = 'text',
  filterValue,
  onFilterChange,
  width,
  minWidth = 70,
  onResize,
  disableFilter = false,
}) => {
  const isActiveSort = currentSortField === field;
  const isDark = theme === 'dark';

  // Filter Popover State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Check if active filter exists
  const hasActiveFilter = React.useMemo(() => {
    if (!filterValue) return false;
    if (typeof filterValue === 'string') return filterValue.trim() !== '';
    if (filterType === 'number' || filterType === 'date') {
      return (
        (filterValue.min !== undefined && filterValue.min !== '' && filterValue.min !== null) ||
        (filterValue.max !== undefined && filterValue.max !== '' && filterValue.max !== null)
      );
    }
    if (filterValue.operator === 'isEmpty' || filterValue.operator === 'isNotEmpty') return true;
    return Boolean(filterValue.value && String(filterValue.value).trim() !== '');
  }, [filterValue, filterType]);

  // Local draft filter for Popover
  const [operator, setOperator] = useState<TextFilterOperator>(
    filterValue?.operator || 'contains'
  );
  const [textValue, setTextValue] = useState<string>(
    typeof filterValue === 'string' ? filterValue : filterValue?.value || ''
  );
  const [rangeMin, setRangeMin] = useState<string>(
    filterValue?.min !== undefined && filterValue?.min !== null ? String(filterValue.min) : ''
  );
  const [rangeMax, setRangeMax] = useState<string>(
    filterValue?.max !== undefined && filterValue?.max !== null ? String(filterValue.max) : ''
  );

  // Sync draft when filterValue prop changes
  useEffect(() => {
    if (typeof filterValue === 'string') {
      setTextValue(filterValue);
      setOperator('contains');
    } else if (filterValue) {
      if (filterValue.operator) setOperator(filterValue.operator);
      if (filterValue.value !== undefined) setTextValue(String(filterValue.value));
      if (filterValue.min !== undefined) setRangeMin(filterValue.min != null ? String(filterValue.min) : '');
      if (filterValue.max !== undefined) setRangeMax(filterValue.max != null ? String(filterValue.max) : '');
    } else {
      setTextValue('');
      setRangeMin('');
      setRangeMax('');
      setOperator('contains');
    }
  }, [filterValue]);

  // Click outside listener for Popover
  useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  // Apply Filter
  const handleApplyFilter = () => {
    if (!onFilterChange) return;
    if (filterType === 'number' || filterType === 'date') {
      const minVal = rangeMin !== '' ? (filterType === 'number' ? Number(rangeMin) : rangeMin) : null;
      const maxVal = rangeMax !== '' ? (filterType === 'number' ? Number(rangeMax) : rangeMax) : null;
      if (minVal == null && maxVal == null) {
        onFilterChange(null);
      } else {
        onFilterChange({ min: minVal, max: maxVal });
      }
    } else {
      if (operator === 'isEmpty' || operator === 'isNotEmpty') {
        onFilterChange({ operator, value: '' });
      } else if (textValue.trim() === '') {
        onFilterChange(null);
      } else {
        onFilterChange({ operator, value: textValue.trim() });
      }
    }
    setIsFilterOpen(false);
  };

  // Clear Filter
  const handleClearFilter = () => {
    setTextValue('');
    setRangeMin('');
    setRangeMax('');
    setOperator('contains');
    if (onFilterChange) onFilterChange(null);
    setIsFilterOpen(false);
  };

  // Resize Handler
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(width || 120);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;
    startWidthRef.current = width || 120;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const nextWidth = Math.max(minWidth, startWidthRef.current + delta);
      if (onResize) onResize(nextWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const styleObj: React.CSSProperties = {
    width: width ? `${width}px` : undefined,
    minWidth: `${minWidth}px`,
  };

  return (
    <th
      style={styleObj}
      className={`relative py-3 px-3 select-none transition-colors whitespace-nowrap group outline-none ${
        isDark
          ? isActiveSort
            ? 'text-indigo-300 bg-slate-700/90 font-bold'
            : 'text-slate-200 hover:bg-slate-700/60'
          : isActiveSort
          ? 'text-indigo-700 bg-indigo-50/70 font-bold'
          : 'text-slate-600 hover:bg-slate-200/80'
      } ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      <div
        className={`inline-flex items-center gap-1.5 w-full ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        {/* Sort Title Click Area */}
        <button
          type="button"
          onClick={() => onSort(field)}
          className="inline-flex items-center gap-1.5 font-inherit cursor-pointer hover:opacity-85 focus:outline-none"
          title={`Click để sắp xếp theo cột này (${
            isActiveSort && currentSortDirection === 'asc' ? 'Giảm dần' : 'Tăng dần'
          })`}
        >
          <span className="truncate">{children}</span>
          {isActiveSort ? (
            currentSortDirection === 'asc' ? (
              <ArrowUp className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`} />
            ) : (
              <ArrowDown className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`} />
            )
          ) : (
            <ArrowUpDown
              className={`w-3 h-3 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity ${
                isDark ? 'text-slate-400 group-hover:text-slate-200' : 'text-slate-400 group-hover:text-slate-600'
              }`}
            />
          )}
        </button>

        {/* Filter Trigger Button */}
        {!disableFilter && onFilterChange && (
          <div className="relative inline-block ml-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFilterOpen((prev) => !prev);
              }}
              className={`p-1 rounded transition-colors focus:outline-none ${
                hasActiveFilter
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 opacity-60 group-hover:opacity-100'
              }`}
              title={hasActiveFilter ? 'Cột đang lọc điều kiện (click để sửa/xóa)' : 'Lọc cột này'}
            >
              <Filter className="w-3 h-3" />
            </button>

            {/* Filter Popover */}
            {isFilterOpen && (
              <div
                ref={filterPopoverRef}
                onClick={(e) => e.stopPropagation()}
                className="absolute z-50 mt-2 left-0 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-3 text-xs text-slate-700 text-left normal-case font-normal animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 font-semibold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Lọc cột: {typeof children === 'string' ? children : field}</span>
                  </div>
                  <button
                    onClick={() => setIsFilterOpen(false)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Filter Controls based on Column Type */}
                {filterType === 'number' || filterType === 'date' ? (
                  <div className="space-y-2.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      {filterType === 'number' ? 'Lọc theo khoảng giá trị:' : 'Lọc theo khoảng thời gian:'}
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        {filterType === 'number' ? 'Từ số tiền / giá trị (Min):' : 'Từ ngày (Start date):'}
                      </label>
                      <input
                        type={filterType === 'number' ? 'number' : 'date'}
                        value={rangeMin}
                        onChange={(e) => setRangeMin(e.target.value)}
                        placeholder="Không giới hạn"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        {filterType === 'number' ? 'Đến số tiền / giá trị (Max):' : 'Đến ngày (End date):'}
                      </label>
                      <input
                        type={filterType === 'number' ? 'number' : 'date'}
                        value={rangeMax}
                        onChange={(e) => setRangeMax(e.target.value)}
                        placeholder="Không giới hạn"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* Text Filter with condition operators */
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-medium mb-1">
                        Điều kiện lọc chuỗi:
                      </label>
                      <select
                        value={operator}
                        onChange={(e) => setOperator(e.target.value as TextFilterOperator)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="contains">Chứa (Contains)</option>
                        <option value="equals">Bằng chính xác (Equals)</option>
                        <option value="startsWith">Bắt đầu bằng (Starts with)</option>
                        <option value="endsWith">Kết thúc bằng (Ends with)</option>
                        <option value="notContains">Không chứa (Does not contain)</option>
                        <option value="isEmpty">Rỗng (Is empty)</option>
                        <option value="isNotEmpty">Có dữ liệu (Is not empty)</option>
                      </select>
                    </div>

                    {operator !== 'isEmpty' && operator !== 'isNotEmpty' && (
                      <div>
                        <label className="block text-[10px] text-slate-500 font-medium mb-1">
                          Giá trị tìm kiếm:
                        </label>
                        <input
                          type="text"
                          value={textValue}
                          onChange={(e) => setTextValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
                          placeholder="Nhập từ khóa..."
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Popover Action Buttons */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleClearFilter}
                    disabled={!hasActiveFilter && !rangeMin && !rangeMax && !textValue}
                    className="text-[11px] text-slate-500 hover:text-red-600 disabled:opacity-40 transition-colors"
                  >
                    Xóa lọc
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFilter}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Áp dụng
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize Handle Divider */}
      {onResize && (
        <div
          onMouseDown={handleMouseDownResize}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-indigo-500 active:bg-indigo-600 transition-colors z-10"
          title="Kéo thả để thay đổi độ rộng cột"
        />
      )}
    </th>
  );
};
