/**
 * Per-tenant Neon Postgres wrapper.
 *
 * `DATABASE_URL` is injected by Vercel at runtime when Neon is provisioned
 * for the tenant. Local dev does not have Neon credentials, so callers
 * MUST handle the `null` return from `getDb()` gracefully.
 *
 * Provisioning check (from project root):
 *   curl <gateway.url>/api/tenants/<tenant.org_id>
 *   → look for `vercel.postgres_store_id` (this tenant has one).
 *
 * See `.agents/skills/aether/storage.md` for the full guidance.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

export function isDbConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

export function getDb(): NeonQueryFunction<false, false> | null {
    if (_sql) return _sql;
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    _sql = neon(url);
    return _sql;
}
