#!/usr/bin/env bash
# CI only: this creates and removes the hrd Compose project, including its volumes.
# Never use this script on a VPS or with an existing store. Use start-production.sh.
set -euo pipefail

if [ "$#" -ne 0 ] || [ "${GITHUB_ACTIONS:-}" != true ] \
  || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ] || [ "${RUNNER_OS:-}" != Linux ] \
  || [ -z "${GITHUB_RUN_ID:-}" ] || [ -z "${GITHUB_WORKSPACE:-}" ]; then
  printf '%s\n' 'This destructive smoke test is restricted to a GitHub-hosted Linux Actions runner.' >&2
  exit 2
fi
if [ -n "${DOCKER_HOST:-}" ] || [ -n "${DOCKER_CONTEXT:-}" ] \
  || [ "$(docker context show)" != default ] \
  || [ "$(docker context inspect default --format '{{.Endpoints.docker.Host}}')" != unix:///var/run/docker.sock ]; then
  printf '%s\n' 'The smoke test requires the runner local default Docker socket.' >&2
  exit 2
fi

deployment_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project_directory=$(cd -- "$deployment_directory/.." && pwd)
if [ "$project_directory" != "$(cd -- "$GITHUB_WORKSPACE" && pwd)" ]; then
  printf '%s\n' 'Run the smoke test only from the checked-out GitHub workspace.' >&2
  exit 2
fi
docker info >/dev/null
docker compose version >/dev/null
docker image inspect home-retreat-direct:ci home-retreat-direct-tools:ci >/dev/null

# Refuse all existing project resources before arming the cleanup trap.
for resource in container volume network; do
  case "$resource" in
    container) existing=$(docker ps --all --quiet --filter label=com.docker.compose.project=hrd) ;;
    volume) existing=$(docker volume ls --quiet --filter label=com.docker.compose.project=hrd) ;;
    network) existing=$(docker network ls --quiet --filter label=com.docker.compose.project=hrd) ;;
  esac
  if [ -n "$existing" ]; then
    printf '%s\n' 'Refusing to replace an existing hrd Compose project.' >&2
    exit 2
  fi
done
for volume in hrd_database hrd_state hrd_cache; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    printf '%s\n' 'Refusing to replace an existing hrd volume.' >&2
    exit 2
  fi
done
for network in hrd_web hrd_database; do
  if docker network inspect "$network" >/dev/null 2>&1; then
    printf '%s\n' 'Refusing to replace an existing hrd network.' >&2
    exit 2
  fi
done

