import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {hash} from 'bcryptjs';
import {categories} from '../lib/catalog';
import {sourcedGalleries} from '../lib/gallery-provenance';
import {rolePermissions} from '../lib/workflow';
import {businessProfile, businessEmails} from '../lib/business-profile';
import content from '../data/retail-content.json';

/** Validate the deployable catalog without reading or changing a database. */
function checkCatalog() {
  if (sourcedGalleries.length !== 250) throw new Error('Expected the complete 250-product catalog.');
  const ids = new Set<string>(), slugs = new Set<string>(), hashes = new Set<string>();
  for (const entry of sourcedGalleries) {
    if (ids.has(entry.id) || slugs.has(entry.slug)) throw new Error('Duplicate product identity in the catalog.');
    ids.add(entry.id); slugs.add(entry.slug);
    if (!categories.some(category => category.slug === entry.category)) throw new Error('Unknown catalog category.');
    if (!Number.isSafeInteger(entry.priceCents) || entry.priceCents! < 1 || entry.images.length < 4) throw new Error('Every product requires a valid price and four images.');
    if (!Number.isInteger(entry.discountPercent ?? 0) || (entry.discountPercent ?? 0) < 0 || (entry.discountPercent ?? 0) > 90) throw new Error('Invalid catalog discount.');
    for (const image of entry.images) {
      const file = path.resolve('public', '.' + image.url);
      if (!file.startsWith(path.resolve('public') + path.sep) || !fs.existsSync(file)) throw new Error('A catalog image is missing.');
      const checksum = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (checksum !== image.sha256 || hashes.has(checksum)) throw new Error('A catalog image is damaged or repeated.');
      hashes.add(checksum);
    }
    for (const variant of entry.variants ?? []) if (!Number.isSafeInteger(variant.priceCents) || variant.priceCents < 1) throw new Error('Invalid finish price.');
  }
  return {products: ids.size, images: hashes.size, categories: categories.length};
}

