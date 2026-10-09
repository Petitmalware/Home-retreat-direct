import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {parse} from 'yaml';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';

const project = path.resolve(import.meta.dirname, '..');
function runInit(extraEnvironment, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'deploy/init-production.ts', ...args], {cwd: project, env: {...process.env, ...extraEnvironment}, windowsHide: true});
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => {stdout += chunk;});
    child.stderr.on('data', chunk => {stderr += chunk;});
    child.once('error', reject);
    child.once('exit', code => resolve({code, stdout, stderr}));
  });
}

test('deployment config publishes only the app loopback port and persists database/media', () => {
  const compose = parse(fs.readFileSync(path.join(project, 'deploy/compose.yml'), 'utf8'));
  assert.deepEqual(compose.services.app.ports, ['127.0.0.1:${APP_PORT:-3100}:3000']);
  assert.equal(compose.services.db.ports, undefined);
  assert.equal(compose.networks.database.internal, true);
  assert.ok(compose.services.db.volumes.includes('database:/var/lib/postgresql/data'));
  assert.ok(compose.services.app.volumes.includes('state:/app/.local'));
  assert.equal(compose.services.app.depends_on.db.condition, 'service_healthy');
  assert.equal(compose.services['email-worker'].depends_on.app.condition, 'service_healthy');
  assert.deepEqual(compose.services.tools.profiles, ['manual']);
  assert.equal(compose.services.db.container_name, undefined);
  const dockerignore = fs.readFileSync(path.join(project, 'deploy/Dockerfile.dockerignore'), 'utf8').split(/\r?\n/);
  for (const privatePath of ['.env', '.env.*', '.local', 'node_modules', '.next', '.git']) assert.ok(dockerignore.includes(privatePath));
  assert.ok(!dockerignore.includes('public'));
});

test('production initializer validates files and guards a fresh isolated database', {timeout: 240000}, async t => {
  // This memory-only PostgreSQL database never opens .env or the live database.
  const database = await PGlite.create();
  let server;
  try {
    for (const folder of fs.readdirSync(path.join(project, 'prisma/migrations')).sort()) {
      const migration = path.join(project, 'prisma/migrations', folder, 'migration.sql');
      if (fs.existsSync(migration)) await database.exec(fs.readFileSync(migration, 'utf8'));
    }
    server = new PGLiteSocketServer({db: database, host: '127.0.0.1', port: 0});
    await server.start();
    const connection = 'postgresql://postgres:isolated@' + server.getServerConn() + '/postgres';
    const environment = {
      DATABASE_URL: connection, DIRECT_DATABASE_URL: connection, DATABASE_TRANSPORT: 'pg', LOCAL_DATABASE_ENGINE: 'pglite',
      APP_ORIGIN: 'https://homeretreatdirect.com', ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      SEED_OWNER_EMAIL: 'initializer-test@homeretreatdirect.test', SEED_OWNER_PASSWORD: randomBytes(24).toString('base64url'),
      DEVELOPMENT_CATALOG: 'false', INIT_PRODUCTION_CONFIRMED: 'homeretreatdirect.com', SITES_RUNTIME: 'false',
      INFO_EMAIL: 'info@homeretreatdirect.com', ORDERS_EMAIL: 'orders@homeretreatdirect.com', SUPPORT_EMAIL: 'support@homeretreatdirect.com',
    };
    await t.test('catalog-only validation requires no database', async () => {
      const result = await runInit({...environment, DATABASE_URL: 'postgresql://no:no@127.0.0.1:9/no'}, ['--check']);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {ok: true, databaseTouched: false, products: 250, images: 1005, categories: 7});
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Product"')).rows[0].count, 0);
    });
    await t.test('missing explicit initialization guard changes no records', async () => {
      const result = await runInit({...environment, INIT_PRODUCTION_CONFIRMED: ''});
      assert.equal(result.code, 1);
      assert.match(result.stderr, /INIT_PRODUCTION_CONFIRMED/);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Product"')).rows[0].count, 0);
    });
    await t.test('new store imports complete facts, prices, galleries and an owner without reviews', async () => {
      const result = await runInit(environment);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).initialized, true);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Product" WHERE "isDemo"=false AND "discountPercent"=15')).rows[0].count, 250);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "ProductImage"')).rows[0].count, 1005);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Review"')).rows[0].count, 0);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Staff" WHERE role=\'OWNER\'')).rows[0].count, 1);
      assert.equal((await database.query('SELECT value FROM "SiteSetting" WHERE key=\'launchApproved\'')).rows[0].value, 'false');
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Policy" WHERE slug IN (\'terms\',\'privacy\',\'returns\',\'delivery\',\'warranty\') AND published=false')).rows[0].count, 5);
      assert.equal((await database.query('SELECT published FROM "Policy" WHERE slug=\'contact\'')).rows[0].published, true);
      const finishes = (await database.query('SELECT color, "priceCents" FROM "ProductVariant" WHERE "productId"=\'prd-massage-chairs-3\'')).rows;
      assert.equal(finishes.find(finish => finish.color === 'Beige').priceCents, 249900);
      assert.equal(finishes.find(finish => finish.color === 'Black').priceCents, 299900);
    });
    await t.test('re-running initializer refuses an existing store and preserves owner data', async () => {
      await database.query('UPDATE "Product" SET "priceCents"=12345 WHERE id=\'prd-massage-chairs-3\'');
      const result = await runInit(environment);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /already contains store records/);
      assert.equal((await database.query('SELECT "priceCents" FROM "Product" WHERE id=\'prd-massage-chairs-3\'')).rows[0].priceCents, 12345);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Product"')).rows[0].count, 250);
    });
  } finally {
    if (server) await server.stop();
    await database.close();
  }
});
