// Imported first by activity.integration.spec.ts. ConfigModule.forRoot validates the environment
// while src/app.module.ts is being loaded, so these defaults must be in place before that import;
// ES modules run in import order, which guarantees it. Values that are already set (from
// backend/.env or the shell) win, so a developer machine is unaffected.
//
// The name ends in "-spec.ts" on purpose: that keeps it out of the production build
// (tsconfig.build.json excludes **/*spec.ts) while Jest does not treat it as a test file.
const ENV_DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_ACCESS_SECRET: 'integration-access-secret-0123456789',
  JWT_REFRESH_SECRET: 'integration-refresh-secret-0123456789',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
};

for (const [name, value] of Object.entries(ENV_DEFAULTS)) {
  process.env[name] ??= value;
}