umask 077
smoke_directory=$(mktemp -d "${RUNNER_TEMP:-/tmp}/hrd-smoke.XXXXXXXX")
smoke_environment_file="$smoke_directory/server.env"
project_started=false
# Compose interpolation must use the generated CI values, not ambient overrides.
unset HRD_ENV_FILE HRD_IMAGE HRD_TOOLS_IMAGE APP_PORT POSTGRES_PASSWORD JOB_SECRET
hrd() {
  docker --context default compose --env-file "$smoke_environment_file" \
    --project-directory "$project_directory" -f "$deployment_directory/compose.yml" -p hrd "$@"
}
cleanup() {
  local result=$?
  trap - EXIT INT TERM
  set +e
  if [ "$project_started" = true ]; then
    if [ "$result" -ne 0 ]; then
      printf '\n%s\n' 'Startup smoke test failed; bounded runtime diagnostics follow.' >&2
      for service in app db; do
        while IFS= read -r container; do
          [ -n "$container" ] || continue
          docker inspect --format '{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}}' "$container"
        done < <(hrd ps --all --quiet "$service")
      done
      hrd logs --no-color --timestamps --tail 100 app db
    fi
    if ! hrd down --volumes --remove-orphans --timeout 10; then
      printf '%s\n' 'Failed to clean up the isolated CI Compose project.' >&2
      [ "$result" -ne 0 ] || result=1
    fi
  fi
  if ! rm -f -- "$smoke_environment_file" || ! rmdir -- "$smoke_directory"; then
    printf '%s\n' 'Failed to remove the temporary CI environment.' >&2
    [ "$result" -ne 0 ] || result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node --input-type=module - "$smoke_environment_file" <<'NODE'
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const environmentPath = process.argv[2];
const secret = () => randomBytes(32).toString('hex');
const password = secret();
const fields = {
  HRD_ENV_FILE: environmentPath,
  HRD_IMAGE: 'home-retreat-direct:ci',
  HRD_TOOLS_IMAGE: 'home-retreat-direct-tools:ci',
  APP_PORT: '3100',
  POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgresql://hrd:${password}@db:5432/home_retreat_direct`,
  DIRECT_DATABASE_URL: `postgresql://hrd:${password}@db:5432/home_retreat_direct`,
  DATABASE_TRANSPORT: 'pg',
  ENCRYPTION_KEY: secret(),
  JOB_SECRET: secret(),
  APP_ORIGIN: 'https://homeretreatdirect.com',
  DEVELOPMENT_CATALOG: 'false',
  SHOW_DEMO_REVIEWS: 'false',
  SITES_RUNTIME: 'false',
  SITES_BUILD: 'false',
  LOCAL_MEDIA_ENABLED: 'true',
  LOCAL_MEDIA_DIRECTORY: '/app/.local/media',
  // Configured fixture mailboxes; no worker or actual email delivery runs in CI.
  EMAIL_DELIVERY_ENABLED: 'false',
  EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'mail.example.test', SMTP_PORT: '465', SMTP_SECURE: 'true',
  INFO_EMAIL: 'info@example.test', ORDERS_EMAIL: 'orders@example.test', SUPPORT_EMAIL: 'support@example.test',
  SMTP_INFO_USER: 'info@example.test', SMTP_INFO_PASS: secret(),
  SMTP_ORDERS_USER: 'orders@example.test', SMTP_ORDERS_PASS: secret(),
  SMTP_SUPPORT_USER: 'support@example.test', SMTP_SUPPORT_PASS: secret(),
  INIT_PRODUCTION_CONFIRMED: 'homeretreatdirect.com',
  SEED_OWNER_EMAIL: 'owner@example.test',
  SEED_OWNER_PASSWORD: secret(),
};
writeFileSync(environmentPath, Object.entries(fields).map(([key, value]) => `${key}=${value}\n`).join(''), {mode: 0o600});
NODE

cd -- "$project_directory"
hrd config --quiet
hrd config --format json | node deploy/check-production-config.mjs fresh
printf '%s\n' 'Starting an isolated PostgreSQL 17 database with the already-built CI images...'
project_started=true
hrd up --detach --no-build --wait --wait-timeout 90 db
hrd run --rm --no-deps --pull never -T tools node node_modules/prisma/build/index.js migrate deploy
hrd run --rm --no-deps --pull never -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts
hrd run --rm --no-deps --pull never -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts --verify-initialized
node --input-type=module - "$smoke_environment_file" <<'NODE'
import {readFileSync, writeFileSync} from 'node:fs';
const file = process.argv[2], source = readFileSync(file, 'utf8');
if (!/^EMAIL_DELIVERY_ENABLED=false$/m.test(source)) throw new Error('Expected the disabled initialization fixture.');
writeFileSync(file, source.replace(/^EMAIL_DELIVERY_ENABLED=false$/m, 'EMAIL_DELIVERY_ENABLED=true'), {mode: 0o600});
NODE
hrd run --rm --no-deps --pull never -T tools node node_modules/tsx/dist/cli.mjs deploy/complete-store-opening.ts --confirm-domain homeretreatdirect.com
fixture_variant=$(hrd run --rm --no-deps --pull never -T tools node --input-type=module -e '
  import pg from "pg";
  const client = new pg.Client({connectionString: process.env.DATABASE_URL});
  await client.connect();
  try { const result = await client.query("SELECT id FROM \"ProductVariant\" WHERE active=true ORDER BY id LIMIT 1"); console.log(result.rows[0].id); }
  finally { await client.end(); }
')
printf '%s\n' 'Starting the production server and waiting for database-backed health...'
hrd up --detach --no-build --pull never --wait --wait-timeout 210 app
if [ "$(hrd port app 3000)" != 127.0.0.1:3100 ]; then
  printf '%s\n' 'The smoke test app must publish only the expected loopback port.' >&2
  exit 1
fi

node --input-type=module - "$smoke_environment_file" "$fixture_variant" <<'NODE'
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const origin = 'http://127.0.0.1:3100';
const catalog = JSON.parse(readFileSync('data/product-galleries.json', 'utf8')).products;
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
async function request(path, type) {
  const response = await fetch(origin + path, {signal: AbortSignal.timeout(15000), redirect: 'error'});
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  assert.ok(response.headers.get('content-type')?.startsWith(type), `${path} has the wrong content type`);
  return response;
}
const health = await request('/api/health', 'application/json');
assert.deepEqual(await health.json(), {status: 'ok'}, 'Health must confirm a database query succeeds');
const home = await (await request('/', 'text/html')).text();
assert.ok(home.includes('<h1') && home.includes('Home Retreat Direct'), 'Home page did not render the store');
const listing = await (await request('/collections/all', 'text/html')).text();
assert.ok(listing.includes('All Collections') && listing.includes('href="/products/'), 'Catalog did not render database-backed product links');
const sitemap = await (await request('/sitemap.xml', 'application/xml')).text();
for (const path of ['/delivery', '/returns', '/privacy', '/terms', '/warranty', '/contact', '/payment-process']) {
  const html = await (await request(path, 'text/html')).text();
  assert.ok(html.includes('<h1') && !/<meta[^>]*name="robots"[^>]*content="noindex/.test(html), path + ' is not published/indexable');
  assert.ok(sitemap.includes('https://homeretreatdirect.com' + path + '</loc>'), path + ' is missing from the sitemap');
}
for (const category of ['premium-furniture', 'gazebos', 'massage-chairs']) {
  const expected = catalog.find(product => product.category === category);
  assert.ok(expected, `Missing smoke fixture for ${category}`);
  const pagePath = '/products/' + encodeURIComponent(expected.slug);
  const html = await (await request(pagePath, 'text/html')).text();
  assert.ok(html.includes(`<h1>${escapeHtml(expected.name)}</h1>`), `${category} product heading is missing`);
  const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  const product = schemas.find(schema => schema['@type'] === 'Product');
  assert.ok(product, `${category} product schema is missing`);
  assert.equal(product.name, expected.name);
  const variant = expected.variants?.find(variant => variant.color === expected.images[0].color) ?? expected.variants?.[0];
  const priceCents = Math.round((variant?.priceCents ?? expected.priceCents) * (100 - (expected.discountPercent ?? 0)) / 100);
  assert.equal(product.offers?.price, (priceCents / 100).toFixed(2), `${category} selling price is wrong`);
  assert.equal(product.offers.priceCurrency, 'USD');
  assert.deepEqual(product.image, expected.images.map(image => 'https://homeretreatdirect.com' + image.url), `${category} catalog images are wrong`);
  assert.ok(html.includes(encodeURIComponent(expected.images[0].url)), `${category} product photograph did not render`);
  const image = await request(expected.images[0].url, 'image/');
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.images[0].sha256, `${category} served photograph is damaged`);
  console.log(`Verified ${category}: product, selling price, gallery and served photograph.`);
}
const imagePath = '/_next/image?url=' + encodeURIComponent(catalog[0].images[0].url) + '&w=640&q=75';
const optimized = await request(imagePath, 'image/');
assert.ok((await optimized.arrayBuffer()).byteLength > 100, 'Optimized product photograph is empty');
// Only this isolated CI database receives orders. No SMTP worker is started.
const cookies = new Map();
async function api(path, method = 'GET', body, trustedOrigin = 'https://homeretreatdirect.com') {
  const response = await fetch(origin + path, {method, signal: AbortSignal.timeout(15000), headers: {
    origin: trustedOrigin, cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '),
    ...(body ? {'content-type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], separator = pair.indexOf('='); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
  return {response, data: await response.json()};
}
const cart = await api('/api/cart', 'POST', {variantId: process.argv[3], quantity: 1});
assert.equal(cart.response.status, 200);
const payload = {email: 'checkout@example.test', phone: '317-555-0100', shipping: {firstName: 'CI', lastName: 'Fixture', line1: '123 Fixture Street', city: 'Indianapolis', state: 'IN', postalCode: '46204', country: 'US'}, acceptTerms: true, idempotencyKey: randomUUID()};
assert.equal((await api('/api/orders', 'POST', payload, 'https://untrusted.example')).response.status, 403);
const submitted = await api('/api/orders', 'POST', payload);
assert.equal(submitted.response.status, 201, 'Published store must accept a reviewed order');
assert.equal(submitted.data.order.paymentReceived, false);
assert.equal(submitted.data.order.shippingCents, null);
assert.equal(submitted.data.order.taxCents, null);
const replay = await api('/api/orders', 'POST', payload);
assert.equal(replay.response.status, 201);
assert.equal(replay.data.order.id, submitted.data.order.id);
assert.equal(replay.data.accessToken, submitted.data.accessToken);
const confirmation = await (await request('/orders/' + submitted.data.order.number + '?token=' + submitted.data.accessToken, 'text/html')).text();
assert.ok(confirmation.includes('Order Received') && confirmation.includes('submitted successfully'), 'Customer confirmation did not render');
const fixtureEnvironment = Object.fromEntries(readFileSync(process.argv[2], 'utf8').trim().split('\n').map(line => {const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];}));
const login = await api('/api/auth/login', 'POST', {email: fixtureEnvironment.SEED_OWNER_EMAIL, password: fixtureEnvironment.SEED_OWNER_PASSWORD});
assert.equal(login.response.status, 200);
const helpResponse = await fetch(origin + '/admin/help', {headers:{cookie:[...cookies].map(([name,value])=>name+'='+value).join('; ')},signal:AbortSignal.timeout(15000)});
assert.equal(helpResponse.status,200);
const help = await helpResponse.text();
assert.ok(help.includes('How to run your store.') && help.includes('Payment receipt'), 'Staff order/email guide must render');
const settings = await api('/api/admin/settings');
assert.equal(settings.response.status, 200);
assert.equal(settings.data.launchReadiness.acceptingOrders, true);
assert.equal((await api('/api/admin/settings', 'POST', {announcement: 'Considered design. Everyday retreat.'})).response.status, 200);
const contacts = await api('/api/admin/business-contacts');
assert.equal(contacts.response.status, 200);
assert.deepEqual(contacts.data, {phone: '', address: '', businessHours: ''});
assert.equal((await api('/api/admin/staff', 'POST', {name: 'CI administrator', email: 'administrator@example.test', password: fixtureEnvironment.SEED_OWNER_PASSWORD, role: 'ADMINISTRATOR'})).response.status, 200);
cookies.clear();
assert.equal((await api('/api/admin/business-contacts')).response.status, 403);
assert.equal((await api('/api/auth/login', 'POST', {email: 'administrator@example.test', password: fixtureEnvironment.SEED_OWNER_PASSWORD})).response.status, 200);
assert.equal((await api('/api/admin/settings')).response.status, 403, 'Administrator must not receive owner-only settings');
assert.equal((await api('/api/admin/business-contacts', 'POST', {phone: '317-555-0100', address: '123 Fixture Street, Indianapolis, IN 46204', businessHours: 'CI fixture only'})).response.status, 200);
assert.equal((await api('/api/admin/business-contacts', 'POST', {launchApproved: 'false'})).response.status, 400, 'Contact editor cannot alter launch approval');
const contactPage = await (await request('/contact', 'text/html')).text();
assert.ok(contactPage.includes('317-555-0100') && contactPage.includes('123 Fixture Street'), 'Staff contact edits must appear publicly');
console.log('Production startup passed: policies, sitemap, PostgreSQL health, catalog images, unpaid checkout, retries, customer confirmation and owner settings.');
NODE
