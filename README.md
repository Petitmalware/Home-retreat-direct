# Home Retreat Direct

A premium U.S. home retail storefront with a manual order approval and payment receipt workflow. Built with Next.js 16 App Router, TypeScript, PostgreSQL, Prisma 7, Tailwind 4 and shadcn/ui.

**Current delivery is a private development store.** Its 85 fictional products, representative licensed photography, warranty placeholders and review fixtures are explicitly disclosed. It is not open for real sales. The launch gate prevents live checkout until real inventory, published business policies, verified contacts and email configuration are supplied.

Private site: https://home-retreat-direct.nearbykidd.chatgpt.site

## Start locally

Install Node.js 22.13 or newer and npm. From this directory:

```sh
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

On Windows, use `Copy-Item .env.example .env` instead of `cp`. Supply PostgreSQL URLs, a random 32-byte hex ENCRYPTION_KEY, and strong SEED_OWNER credentials before migrating/seeding. Prisma uses the direct URL for migrations. The seed is idempotent and creates no real customer orders or payment channels. Do not rerun the demo seed against an established live catalog.

Open http://127.0.0.1:3000. Sign in at /admin with the seeded owner. Local credentials for the delivered database are in the separate **LOCAL-ADMIN-ACCESS.txt** output; they are excluded from source and deployment artifacts. LOCAL-RUNTIME.env is a separate private backup of database/encryption configuration; keep it secure.

## Included

- Seven categories and three principal collections. Massage chairs share one set of 12 products across Home Comfort and Wellness; products support multiple categories/collections.
- 85 development products and 170 variants, normalized specifications, licensed stock images, lifestyle placeholders and illustrative dimensions references.
- Search, price/material/color/brand/rating/attribute filters, sorting, pagination, quick views, variant selection, gallery zoom/swiping, two-to-four-product comparisons, saved products and responsive purchasing controls.
- PostgreSQL-backed anonymous cart, guest checkout, accounts, saved addresses, order history and tracking.
- Protected staff studio with server-enforced Owner, Administrator, Order Manager, Product Manager and Customer Support permissions.
- Product, variant, pricing, inventory, category, collection, image, SEO and visibility administration. Cloudinary uploads support multiple images, alt text, variants, primary image selection and reordering.
- Manual order approval, final shipping/tax confirmation, inventory reservations, encrypted business payment instructions, independently confirmed receipt, shipment tracking, cancellation, external refund recording, internal notes and audit history.
- Branded transactional email outbox with encrypted message bodies, retry leases, provider idempotency and delivery logs. Delivery generates single-use, expiring purchased-item review tokens.
- Moderated customer reviews, optional purchased-item photos, replies and verified-purchase eligibility. Demo reviews cannot become verified purchases or contribute to real ratings.
- Secure PDF pro forma summaries and paid invoices, editable information/policy pages, newsletter consent, metadata, product/breadcrumb schema, sitemap and robots foundations.
- Consent-controlled GA/Google Ads/Meta browser hooks and a server conversion ledger. Purchase events can only be recorded after confirmed, non-demo payment.

## The order and payment contract

Submission creates **AWAITING_REVIEW**, snapshots authoritative variant prices and records policy acceptance. It does not create a confirmed payment, reserve/decrement inventory, or fire Purchase. A replay-safe submission ID recovers the same order if the original response is lost.

Approval requires explicit availability, customer/address and delivery checks plus verified shipping and tax amounts. It atomically reserves stock. Payment instructions require an active owner-approved business method and completed approval. The record remains REQUESTED/unpaid; its instructions-sent timestamp is populated only after the email provider accepts the message.

Only authorized financial staff can confirm independently verified receipt. Amount received must equal the approved total. Confirmation and stock decrement occur in one serializable transaction and cannot happen twice. Shipping stages require this paid workflow. Refund tools record already-completed external refunds; they do not transfer money.

Customer order access requires a matching signed-in account or a secret confirmation token. Public tracking requires both order number and email and returns progress/tracking without addresses, internal notes or payment credentials.

## Service configuration

**PostgreSQL:** Ordinary Node deployments use DATABASE_TRANSPORT=pg. Sites Workers use DATABASE_TRANSPORT=http with Prisma Postgres. PostgreSQL migrations are applied externally with the Prisma CLI, not replaced with SQLite/D1. Back up the database and encryption key together; losing the key makes stored instructions/email bodies unreadable.

**Resend:** Set RESEND_API_KEY, EMAIL_FROM (a verified sender) and SUPPORT_EMAIL. Order events queue their branded notification automatically. With credentials absent, logs stay QUEUED and no email delivery is claimed. Configure an external authenticated cron to POST /api/jobs/email with `Authorization: Bearer JOB_SECRET` every minute for durable retry processing. The owner can also process the outbox in settings. Uncertain delivery older than the provider retry window is marked REVIEW_REQUIRED for operator inspection. Provider acceptance is recorded, not a guarantee the customer read the message.

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

Validated: 17 unit checks, 20 HTTP/database subtests (21 including their enclosing test), and three browser workflows. Layout checks cover 390px mobile and 1440px desktop. This is functional/layout verification, not a measured Core Web Vitals or full independent accessibility audit.

## Deployment

Standard Node hosting:

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

1. **Claim or replace the temporary development database.** The delivered database is scheduled for deletion on **October 7, 2026 at 10:34 PM Eastern** unless claimed. Claim link: https://create-db.prisma.io/claim?projectID=proj_wm0hidtgh4tmq6lmjukou8a6&utm_source=create-db&utm_medium=cli
2. Replace/retire fictional inventory and representative photos, verify supplier specifications, delivery eligibility, electrical requirements, product-specific warranty and returns, and correct all product imagery/diagrams.
3. Enter the actual business identity/contact details, approved payment channels, sender/domain and storage credentials. Approve/publish complete business policies.
4. Change DEVELOPMENT_CATALOG=false and SHOW_DEMO_REVIEWS=false. Demo records stay stored for development but are excluded from live catalog/review display. Rebuild when changing deployment-mode flags.
5. Enable Business launch approved in owner settings. The server checks prerequisites and refuses to bypass them.
6. Configure backups, outbox cron, monitoring, sender deliverability, inventory operations and the desired audience/custom domain. Rotate the initial owner password before live operation.

Still optional/future: automatic gateways/financing, supplier feeds, promotion scheduling, product Q&A, inbound customer email ingestion, review videos and server-side advertising exporters. No such service is claimed to be connected.

Image license/source attribution is recorded in public/images/credits.json. Stock images are representative placeholders, not authorized manufacturer inventory images. No certifications, scarcity claims, customer experiences or honored warranty coverage were invented.
