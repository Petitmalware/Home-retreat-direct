# Technical SEO and deployment verification

The storefront uses Next.js 16 App Router, its Metadata API, and the `app/robots.ts` and `app/sitemap.ts` metadata routes. Metadata is resolved into the HTML head before the response streams. The visible design, purchasing workflow, product facts, prices and review records are unchanged.

Local verification passed for all 271 indexable pages, all 250 products and 285 internal destinations, with zero errors or warnings. The optimized production build, typecheck, lint, 39 unit checks and ten browser workflows passed. The two browser checks covering the final brand/specification and staff skip-link changes also passed after those fixes. `data/seo-validation.json` records the verification summary. Repeat the HTTP audit on the real domain after deployment; local checks cannot validate a host or domain that has not been configured yet.

## What changed

- Homepage, collections, published information pages, newsletter and products have unique descriptive titles, descriptions, absolute canonical URLs, Open Graph and Twitter metadata. Product metadata uses the stored SEO title/description and actual gallery photo. Other pages use their existing content and configured branding.
- One `APP_ORIGIN` controls canonical, sitemap, sharing and structured-data URLs. Canonicals remove tracking queries, fragments and extra trailing slashes. Next.js already redirects trailing-slash variants. Seven legacy shipping, return, privacy and terms aliases now permanently redirect to their existing main routes.
- Public indexing no longer depends on `DEVELOPMENT_CATALOG`. That setting continues to control the existing order workflow. `robots.txt` allows public crawling and blocks staff/API/private order/review paths. Utility and private pages have intentional `noindex`; private pages also use `nofollow`.
- The dynamic sitemap reads active, non-demo products, all category/collection routes, published information pages, the homepage and newsletter. It excludes aliases, utilities, private URLs and draft policies. The current database produces 271 unique URLs, including all 250 products.
- Organization JSON-LD uses the existing store name, URL and configured public business details. It includes a logo/contact/social URL only when provided in settings. No address, registration identifier or certification was invented.
- Product JSON-LD uses the actual name, description, SKU, model, brand, material, photos, dimensions and specifications. Its USD offer matches the default selected finish's displayed discounted price. Special Order stock remains unknown in markup; supported stock statuses are mapped only when explicitly recorded. Ratings are included only from approved, non-demo customer reviews; no reviews or ratings were added.
- All ten product detail tabs now include their content in the server HTML, with inactive panels hidden as before. Crawlers do not need to click a tab to receive features, specifications, dimensions, delivery information or published customer reviews. Every active product is discoverable in the sitemap even when it is beyond the first collection page.
- The existing Specifications table exposes each product's stored brand label so it matches structured data exactly. The staff login's existing Skip to content link now has a working main-content target. Both retain the existing styling.

Six linked policy pages currently have `published:false`: delivery, returns, terms, warranty, contact and privacy. Their existing page access and forms are preserved, with intentional `noindex` and exclusion from the sitemap. When the owner publishes them in Admin → Policies, they automatically become indexable and enter the sitemap. Those five business policies remain available for owner review.

## Deploy with the final domain

1. Set `APP_ORIGIN` in the production environment to the exact public HTTPS origin, with no path, query or credentials. Keep the same hostname for canonicals, sitemap and public traffic. Production fails clearly if this setting is missing or malformed. Local URLs are for local use only.
2. Build and restart the application with those environment settings. The existing Sites-specific build uses `HOSTED_APP_ORIGIN`; set that to the same final domain if using that build path. Configure the host to permanently redirect alternate hostnames and HTTP traffic to the chosen HTTPS origin.
3. Confirm the host/CDN does not add `X-Robots-Tag: noindex`, authentication or a global crawler block to public pages. Keep ordinary authentication on private staff and customer records.
4. Publish any information policies that are ready for indexing using the existing admin control.

## Verify the deployed result

Run the included read-only audit against the actual domain from the project directory:

```powershell
npm run seo:audit -- --origin https://YOUR-ACTUAL-DOMAIN --output seo-audit.json
```

It reads every sitemap URL with both normal and Googlebot user agents, checks titles/descriptions/Open Graph/canonicals/noindex, parses JSON-LD against rendered product facts, follows internal links and fragment targets, and verifies aliases, query canonicals, trailing slash handling and missing-page 404s. It sends at most two simultaneous HTTP requests, changes no records, and exits nonzero on failures. The report is a local artifact; do not place it in `public/`.

Open `/robots.txt` and `/sitemap.xml` on the deployed domain. View the source of a homepage, collection, product and information page: confirm the title, description and canonical use the correct HTTPS domain, JSON-LD parses, and product detail text appears outside client data scripts. Account/cart/checkout/search/compare/wishlist/tracking/staff/order/review URLs should remain unindexed.

Use Google's [Rich Results Test](https://search.google.com/test/rich-results) for a deployed product and homepage, and the [Schema Markup Validator](https://validator.schema.org/) for general schema checks. Submit `/sitemap.xml` to [Google Search Console](https://search.google.com/search-console/) and use URL Inspection → Test live URL on representative public pages. Search features and indexing are Google's decisions, not guaranteed by passing the local checks. Optional stock, shipping, business logo or review warnings should be resolved only with accurate configured facts.

Framework and schema references: [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [Next.js JSON-LD](https://nextjs.org/docs/app/guides/json-ld), [Google Product markup](https://developers.google.com/search/docs/appearance/structured-data/product-snippet), [Google Organization markup](https://developers.google.com/search/docs/appearance/structured-data/organization).