async function main() {
  const totals = checkCatalog();
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ok: true, databaseTouched: false, ...totals}));
    return;
  }
  if (process.env.INIT_PRODUCTION_CONFIRMED !== businessProfile.domain) throw new Error('Set INIT_PRODUCTION_CONFIRMED to the store domain for a fresh production database.');
  if (process.env.DEVELOPMENT_CATALOG !== 'false') throw new Error('Production initialization requires DEVELOPMENT_CATALOG=false.');
  if (new URL(process.env.APP_ORIGIN ?? '').origin !== businessProfile.origin) throw new Error('Set APP_ORIGIN to the final HTTPS store domain.');
  if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY ?? '')) throw new Error('Supply a persistent 32-byte ENCRYPTION_KEY before initialization.');
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase(), password = process.env.SEED_OWNER_PASSWORD;
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || !password || password.length < 16) throw new Error('Supply an owner email and a unique password of at least 16 characters.');
  const passwordHash = await hash(password, 12);
  // Import only after the --check path: validation never opens a connection.
  const {db} = await import('../lib/db');
  try {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(842036201)`;
      const counts = await Promise.all([
        tx.product.count(), tx.user.count(), tx.order.count(), tx.category.count(),
        tx.policy.count(), tx.siteSetting.count(), tx.businessPaymentMethod.count(), tx.review.count(),
      ]);
      if (counts.some(count => count > 0)) throw new Error('Refusing initialization: this database already contains store records. Restore or migrate it instead; no records were changed.');
      for (const category of categories) {
        const first = sourcedGalleries.find(product => product.category === category.slug)!;
        await tx.category.create({data: {id: category.slug, slug: category.slug, name: category.name, group: category.group, description: category.intro, image: first.images[0].url}});
      }
      for (const [id, name] of [['outdoor-living', 'Outdoor Living'], ['home-comfort', 'Home Comfort'], ['wellness', 'Wellness']]) await tx.collection.create({data: {id, slug: id, name, description: 'Considered pieces for your home.'}});
      for (const entry of sourcedGalleries) {
        const position = sourcedGalleries.filter(product => product.category === entry.category).findIndex(product => product.id === entry.id);
        const sku = entry.sku ?? 'HRD-' + entry.asin;
        const collectionIds = entry.category === 'saunas' ? ['wellness'] : entry.category === 'massage-chairs' ? ['wellness', 'home-comfort'] : ['gazebos', 'patio-furniture', 'fire-pits'].includes(entry.category) ? ['outdoor-living'] : ['home-comfort'];
        await tx.product.create({data: {
          id: entry.id, sku, slug: entry.slug, name: entry.name, brand: entry.brand, model: entry.model,
          description: entry.description, shortDescription: entry.description.slice(0, 500),
          priceCents: entry.priceCents!, discountPercent: entry.discountPercent ?? 0,
          status: 'ACTIVE', isDemo: false, featured: position < 2, bestSeller: position < 2, newArrival: position < 3,
          stockStatus: entry.stockStatus ?? 'Special Order', material: entry.material, dimensions: entry.dimensions, weight: entry.weight,
          shippingWeight: entry.shippingWeight ?? '',
          warranty: entry.warranty ?? 'Manufacturer warranty terms apply where provided. Coverage excludes normal wear, misuse and improper installation.',
          deliveryType: entry.deliveryType ?? 'Curbside Freight', deliveryWindow: entry.deliveryWindow ?? 'Delivery timing and charges are confirmed with your order before payment.',
          assembly: entry.assembly ?? 'Follow the supplied installation instructions.', care: entry.care ?? 'Follow the product care instructions and avoid abrasive cleaners.',
          features: entry.features, included: entry.included, seoTitle: entry.name, seoDescription: entry.description.slice(0, 300),
          categories: {create: {categoryId: entry.category}}, collections: {create: collectionIds.map(collectionId => ({collectionId}))},
          specifications: {create: entry.specifications.map((specification, specPosition) => ({...specification, position: specPosition}))},
        }});
        const variantSources = entry.variants?.length ? entry.variants : [{name: entry.color, color: entry.color, colorHex: entry.colorHex, priceCents: entry.priceCents!, sku: sku + '-STANDARD'}];
        const variantIds = new Map<string, string>();
        for (const variant of variantSources) {
          const saved = await tx.productVariant.create({data: {productId: entry.id, sku: variant.sku || sku + '-' + variant.color.toUpperCase().replace(/[^A-Z0-9]+/g, '-'), name: variant.name, color: variant.color, colorHex: variant.colorHex, size: entry.model, priceCents: variant.priceCents, active: true, inventory: {create: {quantity: 0, trackingEnabled: false}}}});
          variantIds.set(variant.color, saved.id);
        }
        for (const [imagePosition, image] of entry.images.entries()) await tx.productImage.create({data: {productId: entry.id, url: image.url, alt: image.alt, kind: image.kind ?? 'PRODUCT', position: imagePosition, isPrimary: imagePosition === 0, variantId: image.color ? variantIds.get(image.color) : null}});
      }
      for (const [role, permissions] of Object.entries(rolePermissions)) {
        await tx.role.create({data: {id: role, name: role}});
        for (const permission of permissions) {
          await tx.permission.upsert({where: {id: permission}, create: {id: permission, description: permission}, update: {}});
          await tx.rolePermission.create({data: {roleId: role, permissionId: permission}});
        }
      }
      await tx.user.create({data: {email: ownerEmail, name: 'Store Owner', passwordHash, staff: {create: {role: 'OWNER'}}}});
      const titles: Record<string, string> = {about: 'Our story', 'payment-process': 'Our order & payment process', delivery: 'Shipping & delivery', warranty: 'Warranty information', returns: 'Returns & refunds', privacy: 'Privacy policy', terms: 'Terms of service', accessibility: 'Accessibility', faqs: 'Frequently asked questions', contact: 'Contact us'};
      const emails = businessEmails();
      const policyContent: Record<string, string> = {...content,
        'payment-process': 'Choose your products and submit an order for review. Our order team confirms availability, delivery eligibility, shipping charges, applicable taxes and the final amount before sending an invoice and approved payment instructions. No payment is collected when you submit an order.\n\nPayment receipts are issued after authorized staff confirm funds received. Keep your order number and use the secure link in your order emails to follow progress. Only use payment instructions supplied through your approved order communication.\n\nFor order and invoice questions, contact ' + emails.ordersEmail + '.',
        contact: 'For general enquiries, supplies, partnerships and business communication, email ' + emails.generalEmail + '.\n\nFor new orders, order confirmation, invoices and payment requests, email ' + emails.ordersEmail + '.\n\nFor customer questions, delivery issues, cancellations and refunds, email ' + emails.supportEmail + '.\n\nInclude your order number when contacting us about an existing order. Do not send passwords, card numbers or bank login details.',
      };
      for (const [slug, body] of Object.entries(policyContent)) await tx.policy.create({data: {slug, title: titles[slug] ?? slug, body, version: 'business-1', published: ['about', 'payment-process', 'faqs', 'accessibility', 'contact'].includes(slug)}});
      const settings = {storeName: businessProfile.name, ...emails, announcement: 'Considered design. Everyday retreat.', phone: '', address: '', businessHours: '', launchApproved: 'false', currency: 'USD'};
      for (const [key, value] of Object.entries(settings)) await tx.siteSetting.create({data: {key, value}});
    }, {timeout: 180000});
    console.log(JSON.stringify({ok: true, initialized: true, ...totals, fabricatedReviews: 0, launchApproved: false}));
  } finally { await db.$disconnect(); }
}

main().catch(error => {
 const safe=error instanceof Error&&/^(Expected|Duplicate|Unknown catalog|Every product|Invalid catalog|Invalid finish|A catalog image|Set INIT_PRODUCTION|Production initialization requires|Set APP_ORIGIN|Supply|Refusing initialization)/.test(error.message);
 console.error(safe?error.message:'Production initialization failed. Check the private server configuration and catalog files.');process.exitCode=1;
});
