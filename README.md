# Home Retreat Direct

A premium U.S. home retail storefront with a manual order approval and payment receipt workflow. Built with Next.js 16 App Router, TypeScript, PostgreSQL, Prisma 7, Tailwind 4 and shadcn/ui.

**Current delivery is a populated local storefront:** 250 identified real models, 1005 distinct original photographs, at least four per model, prices and details in every category. The original 85 records are complete. The approximately 250-product target is reached. Owner discounts and image editing are available. Manufacturer photo-reuse clearance and verified business operations remain prerequisites for public commercial launch; see the adjacent CATALOG-GALLERY-STATUS.md.

**Pricing update, October 8, 2026:** all 250 products have 15% off. Current exact-model USD quotes were verified for 59 models, including finish-specific prices; 191 archival furniture models retain their existing store prices because a current exact-model price could not be verified. The protected **/admin/price-sources** page records evidence, dates, regular/sale prices and unresolved reasons. Product staff can change discounts and retire or restore individual options. Existing orders keep their saved prices.

Business domain: **https://homeretreatdirect.com**. Prepared Linux VPS deployment: **[VPS-HOSTING.md](VPS-HOSTING.md)**. The server package is isolated from the two existing sites and includes PostgreSQL, persistent images, email processing, backups and restore instructions. Server installation and live mailbox authentication still require private configuration.

Local storefront: http://localhost:3000

