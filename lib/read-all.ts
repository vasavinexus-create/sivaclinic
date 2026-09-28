// Fetch every matching row in stable pages; never silently truncate financial totals.
export async function readAll(query: () => any): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query().range(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}
