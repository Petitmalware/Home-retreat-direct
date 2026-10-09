import {verifyPhoto} from '@/lib/media-upload';
import {db} from '@/lib/db';
import {csrf, failure, hash, limit, user, HttpError} from '@/lib/security';
import {reviewSchema} from '@/lib/validation';

export async function POST(req: Request) {
  try {
    csrf(req);
    const d = reviewSchema.parse(await req.json());
    const u = await user();
    if (u?.staff?.active) {
      throw new HttpError(403, 'Staff accounts cannot submit customer reviews. Use review moderation in the studio.');
    }
    await limit('review', d.email, 5);

    await db.$transaction(async tx => {
      let productId = d.productId;
      let orderItemId: string | undefined;

      if (d.token) {
        const t = await tx.reviewToken.findUnique({
          where: {tokenHash: hash(d.token)}, include: {order: true, orderItem: true},
        });
        if (!t || t.usedAt || t.expiresAt < new Date() || t.order.status !== 'DELIVERED' || t.order.email !== d.email) {
          throw new HttpError(400, 'This review link is invalid, expired, already used, or does not match the order email.');
        }
        productId = t.orderItem.productId;
        orderItemId = t.orderItemId;
        const claimed = await tx.reviewToken.updateMany({where: {id: t.id, usedAt: null}, data: {usedAt: new Date()}});
        if (!claimed.count) throw new HttpError(409, 'This review link was already used.');
      }

      // Serialize direct submissions for a product so retries cannot create two reviews.
      if (!d.token && productId) {
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
      }
      const product = productId ? await tx.product.findUnique({where: {id: productId}}) : null;
      if (!productId || !product || (!d.token && (product.status !== 'ACTIVE' || product.isDemo))) {
        throw new HttpError(404, 'Product not found.');
      }

      if (!orderItemId && d.orderNumber && u?.email === d.email) {
        const o = await tx.order.findFirst({
          where: {number: d.orderNumber, email: d.email, userId: u.id, status: 'DELIVERED'}, include: {items: true},
        });
        orderItemId = o?.items.find(i => i.productId === productId)?.id;
      }
      if (orderItemId && await tx.review.findUnique({where: {orderItemId}})) {
        throw new HttpError(409, 'This purchased item already has a submitted review.');
      }
      if (!orderItemId && await tx.review.findFirst({
        where: {productId, email: d.email, orderItemId: null, status: {in: ['PENDING', 'APPROVED', 'FLAGGED']}},
        select: {id: true},
      })) {
        throw new HttpError(409, 'You have already submitted a review for this product.');
      }
      const orderItem = orderItemId ? await tx.orderItem.findUnique({where: {id: orderItemId}, include: {order: true}}) : null;

      if (d.photos?.length && (!d.token || d.photos.some(p => !verifyPhoto(p.url, d.token!, p.grant)))) {
        throw new HttpError(400, 'Review photos must be uploaded using this purchased-item review link.');
      }
      await tx.review.create({data: {
        productId, orderItemId, userId: u?.email === d.email ? u.id : undefined,
        rating: d.rating, title: d.title, body: d.body, name: d.name, email: d.email,
        status: 'PENDING', verifiedPurchase: false, isDemo: product.isDemo || !!orderItem?.order.isDemo,
        images: {create: d.photos?.map(p => ({url: p.url, alt: 'Photo submitted by ' + d.name}))},
      }});
    });
    return Response.json({ok: true, message: 'Thank you. Your review is awaiting moderation. It is not public yet.'});
  } catch (e) {
    return failure(e);
  }
}

