import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const DEFAULT_MEDICINE_CATEGORIES = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Injection",
  "Ointment",
  "Cream",
  "Drops",
  "Inhaler",
  "Gel",
  "Lotion",
  "Powder",
  "Sachet",
  "Device",
  "Surgical",
  "Ayurvedic",
  "General",
];

function formatCategoryName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

test('formatCategoryName properly trims and capitalizes category names', () => {
  assert.equal(formatCategoryName('  tablet  '), 'Tablet');
  assert.equal(formatCategoryName('eye drops'), 'Eye Drops');
  assert.equal(formatCategoryName('pain relief medicine'), 'Pain Relief Medicine');
  assert.equal(formatCategoryName(''), '');
  assert.equal(formatCategoryName('   '), '');
});

test('DEFAULT_MEDICINE_CATEGORIES contains common medicine forms', () => {
  assert.ok(DEFAULT_MEDICINE_CATEGORIES.includes('Tablet'));
  assert.ok(DEFAULT_MEDICINE_CATEGORIES.includes('Capsule'));
  assert.ok(DEFAULT_MEDICINE_CATEGORIES.includes('Syrup'));
  assert.ok(DEFAULT_MEDICINE_CATEGORIES.includes('Injection'));
  assert.ok(DEFAULT_MEDICINE_CATEGORIES.includes('Ointment'));
  assert.ok(DEFAULT_MEDICINE_CATEGORIES.includes('Drops'));
});

test('Database migration creates medicine_categories and pre-populates from products', async () => {
  const db = new PGlite();
  const migration = (name) => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  
  const initial = await migration('migrations/202608110001_initial_sivacare.sql');
  await db.exec(initial.replace('create extension if not exists pgcrypto;', '').split('insert into storage.buckets')[0]);

  // Insert a test organization and some products with categories
  const orgId = randomUUID();
  await db.query('insert into organizations(id, name, clinic_name) values($1, $2, $3)', [orgId, 'Test Clinic', 'Test Clinic']);

  await db.query(
    `insert into products(id, organization_id, product_id, name, category)
     values ($1, $2, 'MED-1', 'Paracetamol 500mg', 'Tablet'),
            ($2, $2, 'MED-2', 'Cough Syrup', 'Syrup')`,
    [randomUUID(), orgId]
  );

  // Run the new medicine_categories migration
  const categoryMigration = await migration('migrations/202611100000_medicine_categories.sql');
  await db.exec(categoryMigration);

  // Verify the categories were populated from products
  const res = await db.query('select name from medicine_categories where organization_id = $1 order by name', [orgId]);
  const names = res.rows.map(r => r.name);
  assert.deepEqual(names, ['Syrup', 'Tablet']);

  // Verify inserting a new category succeeds
  await db.query(
    'insert into medicine_categories(id, organization_id, name) values ($1, $2, $3)',
    [randomUUID(), orgId, 'Eye Drops']
  );

  const updatedRes = await db.query('select name from medicine_categories where organization_id = $1 order by name', [orgId]);
  const updatedNames = updatedRes.rows.map(r => r.name);
  assert.deepEqual(updatedNames, ['Eye Drops', 'Syrup', 'Tablet']);

  await db.close();
});
