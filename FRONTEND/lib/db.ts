// ============================================================
// lib/db.ts — Prisma Client Singleton
// Prevents multiple instances during Next.js hot reload in dev.
// All server-side DB access goes through this singleton.
//
// IMPORTANT: PrismaClient is lazy-initialised so that Next.js
// static build steps (page data collection) don't fail when
// the Prisma engine binary hasn't been downloaded yet.
// In production the binary is available after `prisma generate`
// runs as part of the postinstall / build step.
// ============================================================

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }

  return client;
}

// Lazily create the singleton only when first accessed at request time.
// Using a Proxy so that any property access defers construction until
// after the Prisma engine binary is available (post-build / runtime).
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// ── Helper: soft-delete query extension ───────────────────
// Automatically excludes soft-deleted records from queries.
// Lazy getter — does NOT call $extends at module load time.
let _dbActive: ReturnType<PrismaClient['$extends']> | undefined;

export function getDbActive() {
  if (!_dbActive) {
    _dbActive = getClient().$extends({
      query: {
        $allModels: {
          async findMany({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
            args.where = { ...((args.where as Record<string, unknown>) ?? {}), deletedAt: null };
            return query(args);
          },
          async findFirst({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
            args.where = { ...((args.where as Record<string, unknown>) ?? {}), deletedAt: null };
            return query(args);
          },
          async findUnique({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
            return query(args);
          },
        },
      },
    });
  }
  return _dbActive;
}

// Backward-compatible export (still evaluates lazily via getter).
export const dbActive: ReturnType<PrismaClient['$extends']> = new Proxy({} as ReturnType<PrismaClient['$extends']>, {
  get(_target, prop) {
    const active = getDbActive();
    const value = (active as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(active) : value;
  },
});

export type { PrismaClient };
