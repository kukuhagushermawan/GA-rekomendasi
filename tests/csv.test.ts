import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/data/csv';

describe('parseCsv', () => {
  it('membaca kutip di tengah field secara literal (seperti csv.reader Python)', () => {
    expect(parseCsv('origin,Taman Kota "Cattleya",X\n')).toEqual([['origin', 'Taman Kota "Cattleya"', 'X']]);
  });

  it('mendukung field berkutip yang berisi koma dan kutip ganda ter-escape', () => {
    expect(parseCsv('"a, b","say ""hi""",c')).toEqual([['a, b', 'say "hi"', 'c']]);
  });

  it('menangani CRLF dan mengabaikan baris kosong di akhir', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('mempertahankan field kosong', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });
});
