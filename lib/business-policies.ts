import {z} from 'zod';

const mailbox=z.string().trim().email().max(254).transform(value=>value.toLowerCase());
const publicPhone=z.string().trim().max(25).refine(value=>!value||/^[+()\d\s.-]{7,25}$/.test(value)&&value.replace(/\D/g,'').length>=7,'Enter a valid business phone number or leave it blank.');

/** Merchant choices adopted for the store; optional physical contacts remain absent until supplied. */
export const merchantPolicySchema=z.object({
 storeName:z.string().trim().min(2).max(120),
 generalEmail:mailbox,
 ordersEmail:mailbox,
 supportEmail:mailbox,
 phone:publicPhone.optional().default(''),
 address:z.string().trim().max(500).refine(value=>!value||value.length>=10,'Enter the complete business address or leave it blank.').optional().default(''),
 businessHours:z.string().trim().max(240).optional().default(''),
 shippingCountry:z.literal('US').default('US'),
 returnWindowDays:z.number().int().min(1).max(365).default(30),
 refundProcessingBusinessDays:z.number().int().min(1).max(30).default(10),
 restockingFeePercent:z.number().int().min(0).max(50).default(0),
 returnShippingPayer:z.enum(['customer','store']).default('customer'),
 returnExclusions:z.string().trim().max(3000).optional().default('Products that have been installed, assembled or used, and custom or made-to-order products.'),
}).strict();

export type MerchantPolicyTerms=z.infer<typeof merchantPolicySchema>;
export type BusinessPolicy={title:string;body:string;version:string};
export type PolicyPrivacyOptions={optionalAnalyticsConfigured?:boolean;advertisingConfigured?:boolean};
export const businessPolicyVersion='business-2026-10-10';

