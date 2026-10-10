import type {Prisma} from '@/generated/prisma/client';
import {businessEmails} from './business-profile';
import {emailConfiguration} from './email-routing';
import {buildLaunchReadiness, requiredPublicPolicies} from './launch-readiness';

type StoreDatabase = Pick<Prisma.TransactionClient, 'siteSetting' | 'policy' | 'product'>;
export async function readStoreReadiness(database: StoreDatabase, overrides: Record<string, string> = {}) {
  const [stored, policies, activeProducts, demoProducts] = await Promise.all([
    database.siteSetting.findMany(),
    database.policy.findMany({where: {slug: {in: requiredPublicPolicies.map(([slug]) => slug)}},
      select: {slug: true, title: true, body: true, published: true}}),
    database.product.count({where: {status: 'ACTIVE'}}),
    database.product.count({where: {status: 'ACTIVE', isDemo: true}}),
  ]);
  const settings = {...Object.fromEntries(stored.map(setting => [setting.key, setting.value])), ...overrides};
  return buildLaunchReadiness({settings, contacts: businessEmails(settings), policies, activeProducts, demoProducts,
    email: emailConfiguration(), production: process.env.DEVELOPMENT_CATALOG === 'false'
      && process.env.SITES_RUNTIME === 'false' && /^https:\/\//.test(process.env.APP_ORIGIN ?? '')});
}
