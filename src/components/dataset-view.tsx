'use client';

import { ChevronDown, RotateCcw, Search, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFAULT_DATASET_NAME, useGa } from '@/components/ga-provider';
import { PageHeading, Panel, outlinePill } from '@/components/panel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DATA_FILES, DIKECUALIKAN, TAG_LABELS, tagLabel } from '@/ga/data';
import { cn, jam, rupiah } from '@/lib/utils';

const SELECT_CLASS = 'h-9 rounded-md border border-input bg-white px-2 text-sm';
type SortKey = 'id' | 'name' | 'ticket' | 'visitHours';

export function DatasetView() {
  const { dataset, datasetName, loadUploadedDataset, loadDefaultDataset } = useGa();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<SortKey>('id');
  const [showUpload, setShowUpload] = useState(false);
  const [upload, setUpload] = useState<{ attractions?: File; distance?: File; duration?: File }>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (dataset?.attractions ?? []).filter(
      (a) => (!q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)) && (!tag || a.tags.includes(tag)),
    );
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'id') : sort === 'id' ? a.index - b.index : a[sort] - b[sort]));
  }, [dataset, query, tag, sort]);

  async function applyUpload() {
    setMessage(null);
    if (!upload.attractions || !upload.distance || !upload.duration) {
      setMessage({ ok: false, text: 'Pilih ketiga berkas.' });
      return;
    }
    try {
      const [attractions, distance, duration] = await Promise.all([upload.attractions.text(), upload.distance.text(), upload.duration.text()]);
      loadUploadedDataset({ attractions, distance, duration }, upload.attractions.name);
      setMessage({ ok: true, text: 'Dataset dipakai.' });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading eyebrow="Dataset" title={`${dataset?.attractions.length ?? 0} destinasi`}>
          {datasetName !== DEFAULT_DATASET_NAME && <p className="text-sm text-white/70">{datasetName}</p>}
        </PageHeading>
        <div className="flex gap-2">
          {datasetName !== DEFAULT_DATASET_NAME && (
            <button type="button" className={outlinePill} onClick={loadDefaultDataset}>
              <RotateCcw className="size-4" /> Data asli
            </button>
          )}
          <button type="button" className={outlinePill} onClick={() => setShowUpload((s) => !s)}>
            <Upload className="size-4" /> Unggah
            <ChevronDown className={cn('size-4 transition-transform', showUpload && 'rotate-180')} />
          </button>
        </div>
      </div>

      {showUpload && (
        <Panel className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['attractions', 'Destinasi (.json/.csv)', DATA_FILES.attractions],
                ['distance', 'Jarak, meter (.csv)', DATA_FILES.distance],
                ['duration', 'Durasi, detik (.csv)', DATA_FILES.duration],
              ] as const
            ).map(([key, label, sample]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key} className="text-slate-500">
                  {label}
                </Label>
                <Input id={key} type="file" accept=".txt,.json,.csv" onChange={(e) => setUpload((u) => ({ ...u, [key]: e.target.files?.[0] }))} />
                <a href={sample} download className="text-xs text-slate-400 underline underline-offset-2">
                  contoh format
                </a>
              </div>
            ))}
          </div>
          <button type="button" onClick={applyUpload} className="h-10 rounded-full bg-ugm-ink px-5 text-sm font-semibold text-white">
            Pakai dataset
          </button>
          {message && <p className={cn('text-sm break-words', message.ok ? 'text-emerald-700' : 'text-red-600')}>{message.text}</p>}
        </Panel>
      )}

      <Panel className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-slate-400" />
            <Input placeholder="Cari destinasi" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select aria-label="Kategori" className={SELECT_CLASS} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Semua kategori</option>
            {Object.entries(TAG_LABELS).map(([t, label]) => (
              <option key={t} value={t}>
                {label}
              </option>
            ))}
          </select>
          <select aria-label="Urutkan" className={SELECT_CLASS} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="id">Urut ID</option>
            <option value="name">Nama</option>
            <option value="ticket">Termurah</option>
            <option value="visitHours">Tersingkat</option>
          </select>
        </div>

        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white">
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Tiket</TableHead>
                <TableHead className="text-right">Durasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const excluded = DIKECUALIKAN[a.name];
                return (
                  <TableRow key={a.id} className={cn(excluded && 'text-slate-400')}>
                    <TableCell className="tabular-nums text-slate-400">{a.id}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      {a.name}
                      {excluded && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px]" title={excluded}>
                          tidak dipakai
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal text-xs text-slate-500">{a.tags.map(tagLabel).join(', ')}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.ticket > 0 ? rupiah(a.ticket) : 'gratis'}</TableCell>
                    <TableCell className="text-right tabular-nums">{jam(a.visitHours, 2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
