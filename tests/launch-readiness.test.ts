import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLaunchReadiness, requiredPublicPolicies} from '../lib/launch-readiness';

function fixture() {
  const contacts = {generalEmail: 'info@example.test', ordersEmail: 'orders@example.test', supportEmail: 'support@example.test'};
  return {settings: {launchApproved: 'true'}, contacts,
    policies: requiredPublicPolicies.map(([slug, title]) => ({slug, title, published: true, body: 'Approved policy content. '.repeat(10)})),
    activeProducts: 250, demoProducts: 0, production: true,
    email: {configured: true, missing: [] as string[], channels: {info: {replyTo: contacts.generalEmail}, orders: {replyTo: contacts.ordersEmail}, support: {replyTo: contacts.supportEmail}}}};
}
test('published email contacts permit reviewed orders with no invented phone or address', () => {
  const readiness = buildLaunchReadiness(fixture());
  assert.equal(readiness.ready, true); assert.equal(readiness.acceptingOrders, true);
  assert.equal(buildLaunchReadiness({...fixture(), settings: {launchApproved: 'false'}}).acceptingOrders, false);
});
test('publication, email and inventory regressions block orders despite previous approval', () => {
  for (const slug of requiredPublicPolicies.map(([slug]) => slug)) {
    const input = fixture(); input.policies.find(policy => policy.slug === slug)!.published = false;
    assert.equal(buildLaunchReadiness(input).acceptingOrders, false);
  }
  for (const change of [{activeProducts: 0}, {demoProducts: 1}, {production: false},
    {email: {...fixture().email, configured: false, missing: ['SMTP_HOST']}},
    {contacts: {...fixture().contacts, generalEmail: 'broken'}},
    {contacts: {...fixture().contacts, ordersEmail: 'other@example.test'}}]) {
    assert.equal(buildLaunchReadiness({...fixture(), ...change}).acceptingOrders, false);
  }
  const input = fixture(); input.policies[0].body = '   ';
  assert.equal(buildLaunchReadiness(input).acceptingOrders, false);
});
