import fs from 'node:fs/promises';
import path from 'node:path';

// Read-only HTTP checks. No database, credentials, browser, or JavaScript execution is needed.
// Read the whole streamed response: Next.js may emit metadata after the initial head.
const userAgents = {
  browser: 'Mozilla/5.0 (compatible; HomeRetreatSEOAudit/1.0)',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
const utilityPaths = ['/account', '/cart', '/checkout', '/compare', '/search', '/track-order', '/wishlist'];
const policyAliases = {
  '/shipping': '/delivery', '/shipping-delivery': '/delivery', '/refunds': '/returns',
  '/refund-policy': '/returns', '/return-policy': '/returns', '/privacy-policy': '/privacy',
  '/terms-of-service': '/terms',
};

function options() {
  const args = process.argv.slice(2);
  const parsed = {origin: process.env.APP_ORIGIN || 'http://localhost:3000', output: null, timeout: 45000};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node scripts/audit-seo.mjs [--origin https://your-domain.example] [--output report.json] [--timeout 45000]');
      console.log('Checks every sitemap page, server-rendered product facts, robots rules, internal links, URL variants, and legacy redirects. Uses at most two simultaneous HTTP requests.');
      process.exit(0);
    }
    if (!['--origin', '--output', '--timeout'].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    parsed[args[i].slice(2)] = args[++i];
  }
  const url = new URL(parsed.origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('--origin must be an HTTP(S) origin, without a path, query, credentials, or fragment.');
  parsed.origin = url.origin;
  parsed.timeout = Number(parsed.timeout);
  if (!Number.isInteger(parsed.timeout) || parsed.timeout < 1000 || parsed.timeout > 300000) throw new Error('--timeout must be an integer between 1000 and 300000 milliseconds.');
  return parsed;
}

function decode(value) {
  const entities = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“'};
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? all;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
  });
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=<>/'"]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}

function text(value) {
  return decode(value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parsePage(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const metas = new Map();
  for (const tag of markup.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = attributes(tag[0]), key = (attr.name || attr.property || '').toLowerCase();
    if (key) metas.set(key, [...(metas.get(key) || []), attr.content || '']);
  }
  const links = [...markup.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  return {
    titles: [...markup.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map(match => text(match[1])),
    metas,
    canonicals: links.filter(link => link.rel?.toLowerCase().split(/\s+/).includes('canonical')).map(link => link.href || ''),
    anchors: [...markup.matchAll(/<a\b[^>]*>/gi)].map(match => attributes(match[0]).href).filter(Boolean),
    ids: new Set([...markup.matchAll(/<[a-z][^>]*>/gi)].map(match => attributes(match[0]).id).filter(Boolean)),
    h1: [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map(match => text(match[1])),
    content: text(markup.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')),
    rawMarkup: markup,
    jsonLd: scripts.filter(match => attributes(match[1]).type?.toLowerCase() === 'application/ld+json').map(match => match[2]),
  };
}

function schemas(value) {
  if (Array.isArray(value)) return value.flatMap(schemas);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(child => typeof child === 'object' ? schemas(child) : [])];
}

function hasType(value, type) { return [value['@type']].flat().includes(type); }
function absolute(value) { try { return typeof value === 'string' && /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } }
function normalized(value) { const url = new URL(value); return url.origin + (url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')) + url.search; }
function comparable(value) { return text(value).normalize('NFC').toLowerCase(); }
function contains(content, value) { return typeof value === 'string' && comparable(content).includes(comparable(value)); }
function noindex(page, header) { return [...(page.metas.get('robots') || []), ...(page.metas.get('googlebot') || []), ...(page.metas.get('googlebot-news') || []), header || ''].some(value => /\b(noindex|none)\b/i.test(value)); }

function parseRobots(body) {
  const groups = [], sitemaps = []; let group = null, rulesStarted = false;
  for (const line of body.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, '').trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, rawKey, value] = match, key = rawKey.toLowerCase().trim();
    if (key === 'sitemap') { sitemaps.push(value); continue; }
    if (key === 'user-agent') {
      if (!group || rulesStarted) { group = {agents: [], rules: []}; groups.push(group); rulesStarted = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow'].includes(key)) { group.rules.push({allow: key === 'allow', value}); rulesStarted = true; }
  }
  return {groups, sitemaps};
}

function crawlAllowed(robots, pathname, agent) {
  const matches = robots.groups.map(group => ({group, specificity: Math.max(-1, ...group.agents.map(value => value === '*' ? 0 : agent.toLowerCase().includes(value) ? value.length : -1))})).filter(entry => entry.specificity >= 0);
  const specificity = Math.max(-1, ...matches.map(entry => entry.specificity));
  const rules = matches.filter(entry => entry.specificity === specificity).flatMap(entry => entry.group.rules).filter(rule => {
    if (!rule.value) return false;
    const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    return new RegExp('^' + escaped).test(pathname);
  }).sort((a, b) => b.value.replace(/\*/g, '').length - a.value.replace(/\*/g, '').length || Number(b.allow) - Number(a.allow));
  return !rules.length || rules[0].allow;
}

async function pool(values, work) {
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(2, values.length)}, async () => {
    while (cursor < values.length) { const item = values[cursor++]; await work(item); }
  }));
}

async function main() {
  const config = options(), start = Date.now();
  const report = {checkedAt: new Date().toISOString(), origin: config.origin, sitemapUrls: [], pages: [], linkChecks: [], redirects: [], variants: [], errors: [], warnings: [], requests: 0};
  const fail = (code, url, detail) => report.errors.push({code, url, detail});
  const warn = (code, url, detail) => report.warnings.push({code, url, detail});
  const pages = new Map(), discovered = new Map(), images = new Set();
  let robots = null;

  async function request(url, agent = 'browser', method = 'GET') {
    const redirects = []; let current = url;
    for (let attempt = 0; attempt <= 5; attempt++) {
      report.requests++;
      const response = await fetch(current, {method, headers: {'User-Agent': userAgents[agent], Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}, redirect: 'manual', signal: AbortSignal.timeout(config.timeout)});
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error(`HTTP ${response.status} redirect has no Location header`);
        const next = new URL(location, current);
        if (next.origin !== config.origin) throw new Error(`Internal URL redirects to a different origin: ${next.origin}`);
        redirects.push({url: current, status: response.status, to: next.href}); current = next.href;
        continue;
      }
      const body = method === 'HEAD' ? '' : await response.text();
      return {status: response.status, url: current, redirects, body, contentType: response.headers.get('content-type') || '', robotsHeader: response.headers.get('x-robots-tag') || ''};
    }
    throw new Error('More than five redirects');
  }

  async function safeRequest(url, agent = 'browser', method = 'GET') {
    try { return await request(url, agent, method); }
    catch (error) { fail('request-failed', url, `${agent}: ${error.message}`); return null; }
  }

  function discover(page, from) {
    for (const href of page.anchors) {
      let url;
      try { url = new URL(href, from); } catch { fail('invalid-internal-link', from, href); continue; }
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== config.origin) continue;
      // Never request API/action URLs or customer-specific order and review tokens.
      if (/^\/(?:api|orders|review)(?:\/|$)/.test(url.pathname) || /^\/admin\//.test(url.pathname)) continue;
      const key = url.href;
      const sources = discovered.get(key) || new Set(); sources.add(from); discovered.set(key, sources);
    }
  }

  function checkSchema(page, url) {
    const all = [];
    for (const json of page.jsonLd) {
      try { all.push(...schemas(JSON.parse(json))); }
      catch (error) { fail('invalid-json-ld', url, error.message); }
    }
    const organizations = all.filter(schema => hasType(schema, 'Organization'));
    const products = all.filter(schema => hasType(schema, 'Product'));
    for (const organization of organizations) {
      if (!organization.name || !absolute(organization.url)) fail('invalid-organization', url, 'Organization must contain its real name and absolute URL.');
      if (organization.url && new URL(organization.url, url).origin !== config.origin) fail('organization-origin', url, organization.url);
    }
    if (new URL(url).pathname === '/' && !organizations.length) fail('missing-organization', url, 'Homepage has no Organization structured data.');
    if (new URL(url).pathname.startsWith('/products/') && products.length !== 1) fail('missing-product', url, `Expected one Product schema; found ${products.length}.`);
    for (const product of products) {
      if (!product.name || !page.h1.some(heading => comparable(heading) === comparable(product.name))) fail('product-name-content', url, 'Product name must match the server-rendered H1.');
      if (!product.description || !contains(page.content, product.description)) fail('product-description-content', url, 'Product description is absent from server-rendered content.');
      if (!product.sku || !contains(page.content, product.sku)) fail('product-sku-content', url, 'Product SKU is absent from server-rendered content.');
      if (!product.model || !contains(page.content, product.model)) fail('product-model-content', url, 'Product model is absent from server-rendered content.');
      if (!product.brand?.name || !contains(page.content, product.brand.name)) fail('product-brand-content', url, 'Product brand is absent from server-rendered content.');
      if (![product.image].flat().length || ![product.image].flat().every(absolute)) fail('product-image-urls', url, 'Product images must use absolute HTTP(S) URLs.');
      if (product.material && !contains(page.content, product.material)) fail('product-material-content', url, 'Product material is absent from server-rendered content.');
      for (const property of [product.additionalProperty || []].flat()) if (property.value != null && !contains(page.content, String(property.value))) fail('product-specification-content', url, `Specification is absent from server-rendered content: ${property.name || 'unnamed'}.`);
      const offers = [product.offers || []].flat();
      if (!offers.length) fail('missing-product-offer', url, 'An indexable active product must contain a priced offer.');
      for (const offer of offers) {
        const price = Number(offer.price);
        if (!Number.isFinite(price) || price <= 0 || offer.priceCurrency !== 'USD') fail('invalid-product-price', url, 'Offer must contain the existing positive USD selling price.');
        if (!absolute(offer.url) || normalized(offer.url) !== normalized(url)) fail('offer-canonical-url', url, 'Offer URL must match the canonical product URL.');
        const renderedPrice = new Intl.NumberFormat('en-US', {style: 'currency', currency: offer.priceCurrency || 'USD', minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2}).format(price);
        if (!contains(page.content, renderedPrice)) fail('product-price-content', url, `Offer price ${renderedPrice} is absent from server-rendered content.`);
        if (offer.availability && !/^https:\/\/schema\.org\/(?:InStock|OutOfStock|PreOrder|BackOrder|Discontinued|LimitedAvailability|OnlineOnly|SoldOut)$/.test(offer.availability)) fail('invalid-availability', url, offer.availability);
      }
      if (product.aggregateRating) {
        const rating = product.aggregateRating, count = Number(rating.reviewCount || rating.ratingCount);
        if (!Number.isInteger(count) || count < 1 || Number(rating.ratingValue) < 1 || Number(rating.ratingValue) > 5) fail('invalid-product-rating', url, 'Rating count and value must represent genuine published reviews.');
        if (!new RegExp(`${count}\\s+customer\\s+reviews?\\b`).test(page.content)) fail('rating-content-mismatch', url, 'Structured rating count is absent from rendered customer reviews.');
      }
      if (product.review && !/customer reviews/i.test(page.content)) fail('review-content-mismatch', url, 'Structured reviews have no corresponding rendered customer review section.');
    }
    return {organizationCount: organizations.length, productCount: products.length, jsonLdCount: page.jsonLd.length};
  }

  function checkIndexable(page, response, url, agent) {
    const oneMeta = key => { const values = page.metas.get(key) || []; if (values.length !== 1 || !values[0]) fail('missing-or-duplicate-meta', url, `${agent}: ${key}, found ${values.length}.`); return values[0] || ''; };
    if (response.status !== 200) fail('indexable-status', url, `${agent}: HTTP ${response.status}.`);
    if (response.redirects.length || normalized(response.url) !== normalized(url)) fail('sitemap-redirect', url, `${agent}: Sitemap URL redirects instead of returning its own canonical content.`);
    if (noindex(page, response.robotsHeader)) fail('public-noindex', url, `${agent}: Sitemap page has a noindex directive.`);
    if (page.titles.length !== 1 || !page.titles[0]) fail('missing-or-duplicate-title', url, `${agent}: Found ${page.titles.length} titles.`);
    const description = oneMeta('description');
    if (description.length < 35) warn('short-description', url, `${agent}: Description has ${description.length} characters.`);
    if (page.canonicals.length !== 1 || !absolute(page.canonicals[0])) fail('missing-or-duplicate-canonical', url, `${agent}: Expected one absolute canonical URL.`);
    else {
      const canonical = new URL(page.canonicals[0]);
      if (canonical.search || canonical.hash || normalized(canonical.href) !== normalized(url)) fail('wrong-canonical', url, `${agent}: ${canonical.href}.`);
    }
    for (const key of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:url']) oneMeta(key);
    if (page.metas.get('og:type')?.[0] !== 'website') fail('open-graph-type', url, `${agent}: Expected the website Open Graph type.`);
    if (!absolute(page.metas.get('og:url')?.[0]) || normalized(page.metas.get('og:url')?.[0] || url) !== normalized(url)) fail('open-graph-url', url, `${agent}: Open Graph URL differs from the canonical URL.`);
    const ogImages = page.metas.get('og:image') || [];
    if (!ogImages.length || !ogImages.every(absolute)) fail('open-graph-images', url, `${agent}: Open Graph images must use absolute HTTP(S) URLs.`);
    for (const image of ogImages) if (absolute(image) && new URL(image).origin === config.origin) images.add(image);
    if (!page.h1.length) fail('missing-heading', url, `${agent}: No server-rendered H1.`);
    return {title: page.titles[0] || '', description, canonical: page.canonicals[0] || '', ...checkSchema(page, url)};
  }

  async function loadSitemap(url, depth = 0) {
    if (depth > 3) { fail('sitemap-depth', url, 'Sitemap index nesting exceeds three levels.'); return []; }
    const response = await safeRequest(url);
    if (!response) return [];
    if (response.status !== 200 || response.redirects.length) fail('sitemap-status', url, `HTTP ${response.status}; redirects: ${response.redirects.length}.`);
    if (!/xml/i.test(response.contentType)) fail('sitemap-content-type', url, response.contentType);
    if (/<sitemapindex\b/i.test(response.body)) {
      const children = [...response.body.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)].flatMap(match => [...match[1].matchAll(/<loc\b[^>]*>([^<]*)<\/loc>/gi)].map(value => decode(value[1].trim())));
      const result = [];
      for (const child of children) {
        if (!absolute(child) || new URL(child).origin !== config.origin) { fail('sitemap-origin', url, child); continue; }
        result.push(...await loadSitemap(child, depth + 1));
      }
      return result;
    }
    if (!/<urlset\b/i.test(response.body)) fail('sitemap-xml', url, 'Missing sitemap urlset.');
    return [...response.body.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].flatMap(match => [...match[1].matchAll(/<loc\b[^>]*>([^<]*)<\/loc>/gi)].map(value => decode(value[1].trim())));
  }

  console.log(`Auditing ${config.origin} with normal and Googlebot HTTP requests (maximum concurrency: 2).`);
  const robotResponse = await safeRequest(config.origin + '/robots.txt');
  if (robotResponse) {
    if (robotResponse.status !== 200) fail('robots-status', config.origin + '/robots.txt', `HTTP ${robotResponse.status}.`);
    robots = parseRobots(robotResponse.body);
    if (!robots.groups.length) fail('robots-rules', config.origin + '/robots.txt', 'No user-agent rules found.');
    if (!robots.sitemaps.includes(config.origin + '/sitemap.xml')) fail('robots-sitemap', config.origin + '/robots.txt', 'Sitemap directive must use the audited public origin.');
  }
  const rawUrls = await loadSitemap(config.origin + '/sitemap.xml'), validUrls = [];
  if (!rawUrls.length) fail('empty-sitemap', config.origin + '/sitemap.xml', 'No indexable pages were listed.');
  const seen = new Set();
  for (const url of rawUrls) {
    if (!absolute(url)) { fail('invalid-sitemap-url', config.origin + '/sitemap.xml', url); continue; }
    const parsed = new URL(url);
    if (parsed.origin !== config.origin) { fail('sitemap-origin', config.origin + '/sitemap.xml', url); continue; }
    if (parsed.search || parsed.hash) fail('query-sitemap-url', url, 'Sitemap URLs must not include query strings or fragments.');
    if (seen.has(normalized(url))) fail('duplicate-sitemap-url', url, 'Repeated canonical URL in sitemap.');
    else { seen.add(normalized(url)); validUrls.push(url); }
    if (robots) for (const agent of ['*', 'Googlebot']) if (!crawlAllowed(robots, parsed.pathname, agent)) fail('public-robots-block', url, `${agent} is blocked by robots.txt.`);
    if (/^\/(?:admin|api|account|orders|review|checkout|cart|compare|search|wishlist|track-order)(?:\/|$)/.test(parsed.pathname)) fail('private-sitemap-url', url, 'Utility or private URLs must not appear in the sitemap.');
  }
  report.sitemapUrls = validUrls;

  let completed = 0;
  await pool(validUrls, async url => {
    const entry = {url};
    for (const agent of Object.keys(userAgents)) {
      const response = await safeRequest(url, agent);
      if (!response) continue;
      const page = parsePage(response.body);
      entry[agent] = checkIndexable(page, response, url, agent);
      if (agent === 'browser') { pages.set(normalized(url), {page, response}); discover(page, url); }
    }
    if (entry.browser && entry.googlebot) for (const key of ['title', 'description', 'canonical', 'productCount']) if (entry.browser[key] !== entry.googlebot[key]) fail('bot-content-differs', url, `${key} differs between normal requests and Googlebot.`);
    report.pages.push(entry);
    completed++;
    if (completed % 50 === 0 || completed === validUrls.length) console.log(`Checked ${completed}/${validUrls.length} sitemap pages.`);
  });

  for (const key of ['title', 'description', 'canonical']) {
    const values = new Map();
    for (const entry of report.pages) if (entry.browser?.[key]) {
      const value = entry.browser[key].trim().toLowerCase(), urls = values.get(value) || []; urls.push(entry.url); values.set(value, urls);
    }
    for (const [value, urls] of values) if (urls.length > 1) fail(`duplicate-${key}`, urls[0], `${value}: ${urls.join(', ')}`);
  }

  for (const pathname of [...utilityPaths, '/admin']) if (!discovered.has(config.origin + pathname)) discovered.set(config.origin + pathname, new Set(['SEO utility route check']));
  // Crawl rendered public/utility anchors only. One clean URL is fetched once even when it has several fragments.
  const checkedLinks = new Set(); let wave = 0;
  while (wave++ < 5) {
    const targets = [...discovered].filter(([url]) => !checkedLinks.has(url));
    if (!targets.length) break;
    const jobs = new Map();
    for (const [href, sources] of targets) {
      checkedLinks.add(href); const url = new URL(href), requestUrl = url.origin + url.pathname + url.search;
      let fragment = url.hash.slice(1);
      try { fragment = decodeURIComponent(fragment); } catch { fail('invalid-fragment', href, 'Fragment has malformed URL escaping.'); }
      const links = jobs.get(requestUrl) || []; links.push({href, sources: [...sources], fragment}); jobs.set(requestUrl, links);
    }
    await pool([...jobs], async ([url, links]) => {
      let result = pages.get(normalized(url));
      if (!result) {
        const response = await safeRequest(url); if (!response) return;
        result = {response, page: /html/i.test(response.contentType) ? parsePage(response.body) : null};
        pages.set(normalized(url), result);
        if (result.page && response.status === 200) discover(result.page, response.url);
      }
      const {response, page} = result;
      if (response.status !== 200) fail('broken-internal-link', url, `HTTP ${response.status}; linked by ${links.flatMap(link => link.sources).join(', ')}.`);
      if (response.redirects.length) report.redirects.push({url, chain: response.redirects, destination: response.url});
      for (const link of links) {
        if (link.fragment && page && !page.ids.has(link.fragment)) fail('broken-fragment', link.href, `Missing id=${link.fragment}; linked by ${link.sources.join(', ')}.`);
        report.linkChecks.push({url: link.href, status: response.status, sources: link.sources, redirected: response.redirects.length > 0});
      }
      if (page && (utilityPaths.includes(new URL(url).pathname) || new URL(url).pathname === '/admin') && !noindex(page, response.robotsHeader)) fail('utility-indexable', url, 'Private or utility page is missing noindex metadata.');
      if (page && !seen.has(normalized(url)) && !noindex(page, response.robotsHeader) && !response.redirects.length) warn('indexable-link-outside-sitemap', url, 'Linked page is indexable but absent from the sitemap.');
    });
  }
  if ([...discovered.keys()].some(url => !checkedLinks.has(url))) warn('link-crawl-limit', config.origin, 'Further anchor discovery exceeded five crawl waves.');

  await pool([...images], async url => {
    const response = await safeRequest(url, 'browser', 'HEAD');
    if (response && (response.status !== 200 || !/^image\//i.test(response.contentType))) fail('broken-open-graph-image', url, `HTTP ${response.status}; Content-Type: ${response.contentType}.`);
  });

  await pool(Object.entries(policyAliases), async ([alias, destination]) => {
    const url = config.origin + alias, response = await safeRequest(url);
    if (!response) return;
    report.variants.push({url, status: response.status, destination: response.url, redirectCount: response.redirects.length});
    if (!response.redirects.length || ![301, 308].includes(response.redirects[0].status) || normalized(response.url) !== normalized(config.origin + destination) || response.status !== 200) fail('duplicate-alias-url', url, `Expected a permanent redirect to ${destination}.`);
  });
  const productUrl = validUrls.find(url => new URL(url).pathname.startsWith('/products/'));
  const collectionUrl = validUrls.find(url => new URL(url).pathname.startsWith('/collections/'));
  const variants = [productUrl, collectionUrl].filter(Boolean).flatMap(url => [{url: url + '/', canonical: url, redirect: true}, {url: url + '?utm_source=seo-audit', canonical: url, redirect: false}]);
  await pool(variants, async variant => {
    const response = await safeRequest(variant.url);
    if (!response) return;
    const page = parsePage(response.body);
    report.variants.push({url: variant.url, status: response.status, destination: response.url, canonical: page.canonicals[0], redirectCount: response.redirects.length});
    if (response.status !== 200 || !absolute(page.canonicals[0]) || normalized(page.canonicals[0]) !== normalized(variant.canonical)) fail('duplicate-variant-url', variant.url, 'URL variant does not resolve to a working clean canonical page.');
    if (variant.redirect && (!response.redirects.length || ![301, 308].includes(response.redirects[0].status))) fail('trailing-slash-redirect', variant.url, 'Trailing slash variant should redirect permanently to its clean URL.');
  });

  // Check that missing pages return a genuine 404 rather than a crawlable soft 404.
  for (const pathname of ['/seo-audit-missing-page-' + Date.now(), '/products/seo-audit-missing-product-' + Date.now(), '/collections/seo-audit-missing-collection-' + Date.now()]) {
    const url = config.origin + pathname, response = await safeRequest(url);
    if (response && response.status !== 404) fail('soft-404', url, `Missing URL returned HTTP ${response.status}.`);
  }

  report.pages.sort((a, b) => a.url.localeCompare(b.url));
  report.durationSeconds = Number(((Date.now() - start) / 1000).toFixed(2));
  report.summary = {indexablePages: validUrls.length, products: report.pages.filter(page => page.browser?.productCount === 1).length, internalLinks: report.linkChecks.length, internalDestinations: new Set(report.linkChecks.map(link => new URL(link.url).origin + new URL(link.url).pathname + new URL(link.url).search)).size, openGraphImages: images.size, requests: report.requests, errors: report.errors.length, warnings: report.warnings.length};
  if (config.output) { const output = path.resolve(config.output); await fs.mkdir(path.dirname(output), {recursive: true}); await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n'); console.log(`JSON report: ${output}`); }
  console.log(`SEO audit: ${report.errors.length ? 'FAILED' : 'PASSED'} — ${report.summary.indexablePages} sitemap pages, ${report.summary.products} products, ${report.summary.internalDestinations} internal destinations, ${report.errors.length} errors, ${report.warnings.length} warnings (${report.durationSeconds}s).`);
  for (const error of report.errors.slice(0, 30)) console.error(`${error.code}: ${error.url} — ${error.detail}`);
  if (report.errors.length > 30) console.error(`${report.errors.length - 30} more errors are in the JSON report.`);
  for (const warning of report.warnings.slice(0, 10)) console.log(`Warning ${warning.code}: ${warning.url} — ${warning.detail}`);
  if (report.errors.length) process.exitCode = 1;
}

main().catch(error => { console.error(`SEO audit failed: ${error.message}`); process.exitCode = 1; });
