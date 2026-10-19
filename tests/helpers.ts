import path from 'node:path';
import { buildDataset } from '@/lib/data/load';
import { readRawDir } from '@/lib/data/node';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const RAW_DIR = path.join(ROOT, 'data', 'raw');
export const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'mini');

/**
 * Fixture = 7 baris ASLI dari data/raw (lihat scripts/make-fixture.ts). Indeks setelah dimuat:
 * 0 National Monument (Rp20.000, 0,5 j) · 1 Irian Jaya Liberation Monument (Rp0, 0,1 j)
 * 2 Merdeka Square, Jakarta (Rp0, 0,75 j) · 3 Museum of East Timor (Rp15.000, 0,45 j)
 * 4 Taman Lapangan Banteng (Rp0, 1,5 j) · 5 Monumen Patung Dirgantara (Rp0, 0 j) · 6 Nofri kasur (Rp0, 1 j)
 */
export const F = { NM: 0, IJ: 1, MS: 2, ET: 3, TLB: 4, MPD: 5, NK: 6 } as const;

export const loadFixture = () => buildDataset(readRawDir(FIXTURE_DIR));
