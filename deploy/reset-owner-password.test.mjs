import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {hash, compare} from 'bcryptjs';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {OwnerResetError, parseInput, validateContext, resetOwnerPassword} from './reset-owner-password.mjs';

const project = path.resolve(import.meta.dirname, '..');
const ownerEmail = 'owner@example.test';
const oldPassword = randomBytes(20).toString('hex');
const newPassword = randomBytes(7).toString('hex'); // A 14-character account password is supported.

test('reset input preserves dollar signs and rejects unsafe bcrypt input', () => {
  const value = 'private$fixture$123';
  assert.equal(parseInput(ownerEmail + '\n' + value + '\n').password, value);
  for (const value of ['short', 'a'.repeat(73), 'é'.repeat(37), 'valid-length\0x', 'valid-length\nextra']) {
    assert.throws(() => parseInput(ownerEmail + '\n' + value + '\n'), OwnerResetError);
  }
});

test('CLI refuses a wrong deployment before opening any database and does not print input', () => {
  const value = randomBytes(24).toString('hex');
  const result = spawnSync(process.execPath, ['deploy/reset-owner-password.mjs', '--confirm-domain', 'wrong.example'],
    {cwd: project, input: ownerEmail + '\n' + value + '\n', env: {...process.env, DATABASE_URL: ''}, windowsHide: true, encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production reset-owner-password.sh/);
  assert.ok(!result.stdout.includes(value) && !result.stderr.includes(value));
});

test('production context requires the dedicated internal database', () => {
  const environment = {APP_ORIGIN: 'https://homeretreatdirect.com', DATABASE_TRANSPORT: 'pg', SITES_RUNTIME: 'false',
    DEVELOPMENT_CATALOG: 'false', DATABASE_URL: 'postgresql://hrd:fixture@db:5432/home_retreat_direct'};
  const args = ['--confirm-domain', 'homeretreatdirect.com'];
  assert.doesNotThrow(() => validateContext(args, environment));
  for (const DATABASE_URL of ['postgresql://hrd:fixture@other:5432/home_retreat_direct', 'postgresql://hrd:fixture@db:5432/other']) {
    assert.throws(() => validateContext(args, {...environment, DATABASE_URL}), OwnerResetError);
  }
});

test('reset updates only the owner, revokes sessions, clears its login limit and audits atomically', {timeout: 60000}, async t => {
  const database = await PGlite.create();
  let server, client;
  try {
    for (const folder of fs.readdirSync(path.join(project, 'prisma/migrations')).sort()) {
      const migration = path.join(project, 'prisma/migrations', folder, 'migration.sql');
      if (fs.existsSync(migration)) await database.exec(fs.readFileSync(migration, 'utf8'));
    }
    const oldHash = await hash(oldPassword, 12);
    for (const [id, email] of [['owner', ownerEmail], ['customer', 'customer@example.test'], ['inactive', 'inactive@example.test']]) {
      await database.query('INSERT INTO "User" ("id", "email", "passwordHash", "name", "updatedAt") VALUES ($1, $2, $3, $1, NOW())', [id, email, oldHash]);
    }
    await database.exec(`INSERT INTO "Staff" ("id", "userId", "role", "active") VALUES ('owner-staff', 'owner', 'OWNER', true), ('inactive-staff', 'inactive', 'OWNER', false);
      INSERT INTO "Session" ("tokenHash", "userId", "expiresAt") VALUES ('owner-session', 'owner', NOW() + INTERVAL '1 day'), ('customer-session', 'customer', NOW() + INTERVAL '1 day');
      INSERT INTO "SiteSetting" ("key", "value", "updatedAt") VALUES ('storeName', 'preserve-store', NOW());`);
    const loginKey = createHash('sha256').update('login:' + ownerEmail).digest('hex');
    await database.query('INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES ($1, 10, NOW() + INTERVAL \'1 day\')', [loginKey]);
    server = new PGLiteSocketServer({db: database, host: '127.0.0.1', port: 0});
    await server.start();
    client = new pg.Client({connectionString: 'postgresql://postgres:isolated@' + server.getServerConn() + '/postgres'});
    await client.connect();
    await t.test('wrong or inactive identities cannot reset passwords', async () => {
      for (const email of ['customer@example.test', 'inactive@example.test', 'missing@example.test']) {
        await assert.rejects(resetOwnerPassword(client, email, newPassword), /No single active owner/);
      }
      assert.equal((await database.query('SELECT "passwordHash" FROM "User" WHERE "id" = \'owner\'')).rows[0].passwordHash, oldHash);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Session"')).rows[0].count, 2);
    });
    await t.test('an audit failure rolls back the hash, sessions and login limit', async () => {
      await database.exec('ALTER TABLE "AdminAuditLog" RENAME TO "AuditTemporarilyUnavailable"');
      try { await assert.rejects(resetOwnerPassword(client, ownerEmail, newPassword)); }
      finally { await database.exec('ALTER TABLE "AuditTemporarilyUnavailable" RENAME TO "AdminAuditLog"'); }
      assert.equal((await database.query('SELECT "passwordHash" FROM "User" WHERE "id" = \'owner\'')).rows[0].passwordHash, oldHash);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "Session"')).rows[0].count, 2);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "RateLimit"')).rows[0].count, 1);
    });
    await t.test('the new hash works and all other accounts/store records remain', async () => {
      assert.deepEqual(await resetOwnerPassword(client, ownerEmail, newPassword), {ok: true, passwordChanged: true, sessionsRevoked: 1});
      const saved = (await database.query('SELECT "passwordHash" FROM "User" WHERE "id" = \'owner\'')).rows[0].passwordHash;
      assert.equal(await compare(newPassword, saved), true);
      assert.equal(await compare(oldPassword, saved), false);
      assert.equal((await database.query('SELECT "passwordHash" FROM "User" WHERE "id" = \'customer\'')).rows[0].passwordHash, oldHash);
      assert.deepEqual((await database.query('SELECT "tokenHash" FROM "Session"')).rows, [{tokenHash: 'customer-session'}]);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM "RateLimit"')).rows[0].count, 0);
      const audit = (await database.query('SELECT * FROM "AdminAuditLog"')).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].staffId, 'owner-staff');
      assert.equal(audit[0].action, 'RESET_OWNER_PASSWORD');
      assert.ok(!JSON.stringify(audit).includes(newPassword) && !JSON.stringify(audit).includes(saved));
      assert.equal((await database.query('SELECT "value" FROM "SiteSetting" WHERE "key" = \'storeName\'')).rows[0].value, 'preserve-store');
    });
  } finally {
    if (client) await client.end();
    if (server) await server.stop();
    await database.close();
  }
});