/** Plain paragraphs are rendered safely by the existing public policy page. */
export function buildBusinessPolicies(input:unknown,options:PolicyPrivacyOptions={}):Record<string,BusinessPolicy>{
 const terms=merchantPolicySchema.parse(input);
 const {storeName,generalEmail,ordersEmail,supportEmail}=terms;
 const returnShipping=terms.returnShippingPayer==='customer'
  ?'For a change-of-mind return, you pay the actual return shipping cost. We provide the return destination and shipping instructions with your authorization so you can review the cost before sending the product.'
  :'For an eligible change-of-mind return, we cover the authorized return shipping service. Contact us for a return label or collection instructions before arranging your own shipment.';
 const restocking=terms.restockingFeePercent===0
  ?'We do not charge a restocking fee for an eligible change-of-mind return received in the required condition.'
  :`An eligible change-of-mind return has a restocking fee of ${terms.restockingFeePercent}% of the returned item's purchase price. This fee does not apply to an incorrect, damaged or defective item for which we are responsible.`;
 const exclusions=terms.returnExclusions
  ?`The following are excluded from change-of-mind returns: ${terms.returnExclusions} These exclusions do not limit remedies for damage, defects or incorrect items, or rights provided by applicable law.`
  :'There are no additional product-category exclusions from our standard change-of-mind return policy. Remedies for damage, defects or incorrect items and rights provided by applicable law are unaffected.';
 const optionalTools=options.optionalAnalyticsConfigured||options.advertisingConfigured
  ?`Optional ${options.advertisingConfigured?'analytics and advertising':'analytics'} tools are configured on this website. They load after you allow optional analytics through the footer preference control. These tools may process browsing events, product interactions and device or browser information. You can change your choice in the footer. ${options.advertisingConfigured?'Advertising providers may use this information under their own privacy terms for measurement or advertising purposes.':''}`.trim()
  :'Optional analytics and advertising scripts are not configured. If we add them, the website will request your permission through the footer preference control before loading them.';
 const contactDetails=[`General enquiries, suppliers, partnerships and business communication: ${generalEmail}.`,`New orders, confirmations, invoices and payment questions: ${ordersEmail}.`,`Customer questions, delivery issues, cancellations, returns, refunds and privacy requests: ${supportEmail}.`,terms.phone?`Business telephone: ${terms.phone}.`:'',terms.address?`Business address: ${terms.address}.`:'',terms.businessHours?`Business hours: ${terms.businessHours}.`:''].filter(Boolean);
 const bodies:Record<string,{title:string;paragraphs:string[]}>= {
  delivery:{title:'Shipping & delivery',paragraphs:[
   `${storeName} accepts delivery requests for United States addresses. Product availability and delivery eligibility are checked for each address before payment is requested. An order request is not a guarantee of stock, shipping coverage or a delivery date.`,
   'Shipping charges depend on the product, shipment size, address and property access. We confirm the offered delivery service, shipping charge, applicable taxes and expected dispatch and delivery window in your approved order and invoice before payment. We do not promise a universal shipping rate or free delivery. If you do not accept the final quote, you may cancel your unpaid request.',
   'Standard shipping delivers to the carrier’s normal delivery point. Curbside freight delivers to an accessible curbside location and does not include indoor placement, unpacking, installation or assembly. Threshold, room-of-choice, white-glove or other additional services are included only when expressly confirmed in your approved quote. Tell us about stairs, restricted access or other delivery requirements during order review.',
   'Measure doorways, stairs and the intended installation space before ordering. Follow the product’s assembly, foundation, ventilation, electrical and installation requirements. Installation work and permits are included only when expressly stated in the approved order.',
   'Once your shipment is arranged, we share the available carrier and tracking information through your order updates. Inspect the delivery when it arrives, keep photographs and packaging where practical, and note visible damage on the carrier receipt. Contact us promptly if an item is damaged, missing or incorrect; failure to note damage on a receipt does not remove rights provided by law.',
   'If we cannot ship within the agreed time, we will notify you, explain the revised shipping date when known, and give you the choice to accept the delay or cancel the unshipped merchandise for a refund. If we cannot fulfill an order, we cancel it and refund the amount paid for the unfulfilled merchandise and applicable delivery charges. Required refunds are handled within the deadline that applies to your payment method and law.',
   `For delivery eligibility, shipping updates or damage assistance, contact ${supportEmail} with your order number.`,
  ]},
  returns:{title:'Returns & refunds',paragraphs:[
   `Request a change-of-mind return within ${terms.returnWindowDays} days of delivery by emailing ${supportEmail} with your order number, the item and the reason for your request. Eligible products must be unused, uninstalled and complete, with their original packaging, components and accessories. Obtain return authorization and the confirmed return address before sending anything back. Do not send products to a business or supplier address without authorization.`,
   exclusions,
   returnShipping,
   `${restocking} Original delivery or installation services already completed are not refundable for a change-of-mind return, except where applicable law requires otherwise. We confirm any applicable return costs before you arrange an authorized return.`,
   `Contact ${supportEmail} promptly about damaged, defective or incorrect merchandise and include photographs when available. We will review the issue and arrange the appropriate repair, replacement, return or refund. When a return is needed for an issue for which we are responsible, we arrange or cover the authorized return shipping. Change-of-mind fees and exclusions do not reduce these remedies or applicable consumer rights.`,
   `After an authorized change-of-mind return is received and inspected, we process an eligible refund to the original payment method within ${terms.refundProcessingBusinessDays} business days. Your payment provider may take additional time to display the credit. A shorter legal deadline takes priority, including refunds required when an order is cancelled because we cannot ship it as promised.`,
   `You may cancel an unpaid order request by contacting ${ordersEmail}; no payment refund is needed. For a paid order, contact ${supportEmail} before shipment or custom work begins. We confirm whether cancellation is possible and any previously agreed custom-work conditions; statutory cancellation and refund rights remain unaffected.`,
  ]},
  privacy:{title:'Privacy policy',paragraphs:[
   `${storeName} uses information you provide to manage accounts, review and fulfill orders, answer enquiries, deliver order emails and maintain customer reviews. This can include your name, email address, telephone number, delivery and billing addresses, order items, payment confirmation references, correspondence, and reviews or photos you submit. We also store newsletter subscriptions when you choose to subscribe.`,
   'Your account wishlist is saved with your account. Product comparisons are held in your browser while you use the website. Essential cookies maintain your sign-in session and shopping bag: the sign-in cookie lasts up to seven days and the shopping-bag cookie up to 30 days. An optional-analytics preference cookie, when used, lasts up to one year. You can clear cookies using your browser controls; doing so may sign you out or remove access to your saved shopping bag.',
   'Passwords are stored as hashes, and account access uses session cookies. The checkout form does not collect card numbers or bank login credentials. Any payment is handled through the approved business payment channel supplied with your reviewed order. We keep payment status, amounts and references needed to confirm payments and produce invoices or receipts.',
   'We use relevant service providers for hosting, database and image storage, email delivery, payment handling and shipping. These providers receive information needed to perform their services. Authorized staff can access account, order and support records according to their work responsibilities. We may also disclose information when required by law or needed to protect customers and the business.',
   optionalTools,
   'Operational records of order submissions, approvals and confirmed payments help us administer the business. These records are separate from optional third-party browser analytics. Newsletter subscriptions are optional; to stop receiving newsletter emails, contact the support address below. Order and service messages needed to manage an order may still be sent.',
   'We keep information as needed to complete orders and support requests, maintain business and payment records, prevent misuse and meet applicable legal obligations. Retention depends on the record and relevant legal requirements. Product reviews, review display names and submitted review photos can become public after moderation. Review email addresses and private order details are not shown with public reviews. Avoid including private contact or payment information in review text or photos.',
   `For privacy questions or requests to access, correct or delete your personal information, email ${supportEmail}. We may ask for enough information to verify your identity, and may retain records needed for legal obligations or unresolved transactions. Rights and exceptions depend on the law applicable to you. Do not include passwords, card numbers or bank credentials in your request.`,
   'This website is intended for adults. If you believe a child has supplied personal information, contact us so we can review and address it. We update this policy when our processing practices change. The version of the terms accepted during order submission is recorded with the order.',
  ]},
  terms:{title:'Terms of service',paragraphs:[
   `${storeName} offers products for home comfort, outdoor living and personal wellness. Prices are shown in US dollars. The selected model or finish determines the item price, including any active product discount. Shipping charges and applicable taxes are confirmed separately before payment.`,
   'Submitting an order requests a review of product availability, delivery eligibility and the final amount. No payment is collected at submission. We confirm the exact items, delivery service and total before sending an invoice and approved payment instructions. Pay only through the business payment channel supplied with your approved order. An order submission or invoice alone is not a payment receipt.',
   'Special-order products are sourced for your approved order. Do not schedule installation until the delivery arrangements are confirmed. Use the product listing and the approved order to review dimensions, installation requirements and included components. Decorative items in styled photographs are excluded unless expressly listed. Photograph appearance may vary with lighting and display settings.',
   `You may cancel an unpaid request. Paid-order cancellations, return eligibility, return costs and refund processing are described in our Returns & refunds policy. Our standard change-of-mind request window is ${terms.returnWindowDays} days from delivery. Statutory rights and remedies for damaged, defective or incorrect merchandise are unaffected.`,
   'Products must be installed, operated and maintained according to their instructions. Electrical, gas, structural or foundation work may require qualified professionals and local permits. Services such as assembly or installation are included only when expressly stated in the approved quote.',
   'If a product, price or availability error affects your request, we explain the correction before payment and allow you to accept it or cancel. If we cannot fulfill a paid order, we notify you and arrange the appropriate refund. These terms apply alongside the published shipping, returns, privacy and warranty information.',
   `For order and invoice questions, contact ${ordersEmail}. For customer support or concerns about these terms, contact ${supportEmail}.`,
  ]},
  warranty:{title:'Warranty information',paragraphs:[
   'Warranty coverage is specific to the product and manufacturer. Where a manufacturer provides a warranty, its written terms determine the coverage period, exclusions, registration requirements and claim process. A product listing does not extend a manufacturer’s warranty or imply that the store is an authorized dealer for that manufacturer.',
   'Keep your order receipt, model and serial information, installation records and photographs relevant to a claim. Follow assembly, installation, electrical and care instructions. Normal wear, misuse, unauthorized modifications and improper installation or maintenance may fall outside the manufacturer’s coverage.',
   `Contact ${supportEmail} with your order number, product identification and a description of the issue to begin a support request. We help review the available warranty information and the appropriate claim route. Warranty terms do not remove statutory rights or the store’s responsibility for damaged, defective or incorrect merchandise.`,
  ]},
  contact:{title:'Contact us',paragraphs:[
   `Contact ${storeName} for product questions, order assistance and business enquiries.`,
   ...contactDetails,
   'Choose the relevant topic in the contact form so your message reaches the appropriate team. Include your order number when asking about an existing order. You can also use Track Your Order with the order number and email address, or open the secure link in your order confirmation.',
   'Do not send passwords, payment card numbers or bank login details. For a return, obtain authorization and the confirmed return address before shipping merchandise.',
  ]},
  'payment-process':{title:'Our order & payment process',paragraphs:[
   'Choose your products and submit an order for review. Our order team confirms availability, delivery eligibility, shipping charges, applicable taxes and the final amount before sending an invoice and approved business payment instructions. No payment is collected when you submit an order.',
   'Your invoice records the approved amount due; an invoice is not proof that payment has been received. Use only the approved business payment channel supplied for your order. Do not send account login credentials or payment card details through the contact form.',
   'Authorized staff verify actual receipt of funds before marking an order paid and issuing a payment receipt. Invoices and receipts can be emailed to the customer address supplied for the order. We arrange fulfillment and share shipping updates after the necessary order and payment checks.',
   `Keep your order number and use the secure link in your order emails to follow progress. For order, invoice or payment questions, contact ${ordersEmail}. For delivery issues, cancellations, returns or refunds, contact ${supportEmail}.`,
  ]},
  faqs:{title:'Frequently asked questions',paragraphs:[
   'When do I pay?\nNo payment is collected when you submit an order. We first confirm product availability, delivery eligibility and the final amount, then send an invoice and approved business payment instructions.',
   'Can I order without an account?\nYes. Guest orders are supported. Keep your order number and secure confirmation link to follow progress.',
   'Where do you ship?\nWe review delivery requests for United States addresses. Product availability, delivery service, charges and timing are confirmed for your address before payment.',
   'What does Special Order mean?\nThe selected item is sourced for your approved order. Availability and the expected shipping window are confirmed before payment.',
   'How do discounts work?\nAn active product discount is included in the displayed item price and your shopping bag. Shipping and applicable taxes are confirmed separately.',
   'How does freight delivery work?\nCurbside freight delivers to an accessible curbside location. Indoor placement, assembly or other extra services are included only when expressly confirmed in your approved quote.',
   `Can I return a product?\nRequest an eligible change-of-mind return within ${terms.returnWindowDays} days of delivery. Authorization, condition requirements, shipping costs, exclusions and refund processing are explained in Returns & refunds. Separate remedies apply to damaged, defective or incorrect merchandise.`,
   'Can I compare products or save favorites?\nSelect Compare on two to four products to view their specifications together. Sign in to save products to your account wishlist.',
   `How do I get help?\nEmail ${supportEmail} for customer support or ${ordersEmail} for order and invoice questions. Include your order number when relevant.`,
  ]},
 };
 return Object.fromEntries(Object.entries(bodies).map(([slug,policy])=>[slug,{title:policy.title,body:policy.paragraphs.join('\n\n'),version:businessPolicyVersion}]));
}
