import {businessProfile} from '../lib/business-profile';

async function main() {
  const args = process.argv.slice(2);
  let connection: URL | undefined;
  try { connection = new URL(process.env.DATABASE_URL ?? ''); } catch {}
  if (args.length !== 2 || args[0] !== '--confirm-domain' || args[1] !== businessProfile.domain
    || process.env.APP_ORIGIN !== businessProfile.origin || process.env.DEVELOPMENT_CATALOG !== 'false'
    || process.env.SITES_RUNTIME !== 'false' || process.env.DATABASE_TRANSPORT !== 'pg'
    || !connection || !['postgres:', 'postgresql:'].includes(connection.protocol)
    || connection.hostname !== 'db' || connection.port !== '5432'
    || connection.pathname !== '/home_retreat_direct' || connection.username !== 'hrd') {
    throw new Error('Run complete-store-opening.sh against this store\'s production configuration.');
  }
  const {db} = await import('../lib/db');
  try {
    const {completeStoreOpening} = await import('../lib/open-store');
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(842036202)`;
      return completeStoreOpening(tx);
    }, {isolationLevel: 'Serializable', timeout: 30000});
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  const message = error instanceof Error && /^(Run complete-store|An initialized active owner|Complete the launch requirements)/.test(error.message)
    ? error.message : 'Store opening could not be confirmed. Check the private configuration and database health.';
  console.error(message); process.exitCode = 1;
});
