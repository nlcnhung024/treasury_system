export type SortDirection = 'asc' | 'desc';

export function compareValues(a: any, b: any, direction: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return direction === 'asc' ? 1 : -1;
  if (b == null) return direction === 'asc' ? -1 : 1;

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    const numA = a ? 1 : 0;
    const numB = b ? 1 : 0;
    return direction === 'asc' ? numA - numB : numB - numA;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a;
  }

  const strA = String(a).trim();
  const strB = String(b).trim();
  const numA = Number(strA);
  const numB = Number(strB);

  // Check if they are valid pure numbers (and not date strings like "2024-03-01")
  const isDateA = /^\d{4}-\d{2}/.test(strA);
  const isDateB = /^\d{4}-\d{2}/.test(strB);

  if (!isDateA && !isDateB && !isNaN(numA) && !isNaN(numB) && strA !== '' && strB !== '') {
    return direction === 'asc' ? numA - numB : numB - numA;
  }

  const cmp = strA.localeCompare(strB, 'vi', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? cmp : -cmp;
}

export function sortList<T>(
  list: T[],
  sortField: string,
  sortDirection: SortDirection,
  extractors?: Record<string, (item: T) => any>
): T[] {
  if (!sortField) return list;
  return [...list].sort((itemA, itemB) => {
    const valA = extractors && extractors[sortField] ? extractors[sortField](itemA) : (itemA as any)[sortField];
    const valB = extractors && extractors[sortField] ? extractors[sortField](itemB) : (itemB as any)[sortField];
    return compareValues(valA, valB, sortDirection);
  });
}

