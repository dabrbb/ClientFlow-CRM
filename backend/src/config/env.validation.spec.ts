// class-transformer reads design:type metadata to convert PORT. Nest loads reflect-metadata in
// the running app, but this isolated test has to load it itself.
import 'reflect-metadata';
import { validate } from './env.validation';

type Env = Record<string, string | undefined>;

const DB_PASSWORD = 's3cret-db-pass';
const ACCESS_SECRET = 'valid-access-secret-0123';
const REFRESH_SECRET = 'valid-refresh-secret-0123';

const validEnv: Env = {
  DATABASE_URL: `postgresql://crm_user:${DB_PASSWORD}@localhost:5432/clientflow`,
  PORT: '3000',
  NODE_ENV: 'development',
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_REFRESH_SECRET: REFRESH_SECRET,
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
};

const withEnv = (patch: Env = {}): Env => ({ ...validEnv, ...patch });

const errorMessageOf = (env: Env): string => {
  try {
    validate(env);
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  throw new Error('Expected validate() to throw');
};

describe('validate', () => {
  describe('a valid configuration', () => {
    it('is accepted and keeps the values', () => {
      expect(validate(withEnv())).toMatchObject({
        DATABASE_URL: validEnv.DATABASE_URL,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '7d',
      });
    });

    it('converts PORT from the string found in process.env to a number', () => {
      const result = validate(withEnv({ PORT: '3000' }));

      expect(result.PORT).toBe(3000);
    });

    it('does not require PORT or NODE_ENV', () => {
      const result = validate(withEnv({ PORT: undefined, NODE_ENV: undefined }));

      expect(result.PORT).toBeUndefined();
      expect(result.NODE_ENV).toBeUndefined();
    });

    it('is not bothered by unrelated variables', () => {
      expect(() => validate(withEnv({ PATH: '/usr/bin', SOME_OTHER_VAR: 'x' }))).not.toThrow();
    });
  });

  describe('PORT', () => {
    it.each(['1', '65535'])('accepts %s', (port) => {
      expect(validate(withEnv({ PORT: port })).PORT).toBe(Number(port));
    });

    it.each(['0', '65536', '3000.5', 'abc', ''])('rejects "%s"', (port) => {
      expect(() => validate(withEnv({ PORT: port }))).toThrow(/PORT/);
    });
  });

  describe('NODE_ENV', () => {
    it.each(['development', 'production', 'test'])('accepts %s', (nodeEnv) => {
      expect(validate(withEnv({ NODE_ENV: nodeEnv })).NODE_ENV).toBe(nodeEnv);
    });

    it('rejects an unknown environment', () => {
      expect(() => validate(withEnv({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/);
    });
  });

  describe.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])('%s', (name) => {
    it('accepts a secret of exactly 16 characters', () => {
      expect(() => validate(withEnv({ [name]: 'x'.repeat(16) }))).not.toThrow();
    });

    it('rejects a secret of 15 characters', () => {
      expect(() => validate(withEnv({ [name]: 'x'.repeat(15) }))).toThrow(new RegExp(name));
    });

    it('rejects an empty secret', () => {
      expect(() => validate(withEnv({ [name]: '' }))).toThrow(new RegExp(name));
    });

    it('rejects a missing secret', () => {
      expect(() => validate(withEnv({ [name]: undefined }))).toThrow(new RegExp(name));
    });
  });

  describe.each(['JWT_ACCESS_EXPIRES', 'JWT_REFRESH_EXPIRES'])('%s', (name) => {
    it.each(['15m', '1h', '7d', '500ms', '30s', '2w', '1y'])('accepts "%s"', (duration) => {
      expect(validate(withEnv({ [name]: duration }))).toMatchObject({ [name]: duration });
    });

    it.each(['15 m', '15M', '1.5h', '-1d', '', '15min'])('rejects "%s"', (duration) => {
      expect(() => validate(withEnv({ [name]: duration }))).toThrow(new RegExp(name));
    });

    it('rejects a bare number because jsonwebtoken would read it as milliseconds', () => {
      expect(() => validate(withEnv({ [name]: '3600' }))).toThrow(new RegExp(name));
    });

    it('rejects a missing value', () => {
      expect(() => validate(withEnv({ [name]: undefined }))).toThrow(new RegExp(name));
    });
  });

  describe('DATABASE_URL', () => {
    it.each(['postgresql://u:p@localhost:5432/db', 'postgres://u:p@localhost:5432/db'])(
      'accepts %s',
      (url) => {
        expect(() => validate(withEnv({ DATABASE_URL: url }))).not.toThrow();
      },
    );

    it.each(['mysql://u:p@localhost:3306/db', 'postgresql:u@localhost/db', ''])(
      'rejects "%s"',
      (url) => {
        expect(() => validate(withEnv({ DATABASE_URL: url }))).toThrow(/DATABASE_URL/);
      },
    );

    it('rejects a missing value', () => {
      expect(() => validate(withEnv({ DATABASE_URL: undefined }))).toThrow(/DATABASE_URL/);
    });
  });

  describe('error message', () => {
    it('starts with a fixed header', () => {
      expect(errorMessageOf(withEnv({ PORT: 'abc' }))).toMatch(
        /^Invalid environment configuration:/,
      );
    });

    it('names the broken variable and none of the valid ones', () => {
      const message = errorMessageOf(withEnv({ PORT: 'abc' }));

      expect(message).toContain('PORT');
      for (const valid of [
        'DATABASE_URL',
        'NODE_ENV',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'JWT_ACCESS_EXPIRES',
        'JWT_REFRESH_EXPIRES',
      ]) {
        expect(message).not.toContain(valid);
      }
    });

    it('reports every problem at once, whatever the order', () => {
      const message = errorMessageOf(
        withEnv({
          DATABASE_URL: 'mysql://x',
          PORT: 'abc',
          NODE_ENV: 'staging',
          JWT_ACCESS_SECRET: 'short',
          JWT_REFRESH_SECRET: 'short',
          JWT_ACCESS_EXPIRES: 'soon',
          JWT_REFRESH_EXPIRES: undefined,
        }),
      );

      for (const name of [
        'DATABASE_URL',
        'PORT',
        'NODE_ENV',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'JWT_ACCESS_EXPIRES',
        'JWT_REFRESH_EXPIRES',
      ]) {
        expect(message).toContain(name);
      }
    });

    it('does not leak JWT secrets that are rejected', () => {
      const message = errorMessageOf(
        withEnv({ JWT_ACCESS_SECRET: 'leaky-access-1', JWT_REFRESH_SECRET: 'leaky-refresh-2' }),
      );

      expect(message).toContain('JWT_ACCESS_SECRET');
      expect(message).not.toContain('leaky-access-1');
      expect(message).not.toContain('leaky-refresh-2');
    });

    it('does not leak the password of a rejected DATABASE_URL', () => {
      const message = errorMessageOf(
        withEnv({ DATABASE_URL: 'mysql://admin:p4ssw0rd-LEAK@db.example.com/crm' }),
      );

      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain('p4ssw0rd-LEAK');
    });

    it('does not leak valid secrets or the database password while reporting other errors', () => {
      const message = errorMessageOf(withEnv({ PORT: 'abc' }));

      expect(message).not.toContain(ACCESS_SECRET);
      expect(message).not.toContain(REFRESH_SECRET);
      expect(message).not.toContain(DB_PASSWORD);
    });
  });
});
