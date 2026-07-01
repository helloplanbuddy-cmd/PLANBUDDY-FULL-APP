// Prisma v7+ datasource URL moved out of schema.prisma.
//
// This config file is intentionally typed as `any` so `prisma generate`
// does not require `@prisma/client` to be installed yet.

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable (required for Prisma datasource config).');
}

const config: any = {
  datasources: {
    db: { url: databaseUrl },
  },
};

export default config;


