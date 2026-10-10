# Host Home Retreat Direct on your VPS

The deployment target is **homeretreatdirect.com**, on the Linux VPS at **63.141.255.57** (4 cores, 8 GB RAM, 140 GB SSD). This package adds a separate Home Retreat Direct app and PostgreSQL database. Your existing web server continues to handle the other two sites and HTTPS.

The source repository is [Petitmalware/Home-retreat-direct](https://github.com/Petitmalware/Home-retreat-direct), with deployment files at its root. The server clones its `main` branch and fetches later updates from GitHub; the database, uploaded images and private configuration remain on the VPS.

The SSH login is administrator@63.141.255.57. The VPS runs Ubuntu 24.04 with Docker and Compose installed. The corrected production images passed the [Linux production startup check](https://github.com/Petitmalware/Home-retreat-direct/actions/runs/38015804447): a fresh PostgreSQL 17 database, all migrations, the 250-product/1005-image catalog, database-backed health, homepage, collection, product prices/galleries and served/optimized images. Server startup, HTTPS and SMTP delivery must also be verified on the actual VPS.

**For your current installation:** the server log confirms the owner and catalog were initialized successfully. Nginx and Certbot already serve the other two sites. DNS for the apex and www resolves to 63.141.255.57. Start with [Resume the initialized store](#resume-the-initialized-store), then [connect Nginx and HTTPS](#4-start-the-app-and-connect-only-this-domain), [configure email](#5-configure-the-three-business-mailboxes) and [complete opening checks](#6-complete-opening-checks-in-the-studio). Keep the existing private environment and database; first-installation steps are below for reference.

## What is included

- Next.js production app; dedicated PostgreSQL 17; persistent uploaded images and image cache.
- All 250 product models, 1005 distinct local gallery photographs, existing product details and configured discounts.
- Public business contacts and enquiry routing: info for business, orders for order/invoice communication, support for customer help.
- Branded customer emails with PDF order summaries, approved invoices and payment receipts; protected staff email previews, queues, delivery status and retries.
- New-order, approval and payment-confirmation staff notifications to orders@homeretreatdirect.com.
- An authenticated background email worker, health endpoint and daily backup/recovery scripts.

The store uses an approval workflow: order submission does not collect payment. An invoice uses approved charges; a receipt requires independently confirmed payment. Staff configure genuine business payment instructions in the studio.

## 1. Identify the existing server before installing anything

Open PowerShell or your local terminal and log in:

```sh
ssh administrator@63.141.255.57
```

Run these read-only checks:

```sh
cat /etc/os-release
free -h
df -h
ss -ltnp
docker --version
docker compose version
git --version
```

Record the two existing sites' names, URLs, document roots, proxy software, panel and backup locations. Test both sites and their mail before starting. Port **3100** must be unused. If Docker is absent, use the distribution-specific [official Docker installation instructions](https://docs.docker.com/engine/install/) and [Compose plugin instructions](https://docs.docker.com/compose/install/linux/); have the server administrator check the panel's compatibility first. The compose file uses the modern `env_file` object syntax, requiring Compose 2.24 or newer.

The new app/database/worker have runtime memory limits of 2 GB, 1 GB and 128 MB. Building can use additional memory. Check remaining capacity with the other two sites running; build on Linux CI instead if there is insufficient headroom. No public database port is opened.

**If cPanel/WHM, Plesk or another panel manages the server:** add homeretreatdirect.com as a new domain and use its supported per-domain proxy/custom directive and certificate tools. Do not replace panel-generated global Nginx/Apache files. If Docker or proxy access is restricted, ask the server administrator to run this isolated deployment; do not replace the existing web stack.

## 2. Clone the GitHub repository and keep credentials separate

Run the following **inside the SSH session**, after confirming this is a new deployment directory. The commands create paths owned by your deployment user. If `/opt/home-retreat-direct/current` already exists, inspect it first and use the update procedure in section 7 for an existing checkout; do not delete or overwrite it.

```sh
sudo install -d -m 755 -o "$(id -un)" -g "$(id -gn)" /opt/home-retreat-direct
sudo install -d -m 700 -o "$(id -un)" -g "$(id -gn)" /opt/home-retreat-direct/private
git clone --branch main --single-branch https://github.com/Petitmalware/Home-retreat-direct.git /opt/home-retreat-direct/current
cd /opt/home-retreat-direct/current
git log -1 --oneline
test -f deploy/compose.yml
```

If the repository is private, authenticate using a repository-specific **read-only deploy key**, following [GitHub's deploy-key instructions](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys), and clone its SSH URL `git@github.com:Petitmalware/Home-retreat-direct.git` instead. GitHub account passwords do not authenticate Git operations. Never put an access token in a clone URL or commit the server's private SSH key.

Do not put this checkout or its private directory inside either existing site's public directory. GitHub contains application source and public catalog photos; PostgreSQL data, uploaded media, customer/order records, mailbox passwords, encryption keys and server environment files stay outside the repository. Never copy local `.env`, `.env.hosted`, `.local/ADMIN-ACCESS.txt`, `.local/pglite`, `node_modules` or `.next` into a web document root.

```sh
cd /opt/home-retreat-direct/current
if [ -e /opt/home-retreat-direct/private/server.env ]; then
  printf '%s\n' 'Keeping existing private server.env; inspect it before proceeding.'
else
  (umask 077; cp deploy/server.env.example /opt/home-retreat-direct/private/server.env)
fi
chmod 600 /opt/home-retreat-direct/private/server.env
```

Edit the private file in a server editor. Generate separate random values with `openssl rand -hex 32` for POSTGRES_PASSWORD, ENCRYPTION_KEY and JOB_SECRET. Use the database password in both PostgreSQL URLs. Set your owner email and a unique owner password of at least 16 characters. Do not post the completed file in chat. Keep the example's production origin, DEVELOPMENT_CATALOG=false, SHOW_DEMO_REVIEWS=false and LOCAL_MEDIA_ENABLED=true.

Create `server.env` only for the first installation. On later updates, edit the existing private file if a release requires a new setting; do not copy the example over it. The Git checkout has no production passwords.

Keep **EMAIL_DELIVERY_ENABLED=false** while preparing the server. Never change ENCRYPTION_KEY after database initialization: it protects stored emails, payment instructions and order access. If migrating the current local store, use its existing key instead of generating a replacement.

### Start a fresh store with one command

After completing the private file, run:

```sh
cd /opt/home-retreat-direct/current
sudo bash deploy/start-production.sh --fresh
```

The helper checks the resolved private settings before building, applies migrations, initializes the empty database and starts the app. It requires an owner password of at least 16 characters and matching internal database connections. Configuration errors identify the field without printing private values. A successful startup ends with `{"status":"ok"}`; continue with domain routing in section 4. The helper leaves email delivery disabled during first initialization.

If first initialization stops at the owner credential check, correct only SEED_OWNER_EMAIL or SEED_OWNER_PASSWORD and rerun `--fresh`. Once PostgreSQL has started, retain its existing database password and encryption key. Use a generated hexadecimal owner password to avoid interpolation; single quotes preserve literal characters in a manually chosen password.

If initialization completed but app startup was interrupted, use `--resume` to finish starting that initialized store. Do not use `--fresh` on an existing database. For later live updates, use the backup and maintenance procedure in section 7. To preserve the local store instead, follow the manual migration path below.

### Resume the initialized store

If the terminal already reported `"initialized":true` and the app later became unhealthy, the owner and catalog are saved. This is the recovery path for your current VPS. Run the following in SSH, from either the administrator or root shell:

```sh
sudo -H -u administrator git -C /opt/home-retreat-direct/current pull --ff-only &&
cd /opt/home-retreat-direct/current &&
sudo bash deploy/start-production.sh --resume
```

The final output should contain `{"status":"ok"}` and `App startup completed`. The build may take a few minutes. The previous HTTP 500 was caused by runtime files missing from the standalone image; this release includes those files. `--resume` checks the saved owner/catalog and starts the corrected image without initializing another store. Do not rerun `--fresh`, regenerate database/encryption secrets or delete Docker volumes.

The production tracing configuration includes the Next.js API runtimes and PostgreSQL/Prisma runtime files required by the standalone server. GitHub CI starts the actual production images with PostgreSQL, initializes a disposable store and verifies health, public product content, prices and served images. Its `deploy/smoke-production.sh` is restricted to disposable GitHub-hosted runners and must never be used on the VPS.

If an earlier Docker build failed with missing lock-file dependencies, fetch the repaired source before retrying. Run Git as the checkout owner. For the existing administrator-owned checkout, even from a root SSH shell:

```sh
sudo -H -u administrator git -C /opt/home-retreat-direct/current pull --ff-only
```

### Manual setup and local-store migration

For the manual path, define this convenience function in your server shell:

```sh
hrd() { sudo docker compose --env-file /opt/home-retreat-direct/private/server.env -f /opt/home-retreat-direct/current/deploy/compose.yml -p hrd "$@"; }
hrd config --quiet
hrd build app tools
hrd up -d --wait db
hrd run --rm -T tools node node_modules/prisma/build/index.js migrate deploy
```

`config --quiet` validates without printing resolved passwords. Do not use `docker compose down -v`: that would delete this store's persistent volumes. The deployment project name is `hrd`; do not reuse another site's project name or database.

## 3. Choose a fresh catalog or preserve the local store

**Fresh production database:** imports the complete real-product catalog, taxonomy, policy drafts and the new owner, with zero fabricated reviews or orders.

```sh
hrd run --rm -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts --check
hrd run --rm -T tools node node_modules/tsx/dist/cli.mjs deploy/init-production.ts
```

Initialization refuses an existing store. Do not run `npm run db:seed` or development imports on production. The contact page is published with your supplied mailboxes. Business policy drafts require owner review; launchApproved starts false.

**Preserve current local edits/accounts/orders instead:** skip the initializer. The target must have the same migrations and no store records. The encrypted migration tool exports from localhost and imports transactionally, refusing a nonempty database or mismatched schema. On the Windows project, with the local app/database running:

```powershell
$env:MIGRATION_KEY = Read-Host 'Enter a separate 64-character hexadecimal migration key'
node --import dotenv/config deploy/migrate-store.mjs export 'C:/ABSOLUTE/PRIVATE/PATH/store.hrd'
node deploy/migrate-store.mjs verify 'C:/ABSOLUTE/PRIVATE/PATH/store.hrd'
Remove-Item Env:MIGRATION_KEY
```

Transfer that encrypted archive through SFTP to the server's private directory. Add its separate MIGRATION_KEY and `IMPORT_PRODUCTION_CONFIRMED=homeretreatdirect.com` temporarily to the private environment. Preserve the local ENCRYPTION_KEY. Import through a read-only mount:

```sh
hrd run --rm -T --user 0:0 -v /opt/home-retreat-direct/private:/migration:ro tools node deploy/migrate-store.mjs import /migration/store.hrd
```

Copy any local `.local/media` uploads into the `hrd_state` volume's `media` directory using the tools container and a read-only archive mount. For example, create a private `media.tar.gz` with `tar -czf media.tar.gz -C .local media`, transfer it to `private`, then run:

```sh
hrd run --rm -T --user 0:0 -v /opt/home-retreat-direct/private:/migration:ro tools tar -xzf /migration/media.tar.gz -C /app/.local
hrd run --rm -T --user 0:0 tools chown -R 1000:1000 /app/.local/media
```

The included public catalog photographs are already in the application image. Keep migration archives private; retain the matching keys in a separate encrypted recovery store. Remove temporary migration variables after verification. Review imported demo orders/reviews and pending emails before enabling delivery; historical development records are not genuine sales or customer ratings. Import preserves their existing flags and closes launch approval.

## 4. Start the app and connect only this domain

After the resume helper succeeds, define this convenience function in the SSH shell. Define it again whenever you reconnect:

```sh
hrd() { sudo docker compose --env-file /opt/home-retreat-direct/private/server.env -f /opt/home-retreat-direct/current/deploy/compose.yml -p hrd "$@"; }
hrd up -d --wait app
curl --fail --show-error --max-time 15 http://127.0.0.1:3100/api/health
```

The expected response is `{"status":"ok"}`. This checks database connectivity, not email delivery or payments. The app binds only to the server's loopback interface, **127.0.0.1:3100**. Use `hrd logs --tail=100 app` for startup diagnostics; keep customer data and credentials private.

Your server output confirms native Nginx includes `/etc/nginx/sites-enabled/*`, existing Certbot SSL options and `/usr/bin/certbot`. The active sites are `apex-global-logistics` and `imperialpaws`; no Home Retreat Direct host was present in that output. The steps below add one dedicated file for this domain. They use [Certbot's webroot method](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot) with the running Nginx service. For a future panel-managed or differently configured server, use its supported domain/certificate tools and the location templates instead.

### Confirm web DNS

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 63.141.255.57 |
| CNAME | www | homeretreatdirect.com |

The DNS check on October 10, 2026 (UTC) found both of these records already correct, no apex AAAA record and the existing Spacemail MX records. No DNS change is needed if they still resolve this way. Do not add AAAA until public IPv6 routing is verified. **Keep existing MX, SPF, DKIM and mailbox records.**

### Add the HTTP host

Run this block after local health returns `{"status":"ok"}`. It refuses an existing file or domain configuration and rolls back the new file if the Nginx test/reload fails:

```sh
sudo bash -eu <<'SH'
site=/etc/nginx/sites-available/home-retreat-direct
enabled=/etc/nginx/sites-enabled/home-retreat-direct
nginx -t
test -d /etc/nginx/sites-enabled
if [ -e "$site" ] || [ -L "$site" ] || [ -e "$enabled" ] || [ -L "$enabled" ]; then
  printf '%s\n' 'A Home Retreat Direct configuration already exists. Review it before proceeding.' >&2
  exit 1
fi
if nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name[[:space:]].*homeretreatdirect\.com'; then
  printf '%s\n' 'This domain already has an Nginx host. Review it instead of adding a duplicate.' >&2
  exit 1
fi
install -d -m 755 /etc/nginx/sites-available /var/www/home-retreat-direct-acme/.well-known/acme-challenge
install -m 644 /opt/home-retreat-direct/current/deploy/nginx-http.conf.example "$site"
ln -s "$site" "$enabled"
if ! nginx -t || ! systemctl reload nginx; then
  rm -f -- "$enabled" "$site"
  nginx -t && systemctl reload nginx
  printf '%s\n' 'The new host was removed; inspect the Nginx error before retrying.' >&2
  exit 1
fi
printf '%s\n' 'home-retreat-direct-acme-ok' > /var/www/home-retreat-direct-acme/.well-known/acme-challenge/hrd-check
chmod 644 /var/www/home-retreat-direct-acme/.well-known/acme-challenge/hrd-check
SH
```

Check both public challenge URLs. Each must print `home-retreat-direct-acme-ok`:

```sh
curl --fail --show-error --max-time 20 http://homeretreatdirect.com/.well-known/acme-challenge/hrd-check
curl --fail --show-error --max-time 20 http://www.homeretreatdirect.com/.well-known/acme-challenge/hrd-check
```

If a check fails, correct domain routing or firewall rules for port 80 before requesting a certificate. Do not sign in or submit personal information over this temporary HTTP host.

### Issue HTTPS and activate the final host

Certbot is already installed on this VPS. Request the certificate for both names without editing the other hosts:

```sh
sudo certbot certonly --webroot -w /var/www/home-retreat-direct-acme \
  --cert-name homeretreatdirect.com \
  -d homeretreatdirect.com -d www.homeretreatdirect.com \
  --email info@homeretreatdirect.com --agree-tos --non-interactive
```

Only after issuance succeeds, activate the HTTPS template. This block backs up and, on failure, restores just the Home Retreat Direct file:

```sh
sudo bash -eu <<'SH'
site=/etc/nginx/sites-available/home-retreat-direct
test -f "$site"
test -f /etc/letsencrypt/options-ssl-nginx.conf
test -s /etc/letsencrypt/live/homeretreatdirect.com/fullchain.pem
test -s /etc/letsencrypt/live/homeretreatdirect.com/privkey.pem
backup=$(mktemp /etc/nginx/sites-available/.home-retreat-direct-backup.XXXXXX)
cp -p -- "$site" "$backup"
install -m 644 /opt/home-retreat-direct/current/deploy/nginx-https.conf.example "$site"
if ! nginx -t || ! systemctl reload nginx; then
  cp -p -- "$backup" "$site"
  rm -f -- "$backup"
  nginx -t && systemctl reload nginx
  printf '%s\n' 'Restored the previous Home Retreat Direct host. Inspect the HTTPS error.' >&2
  exit 1
fi
rm -f -- "$backup"
SH
```

The final host proxies the apex over HTTPS, redirects HTTP and www to `https://homeretreatdirect.com` and leaves the ACME challenge available for renewal. It preserves the original HTTPS scheme and supports streamed Next.js responses using [Nginx proxy directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html). Keep APP_ORIGIN set to that canonical HTTPS origin.

### Verify HTTPS and automatic renewal

```sh
curl --fail --show-error --max-time 20 https://homeretreatdirect.com/api/health
curl -I --max-time 20 http://homeretreatdirect.com/
curl -I --max-time 20 https://www.homeretreatdirect.com/
```

Expect JSON health `{"status":"ok"}`, HTTP 301 for both redirects and Location `https://homeretreatdirect.com/`. Open the homepage, a product/gallery and `/admin` in your browser. Check `apexgloballogistics.net` and `imperialpaws.pet` too.

Install a certificate-specific reload hook, then rehearse renewal. Certbot's existing scheduler remains in use:

```sh
sudo install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/home-retreat-direct >/dev/null <<'SH'
#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/homeretreatdirect.com ]; then
  /usr/sbin/nginx -t
  /bin/systemctl reload nginx
fi
SH
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/home-retreat-direct
sudo certbot renew --cert-name homeretreatdirect.com --dry-run --run-deploy-hooks
sudo systemctl status certbot.timer --no-pager
```

For this `/usr/bin/certbot` installation, enable the existing timer if it is installed but inactive: `sudo systemctl enable --now certbot.timer`. If renewal is managed by another existing scheduler, verify that schedule instead of adding a duplicate. The reload hook applies only after this domain's certificate is renewed; [Certbot documents deploy hooks and automated renewal](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

## 5. Configure the three business mailboxes

The public roles are:

| Mailbox | Site use |
| --- | --- |
| info@homeretreatdirect.com | General, supplier, partnership and business enquiries |
| orders@homeretreatdirect.com | New-order alerts, approval alerts, confirmations, payment requests, invoices and receipts |
| support@homeretreatdirect.com | Customer support, delivery issues, cancellations, refunds and staff replies |

Current DNS suggests Spacemail, but confirm the provider. Its [official SMTP settings](https://www.spaceship.com/knowledgebase/migrate-emails-to-spacemail/) are **mail.spacemail.com**, **465**, SSL/TLS; username is the full mailbox address. Enable IMAP/SMTP access in Spacemail settings if required. For that provider set SMTP_HOST accordingly, SMTP_PORT=465 and SMTP_SECURE=true. Enter each mailbox's private credentials in SMTP_INFO_USER/PASS, SMTP_ORDERS_USER/PASS and SMTP_SUPPORT_USER/PASS. Confirm sender permission, outbound connectivity and SPF/DKIM with the provider. Do not run a new mail server on this VPS or change MX to the VPS IP.

The app also supports Resend with verified senders if you choose it. It always requires the public HTTPS origin and explicitly enabled delivery. Contact forms save the enquiry and its email notice together. Reply-To uses the customer's validated email, allowing staff to reply from their mailbox. Customer order documents use the matching business reply address. Incoming mailbox email remains in your existing mail service; the site inbox handles contact-form messages.

Edit `sudo nano /opt/home-retreat-direct/private/server.env` on the VPS. Keep the existing database/encryption secrets. For the confirmed Spacemail provider use the following nonsecret settings and enter the three mailbox passwords privately:

```dotenv
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.spacemail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_INFO_USER=info@homeretreatdirect.com
SMTP_ORDERS_USER=orders@homeretreatdirect.com
SMTP_SUPPORT_USER=support@homeretreatdirect.com
```

Set SMTP_INFO_PASS, SMTP_ORDERS_PASS and SMTP_SUPPORT_PASS to their corresponding mailbox passwords. Single-quote values containing literal dollar signs so Compose does not interpolate them. Save Nano with Ctrl+O, Enter, then Ctrl+X; run `sudo chmod 600 /opt/home-retreat-direct/private/server.env`.

Review saved messages and queued/failed email recipients in the private studio before starting the worker, because it processes the saved outbox immediately. Choose an inbox you control for the first delivery test. Set EMAIL_DELIVERY_ENABLED=true for that controlled test and recreate the app so it reads the private configuration:

```sh
hrd up -d --force-recreate --wait app
hrd up -d email-worker
hrd ps
hrd logs --tail=50 email-worker
```

The worker checks the outbox every minute using JOB_SECRET over the private container network. Quiet worker logs indicate no reported HTTP failure, not confirmed delivery. Inspect email delivery status in the studio, then verify receipt of the HTML email and open the attached PDF. Check all three sending mailboxes, an approved invoice and a receipt tied to a genuinely confirmed payment. Review spam folders and provider logs. SMTP uncertain acceptance is marked REVIEW_REQUIRED to avoid automatic duplicate sends. Resend retries retain the same key within the safe retry window. Inspect uncertain results before creating another copy. If delivery fails, set EMAIL_DELIVERY_ENABLED=false, recreate the app and stop the worker with `hrd stop email-worker` while correcting the mailbox settings.

## 6. Complete opening checks in the studio

Open **https://homeretreatdirect.com/admin** with the owner you initialized or migrated. Set the verified business address and phone, review/publish the delivery, returns, privacy, terms and warranty policies, and configure a genuine approved payment channel. Review stock/availability, existing pricing evidence and private photography source/usage records. Public pricing is already populated; unresolved supplier/price evidence remains visible to staff rather than being invented.

Check all three contact topics/mailboxes and replies; product selection, cart, guest/account checkout, order tracking, discounts, image updates, order approval, approved invoice and shipment notifications. A payment receipt is issued only after actual payment has been independently verified. Keep the site restricted to your operator IP if doing controlled preopening checks. Enable Business launch approved in Settings after its prerequisites pass; remove access restrictions when opening publicly. Local tests never charge anyone or send real customer mail.

After HTTPS is deployed run:

```sh
hrd run --rm -T tools node scripts/audit-seo.mjs --origin https://homeretreatdirect.com
```

Check sitemap.xml, robots.txt, canonical URLs, mobile navigation and the existing two sites. Submit the sitemap in Search Console after the site is public. Keep .env/private files out of public URLs.

## 7. Backups, recovery and later updates

Run `sudo bash deploy/backup.sh` from the checkout on the VPS. It creates a private PostgreSQL custom dump, uploaded-media archive and checksums; [PostgreSQL documents this dump method](https://www.postgresql.org/docs/17/backup-dump.html). Install the supplied backup service/timer only after the paths and manual backup succeed, using the server's existing administration process. Schedule encrypted off-server copies and choose retention based on disk capacity. Keep the matching ENCRYPTION_KEY separately in encrypted recovery storage.

`deploy/restore-to-new-database.sh` restores into a separate project named `hrd-restore-...`, refuses existing target tables and starts no app or mail worker. Rehearse recovery with delivery disabled. Never test restore over the live database.

### Pull a later GitHub release

Log in again with `ssh administrator@63.141.255.57`, change to the checkout and define the `hrd` function from section 2. First inspect the incoming release without changing the running application:

```sh
sudo -H -u administrator git -C /opt/home-retreat-direct/current status --short
sudo -H -u administrator git -C /opt/home-retreat-direct/current fetch --prune origin main
sudo -H -u administrator git -C /opt/home-retreat-direct/current log --oneline HEAD..origin/main
sudo -H -u administrator git -C /opt/home-retreat-direct/current diff --stat HEAD..origin/main
```

Review the release notes, environment changes and `prisma/migrations` changes. Stop if the checkout has local edits or unexpected commits; resolve them without `git reset --hard` or `git clean`. Keep server-specific settings in `/opt/home-retreat-direct/private/server.env`. Fetching or pulling the source does not replace that file or Docker volumes. [Git's fast-forward-only update](https://git-scm.com/docs/git-pull) refuses a divergent local branch instead of creating an unintended merge.

Once you have reviewed the release, use this guarded sequence. It saves a database/media backup and previous source/image, builds while the current app is running, then stops **only this store's** app and mail worker for the migration. Plan a short maintenance window. The private settings and database/media/cache volumes are retained.

```sh
sudo bash -eu <<'SH'
  git() { sudo -H -u administrator /usr/bin/git "$@"; }
  hrd() { docker compose --env-file /opt/home-retreat-direct/private/server.env -f /opt/home-retreat-direct/current/deploy/compose.yml -p hrd "$@"; }
  cd /opt/home-retreat-direct/current
  test "$(git branch --show-current)" = main
  test -z "$(git status --porcelain)"
  bash deploy/backup.sh
  release_stamp=$(date -u +%Y%m%dT%H%M%SZ)
  previous_commit=$(git rev-parse HEAD)
  previous_container=$(hrd ps -q app)
  previous_worker=$(hrd ps --status running -q email-worker)
  test -n "$previous_container"
  previous_image=$(docker inspect --format '{{.Image}}' "$previous_container")
  install -d -m 700 /opt/home-retreat-direct/private/releases
  git archive "$previous_commit" > "/opt/home-retreat-direct/private/releases/$release_stamp-source.tar"
  printf '%s\n' "$previous_commit" > "/opt/home-retreat-direct/private/releases/$release_stamp-commit.txt"
  docker image tag "$previous_image" "home-retreat-direct:rollback-$release_stamp"
  git merge --ff-only origin/main
  hrd config --quiet
  hrd build app tools
  hrd stop email-worker app
  hrd run --rm -T tools node node_modules/prisma/build/index.js migrate deploy
  hrd up -d --no-deps --wait app
  curl --fail http://127.0.0.1:3100/api/health
  if [ -n "$previous_worker" ]; then hrd up -d --no-deps email-worker; fi
  hrd ps
SH
```

This runs Git as administrator and database/backup operations with root permissions. It uses [Compose recreation](https://docs.docker.com/reference/cli/docker/compose/up/) without starting or recreating the database or unrelated projects. The worker is restarted only if it was already running; configure and test delivery in section 5 before first enabling it. If a command fails, the sequence stops; inspect the failure before continuing. A migration failure may leave this store's app stopped. Never rerun production initialization, development seeds or catalog imports as part of an update. Do not delete volumes or prune the retained rollback image before recovery has been tested.

Check the public health endpoint, catalog images, login, checkout, order approval, invoice/receipt delivery and both existing websites after the update. Roll back the image only when its database schema remains compatible; use the tested recovery process for incompatible changes. Keep the other sites' configurations, databases and mail services separate.
