export const requiredPublicPolicies = [
  ['delivery', 'Shipping and delivery'], ['returns', 'Returns and refunds'],
  ['privacy', 'Privacy'], ['terms', 'Terms of service'], ['warranty', 'Warranty'],
  ['contact', 'Contact information'], ['payment-process', 'Order and payment process'],
] as const;

export type LaunchCheck = {key: string; label: string; ready: boolean; href: string; detail: string};
export type LaunchReadiness = {ready: boolean; approved: boolean; acceptingOrders: boolean; checks: LaunchCheck[]};
type Input = {
  settings: Record<string, string>;
  contacts: {generalEmail: string; ordersEmail: string; supportEmail: string};
  policies: {slug: string; title: string; body: string; published: boolean}[];
  activeProducts: number; demoProducts: number;
  email: {configured: boolean; missing: string[]; channels: Record<string, {replyTo: string}>};
  production: boolean;
};

/** Shared by owner approval, the checkout page and the order transaction. */
export function buildLaunchReadiness(input: Input): LaunchReadiness {
  const checks: LaunchCheck[] = requiredPublicPolicies.map(([slug, label]) => {
    const policy = input.policies.find(item => item.slug === slug);
    const ready = !!policy?.published && !!policy.title.trim() && policy.body.trim().length >= 80;
    return {key: 'policy:' + slug, label: label + ' published', ready, href: '/admin/policies',
      detail: ready ? 'Available to customers and search engines.' : 'Publish the complete approved page in Policies & information.'};
  });
  const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const contactsReady = Object.values(input.contacts).every(validEmail);
  checks.push({key: 'contacts', label: 'Public business email addresses', ready: contactsReady,
    href: '/admin/settings?tab=business', detail: contactsReady
      ? 'General enquiries, orders and support have published email contacts. Phone and address remain editable.'
      : 'Supply valid general, orders and support email addresses.'});
  const aligned = input.email.channels.info?.replyTo === input.contacts.generalEmail
    && input.email.channels.orders?.replyTo === input.contacts.ordersEmail
    && input.email.channels.support?.replyTo === input.contacts.supportEmail;
  checks.push({key: 'email', label: 'Business email configuration', ready: input.email.configured && aligned,
    href: '/admin/settings?tab=services', detail: !input.email.configured
      ? 'Complete server email configuration: ' + input.email.missing.join(', ') + '.'
      : !aligned ? 'Align the server sender mailboxes with the public business email addresses.'
      : 'All three mailboxes are configured. Confirm delivery to your own inbox before requesting customer payment.'});
  checks.push({key: 'catalog', label: 'Public product catalog', ready: input.activeProducts > 0 && input.demoProducts === 0,
    href: '/admin/products', detail: input.demoProducts ? 'Remove demonstration products from public inventory.'
      : input.activeProducts ? input.activeProducts + ' active products available for order review.' : 'Publish at least one real product.'});
  checks.push({key: 'environment', label: 'Production environment', ready: input.production,
    href: '/admin/settings?tab=services', detail: input.production ? 'Production ordering is configured.'
      : 'Use the production HTTPS origin and disable development catalog/runtime flags.'});
  const ready = checks.every(check => check.ready), approved = input.settings.launchApproved === 'true';
  return {ready, approved, acceptingOrders: ready && approved, checks};
}
