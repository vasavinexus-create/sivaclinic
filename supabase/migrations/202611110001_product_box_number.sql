-- 202611110001_product_box_number.sql
-- Add box_number to products table for storing medicine box / rack numbers.

alter table public.products
  add column if not exists box_number text;

comment on column public.products.box_number is 'Medicine box number or shelf/rack location for quick retrieval';
