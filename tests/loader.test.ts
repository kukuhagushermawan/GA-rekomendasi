import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/data/csv';
import {
  DatasetValidationError,
  buildDataset,
  distanceKm,
  fromProcessed,
  rawDistanceM,
  rawDurationS,
  toProcessed,
  travelHours,
} from '@/lib/data/load';
import { readRawDir } from '@/lib/data/node';
import { F, FIXTURE_DIR, loadFixture } from './helpers';

const input = () => readRawDir(FIXTURE_DIR);

describe('buildDataset — fixture data asli', () => {
  const ds = loadFixture();

  it('memuat 7 atraksi dan melaporkan label matriks non-atraksi', () => {
    expect(ds.attractions).toHaveLength(7);
    expect(ds.extraMatrixLabels).toEqual(['Jakarta']);
    expect(ds.matrices.size).toBe(7);
  });

  it('menormalisasi satuan: HTM string → rupiah, visitDuration string → jam', () => {
    const nm = ds.attractions[F.NM];
    expect(nm).toMatchObject({ id: 'ID001', name: 'National Monument', ticketPriceIdr: 20000, visitHours: 0.5, number: 6 });
    expect(ds.attractions[F.MPD]?.visitHours).toBe(0);
  });

  it('menghapus koma untuk kunci matriks tanpa mengubah nama tampilan', () => {
    expect(ds.attractions[F.MS]).toMatchObject({ name: 'Merdeka Square, Jakarta', matrixKey: 'Merdeka Square Jakarta' });
  });

  it('rating yang tidak ada menjadi null', () => {
    expect(ds.attractions[F.MS]?.rating).toBeNull();
    expect(ds.attractions[F.NM]?.rating).toBeTypeOf('number');
  });

  it('menyimpan sel matriks apa adanya (meter / detik)', () => {
    // distanceMatrix.csv baris "National Monument", kolom "Merdeka Square Jakarta" = 403; durasi = 39.
    expect(rawDistanceM(ds.matrices, F.NM, F.MS)).toBe(403);
    expect(rawDurationS(ds.matrices, F.NM, F.MS)).toBe(39);
    // Matriks asimetris: arah sebaliknya 566 m / 54 s.
    expect(rawDistanceM(ds.matrices, F.MS, F.NM)).toBe(566);
    expect(rawDurationS(ds.matrices, F.MS, F.NM)).toBe(54);
    // Nilai tak masuk akal tetap dipertahankan (tidak dihitung ulang).
    expect(rawDistanceM(ds.matrices, F.NM, F.ET)).toBe(3096350);
    expect(rawDistanceM(ds.matrices, F.NM, F.NK)).toBe(-1);
    expect(rawDistanceM(ds.matrices, F.NK, F.NK)).toBe(-1);
  });

  it('accessor km/jam mengonversi satuan dan mengembalikan null untuk sel -1 atau 0 di luar diagonal', () => {
    expect(distanceKm(ds.matrices, F.NM, F.MS)).toBe(0.403);
    expect(travelHours(ds.matrices, F.NM, F.MS)).toBe(39 / 3600);
    expect(distanceKm(ds.matrices, F.NM, F.NM)).toBe(0);
    expect(distanceKm(ds.matrices, F.NM, F.NK)).toBeNull();
    expect(distanceKm(ds.matrices, F.IJ, F.TLB)).toBeNull();
    expect(travelHours(ds.matrices, F.IJ, F.TLB)).toBeNull();
  });

  it('mengindeks matriks berdasarkan NAMA, bukan posisi baris/kolom', () => {
    const original = input();
    const reverse = (csv: string) => {
      const rows = parseCsv(csv);
      const header = rows[0] as string[];
      const order = [0, ...header.slice(1).map((_, i) => header.length - 1 - i)];
      const body = rows.slice(1).reverse();
      return `${[header, ...body].map((r) => order.map((i) => r[i]).join(',')).join('\n')}\n`;
    };
    const shuffled = buildDataset({
      ...original,
      distanceCsv: reverse(original.distanceCsv),
      durationCsv: reverse(original.durationCsv),
    });
    expect(Array.from(shuffled.matrices.distanceM)).toEqual(Array.from(ds.matrices.distanceM));
    expect(Array.from(shuffled.matrices.durationS)).toEqual(Array.from(ds.matrices.durationS));
  });

  it('round-trip ke format processed tetap identik', () => {
    const source = { repository: 'x', commit: 'y', license: 'GPL-3.0', files: {} };
    const back = fromProcessed(JSON.parse(JSON.stringify(toProcessed(ds, source))));
    expect(back.attractions).toEqual(ds.attractions);
    expect(Array.from(back.matrices.distanceM)).toEqual(Array.from(ds.matrices.distanceM));
    expect(Array.from(back.matrices.durationS)).toEqual(Array.from(ds.matrices.durationS));
  });
});

describe('buildDataset — validasi', () => {
  const places = () => JSON.parse(input().attractionsJson) as { places: Record<string, unknown>[] };

  const expectIssue = (fn: () => unknown, pattern: RegExp) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetValidationError);
      expect((error as DatasetValidationError).issues.join('\n')).toMatch(pattern);
      return;
    }
    throw new Error('seharusnya melempar DatasetValidationError');
  };

  it('menolak ticketPrice yang bukan digit', () => {
    const data = places();
    (data.places[0] as Record<string, unknown>).ticketPrice = 'Rp 20.000';
    expectIssue(() => buildDataset({ ...input(), attractionsJson: JSON.stringify(data) }), /ticketPrice/);
  });

  it('menolak atraksi tanpa tag', () => {
    const data = places();
    (data.places[0] as Record<string, unknown>).tags = [];
    expectIssue(() => buildDataset({ ...input(), attractionsJson: JSON.stringify(data) }), /tags/);
  });

  it('menolak nama yang bentrok setelah koma dihapus', () => {
    const data = places();
    (data.places[1] as Record<string, unknown>).name = 'Merdeka Square Jakarta';
    expectIssue(() => buildDataset({ ...input(), attractionsJson: JSON.stringify(data) }), /Merdeka Square Jakarta/);
  });

  it('menolak atraksi yang tidak ada di header matriks', () => {
    const data = places();
    (data.places[0] as Record<string, unknown>).name = 'Tempat Yang Tidak Ada';
    expectIssue(() => buildDataset({ ...input(), attractionsJson: JSON.stringify(data) }), /Tempat Yang Tidak Ada/);
  });

  it('menolak sel matriks < -1 atau bukan bilangan bulat', () => {
    const csv = input().distanceCsv;
    expectIssue(() => buildDataset({ ...input(), distanceCsv: csv.replace(',403,', ',-2,') }), /-2/);
    expectIssue(() => buildDataset({ ...input(), distanceCsv: csv.replace(',403,', ',4.5,') }), /4\.5/);
  });

  it('menolak urutan baris yang tidak sama dengan header', () => {
    const rows = input().distanceCsv.trim().split('\n');
    const swapped = [rows[0], rows[2], rows[1], ...rows.slice(3)].join('\n');
    expectIssue(() => buildDataset({ ...input(), distanceCsv: swapped }), /urutan baris/);
  });
});
