import type {Prisma} from '@/generated/prisma/client';
import {businessEmails, businessProfile} from './business-profile';
import {buildBusinessPolicies, businessPolicyVersion} from './business-policies';
import {readStoreReadiness} from './store-readiness';

type StoreDatabase = Pick<Prisma.TransactionClient, 'staff' | 'siteSetting' | 'policy' | 'product' | 'adminAuditLog'>;

/** Applies the owner-adopted store rules while retaining staff-authored published pages. */
export async function completeStoreOpening(database: StoreDatabase) {
  const owner = await database.staff.findFirst({where: {role: 'OWNER', active: true}, orderBy: {id: 'asc'}});
  if (!owner) throw new Error('An initialized active owner is required.');
  const settings = Object.fromEntries((await database.siteSetting.findMany()).map(setting => [setting.key, setting.value]));
  // Public Contact renders these optional details directly from SiteSetting.
  // Do not bake them into policy text that could become stale after staff edits.
  const policies = buildBusinessPolicies({storeName: settings.storeName || businessProfile.name, ...businessEmails(settings)},
  {optionalAnalyticsConfigured: !!settings.analyticsId, advertisingConfigured: !!(settings.metaPixelId || settings.googleAdsId)});
  const previous = await database.policy.findMany({where: {slug: {in: Object.keys(policies)}}});
  const published: string[] = [], preserved: string[] = [];
  for (const [slug, policy] of Object.entries(policies)) {
    const existing = previous.find(item => item.slug === slug);
    // The initializer's business-1 and retail-1 versions are generated defaults.
    // A published custom version belongs to staff and must not be overwritten.
    if (existing?.published && existing.version !== 'business-1' && existing.version !== 'retail-1') {
      preserved.push(slug); continue;
    }
    await database.policy.upsert({where: {slug}, create: {slug, ...policy, published: true},
      update: {...policy, published: true}});
    published.push(slug);
  }
  for (const [key, value] of Object.entries(businessEmails(settings))) {
    await database.siteSetting.upsert({where: {key}, create: {key, value}, update: {value}});
  }
  const readiness = await readStoreReadiness(database, {launchApproved: 'true'});
  if (!readiness.ready) throw new Error('Complete the launch requirements: ' + readiness.checks.filter(check => !check.ready).map(check => check.label).join(', ') + '.');
  await database.siteSetting.upsert({where: {key: 'launchApproved'}, create: {key: 'launchApproved', value: 'true'}, update: {value: 'true'}});
  await database.siteSetting.upsert({where: {key: 'publishedBusinessPoliciesVersion'},
    create: {key: 'publishedBusinessPoliciesVersion', value: businessPolicyVersion}, update: {value: businessPolicyVersion}});
  await database.adminAuditLog.create({data: {staffId: owner.id, action: 'PUBLISH_POLICIES_AND_OPEN_STORE',
    entityType: 'SiteSetting', entityId: 'store', detail: 'Owner-authorized server update; published: ' + published.join(', ') + '; retained staff pages: ' + preserved.join(', ')}});
  return {ok: true, acceptingOrders: true, publishedPolicies: published, preservedPolicies: preserved};
}
