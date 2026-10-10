import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBusinessPolicies,merchantPolicySchema,businessPolicyVersion} from '../lib/business-policies';

const merchant={storeName:'Home Retreat Direct',generalEmail:'info@homeretreatdirect.com',ordersEmail:'orders@homeretreatdirect.com',supportEmail:'support@homeretreatdirect.com'};

test('adopted merchant rules require real email contacts and omit unknown physical details',()=>{
 const values=merchantPolicySchema.parse(merchant),policies=buildBusinessPolicies(values);
 assert.equal(values.returnWindowDays,30);assert.equal(values.refundProcessingBusinessDays,10);assert.equal(values.restockingFeePercent,0);assert.equal(values.returnShippingPayer,'customer');assert.equal(values.shippingCountry,'US');
 assert.equal(values.address,'');assert.equal(values.phone,'');
 assert(!policies.contact.body.includes('Business address:'));assert(!policies.contact.body.includes('Business telephone:'));assert(!policies.contact.body.includes('Business hours:'));
 for(const slug of ['delivery','returns','privacy','terms','warranty','contact','payment-process','faqs']){assert(policies[slug].body.length>100);assert.equal(policies[slug].version,businessPolicyVersion);}
 assert.throws(()=>merchantPolicySchema.parse({...merchant,supportEmail:''}));
 assert.throws(()=>merchantPolicySchema.parse({...merchant,shippingCountry:'CA'}));
 assert.throws(()=>merchantPolicySchema.parse({...merchant,address:'Fake'}));
 assert.throws(()=>merchantPolicySchema.parse({...merchant,phone:'-------'}));
});

test('return choices remain consistent across terms and customer answers without weakening statutory remedies',()=>{
 const policies=buildBusinessPolicies({...merchant,returnWindowDays:45,refundProcessingBusinessDays:6,restockingFeePercent:12,returnShippingPayer:'store',returnExclusions:'Custom engraved products.'});
 assert.match(policies.returns.body,/within 45 days of delivery/);assert.match(policies.terms.body,/45 days from delivery/);assert.match(policies.faqs.body,/within 45 days of delivery/);
 assert.match(policies.returns.body,/within 6 business days/);assert.match(policies.returns.body,/12% of the returned item's purchase price/);assert.match(policies.returns.body,/we cover the authorized return shipping service/);assert.match(policies.returns.body,/Custom engraved products/);
 assert.match(policies.returns.body,/A shorter legal deadline takes priority/);assert.match(policies.returns.body,/do not limit remedies for damage, defects or incorrect items/);
 for(const bad of [{returnWindowDays:0},{returnWindowDays:366},{refundProcessingBusinessDays:31},{restockingFeePercent:51},{returnShippingPayer:'unknown'}])assert.throws(()=>merchantPolicySchema.parse({...merchant,...bad}));
});

test('privacy describes actual cookies and opt-in tools without an unsupported no-sharing promise',()=>{
 const disabled=buildBusinessPolicies(merchant),analytics=buildBusinessPolicies(merchant,{optionalAnalyticsConfigured:true}),ads=buildBusinessPolicies(merchant,{advertisingConfigured:true});
 assert.match(disabled.privacy.body,/not configured/);assert.match(disabled.privacy.body,/up to seven days/);assert.match(disabled.privacy.body,/up to 30 days/);assert.match(disabled.privacy.body,/up to one year/);assert.match(disabled.privacy.body,/wishlist is saved with your account/);assert.match(disabled.privacy.body,/Product comparisons are held in your browser/);
 assert.match(analytics.privacy.body,/They load after you allow optional analytics/);assert.match(ads.privacy.body,/Advertising providers may use/);
 for(const policies of [disabled,analytics,ads]){assert(!policies.privacy.body.includes('We do not sell'));assert.match(policies.privacy.body,/Review email addresses and private order details are not shown/);assert.match(policies.privacy.body,/newsletter emails, contact/);}
});

test('published contact details and checkout facts are accurate when optional business facts are supplied',()=>{
 const policies=buildBusinessPolicies({...merchant,phone:'+1 212 555 0100',address:'123 Example Street, Example City, NY 10001',businessHours:'Monday–Friday, 9am–5pm Eastern'});
 assert.match(policies.contact.body,/Business telephone: \+1 212 555 0100/);assert.match(policies.contact.body,/Business address: 123 Example Street/);assert.match(policies.contact.body,/Business hours: Monday–Friday/);
 assert.match(policies.delivery.body,/United States addresses/);assert.match(policies.delivery.body,/do not promise a universal shipping rate or free delivery/);assert.match(policies['payment-process'].body,/an invoice is not proof that payment has been received/);
 for(const policy of Object.values(policies))assert(!/draft policy|sample catalog|development order|placeholder|legal review required/i.test(policy.body));
});
