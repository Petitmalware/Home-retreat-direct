# Host Home Retreat Direct on your VPS

The deployment target is **homeretreatdirect.com**, on the Linux VPS at **63.141.255.57** (4 cores, 8 GB RAM, 140 GB SSD). This package adds a separate Home Retreat Direct app and PostgreSQL database. Your existing web server continues to handle the other two sites and HTTPS.

The source repository is [Petitmalware/Home-retreat-direct](https://github.com/Petitmalware/Home-retreat-direct), with deployment files at its root. The server clones its `main` branch and fetches later updates from GitHub; the database, uploaded images and private configuration remain on the VPS.

This is a prepared deployment, not a completed installation on the VPS. The SSH login is administrator@63.141.255.57. Authentication, Linux distribution, control panel, existing proxy configuration, free memory/disk and SMTP authentication have not been tested. Docker is unavailable on this Windows computer; the Linux images must be built and checked on the server or Linux CI. Local tests cover the application, email adapters, production initialization and encrypted store migration.

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

Define this convenience function in your server shell:

```sh
hrd() { docker compose --env-file /opt/home-retreat-direct/private/server.env -f /opt/home-retreat-direct/current/deploy/compose.yml -p hrd "$@"; }
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

```sh
hrd up -d --wait app
curl --fail http://127.0.0.1:3100/api/health
```

The expected response is `{"status":"ok"}`. This checks database connectivity, not email delivery or payments. The app binds only to the server's loopback interface, **127.0.0.1:3100**. Use `hrd logs --tail=100 app` for startup diagnostics; keep customer data and credentials private.

Add a new domain-specific virtual host in the existing proxy. The templates are `deploy/nginx-location.conf.example` and `deploy/apache-location.conf.example`. Route this domain's requests to `http://127.0.0.1:3100`; preserve Host and the original HTTPS scheme. Nginx streaming uses proxy buffering off, consistent with [Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting) and [Nginx proxy directives](https://nginx.org/en/docs/http/ngx_http_proxy_module.html). Use your panel's supported method when applicable. Test proxy configuration before a graceful reload, and test both existing sites afterward.

Once the new virtual host works, add web DNS:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 63.141.255.57 |
| CNAME | www | homeretreatdirect.com |

Confirm this IP with the host first. Do not add AAAA unless the host supplies a working IPv6 address. **Keep existing MX, SPF, DKIM and mailbox records.** The DNS check on October 9, 2026 found Spacemail MX records and no apex A/AAAA record; email and website hosting can remain separate. Recheck current records before editing.

Issue and renew a certificate for the apex and www using the existing panel/certificate manager. Redirect HTTP and www to **https://homeretreatdirect.com**. Do not install a second competing listener on ports 80/443. Keep APP_ORIGIN set to that canonical HTTPS origin.

## 5. Configure the three business mailboxes

The public roles are:

| Mailbox | Site use |
| --- | --- |
| info@homeretreatdirect.com | General, supplier, partnership and business enquiries |
| orders@homeretreatdirect.com | New-order alerts, approval alerts, confirmations, payment requests, invoices and receipts |
| support@homeretreatdirect.com | Customer support, delivery issues, cancellations, refunds and staff replies |

Current DNS suggests Spacemail, but confirm the provider. Its [official SMTP settings](https://www.spaceship.com/knowledgebase/migrate-emails-to-spacemail/) are **mail.spacemail.com**, **465**, SSL/TLS; username is the full mailbox address. Enable IMAP/SMTP access in Spacemail settings if required. For that provider set SMTP_HOST accordingly, SMTP_PORT=465 and SMTP_SECURE=true. Enter each mailbox's private credentials in SMTP_INFO_USER/PASS, SMTP_ORDERS_USER/PASS and SMTP_SUPPORT_USER/PASS. Confirm sender permission, outbound connectivity and SPF/DKIM with the provider. Do not run a new mail server on this VPS or change MX to the VPS IP.

The app also supports Resend with verified senders if you choose it. It always requires the public HTTPS origin and explicitly enabled delivery. Contact forms save the enquiry and its email notice together. Reply-To uses the customer's validated email, allowing staff to reply from their mailbox. Customer order documents use the matching business reply address. Incoming mailbox email remains in your existing mail service; the site inbox handles contact-form messages.

Review saved messages in the private studio and choose an inbox you control for the first delivery test. Set EMAIL_DELIVERY_ENABLED=true and recreate the app so it reads the private configuration:

```sh
hrd up -d --force-recreate --wait app
hrd up -d email-worker
```

The worker checks the outbox every minute using JOB_SECRET over the private container network. Provider acceptance is logged; it does not prove inbox delivery. Verify receipt of the HTML email and open the attached PDF. Review spam folders and provider logs. SMTP uncertain acceptance is marked REVIEW_REQUIRED to avoid automatic duplicate sends. Resend retries retain the same key within the safe retry window. Inspect uncertain results before creating another copy.

## 6. Complete opening checks in the studio

Open **https://homeretreatdirect.com/admin** with the owner you initialized or migrated. Set the verified business address and phone, review/publish the delivery, returns, privacy, terms and warranty policies, and configure a genuine approved payment channel. Review stock/availability, existing pricing evidence and private photography source/usage records. Public pricing is already populated; unresolved supplier/price evidence remains visible to staff rather than being invented.

Check all three contact topics/mailboxes and replies; product selection, cart, guest/account checkout, order tracking, discounts, image updates, order approval, approved invoice and shipment notifications. A payment receipt is issued only after actual payment has been independently verified. Keep the site restricted to your operator IP if doing controlled preopening checks. Enable Business launch approved in Settings after its prerequisites pass; remove access restrictions when opening publicly. Local tests never charge anyone or send real customer mail.

After HTTPS is deployed run:

```sh
hrd run --rm -T tools node scripts/audit-seo.mjs --origin https://homeretreatdirect.com
```

Check sitemap.xml, robots.txt, canonical URLs, mobile navigation and the existing two sites. Submit the sitemap in Search Console after the site is public. Keep .env/private files out of public URLs.

## 7. Backups, recovery and later updates

Run `bash deploy/backup.sh` on the VPS. It creates a private PostgreSQL custom dump, uploaded-media archive and checksums; [PostgreSQL documents this dump method](https://www.postgresql.org/docs/17/backup-dump.html). Install the supplied backup service/timer only after the paths and manual backup succeed, using the server's existing administration process. Schedule encrypted off-server copies and choose retention based on disk capacity. Keep the matching ENCRYPTION_KEY separately in encrypted recovery storage.

`deploy/restore-to-new-database.sh` restores into a separate project named `hrd-restore-...`, refuses existing target tables and starts no app or mail worker. Rehearse recovery with delivery disabled. Never test restore over the live database.

### Pull a later GitHub release

Log in again with `ssh administrator@63.141.255.57`, change to the checkout and define the `hrd` function from section 2. First inspect the incoming release without changing the running application:

```sh
cd /opt/home-retreat-direct/current
git status --short
git fetch --prune origin main
git log --oneline HEAD..origin/main
git diff --stat HEAD..origin/main
```

Review the release notes, environment changes and `prisma/migrations` changes. Stop if the checkout has local edits or unexpected commits; resolve them without `git reset --hard` or `git clean`. Keep server-specific settings in `/opt/home-retreat-direct/private/server.env`. Fetching or pulling the source does not replace that file or Docker volumes. [Git's fast-forward-only update](https://git-scm.com/docs/git-pull) refuses a divergent local branch instead of creating an unintended merge.

Once you have reviewed the release, use this guarded sequence. It saves a database/media backup and previous source/image, builds while the current app is running, then stops **only this store's** app and mail worker for the migration. Plan a short maintenance window. The private settings and database/media/cache volumes are retained.

```sh
(
  set -eu
  cd /opt/home-retreat-direct/current
  test "$(git branch --show-current)" = main
  test -z "$(git status --porcelain)"
  bash deploy/backup.sh
  release_stamp=$(date -u +%Y%m%dT%H%M%SZ)
  previous_commit=$(git rev-parse HEAD)
  previous_container=$(hrd ps -q app)
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
  hrd up -d --no-deps email-worker
  hrd ps
)
```

This uses [Compose recreation](https://docs.docker.com/reference/cli/docker/compose/up/) without starting or recreating the database or unrelated projects. Use the mail-worker command only after email delivery has been configured and tested as described in section 5. If a command fails, the sequence stops; inspect the failure before continuing. A migration failure may leave this store's app stopped. Never rerun production initialization, development seeds or catalog imports as part of an update. Do not delete volumes or prune the retained rollback image before recovery has been tested.

Check the public health endpoint, catalog images, login, checkout, order approval, invoice/receipt delivery and both existing websites after the update. Roll back the image only when its database schema remains compatible; use the tested recovery process for incompatible changes. Keep the other sites' configurations, databases and mail services separate.