GitHub source: [Petitmalware/Home-retreat-direct](https://github.com/Petitmalware/Home-retreat-direct). Connect to the VPS with `ssh administrator@63.141.255.57`, then follow [VPS-HOSTING.md](VPS-HOSTING.md) to clone `main`, create private server configuration, and run the isolated deployment. Later releases use a reviewed fast-forward pull; database and uploaded media stay in persistent volumes.

Technical SEO uses Next.js Metadata API, canonical URLs, dynamic robots/sitemap routes, factual Organization/Product JSON-LD and complete server-rendered product tabs. See [SEO-DEPLOYMENT.md](SEO-DEPLOYMENT.md) for the final-domain configuration, indexability rules and deployment checks. Run `npm run seo:audit -- --origin https://YOUR-ACTUAL-DOMAIN --output seo-audit.json` to audit the deployed website without changing data.

## Start locally

On this computer, open the adjacent **Home Retreat Direct.code-workspace** file in VS Code. Press **Ctrl+Shift+B** to start PostgreSQL and the website together. Open **http://localhost:3000**; the staff studio is **http://localhost:3000/admin**. Stop the task with Ctrl+C in its terminal, or run `npm run stop:local` from the project folder. A second launch detects the running server and avoids opening the database files again.

The launcher uses PostgreSQL on port 54329. It first tries the bundled PostgreSQL 18 binaries; on this computer Windows terminated their bootstrap process with an access violation, so the delivered setup uses **PGlite**, a PostgreSQL engine compiled to WebAssembly, with persistent files in `.local/pglite`. This is a local development runtime with serialized connections; use ordinary persistent PostgreSQL when deploying for customers. On its first run, the launcher copies the existing cloud database without changing that database, preserves the encryption key and owner account, and saves a private snapshot in `.local/backups`. Subsequent runs reuse the local data. `.local/ADMIN-ACCESS.txt` contains the original owner credentials; use your changed password if you changed it earlier. These private files and `.env.hosted` are excluded from Git and deployment archives. Back up `.local` and `.env` together while the local server is stopped.

For a fresh Windows checkout, install Node.js 22.13 or newer and npm, then:

```powershell
npm ci --include=dev --include=optional
npm run dev:local
```

The PostgreSQL binaries are downloaded as an optional dependency. No system PostgreSQL installation or Docker is required. The delivered copy already includes them. A fresh checkout without a cloud configuration creates the populated 250-product catalog and a private initial owner password automatically.

For an externally managed development PostgreSQL database instead, configure `.env` from `.env.example` and use:

```sh
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npx tsx scripts/import-retail-catalog.ts
npx tsx scripts/import-retail-content.ts
npx tsx scripts/import-source-variants.ts
npm run dev
```

On Windows, use `Copy-Item .env.example .env` instead of `cp`. Supply PostgreSQL URLs, a random 32-byte hex ENCRYPTION_KEY, and strong SEED_OWNER credentials before migrating/seeding. Prisma uses the direct URL for migrations. Initial seeding establishes the account and taxonomy; the three catalog imports populate the real products, information pages and documented finishes. Do not rerun the initial seed against an established live catalog.

Open http://127.0.0.1:3000. Sign in at /admin with the seeded owner. For the automatic local launcher, use `.local/ADMIN-ACCESS.txt`. The older separate LOCAL-RUNTIME.env output preserves the original cloud configuration; keep it secure and retain the new local `.env` for local work.

## Included

- Seven categories and three principal collections. Massage chairs share one set of 12 products across Home Comfort and Wellness; products support multiple categories/collections.
- 250 real model galleries across all seven categories, with 1005 distinct original photos. Every displayed product has four or more photos, details and a regular selling price. Superseded single-photo records are archived.
- Search, price/material/color/brand/rating/attribute filters, sorting, pagination, quick views, variant selection, gallery zoom/swiping, two-to-four-product comparisons, saved products and responsive purchasing controls.
- PostgreSQL-backed anonymous cart, guest checkout, accounts, saved addresses, order history and tracking.
- Protected staff studio with server-enforced Owner, Administrator, Order Manager, Product Manager and Customer Support permissions.
- Product, variant, pricing, percentage discounts, inventory, category, collection, image, SEO and visibility administration. Local and VPS admin uploads work without an external storage account when persistent local media is enabled; Cloudinary also remains supported. Galleries support multiple images, alt text, variants, primary selection and reordering.
- Manual order approval, final shipping/tax confirmation, inventory reservations, encrypted business payment instructions, independently confirmed receipt, shipment tracking, cancellation, external refund recording, internal notes and audit history.
- Branded transactional email outbox with encrypted message bodies, retry leases, provider idempotency and delivery logs. Delivery generates single-use, expiring purchased-item review tokens.
- Customer review buttons on every product, deliberate 1–5 star selection, average ratings, interactive star filters, sorting, optional purchased-item photos, staff replies and verified-purchase eligibility. Reviews stay private until staff approve them; all star levels contribute equally. Duplicate submissions are rejected. Demo reviews cannot become verified purchases or contribute to real ratings.
- Contact topics route enquiries to info, orders or support, save notices atomically, and expose delivery status only to staff. Customers can email the supplied business mailboxes directly; incoming mailbox emails remain with the mail provider.
- Secure PDF pro forma summaries and paid invoices, editable information/policy pages, newsletter consent, metadata, product/breadcrumb schema, sitemap and robots foundations.
- Consent-controlled GA/Google Ads/Meta browser hooks and a server conversion ledger. Purchase events can only be recorded after confirmed, non-demo payment.

## The order and payment contract

Submission creates **AWAITING_REVIEW**, snapshots authoritative variant prices and records policy acceptance. It does not create a confirmed payment, reserve/decrement inventory, or fire Purchase. A replay-safe submission ID recovers the same order if the original response is lost.

Approval requires explicit availability, customer/address and delivery checks plus verified shipping and tax amounts. It atomically reserves stock. Payment instructions require an active owner-approved business method and completed approval. The record remains REQUESTED/unpaid; its instructions-sent timestamp is populated only after the email provider accepts the message.

Only authorized financial staff can confirm independently verified receipt. Amount received must equal the approved total. Confirmation and stock decrement occur in one serializable transaction and cannot happen twice. Shipping stages require this paid workflow. Refund tools record already-completed external refunds; they do not transfer money.

Customer order access requires a matching signed-in account or a secret confirmation token. Public tracking requires both order number and email and returns progress/tracking without addresses, internal notes or payment credentials.

## Service configuration

**PostgreSQL:** Ordinary Node deployments use DATABASE_TRANSPORT=pg. Sites Workers use DATABASE_TRANSPORT=http with Prisma Postgres. PostgreSQL migrations are applied externally with the Prisma CLI, not replaced with SQLite/D1. Back up the database and encryption key together; losing the key makes stored instructions/email bodies unreadable.

**Business email:** Authenticated SMTP supports the three existing homeretreatdirect.com mailboxes with separate SMTP_INFO_USER/PASS, SMTP_ORDERS_USER/PASS and SMTP_SUPPORT_USER/PASS credentials. Set EMAIL_PROVIDER=smtp, SMTP_HOST, SMTP_PORT, SMTP_SECURE, INFO_EMAIL, ORDERS_EMAIL and SUPPORT_EMAIL in the private environment. Resend remains available with EMAIL_PROVIDER=resend, RESEND_API_KEY and verified sender addresses. Both require public HTTPS APP_ORIGIN and EMAIL_DELIVERY_ENABLED=true when ready to send. Order events queue their branded notification automatically. While sending is paused or configuration is incomplete, logs stay QUEUED and no email delivery is claimed. Configure an external authenticated cron to POST /api/jobs/email with `Authorization: Bearer JOB_SECRET` every minute for durable retry processing. The owner can also process the outbox in settings. Uncertain delivery older than the provider retry window is marked REVIEW_REQUIRED for operator inspection. Provider acceptance is recorded, not a guarantee the customer read the message.

**Image storage:** Included gallery photographs live in public/images/catalog, independently of the database. Provenance and hashes are recorded in data/product-galleries.json; required minimal attribution is in Terms; detailed source records are staff-only at /admin/photo-sources. Local product uploads use .local/media and /api/media. VPS uploads use LOCAL_MEDIA_ENABLED=true and a durable LOCAL_MEDIA_DIRECTORY; the supplied Compose state volume preserves them across application rebuilds. Back up that volume with the database. The startup gallery importer runs once and preserves later owner edits. `npm run catalog:audit` checks local gallery counts and duplicate file hashes.

**Pricing records:** Source quotes in data/price-sources.json are private server data and are exposed only to authorized product staff. The storefront receives regular and discounted selling prices. `npm run catalog:prices` manually reapplies the recorded source prices and 15% promotion, creates a private pre-change backup, and verifies that historical order amounts stay unchanged. It is not run on startup: subsequent owner prices, discounts and retired options are preserved. Refresh source evidence before intentionally running it again; it will overwrite current product discounts. An unmatched option without verified pricing is retired, keeping historical references and allowing removal from existing bags.

**Cloudinary:** Set cloud name, API key and API secret. Uploads validate image types, signatures and an 8 MB limit. Delivered-order review photo uploads are bound to a valid review token and email, rate limited, and cryptographically authorized for the pending review. Uploaded images use automatic quality/format URLs. Configure provider lifecycle cleanup for uploads abandoned before a form is saved.

**Payment:** Add only verified legitimate business invoice, ACH, bank transfer or secure card-link instructions through owner settings. AES-GCM protects instructions at rest. Checkout collects no bank/card details. No actual payment service credentials or payee details were invented.

**Analytics:** Configure GA measurement, Google Ads and/or Meta Pixel IDs in settings. Optional browser measurement starts only after the visitor enables it in the footer. View, Search, Add to Cart, Begin Checkout and Submit Order are separate events. Browser code has no Purchase event. Authorized integrations can read the non-demo conversion feed at GET /api/admin/analytics and use eventKey/orderId for downstream deduplication. Server-to-server GA Measurement Protocol/Meta CAPI/Ads purchase exporters are integration work; they are not enabled by entering a browser ID alone. Never treat Submit Order as Purchase.

## Validation

```sh
npm run typecheck
npm run lint -- --max-warnings 0
npm test
npm run test:browser
```

For the real database/HTTP integration suite, run the local server first and set RUN_INTEGRATION=true:

```sh
RUN_INTEGRATION=true npm run test:integration
```

PowerShell: `$env:RUN_INTEGRATION='true'; npm run test:integration`.

Integration tests use uniquely named development fixtures, clean up their own users/orders/reviews/payment method/addresses and restore the selected variant's inventory. **Run them against an isolated development database, never a live sales database.** The verified-purchase branch uses a temporary explicit TEST-only draft product/order and removes it. No fabricated genuine review remains after the tests. Browser tests use Chrome by default; set PLAYWRIGHT_CHANNEL=msedge on Windows or install a Playwright browser and adjust the config.

Validated: 39 unit checks, 71 HTTP/database checks including exact model/finish pricing, discounts, retired options, contact, document emails, source privacy, customer order wording and review moderation, ten browser workflows, six isolated deployment checks and a scoped admin email UI check. The SEO audit checks all indexable pages and internal destinations with normal and Googlebot responses; the final report has zero errors or warnings. Gallery audits check all selected local files for integrity, duplicate hashes and full decoding. Layout checks cover 390px mobile and 1440px desktop, including server-rendered tab details, discounted finish prices, deliberate low-star review submission and private moderation. This is functional/layout verification, not a measured Core Web Vitals or independent accessibility audit.

## Deployment

For this server, follow **[VPS-HOSTING.md](VPS-HOSTING.md)** and use `deploy/init-production.ts` for a fresh production catalog or the encrypted store migration for current local edits. Do not use the development seed on production.

Other standard Node hosting:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm run start
```

Set production runtime secrets in the host, APP_ORIGIN to the exact HTTPS origin, and use persistent managed PostgreSQL. Secure session/cart cookies are enabled in production. Set the verified email/storage configuration before opening for sales.

Sites hosting uses the existing .openai/hosting.json project identity, preserves owner-private access, and packages the actual Next.js build through OpenNext:

```sh
npm run build:sites
```

The build generates a separate Cloudflare Prisma client, adapts the Next standalone output, clears embedded dotenv values, bundles a Worker plus assets into dist, and scans the artifact for configured secrets. Windows builds use directory junctions/file copies because native symlinks can require elevated privileges. Runtime secrets are stored in Sites, not the source manifest. Source must be pushed and the matching archive saved before deployment. Do not create another Site identity for this checkout.

A new automatic gateway should call the same confirmation/stock/order services only after verified, idempotent provider receipt. Do not update status directly from a customer redirect.

## Before real sales

1. Configure managed PostgreSQL for the public host, retain the encryption key, and transfer the verified local data with a tested backup and restore process. The delivered local PGlite data has no scheduled expiration.
2. Confirm supplier availability, delivery eligibility, installation requirements, product-specific warranty and returns. Resolve commercial photo-reuse permission for the 58 manufacturer galleries; the 192 Amazon Berkeley Objects models have CC BY 4.0 attribution.
3. Enter the actual business identity/contact details, approved payment channels, sender/domain and storage credentials. Approve/publish complete business policies.
4. Change DEVELOPMENT_CATALOG=false and SHOW_DEMO_REVIEWS=false. Demo records stay stored for development but are excluded from live catalog/review display. Rebuild when changing deployment-mode flags.
5. Enable Business launch approved in owner settings. The server checks prerequisites and refuses to bypass them.
6. Configure backups, outbox cron, monitoring, sender deliverability, inventory operations and the desired audience/custom domain. Rotate the initial owner password before live operation.

Still optional/future: automatic gateways/financing, supplier feeds, promotion scheduling, product Q&A, inbound customer email ingestion, review videos and server-side advertising exporters. No such service is claimed to be connected.

All active product photography, identity, source URLs, hashes and rights information are recorded in data/product-galleries.json; required minimal attribution is in Terms and detailed records are restricted to /admin/photo-sources. Additional decorative homepage photography is recorded privately in data/photo-source-records/decorative.json. Three older single-photo reference records are archived and excluded from the active storefront. No owner image upload is required to complete the delivered galleries. Prices are the store's regular selling prices, and supplier availability is confirmed through the order-review process.

Customer order confirmations, invoices and payment receipts include branded HTML/plain-text emails and attached PDFs. Staff previews, queueing, saved-message retries and custom messages are in Admin → Orders → Customer emails. Sending remains paused for later professional email/domain configuration; see EMAIL-SETUP.md.
