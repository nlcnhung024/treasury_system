import { useState, useMemo, useCallback } from 'react';
import { ColumnFilterValue, TableGridOptions } from '../types/grid';
import { SortDirection, sortList } from '../utils/sort';

export function useTableGrid<T extends Record<string, any>>(options: TableGridOptions<T>) {
  const { tableId, columns, defaultSortField, defaultSortDirection = 'asc' } = options;

  // LocalStorage keys
  const visibilityStorageKey = `bsp_grid_${tableId}_cols`;
  const widthsStorageKey = `bsp_grid_${tableId}_widths`;

  // 1. Column Visibility State (Khởi tạo và ghi nhớ từ localStorage)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const def: Record<string, boolean> = {};
    columns.forEach((c) => {
      def[c.field] = !c.hiddenByDefault;
    });

    try {
      const saved = localStorage.getItem(visibilityStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        return { ...def, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to parse grid visibility from localStorage', e);
    }
    return def;
  });

  const toggleColumn = useCallback((field: string) => {
    setVisibleColumns((prev) => {
      const current = prev[field] !== false;
      const next = { ...prev, [field]: !current };
      try {
        localStorage.setItem(visibilityStorageKey, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save grid visibility to localStorage', e);
      }
      return next;
    });
  }, [visibilityStorageKey]);

  const saveVisibility = useCallback((customConfig?: Record<string, boolean>) => {
    const configToSave = customConfig || visibleColumns;
    try {
      localStorage.setItem(visibilityStorageKey, JSON.stringify(configToSave));
      return true;
    } catch (e) {
      console.warn('Failed to save grid visibility to localStorage', e);
      return false;
    }
  }, [visibilityStorageKey, visibleColumns]);

  const showAllColumns = useCallback(() => {
    const next: Record<string, boolean> = {};
    columns.forEach((c) => (next[c.field] = true));
    setVisibleColumns(next);
    try {
      localStorage.setItem(visibilityStorageKey, JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save grid visibility to localStorage', e);
    }
  }, [columns, visibilityStorageKey]);

  const resetColumns = useCallback(() => {
    const next: Record<string, boolean> = {};
    columns.forEach((c) => (next[c.field] = !c.hiddenByDefault));
    setVisibleColumns(next);
    try {
      localStorage.setItem(visibilityStorageKey, JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save grid visibility to localStorage', e);
    }
  }, [columns, visibilityStorageKey]);

  const isColumnVisible = useCallback(
    (field: string) => visibleColumns[field] !== false,
    [visibleColumns]
  );

  // 2. Column Widths State
  const initialWidths = useMemo(() => {
    try {
      const saved = localStorage.getItem(widthsStorageKey);
      if (saved) {
        return JSON.parse(saved) as Record<string, number>;
      }
    } catch (e) {
      console.warn('Failed to parse grid widths from localStorage', e);
    }
    const def: Record<string, number> = {};
    columns.forEach((c) => {
      if (c.defaultWidth) def[c.field] = c.defaultWidth;
    });
    return def;
  }, [tableId, columns, widthsStorageKey]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(initialWidths);

  const handleResize = useCallback((field: string, width: number) => {
    setColumnWidths((prev) => {
      const next = { ...prev, [field]: width };
      try {
        localStorage.setItem(widthsStorageKey, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save grid widths to localStorage', e);
      }
      return next;
    });
  }, [widthsStorageKey]);

  // 3. Sorting State
  const [sortField, setSortField] = useState<string>(defaultSortField || (columns[0]?.field ?? ''));
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const handleSort = useCallback((field: string) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return field;
      } else {
        setSortDirection('asc');
        return field;
      }
    });
  }, []);

  // 4. Filtering State
  const [filters, setFilters] = useState<Record<string, ColumnFilterValue>>({});

  const setFilter = useCallback((field: string, value: ColumnFilterValue | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === null || value === undefined) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }, []);

  const clearFilter = useCallback((field: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
  }, []);

  const activeFilterCount = useMemo(() => {
    return Object.keys(filters).length;
  }, [filters]);

  // 5. Filter & Sort Execution Logic
  const columnTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    columns.forEach((c) => {
      map[c.field] = c.type || 'text';
    });
    return map;
  }, [columns]);

  const filterAndSort = useCallback(
    (items: T[], customExtractors?: Record<string, (item: T) => any>): T[] => {
      if (!items || items.length === 0) return [];

      let result = items;

      // Filter
      const activeKeys = Object.keys(filters);
      if (activeKeys.length > 0) {
        result = result.filter((item) => {
          for (const key of activeKeys) {
            const filter = filters[key];
            if (!filter) continue;

            const extractor = customExtractors && customExtractors[key];
            const rawValue = extractor ? extractor(item) : item[key];
            const colType = columnTypeMap[key] || 'text';

            if (colType === 'number') {
              const num = rawValue != null && rawValue !== '' ? Number(rawValue) : null;
              if (filter.min != null && filter.min !== '') {
                if (num == null || num < Number(filter.min)) return false;
              }
              if (filter.max != null && filter.max !== '') {
                if (num == null || num > Number(filter.max)) return false;
              }
            } else if (colType === 'date') {
              const strDate = rawValue ? String(rawValue).slice(0, 10) : '';
              if (filter.min) {
                if (!strDate || strDate < String(filter.min).slice(0, 10)) return false;
              }
              if (filter.max) {
                if (!strDate || strDate > String(filter.max).slice(0, 10)) return false;
              }
            } else {
              // Text Filter
              const str = rawValue != null ? String(rawValue).toLowerCase().trim() : '';
              if (typeof filter === 'string') {
                if (!str.includes(filter.toLowerCase().trim())) return false;
              } else if (filter) {
                const op = filter.operator || 'contains';
                const target = filter.value ? String(filter.value).toLowerCase().trim() : '';

                switch (op) {
                  case 'contains':
                    if (!str.includes(target)) return false;
                    break;
                  case 'equals':
                    if (str !== target) return false;
                    break;
                  case 'startsWith':
                    if (!str.startsWith(target)) return false;
                    break;
                  case 'endsWith':
                    if (!str.endsWith(target)) return false;
                    break;
                  case 'notContains':
                    if (str.includes(target)) return false;
                    break;
                  case 'isEmpty':
                    if (str !== '') return false;
                    break;
                  case 'isNotEmpty':
                    if (str === '') return false;
                    break;
                }
              }
            }
          }
          return true;
        });
      }

      // Sort
      if (sortField) {
        return sortList(result, sortField, sortDirection, customExtractors);
      }

      return result;
    },
    [filters, sortField, sortDirection, columnTypeMap]
  );

  return {
    // Visibility
    visibleColumns,
    toggleColumn,
    showAllColumns,
    resetColumns,
    saveVisibility,
    isColumnVisible,
    // Widths / Resizing
    columnWidths,
    handleResize,
    // Sorting
    sortField,
    sortDirection,
    handleSort,
    setSortField,
    setSortDirection,
    // Filtering
    filters,
    setFilter,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    // Executor
    filterAndSort,
  };
}
