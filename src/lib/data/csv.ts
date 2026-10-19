/**
 * Parser CSV minimal yang meniru `csv.reader` Python (dialek default) yang dipakai upstream:
 * - tanda kutip hanya bermakna di AWAL field; kutip di tengah field dibaca literal
 *   (data upstream memuat nama `Taman Kota "Cattleya"` tanpa pembungkus kutip);
 * - di dalam field berkutip, `""` berarti satu tanda kutip;
 * - pemisah baris LF atau CRLF.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let atFieldStart = true;
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
    atFieldStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (field !== '' || row.length > 0) {
    endField();
    rows.push(row);
  }
  // Abaikan baris kosong di akhir berkas.
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
