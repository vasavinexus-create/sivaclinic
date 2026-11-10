import test from 'node:test';
import assert from 'node:assert/strict';

// Core mapping & parsing functions matching medicineImport
function cleanHeader(h) {
  return String(h || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9%]/g, ' ')
    .replace(/\s+/g, ' ');
}

function mapHeaderToField(header) {
  const c = cleanHeader(header);
  if (c === 'MEDICINE' || c === 'MEDICINE NAME' || c === 'NAME' || c === 'PRODUCT') return 'medicine';
  if (c === 'GENIRIC' || c === 'GENERIC' || c === 'GENERIC NAME' || c === 'COMPOSITION') return 'generic_name';
  if (c === 'CATEGORY') return 'category';
  if (c === 'SALE UNIT' || c === 'SALEUNIT') return 'sale_unit';
  if (c === 'PURCHASE UNIT' || c === 'PURCHASEUNIT') return 'purchase_unit';
  if (c === 'UNITS PACK' || c === 'UNITS PER PACK' || c === 'UNIT PACK') return 'units_per_pack';
  if (c === 'MRP') return 'mrp';
  if (c === 'GST' || c === 'GST %' || c === 'GST PERCENT') return 'gst_percent';
  if (c === 'DISCOUNT %' || c === 'DISCOUNT') return 'discount_percent';
  if (c === 'MINIMUM STOCK' || c === 'MIN STOCK') return 'minimum_stock';
  if (c === 'STOCK' || c === 'OPENING STOCK' || c === 'QTY') return 'stock';
  if (c === 'BATCH' || c === 'BATCH NUMBER' || c === 'BATCH NO') return 'batch';
  if (c === 'EXPIRY DATE' || c === 'EXPIRY' || c === 'EXP DATE') return 'expiry_date';
  return null;
}

function parseCsvOrTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          cur += char;
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.every((c) => !c)) continue;
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] || '';
    });
    rows.push(rowObj);
  }
  return rows;
}

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }
  return s;
}

test('CSV Parser and header mapping support exact user format', () => {
  const csv = `MEDICINE,GENIRIC,CATEGORY,SALE UNIT,PURCHASE UNIT,UNITS/PACK,MRP,GST,DISCOUNT %,MINIMUM STOCK,STOCK,BATCH,EXPIRY DATE
Paracetamol 500mg,Paracetamol,Tablet,tablet,strip,10,25.00,12,0,50,100,B-PAR01,2027-12-31`;

  const parsed = parseCsvOrTsv(csv);
  assert.equal(parsed.length, 1);
  const row = parsed[0];
  assert.equal(mapHeaderToField('MEDICINE'), 'medicine');
  assert.equal(mapHeaderToField('GENIRIC'), 'generic_name');
  assert.equal(mapHeaderToField('CATEGORY'), 'category');
  assert.equal(mapHeaderToField('SALE UNIT'), 'sale_unit');
  assert.equal(mapHeaderToField('PURCHASE UNIT'), 'purchase_unit');
  assert.equal(mapHeaderToField('UNITS/PACK'), 'units_per_pack');
  assert.equal(mapHeaderToField('MRP'), 'mrp');
  assert.equal(mapHeaderToField('GST'), 'gst_percent');
  assert.equal(mapHeaderToField('DISCOUNT %'), 'discount_percent');
  assert.equal(mapHeaderToField('MINIMUM STOCK'), 'minimum_stock');
  assert.equal(mapHeaderToField('STOCK'), 'stock');
  assert.equal(mapHeaderToField('BATCH'), 'batch');
  assert.equal(mapHeaderToField('EXPIRY DATE'), 'expiry_date');

  assert.equal(row.MEDICINE, 'Paracetamol 500mg');
  assert.equal(row.GENIRIC, 'Paracetamol');
  assert.equal(row.STOCK, '100');
  assert.equal(row.BATCH, 'B-PAR01');
});

test('normalizeDate converts DD/MM/YYYY to YYYY-MM-DD', () => {
  assert.equal(normalizeDate('31/12/2027'), '2027-12-31');
  assert.equal(normalizeDate('05-06-2028'), '2028-06-05');
  assert.equal(normalizeDate('2027-12-31'), '2027-12-31');
});
