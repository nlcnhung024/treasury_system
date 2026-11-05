import { SortDirection } from '../utils/sort';

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'status' | 'actions';

export type TextFilterOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'notContains'
  | 'isEmpty'
  | 'isNotEmpty';

export interface TextFilterValue {
  operator: TextFilterOperator;
  value: string;
}

export interface RangeFilterValue {
  min?: number | string | null;
  max?: number | string | null;
}

export type ColumnFilterValue = TextFilterValue | RangeFilterValue | string | any;

export interface ColumnConfig {
  field: string;
  label: string;
  type?: ColumnType;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  disableSort?: boolean;
  disableFilter?: boolean;
  disableHide?: boolean;
  locked?: boolean;
  hiddenByDefault?: boolean;
}

export interface TableGridOptions<_T = any> {
  tableId: string;
  columns: ColumnConfig[];
  defaultSortField?: string;
  defaultSortDirection?: SortDirection;
}
