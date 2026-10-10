import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const checker = path.join(import.meta.dirname, 'check-production-config.mjs');
const secret = () => randomBytes(32).toString('hex');

function configuration() {
  const password = secret();
  return {services: {app: {environment: {
    POSTGRES_PASSWORD: password,
    ENCRYPTION_KEY: secret(),
    JOB_SECRET: secret(),
    DATABASE_URL: `postgresql://hrd:${password}@db:5432/home_retreat_direct`,
    DIRECT_DATABASE_URL: `postgres://hrd:${password}@db:5432/home_retreat_direct`,
    APP_ORIGIN: 'https://homeretreatdirect.com',
    DATABASE_TRANSPORT: 'pg',
    DEVELOPMENT_CATALOG: 'false',
    SHOW_DEMO_REVIEWS: 'false',
    LOCAL_MEDIA_ENABLED: 'true',
    LOCAL_MEDIA_DIRECTORY: '/app/.local/media',
    EMAIL_DELIVERY_ENABLED: 'false',
    INIT_PRODUCTION_CONFIRMED: 'homeretreatdirect.com',
    SEED_OWNER_EMAIL: `${randomBytes(12).toString('hex')}@example.test`,
    SEED_OWNER_PASSWORD: randomBytes(24).toString('base64url'),
  }}}};
}

function composeJson(configuration) {
  // Match normal Compose output, which escapes dollars after JSON serialization.
  return JSON.stringify(configuration).replaceAll('$', () => '$$');
}

