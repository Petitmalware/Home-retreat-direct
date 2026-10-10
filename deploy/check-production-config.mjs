function databaseUrlMatches(value, password) {
  if (typeof value !== 'string' || typeof password !== 'string') return false;
  if (value !== value.trim()) return false;
  // Require the complete internal connection, including an explicit port.
  if (!/^(?:postgres|postgresql):\/\/hrd:[^@/?#]+@db:5432\/home_retreat_direct$/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:')
      && url.username === 'hrd'
      && url.hostname === 'db'
      && url.port === '5432'
      && url.pathname === '/home_retreat_direct'
      && url.search === ''
      && url.hash === ''
      && decodeURIComponent(url.password) === password;
  } catch {
    return false;
  }
}

function validateConfiguration(compose, mode) {
  const serializedEnvironment = compose?.services?.app?.environment;
  if (!serializedEnvironment || typeof serializedEnvironment !== 'object' || Array.isArray(serializedEnvironment)) {
    return ['services.app.environment: Supply resolved application environment fields in the Compose JSON.'];
  }

  // Input is normal `docker compose config --format json` output. Compose doubles
  // literal dollars when rendering it; undo that escaping exactly once.
  const environment = Object.fromEntries(Object.entries(serializedEnvironment).map(([field, value]) =>
    [field, typeof value === 'string' ? value.replaceAll('$$', '$') : value]));

  const errors = [];
  const requireField = (field, valid, instruction) => {
    if (!valid) errors.push(`${field}: ${instruction}`);
  };
  for (const field of ['POSTGRES_PASSWORD', 'ENCRYPTION_KEY', 'JOB_SECRET']) {
    requireField(field, typeof environment[field] === 'string' && environment[field].length === 64
      && /^[a-f0-9]{64}$/i.test(environment[field]),
      'Supply a persistent 32-byte hexadecimal secret.');
  }
  for (const field of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
    requireField(field, databaseUrlMatches(environment[field], environment.POSTGRES_PASSWORD),
      'Use the internal database connection with the configured database password and no extra URL options.');
  }

  const requiredValues = {
    APP_ORIGIN: 'https://homeretreatdirect.com',
    DATABASE_TRANSPORT: 'pg',
    DEVELOPMENT_CATALOG: 'false',
    SHOW_DEMO_REVIEWS: 'false',
    LOCAL_MEDIA_ENABLED: 'true',
    LOCAL_MEDIA_DIRECTORY: '/app/.local/media',
  };
  for (const [field, expected] of Object.entries(requiredValues)) {
    requireField(field, environment[field] === expected, 'Use the required production setting.');
  }

  if (mode === 'fresh') {
    requireField('INIT_PRODUCTION_CONFIRMED', environment.INIT_PRODUCTION_CONFIRMED === 'homeretreatdirect.com',
      'Confirm the store domain before fresh initialization.');
    requireField('EMAIL_DELIVERY_ENABLED', environment.EMAIL_DELIVERY_ENABLED === 'false',
      'Disable email delivery during fresh initialization.');
    requireField('SEED_OWNER_EMAIL', typeof environment.SEED_OWNER_EMAIL === 'string'
      && environment.SEED_OWNER_EMAIL === environment.SEED_OWNER_EMAIL.trim()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environment.SEED_OWNER_EMAIL),
      'Supply a valid owner email address before fresh initialization.');
    requireField('SEED_OWNER_PASSWORD', typeof environment.SEED_OWNER_PASSWORD === 'string'
      && [...environment.SEED_OWNER_PASSWORD].length >= 16,
      'Supply an owner password containing at least 16 characters before fresh initialization.');
  }
  return errors;
}

async function main() {
  const [mode, ...extraArguments] = process.argv.slice(2);
  if (!['fresh', 'resume'].includes(mode) || extraArguments.length) {
    process.stderr.write('MODE: Select fresh or resume and supply resolved Compose JSON on stdin.\n');
    process.exitCode = 1;
    return;
  }

  let compose;
  try {
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    compose = JSON.parse(input);
  } catch {
    process.stderr.write('COMPOSE_JSON: Supply valid resolved Compose JSON on stdin.\n');
    process.exitCode = 1;
    return;
  }

  const errors = validateConfiguration(compose, mode);
  if (errors.length) {
    process.stderr.write(`Production configuration needs attention:\n${errors.map(error => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Production configuration checks passed.\n');
}

await main();
