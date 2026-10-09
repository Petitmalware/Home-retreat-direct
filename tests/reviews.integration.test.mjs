import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db.ts';
import {hash} from '../lib/security.ts';
import {product as publicProduct} from '../lib/products.ts';

const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3000';
const run = process.env.RUN_INTEGRATION === 'true';

test('customer ratings and impartial moderation with removable fixtures', {skip: !run, timeout: 180000}, async t => {
  const fixtureKey = randomUUID();
  const productIds = [];
  const reviewIds = [];
  const emails = new Set();
  let ownerId;
  let ownerCookie;
  let positive;
  let critical;
  let activeProduct;

  function payload(extra = {}) {
    const email = 'reviews-' + randomUUID() + '@example.test';
    emails.add(email);
    return {productId: activeProduct?.id, email, name: 'TEST isolated customer', rating: 5,
      title: 'TEST positive ' + fixtureKey, body: 'TEST ONLY. An isolated review fixture, removed when this check finishes.', ...extra};
  }
  async function fixtureProduct(status = 'ACTIVE', isDemo = false) {
    const key = randomUUID();
    const p = await db.product.create({data: {
      sku: 'TEST-REVIEWS-' + key, slug: 'test-reviews-' + key, name: 'TEST ONLY review product',
      shortDescription: 'Isolated test fixture', description: 'TEST ONLY removable review product.', priceCents: 12900,
      brand: 'TEST', model: 'TEST', status, isDemo, material: 'TEST', dimensions: 'TEST', weight: 'TEST',
      shippingWeight: 'TEST', warranty: 'TEST', deliveryType: 'TEST', deliveryWindow: 'TEST', assembly: 'TEST',
      care: 'TEST', features: [], included: [], seoTitle: 'TEST', seoDescription: 'TEST',
      variants: {create: {sku: 'TEST-REVIEWS-VARIANT-' + key, name: 'TEST', color: 'TEST', colorHex: '#ffffff',
        size: 'TEST', priceCents: 12900, inventory: {create: {quantity: 1}}}},
    }});
    productIds.push(p.id);
    return p;
  }
  async function req(path, method = 'GET', data, cookie = '', requestOrigin = origin) {
    const response = await fetch(origin + path, {method, headers: {origin: requestOrigin,
      ...(cookie ? {cookie} : {}), ...(data ? {'Content-Type': 'application/json'} : {})},
      body: data ? JSON.stringify(data) : undefined});
    const content = await response.text();
    return {status: response.status, body: (response.headers.get('content-type') || '').includes('application/json') ? JSON.parse(content) : content};
  }
  async function moderate(review, status) {
    return req('/api/admin/reviews/' + review.id, 'POST', {status}, ownerCookie);
  }
  async function ratings(count, rating) {
    const p = await publicProduct(activeProduct.slug);
    assert.equal(p.reviewCount, count);
    assert.equal(p.rating, rating);
    assert.equal(p.demoCount, 0);
    assert.equal(p.demoRating, 0);
  }

  try {
    activeProduct = await fixtureProduct();
    const sessionToken = randomUUID();
    const owner = await db.user.create({data: {email: 'reviews-owner-' + fixtureKey + '@example.test',
      name: 'TEST isolated review moderator', passwordHash: 'TEST unusable password', staff: {create: {role: 'OWNER'}}}});
    ownerId = owner.id;
    await db.session.create({data: {userId: ownerId, tokenHash: hash(sessionToken), expiresAt: new Date(Date.now() + 600000)}});
    ownerCookie = 'hrd_session=' + sessionToken;

    await t.test('CSRF, rating range and explicit product selection are required', async () => {
      const base = payload();
      assert.equal((await req('/api/reviews', 'POST', base, '', 'https://untrusted.example')).status, 403);
      for (const rating of [undefined, 0, 6, 1.5, '5']) {
        assert.equal((await req('/api/reviews', 'POST', {...base, rating})).status, 400);
      }
      assert.equal((await req('/api/reviews', 'POST', {...base, productId: undefined})).status, 400);
      assert.equal((await req('/api/reviews', 'POST', {...base, status: 'APPROVED', verifiedPurchase: true})).status, 400);
      assert.equal(await db.review.count({where: {productId: activeProduct.id}}), 0);
    });

    await t.test('direct submissions reject drafts, archived products, demo inventory and unknown IDs', async () => {
      for (const [status, isDemo] of [['DRAFT', false], ['ARCHIVED', false], ['ACTIVE', true]]) {
        const p = await fixtureProduct(status, isDemo);
        assert.equal((await req('/api/reviews', 'POST', payload({productId: p.id}))).status, 404);
      }
      assert.equal((await req('/api/reviews', 'POST', payload({productId: 'unknown-' + fixtureKey}))).status, 404);
    });

    await t.test('staff accounts cannot write customer reviews or confer their own verification', async () => {
      assert.equal((await req('/api/reviews', 'POST', payload({email: owner.email}), ownerCookie)).status, 403);
      assert.equal(await db.review.count({where: {productId: activeProduct.id}}), 0);
    });

    await t.test('positive and critical guest experiences both enter a private moderation queue', async () => {
      const good = payload();
      const bad = payload({rating: 1, title: 'TEST critical ' + fixtureKey,
        body: 'TEST ONLY. Critical customer-review fixture, removed when this check finishes.'});
      for (const input of [good, bad]) {
        const response = await req('/api/reviews', 'POST', {...input, email: ' ' + input.email.toUpperCase() + ' '});
        assert.equal(response.status, 200, JSON.stringify(response.body));
        assert(!JSON.stringify(response.body).includes(input.email));
      }
      positive = await db.review.findFirstOrThrow({where: {email: good.email, productId: activeProduct.id}});
      critical = await db.review.findFirstOrThrow({where: {email: bad.email, productId: activeProduct.id}});
      reviewIds.push(positive.id, critical.id);
      for (const review of [positive, critical]) {
        assert.equal(review.status, 'PENDING');
        assert.equal(review.verifiedPurchase, false);
        assert.equal(review.isDemo, false);
        assert.equal(review.orderItemId, null);
      }
      await ratings(0, 0);
      const page = await req('/products/' + activeProduct.slug);
      assert.equal(page.status, 200);
      assert(!page.body.includes(good.title));
      assert(!page.body.includes(bad.title));
    });

    await t.test('sequential and simultaneous retries cannot duplicate an unpurchased review', async () => {
      const good = {productId: activeProduct.id, email: positive.email, name: positive.name,
        rating: positive.rating, title: positive.title, body: positive.body};
      assert.equal((await req('/api/reviews', 'POST', good)).status, 409);
      const concurrent = payload({title: 'TEST concurrent retry ' + fixtureKey});
      const results = await Promise.all([req('/api/reviews', 'POST', concurrent), req('/api/reviews', 'POST', concurrent)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const saved = await db.review.findMany({where: {email: concurrent.email, productId: activeProduct.id}});
      assert.equal(saved.length, 1);
      await db.review.delete({where: {id: saved[0].id}});
      assert.equal(await db.review.count({where: {productId: activeProduct.id}}), 2);
    });

    await t.test('approval publishes all star levels and customer emails remain private', async () => {
      assert.equal((await moderate(positive, 'APPROVED')).status, 200);
      assert.equal((await moderate(critical, 'APPROVED')).status, 200);
      await ratings(2, 3);
      const page = await req('/products/' + activeProduct.slug);
      assert.equal(page.status, 200);
      assert(page.body.includes(positive.title));
      assert(page.body.includes(critical.title));
      assert(page.body.includes('"ratingValue":3'));
      assert(page.body.includes('"reviewCount":2'));
      assert(!page.body.includes(positive.email));
      assert(!page.body.includes(critical.email));
      for (const review of await db.review.findMany({where: {id: {in: reviewIds}}})) assert.equal(review.verifiedPurchase, false);
    });

    await t.test('approved demo fixtures cannot affect public ratings or product reviews', async () => {
      const demo = await db.review.create({data: {productId: activeProduct.id, email: 'demo-' + fixtureKey + '@example.test',
        name: 'TEST fixture', rating: 5, title: 'TEST demo excluded ' + fixtureKey,
        body: 'TEST ONLY excluded fixture.', status: 'APPROVED', isDemo: true}});
      reviewIds.push(demo.id);
      await ratings(2, 3);
      const page = await req('/products/' + activeProduct.slug);
      assert(!page.body.includes(demo.title));
    });

    await t.test('flagging and rejection remove reviews from averages and public content', async () => {
      assert.equal((await moderate(critical, 'FLAGGED')).status, 200);
      await ratings(1, 5);
      assert.equal((await moderate(positive, 'REJECTED')).status, 200);
      await ratings(0, 0);
      const page = await req('/products/' + activeProduct.slug);
      assert(!page.body.includes(positive.title));
      assert(!page.body.includes(critical.title));
      assert(!page.body.includes('"aggregateRating"'));
    });

    await t.test('public reviews cannot forge customer photo upload grants', async () => {
      const response = await req('/api/reviews', 'POST', payload({photos: [{url: 'https://res.cloudinary.com/example/image.jpg', grant: 'forged'}]}));
      assert.equal(response.status, 400);
      assert.equal(await db.review.count({where: {productId: activeProduct.id}}), 3);
    });
  } finally {
    await db.adminAuditLog.deleteMany({where: {entityId: {in: reviewIds}}});
    await db.product.deleteMany({where: {id: {in: productIds}}});
    if (ownerId) await db.user.deleteMany({where: {id: ownerId}});
    await db.rateLimit.deleteMany({where: {key: {in: [...emails].map(email => hash('review:' + email))}}});
    await db.$disconnect();
  }
});