function run(input, mode = 'fresh', extraArguments = []) {
  const result = spawnSync(process.execPath, [checker, mode, ...extraArguments], {
    input: typeof input === 'string' ? input : composeJson(input),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
  assert.ifError(result.error);
  return {code: result.status, stdout: result.stdout, stderr: result.stderr};
}

function assertRejected(result, field) {
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(`${field}:`), result.stderr);
}

test('fresh mode accepts valid resolved configuration and both PostgreSQL schemes', () => {
  const result = run(configuration());
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Production configuration checks passed.\n');
});

test('resume mode permits enabled email and omitted owner seed fields', () => {
  const compose = configuration();
  const environment = compose.services.app.environment;
  environment.EMAIL_DELIVERY_ENABLED = 'true';
  delete environment.SEED_OWNER_EMAIL;
  delete environment.SEED_OWNER_PASSWORD;
  const result = run(compose, 'resume');
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Production configuration checks passed.\n');
});

test('fresh mode rejects short owner passwords and accepts the minimum length', () => {
  const compose = configuration();
  compose.services.app.environment.SEED_OWNER_PASSWORD = randomBytes(7).toString('hex');
  assertRejected(run(compose), 'SEED_OWNER_PASSWORD');
  compose.services.app.environment.SEED_OWNER_PASSWORD = randomBytes(8).toString('hex');
  assert.equal(run(compose).code, 0);
});

test('fresh mode rejects a 15-character runtime password serialized as 19 characters', () => {
  const compose = configuration();
  const password = randomBytes(6).toString('hex').slice(0, 11) + '$'.repeat(4);
  compose.services.app.environment.SEED_OWNER_PASSWORD = password;
  const serialized = composeJson(compose);
  assert.equal(password.length, 15);
  assert.equal(JSON.parse(serialized).services.app.environment.SEED_OWNER_PASSWORD.length, 19);
  assertRejected(run(serialized), 'SEED_OWNER_PASSWORD');
});

test('fresh mode accepts a 16-character runtime password containing dollars', () => {
  const compose = configuration();
  const password = randomBytes(6).toString('hex') + '$a$b';
  compose.services.app.environment.SEED_OWNER_PASSWORD = password;
  assert.equal(password.length, 16);
  const result = run(compose);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
});

test('Compose dollar escaping is decoded once, preserving genuine consecutive dollars', () => {
  const compose = configuration();
  const password = randomBytes(4).toString('hex') + '$'.repeat(8);
  compose.services.app.environment.SEED_OWNER_PASSWORD = password;
  const serialized = composeJson(compose);
  assert.equal(password.length, 16);
  assert.equal(JSON.parse(serialized).services.app.environment.SEED_OWNER_PASSWORD.length, 24);
  const result = run(serialized);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
});

test('fresh mode requires explicit initialization confirmation', () => {
  const compose = configuration();
  delete compose.services.app.environment.INIT_PRODUCTION_CONFIRMED;
  assertRejected(run(compose), 'INIT_PRODUCTION_CONFIRMED');
  assert.equal(run(compose, 'resume').code, 0);
});

test('fresh mode requires disabled email and a valid owner email', () => {
  const compose = configuration();
  compose.services.app.environment.EMAIL_DELIVERY_ENABLED = 'true';
  compose.services.app.environment.SEED_OWNER_EMAIL = randomBytes(12).toString('hex');
  const result = run(compose);
  assertRejected(result, 'EMAIL_DELIVERY_ENABLED');
  assertRejected(result, 'SEED_OWNER_EMAIL');
});

test('database connections must match the password and every internal connection field', async t => {
  const changes = {
    password: (url) => {url.password = secret();},
    username: (url) => {url.username = randomBytes(5).toString('hex');},
    hostname: (url) => {url.hostname = `${randomBytes(8).toString('hex')}.example.test`;},
    port: (url) => {url.port = '5433';},
    database: (url) => {url.pathname = `/${randomBytes(8).toString('hex')}`;},
    scheme: (url) => {url.protocol = 'mysql:';},
    query: (url) => {url.search = `?value=${secret()}`;},
    hash: (url) => {url.hash = secret();},
  };
  for (const field of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
    for (const [name, change] of Object.entries(changes)) {
      await t.test(`${field} rejects a changed ${name}`, () => {
        const compose = configuration();
        const url = new URL(compose.services.app.environment[field]);
        change(url);
        compose.services.app.environment[field] = url.href;
        assertRejected(run(compose), field);
      });
    }
    for (const suffix of ['?', '#', '/', '\n']) {
      await t.test(`${field} rejects an extra connection suffix`, () => {
        const compose = configuration();
        compose.services.app.environment[field] += suffix;
        assertRejected(run(compose), field);
      });
    }
  }
});

test('database passwords are compared after URL decoding', () => {
  const compose = configuration();
  const environment = compose.services.app.environment;
  const encoded = [...environment.POSTGRES_PASSWORD].map(character =>
    `%${character.charCodeAt(0).toString(16)}`).join('');
  environment.DATABASE_URL = `postgresql://hrd:${encoded}@db:5432/home_retreat_direct`;
  assert.equal(run(compose).code, 0);
});

test('required secrets reject missing and malformed values', async t => {
  for (const field of ['POSTGRES_PASSWORD', 'ENCRYPTION_KEY', 'JOB_SECRET']) {
    await t.test(`${field} rejects a missing value`, () => {
      const compose = configuration();
      delete compose.services.app.environment[field];
      assertRejected(run(compose, 'resume'), field);
    });
    await t.test(`${field} rejects a short value`, () => {
      const compose = configuration();
      compose.services.app.environment[field] = randomBytes(31).toString('hex');
      assertRejected(run(compose), field);
    });
    await t.test(`${field} rejects nonhexadecimal characters`, () => {
      const compose = configuration();
      compose.services.app.environment[field] = `g${secret().slice(1)}`;
      assertRejected(run(compose), field);
    });
    await t.test(`${field} rejects a trailing newline`, () => {
      const compose = configuration();
      compose.services.app.environment[field] += '\n';
      assertRejected(run(compose), field);
    });
  }
});

test('production settings require exact string values', async t => {
  for (const field of ['APP_ORIGIN', 'DATABASE_TRANSPORT', 'DEVELOPMENT_CATALOG',
    'SHOW_DEMO_REVIEWS', 'LOCAL_MEDIA_ENABLED', 'LOCAL_MEDIA_DIRECTORY']) {
    await t.test(`${field} rejects a changed value`, () => {
      const compose = configuration();
      compose.services.app.environment[field] = randomBytes(12).toString('hex');
      assertRejected(run(compose, 'resume'), field);
    });
  }
});

test('invalid JSON and malformed Compose structures produce safe diagnostics', () => {
  const malformed = `{"secret":"${secret()}"`;
  const result = run(malformed);
  assertRejected(result, 'COMPOSE_JSON');
  assert.equal(result.stderr, 'COMPOSE_JSON: Supply valid resolved Compose JSON on stdin.\n');
  for (const input of [null, [], {}, {services: {app: {environment: []}}}]) {
    assertRejected(run(input), 'services.app.environment');
  }
});

test('errors never print input values, connection URLs, secrets or parser details', () => {
  const compose = configuration();
  const environment = compose.services.app.environment;
  environment.JOB_SECRET = randomBytes(31).toString('hex');
  environment.APP_ORIGIN = `https://${secret()}.example.test`;
  environment.DATABASE_URL = `postgresql://hrd:${secret()}@${secret()}.example.test:5432/home_retreat_direct`;
  environment.SEED_OWNER_PASSWORD = randomBytes(7).toString('hex');
  const result = run(compose);
  assert.equal(result.code, 1);
  const output = result.stdout + result.stderr;
  for (const value of Object.values(environment)) {
    if (value.length >= 14) assert.ok(!output.includes(value), 'An input value appeared in diagnostic output.');
  }
  assert.doesNotMatch(output, /postgres(?:ql)?:\/\/|https:\/\/|SyntaxError|\bat file:/);

  const marker = secret();
  const invalidJsonResult = run(`{"${marker}":`);
  assert.ok(!invalidJsonResult.stderr.includes(marker));
});

test('invalid CLI modes and extra arguments never echo their contents', () => {
  const marker = secret();
  const badMode = run(configuration(), marker);
  assertRejected(badMode, 'MODE');
  assert.ok(!badMode.stderr.includes(marker));
  const extraArgument = run(configuration(), 'fresh', [marker]);
  assertRejected(extraArgument, 'MODE');
  assert.ok(!extraArgument.stderr.includes(marker));
});
