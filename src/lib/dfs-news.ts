import { neon } from "@neondatabase/serverless";

export type DfsNewsPost = {
  id: number;
  title: string;
  summary: string;
  body: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  title: string;
  summary: string;
  body: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): DfsNewsPost {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchPublishedNews(): Promise<DfsNewsPost[]> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const sql = neon(databaseUrl);
  const rows = (await sql`
    SELECT id, title, summary, body, is_published, published_at, created_at, updated_at
    FROM dfs_news
    WHERE is_published = TRUE
    ORDER BY published_at DESC, id DESC
  `) as Row[];

  return rows.map(mapRow);
}
