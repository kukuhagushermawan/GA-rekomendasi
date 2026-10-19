import type { ProcessedDataset } from './schema';

/** JSON yang ramah diff: atraksi diindentasi, matriks ditulis satu baris per asal. */
export function serializeProcessed(data: ProcessedDataset): string {
  const n = data.attractions.length;
  const matrixJson = (cells: readonly number[]): string => {
    const rows: string[] = [];
    for (let i = 0; i < n; i++) rows.push(`    ${cells.slice(i * n, (i + 1) * n).join(',')}`);
    return `[\n${rows.join(',\n')}\n  ]`;
  };
  return `${JSON.stringify({ ...data, distanceM: '__DISTANCE__', durationS: '__DURATION__' }, null, 2)
    .replace('"__DISTANCE__"', matrixJson(data.distanceM))
    .replace('"__DURATION__"', matrixJson(data.durationS))}\n`;
}
