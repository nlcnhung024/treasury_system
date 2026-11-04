import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { SortDirection } from '../../utils/sort';

export interface SortableThProps {
  field: string;
  currentSortField: string;
  currentSortDirection: SortDirection;
  onSort: (field: string) => void;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  theme?: 'light' | 'dark';
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
}) => {
  const isActive = currentSortField === field;
  const isDark = theme === 'dark';

  return (
    <th
      onClick={() => onSort(field)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(field);
        }
      }}
      tabIndex={0}
      role="columnheader"
      aria-sort={isActive ? (currentSortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`py-3 px-3 cursor-pointer select-none transition-colors whitespace-nowrap group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        isDark
          ? isActive
            ? 'text-indigo-300 bg-slate-700/90 font-bold'
            : 'text-slate-200 hover:bg-slate-700/60'
          : isActive
          ? 'text-indigo-700 bg-indigo-50/70 font-bold'
          : 'text-slate-600 hover:bg-slate-200/80'
      } ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
      title={`Click để sắp xếp theo ${typeof children === 'string' ? children : 'cột này'} (${
        isActive && currentSortDirection === 'asc' ? 'Giảm dần' : 'Tăng dần'
      })`}
    >
      <div
        className={`inline-flex items-center gap-1.5 ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        <span>{children}</span>
        {isActive ? (
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
      </div>
    </th>
  );
};

