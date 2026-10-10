import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from 'bcryptjs';
import pg from 'pg';

export class OwnerResetError extends Error {}

export function validateCredentials(email, password) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OwnerResetError('Enter a valid owner email address.');
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72
      || /[\x00-\x1f\x7f]/.test(password)) {
    throw new OwnerResetError('Use a password of at least 12 characters and at most 72 UTF-8 bytes, without control characters.');
  }
  return {email: email.toLowerCase(), password};
}

export function validateContext(args, environment) {
  if (args.length !== 2 || args[0] !== '--confirm-domain' || args[1] !== 'homeretreatdirect.com'
      || environment.APP_ORIGIN !== 'https://homeretreatdirect.com'
      || environment.DATABASE_TRANSPORT !== 'pg' || environment.SITES_RUNTIME !== 'false'
      || environment.DEVELOPMENT_CATALOG !== 'false') {
    throw new OwnerResetError('Run this maintenance helper through the production reset-owner-password.sh script.');
  }
  let connection;
  try { connection = new URL(environment.DATABASE_URL); } catch {}
  if (!connection || !['postgres:', 'postgresql:'].includes(connection.protocol)
      || connection.hostname !== 'db' || connection.port !== '5432'
      || connection.pathname !== '/home_retreat_direct' || connection.username !== 'hrd') {
    throw new OwnerResetError('The reset requires this store\'s internal production PostgreSQL connection.');
  }
}

export function parseInput(input) {
  if (Buffer.byteLength(input, 'utf8') > 512) throw new OwnerResetError('Invalid reset input.');
  const lines = input.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 2) throw new OwnerResetError('Supply the owner email and password through private standard input.');
  return validateCredentials(lines[0], lines[1]);
}

/** Requires an authenticated database connection owned by the server operator. */
export async function resetOwnerPassword(client, email, password) {
  const credentials = validateCredentials(email, password);
  const passwordHash = await hash(credentials.password, 12);
  await client.query('BEGIN');
  try {
    const owners = await client.query(`
      SELECT u."id", s."id" AS "staffId"
      FROM "User" u JOIN "Staff" s ON s."userId" = u."id"
      WHERE lower(u."email") = $1 AND s."role" = 'OWNER' AND s."active" = true
      FOR UPDATE OF u, s`, [credentials.email]);
    if (owners.rows.length !== 1) throw new OwnerResetError('No single active owner matches that email. No password was changed.');
    const owner = owners.rows[0];
    await client.query('UPDATE "User" SET "passwordHash" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2', [passwordHash, owner.id]);
    const sessions = await client.query('DELETE FROM "Session" WHERE "userId" = $1', [owner.id]);
    const loginKey = createHash('sha256').update('login:' + credentials.email).digest('hex');
    await client.query('DELETE FROM "RateLimit" WHERE "key" = $1', [loginKey]);
    await client.query(`INSERT INTO "AdminAuditLog" ("id", "staffId", "action", "entityType", "entityId", "detail")
      VALUES ($1, $2, 'RESET_OWNER_PASSWORD', 'User', $3, $4)`,
    [randomUUID(), owner.staffId, owner.id, 'Password reset by the server operator through the SSH maintenance helper; existing owner sessions invalidated.']);
    await client.query('COMMIT');
    return {ok: true, passwordChanged: true, sessionsRevoked: sessions.rowCount};
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  }
}

async function main() {
  let client;
  try {
    validateContext(process.argv.slice(2), process.env);
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk.toString('utf8');
      if (Buffer.byteLength(input, 'utf8') > 512) throw new OwnerResetError('Invalid reset input.');
    }
    const credentials = parseInput(input);
    input = '';
    client = new pg.Client({connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000,
      query_timeout: 15000, statement_timeout: 15000, lock_timeout: 5000, application_name: 'hrd-owner-password-reset'});
    client.on('error', () => {});
    await client.connect();
    process.stdout.write(JSON.stringify(await resetOwnerPassword(client, credentials.email, credentials.password)) + '\n');
  } catch (error) {
    // Database/provider error messages can contain credentials or submitted values.
    process.stderr.write('Owner reset: ' + (error instanceof OwnerResetError ? error.message
      : 'Reset could not be confirmed. Check database health before retrying.') + '\n');
    process.exitCode = 1;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
