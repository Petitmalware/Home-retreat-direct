import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Buffer} from 'node:buffer';
import {randomBytes, randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';

test('opening publishes adopted policies and real checkout preserves unpaid review and idempotency', {timeout: 90000}, async t => {
  // No dotenv or live database: migrations and all orders use this memory-only fixture.
  const memory = await PGlite.create();
  let socket: PGLiteSocketServer | undefined;
  let db: (typeof import('../lib/db'))['db'] | undefined;
  try {
    for (const folder of fs.readdirSync('prisma/migrations').sort()) {
      const file = path.join('prisma/migrations', folder, 'migration.sql');
      if (fs.existsSync(file)) await memory.exec(fs.readFileSync(file, 'utf8'));
    }
    socket = new PGLiteSocketServer({db: memory, host: '127.0.0.1', port: 0});
    await socket.start();
    Object.assign(process.env, {DATABASE_URL: 'postgresql://postgres:isolated@' + socket.getServerConn() + '/postgres',
      DATABASE_TRANSPORT: 'pg', LOCAL_DATABASE_ENGINE: 'pglite', DEVELOPMENT_CATALOG: 'false', SITES_RUNTIME: 'false',
      APP_ORIGIN: 'https://homeretreatdirect.com', ENCRYPTION_KEY: Buffer.from(randomBytes(32)).toString('hex'),
      EMAIL_PROVIDER: 'smtp', EMAIL_DELIVERY_ENABLED: 'true', SMTP_HOST: 'mail.example.test', SMTP_PORT: '465', SMTP_SECURE: 'true',
      INFO_EMAIL: 'info@example.test', ORDERS_EMAIL: 'orders@example.test', SUPPORT_EMAIL: 'support@example.test',
      SMTP_INFO_USER: 'info@example.test', SMTP_INFO_PASS: Buffer.from(randomBytes(20)).toString('hex'),
      SMTP_ORDERS_USER: 'orders@example.test', SMTP_ORDERS_PASS: Buffer.from(randomBytes(20)).toString('hex'),
      SMTP_SUPPORT_USER: 'support@example.test', SMTP_SUPPORT_PASS: Buffer.from(randomBytes(20)).toString('hex')});
    db = (await import('../lib/db')).db;
    const database = db;
    const {submitOrder} = await import('../lib/orders');
    const {completeStoreOpening} = await import('../lib/open-store');
    const {readStoreReadiness} = await import('../lib/store-readiness');
    const owner = await database.user.create({data: {email: 'owner@example.test', name: 'Fixture owner', passwordHash: 'isolated-owner-hash', staff: {create: {role: 'OWNER'}}}});
    const product = await database.product.create({data: {id: 'fixture-product', sku: 'FIXTURE', slug: 'fixture-product', name: 'Isolated fixture product',
      description: 'This product exists only in an isolated test database.', shortDescription: 'Isolated fixture', priceCents: 10000, discountPercent: 15,
      status: 'ACTIVE', isDemo: false, stockStatus: 'Special Order', brand: 'Fixture', model: 'Fixture', material: 'Fixture', dimensions: 'Fixture', weight: '',
      shippingWeight: '', warranty: 'Fixture', deliveryType: 'Curbside Freight', deliveryWindow: 'Reviewed before payment', assembly: '', care: '',
      features: [], included: [], seoTitle: 'Fixture', seoDescription: 'Fixture',
      images: {create: Array.from({length: 4}, (_, i) => ({url: '/images/fixture-' + i + '.jpg', alt: 'Fixture view ' + i, position: i, isPrimary: i === 0}))},
      variants: {create: {sku: 'FIXTURE-STANDARD', name: 'Standard', color: 'Black', colorHex: '#000000', size: 'Standard', priceCents: 10000,
        inventory: {create: {quantity: 0, trackingEnabled: false}}}}}, include: {variants: true}});
    const cart = await database.cart.create({data: {tokenHash: Buffer.from(randomBytes(32)).toString('hex'), items: {create: {variantId: product.variants[0].id, quantity: 2}}}});
    await database.siteSetting.createMany({data: [{key: 'launchApproved', value: 'false'}, {key: 'businessProfileVersion', value: 'internal-marker'}, {key: 'storeName', value: 'Home Retreat Direct'}]});
    await database.policy.create({data: {slug: 'terms', title: 'Terms', body: 'Unpublished initial content', version: 'business-1', published: false}});
    const payload = {email: 'customer@example.test', phone: '317-555-0100', shipping: {firstName: 'Fixture', lastName: 'Customer', line1: '123 Fixture Street',
      city: 'Indianapolis', state: 'IN', postalCode: '46204', country: 'US'}, acceptTerms: true, idempotencyKey: randomUUID()};
    await t.test('closed checkout writes no order, address or email', async () => {
      await assert.rejects(submitOrder(payload, cart.id), error => (error as {status: number}).status === 503);
      assert.equal(await database.order.count(), 0); assert.equal(await database.address.count(), 0); assert.equal(await database.emailLog.count(), 0);
    });
    await t.test('failed readiness rolls back publication and launch settings', async () => {
      process.env.EMAIL_DELIVERY_ENABLED = 'false';
      await assert.rejects(database.$transaction(tx => completeStoreOpening(tx)), /launch requirements/);
      assert.equal(await database.policy.count(), 1);
      assert.equal((await database.siteSetting.findUniqueOrThrow({where: {key: 'launchApproved'}})).value, 'false');
      process.env.EMAIL_DELIVERY_ENABLED = 'true';
    });
    await t.test('policies are published with actual contacts and optional physical details absent', async () => {
      const result = await database.$transaction(tx => completeStoreOpening(tx));
      assert.equal(result.acceptingOrders, true); assert.equal(result.publishedPolicies.length, 8);
      assert.equal((await readStoreReadiness(database)).acceptingOrders, true);
      assert.equal((await database.user.findUniqueOrThrow({where: {id: owner.id}})).passwordHash, 'isolated-owner-hash');
      assert.equal((await database.product.findUniqueOrThrow({where: {id: product.id}})).priceCents, 10000);
      assert.equal(await database.siteSetting.count({where: {key: {in: ['phone', 'address']}}}), 0);
    });
    await t.test('repeat setup preserves published staff changes', async () => {
      await database.policy.update({where: {slug: 'returns'}, data: {version: 'staff-edited', body: 'Staff-approved return conditions. '.repeat(10)}});
      const result = await database.$transaction(tx => completeStoreOpening(tx));
      assert(result.preservedPolicies.includes('returns'));
      assert.match((await database.policy.findUniqueOrThrow({where: {slug: 'returns'}})).body, /Staff-approved/);
    });
    await t.test('submission saves discounted prices, secure access and queued emails without payment', async () => {
      const first = await submitOrder(payload, cart.id), replay = await submitOrder(payload, cart.id);
      assert.equal(first.order.id, replay.order.id); assert.equal(first.accessToken, replay.accessToken);
      assert.equal(first.order.subtotalCents, 17000); assert.equal(first.order.totalCents, 17000);
      assert.equal(first.order.shippingCents, null); assert.equal(first.order.taxCents, null);
      assert.equal(await database.order.count(), 1); assert.equal(await database.payment.count(), 0);
      assert.equal(await database.cartItem.count({where: {cartId: cart.id}}), 0);
      const emails = await database.emailLog.findMany();
      assert(emails.some(email => email.template === 'ORDER_RECEIVED')); assert(emails.some(email => email.template === 'ORDER_STAFF_ALERT_SUBMITTED'));
      assert(emails.every(email => email.status === 'QUEUED' && !email.sentAt));
      assert.equal((await database.order.findUniqueOrThrow({where: {id: first.order.id}})).policyVersion, 'business-2026-10-10');
      await assert.rejects(submitOrder({...payload, email: 'other@example.test'}, cart.id), error => (error as {status: number}).status === 403);
    });
    await t.test('withdrawing a published policy blocks new requests despite the approval flag', async () => {
      await database.policy.update({where: {slug: 'privacy'}, data: {published: false}});
      const another = await database.cart.create({data: {tokenHash: Buffer.from(randomBytes(32)).toString('hex'), items: {create: {variantId: product.variants[0].id, quantity: 1}}}});
      await assert.rejects(submitOrder({...payload, idempotencyKey: randomUUID()}, another.id), error => (error as {status: number}).status === 503);
      assert.equal(await database.order.count(), 1);
    });
    await t.test('guided order actions queue invoice, instructions and receipt in the correct sequence', async () => {
      const {changeOrder} = await import('../lib/orders');
      const {readEmailContent} = await import('../lib/email');
      const {encrypt} = await import('../lib/security');
      const {prepareOrderTemplate} = await import('../lib/order-email');
      const staff = await database.staff.findUniqueOrThrow({where:{userId:owner.id}});
      let order = await database.order.findFirstOrThrow();
      await assert.rejects(database.$transaction(tx=>prepareOrderTemplate(tx,order.id,'INVOICE')),/after order approval/);
      await changeOrder(order.id,staff.id,{action:'approve',version:order.version,shippingCents:1000,taxCents:1200,inventoryConfirmed:true,customerConfirmed:true,deliveryConfirmed:true});
      order = await database.order.findUniqueOrThrow({where:{id:order.id}});
      const invoice = await database.emailLog.findFirstOrThrow({where:{orderId:order.id,template:'APPROVED'}});
      const invoiceContent = readEmailContent(invoice.bodyCipher);
      assert.equal(invoiceContent.attachments.length,1);assert.match(invoiceContent.attachments[0].filename,/-invoice.pdf$/);
      assert.match(invoiceContent.html,/Your invoice/);assert.match(invoiceContent.text,/Amount due: \$192\.00/);
      await assert.rejects(database.$transaction(tx=>prepareOrderTemplate(tx,order.id,'PAYMENT_RECEIPT')),/after payment/);
      const method = await database.businessPaymentMethod.create({data:{name:'Isolated test transfer',type:'BANK_TRANSFER',instructionsCipher:encrypt('Isolated test instructions. No real account or transfer exists.')}});
      await changeOrder(order.id,staff.id,{action:'request-payment',version:order.version,methodId:method.id});
      order = await database.order.findUniqueOrThrow({where:{id:order.id}});
      const instructions = await database.emailLog.findFirstOrThrow({where:{orderId:order.id,template:'PAYMENT_INSTRUCTIONS'}});
      assert.match(readEmailContent(instructions.bodyCipher).text,/Isolated test instructions/);
      assert.match(readEmailContent(instructions.bodyCipher).attachments[0].filename,/-invoice.pdf$/);
      const payment = await database.payment.findFirstOrThrow({where:{orderId:order.id}});
      await assert.rejects(changeOrder(order.id,staff.id,{action:'confirm-payment',version:order.version,paymentId:payment.id,amountReceivedCents:1,reference:'ISOLATED-REFERENCE',receiptConfirmed:true}),/match the approved order total/);
      assert.equal(await database.emailLog.count({where:{orderId:order.id,template:'PAYMENT_RECEIVED'}}),0);
      await changeOrder(order.id,staff.id,{action:'confirm-payment',version:order.version,paymentId:payment.id,amountReceivedCents:order.totalCents,reference:'ISOLATED-REFERENCE',receiptConfirmed:true});
      const receipt = await database.emailLog.findFirstOrThrow({where:{orderId:order.id,template:'PAYMENT_RECEIVED'}});
      const receiptContent = readEmailContent(receipt.bodyCipher);
      assert.match(receiptContent.attachments[0].filename,/-receipt.pdf$/);assert.match(receiptContent.html,/ISOLATED-REFERENCE/);
      assert.match(receiptContent.text,/Isolated test transfer/);assert.match(receiptContent.text,/Amount due: \$0\.00/);assert.match(receiptContent.text,/Payment received: \$192\.00/);
      assert.equal((await database.order.findUniqueOrThrow({where:{id:order.id}})).status,'PAYMENT_RECEIVED');
      assert.equal(receipt.status,'QUEUED');assert.equal(receipt.sentAt,null);
    });
  } finally {
    if (db) await db.$disconnect();
    if (socket) await socket.stop();
    await memory.close();
  }
});
