import { notFound } from "next/navigation";
import V2App from "../V2App";
import { v2Nav } from "../lib/modules";

export const dynamicParams = false;
const aliasPages: Record<string, string> = { "users-roles": "users-and-roles" };

export function generateStaticParams() {
  const pages = v2Nav.filter(item => item.key && item.key !== "dashboard").map(item => item.key!);
  return [...pages, ...Object.keys(aliasPages)].map(page => ({ page }));
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page: rawPage } = await params;
  const page = aliasPages[rawPage] || rawPage;
  if (!v2Nav.some(item => item.key === page)) notFound();
  return <V2App pageKey={page}/>;
}
