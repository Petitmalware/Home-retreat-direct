import fs from 'node:fs';
import path from 'node:path';
import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import pg from 'pg';

const [action, filename] = process.argv.slice(2);
if (!['export', 'import', 'verify'].includes(action) || !filename || !path.isAbsolute(filename)) throw new Error('Usage: migrate-store.mjs export|import|verify ABSOLUTE_PRIVATE_ARCHIVE_PATH');
if (filename.startsWith(path.resolve('public') + path.sep)) throw new Error('Migration archives must never be saved under public.');
const rawKey = process.env.MIGRATION_KEY;
if (!rawKey || !/^[a-f0-9]{64}$/i.test(rawKey)) throw new Error('Set a separate random 32-byte hexadecimal MIGRATION_KEY in the private environment.');
const key = Buffer.from(rawKey, 'hex'), signature = Buffer.from('HRDMIG01');
const identifier = value => '"' + value.replaceAll('"', '""') + '"';

async function schema(client) {
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name")).rows.map(row => row.table_name);
  const columns = (await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const dependencies = (await client.query("SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND n.nspname='public'")).rows;
  const migrations = (await client.query('SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
  return {tables, columns, dependencies, migrations};
}
function unpack() {
  const archive = fs.readFileSync(filename);
  if (archive.length < 37 || !archive.subarray(0, 8).equals(signature)) throw new Error('Invalid store archive.');
  const decipher = createDecipheriv('aes-256-gcm', key, archive.subarray(8, 20));
  decipher.setAAD(signature); decipher.setAuthTag(archive.subarray(20, 36));
  let data;
  try {data = JSON.parse(Buffer.concat([decipher.update(archive.subarray(36)), decipher.final()]).toString('utf8'));} catch {throw new Error('Archive authentication failed; use its matching MIGRATION_KEY.');}
  if (data.version !== 1 || data.domain !== 'homeretreatdirect.com' || !Array.isArray(data.snapshots) || !Array.isArray(data.migrations)) throw new Error('Invalid store archive payload.');
  return data;
}
function counts(data) {
  return Object.fromEntries(data.snapshots.filter(item => ['Product', 'ProductImage', 'Order', 'User'].includes(item.table)).map(item => [item.table, item.rows.length]));
}

async function main() {
  if (action === 'verify') {const data = unpack(); console.log(JSON.stringify({ok: true, createdAt: data.createdAt, counts: counts(data), databaseTouched: false})); return;}
  const connection = action === 'export' ? process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL : process.env.DATABASE_URL;
  if (!connection) throw new Error('Database connection is missing.');
  if (action === 'export' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) throw new Error('This export is restricted to the local store database.');
  if (action === 'import' && (process.env.IMPORT_PRODUCTION_CONFIRMED !== 'homeretreatdirect.com' || process.env.EMAIL_DELIVERY_ENABLED !== 'false')) throw new Error('Set IMPORT_PRODUCTION_CONFIRMED=homeretreatdirect.com and EMAIL_DELIVERY_ENABLED=false before importing into an empty production database.');
  const client = new pg.Client({connectionString: connection, connectionTimeoutMillis: 15000});
  await client.connect();
  let inTransaction = false;
  try {
    if (action === 'export') {
      if (fs.existsSync(filename)) throw new Error('Refusing to overwrite an existing migration archive.');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); inTransaction = true;
      const info = await schema(client), snapshots = [];
      for (const table of info.tables) {
        const columns = info.columns.filter(column => column.table_name === table).map(column => column.column_name);
        snapshots.push({table, columns, rows: (await client.query('SELECT * FROM ' + identifier(table))).rows});
      }
      await client.query('COMMIT'); inTransaction = false;
      const data = {version: 1, domain: 'homeretreatdirect.com', createdAt: new Date().toISOString(), migrations: info.migrations, snapshots};
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(signature);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
      fs.writeFileSync(filename, Buffer.concat([signature, iv, cipher.getAuthTag(), encrypted]), {flag: 'wx', mode: 0o600});
      console.log(JSON.stringify({ok: true, encrypted: true, counts: counts(data)}));
      return;
    }
    const data = unpack();
    await client.query('BEGIN'); inTransaction = true;
    await client.query('SELECT pg_advisory_xact_lock(842036201)');
    const info = await schema(client);
    if (new Set(data.snapshots.map(item => item.table)).size !== info.tables.length || data.snapshots.length !== info.tables.length || data.snapshots.some(item => !info.tables.includes(item.table))) throw new Error('Source and target tables differ; apply the same store migrations before import.');
    for (const migration of data.migrations) if (!info.migrations.some(current => current.migration_name === migration.migration_name && current.checksum === migration.checksum)) throw new Error('Source and target migration checksums differ; use the matching store source.');
    for (const table of info.tables) {
      const snapshot = data.snapshots.find(item => item.table === table), columns = info.columns.filter(column => column.table_name === table).map(column => column.column_name);
      if (JSON.stringify(columns) !== JSON.stringify(snapshot.columns)) throw new Error('Source and target columns differ; update the local schema before export.');
      if ((await client.query('SELECT 1 FROM ' + identifier(table) + ' LIMIT 1')).rowCount) throw new Error('Refusing import: the target already contains store records. No records were changed.');
    }
    const pending = new Set(info.tables), ordered = [];
    while (pending.size) {
      const ready = [...pending].filter(table => info.dependencies.every(edge => edge.child !== table || edge.parent === table || !pending.has(edge.parent)));
      if (!ready.length) throw new Error('Circular schema dependencies require a reviewed migration.');
      for (const table of ready) {ordered.push(table); pending.delete(table);}
    }
    for (const table of ordered) {
      const snapshot = data.snapshots.find(item => item.table === table), columns = snapshot.columns;
      const sql = `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES (${columns.map((_, index) => '$' + (index + 1)).join(',')})`;
      for (const row of snapshot.rows) await client.query(sql, columns.map(column => row[column]));
    }
    // Public opening is separately confirmed after HTTPS, email and policy checks.
    await client.query('UPDATE "SiteSetting" SET value=\'false\' WHERE key=\'launchApproved\'');
    await client.query('COMMIT'); inTransaction = false;
    console.log(JSON.stringify({ok: true, imported: true, counts: counts(data), launchApproved: false}));
  } finally {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

main().catch(error => {
  // Provider/connection errors can contain credentials or customer row values.
  const safe = error instanceof Error && /^(Refusing|Source and target|Circular|Invalid store|Archive authentication|Set IMPORT|Database connection|This export)/.test(error.message);
  console.error(safe ? error.message : 'Store migration failed. Check the private environment and database schema; no partial import was committed.');
  process.exitCode = 1;
});
