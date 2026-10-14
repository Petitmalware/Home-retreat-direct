import Link from 'next/link';
import {can} from '@/lib/workflow';
import type {StaffRole} from '@/generated/prisma/client';

export function AdminHelp({role}:{role:StaffRole}){
 const tasks=[
  ['orders:read','/admin/orders','Handle an order','Open an order and follow the next step at the top.'],
  ['products','/admin/seasonal','Show or hide Christmas','Use the switch to change the whole seasonal collection immediately, or choose start and end dates.'],
  ['products','/admin/products','Change products, images or discounts','Open a product, make your changes and save.'],
  ['customers','/admin/messages','Answer a customer','Read website enquiries and reply from Customer messages.'],
  ['policies','/admin/business-contacts','Update your phone, address or opening hours','Save verified details to update the public contact page and new documents.'],
  ['policies','/admin/policies','Update shipping and return policies','Select a policy, edit it, and save it as published.'],
  ['settings','/admin/settings?tab=payments','Set up how customers pay','Save your actual business payment instructions before requesting payment.'],
 ];
 return <><div className="admin-heading"><div><p className="eyebrow">HELP WHEN YOU NEED IT</p><h1>How to run your store.</h1><p>Choose a task below. Each order tells you what to do next.</p></div></div>
  <div className="admin-task-grid">{tasks.filter(([permission])=>can(role,permission)).map(([,href,title,description])=><Link className="panel admin-task-card" key={href} href={href}><h2>{title}</h2><p>{description}</p><span className="text-link">Open this task →</span></Link>)}</div>
  {can(role,'orders:read')&&<section className="panel admin-help-section"><h2>Emails: what goes first?</h2><p>You usually do not need to send these yourself. The order buttons prepare the correct message and PDF automatically.</p><ol className="admin-help-steps">
   <li><strong>Customer places an order → Order confirmation</strong><p>Sent automatically. It confirms the request was received; payment has not been taken.</p></li>
   <li><strong>You approve the order → Invoice</strong><p>Check availability, address, shipping and tax. “Approve & send invoice” emails the final approved charges.</p></li>
   <li><strong>You request payment → Payment instructions + invoice</strong><p>Choose the saved payment method. The customer gets the details they need to pay.</p></li>
   <li><strong>You confirm received funds → Payment receipt</strong><p>Check your bank or payment provider first. Then enter the exact received amount and reference. The receipt is emailed automatically.</p></li>
   <li><strong>You ship and deliver → Tracking and delivery updates</strong><p>Enter real tracking details and keep the order updated. The customer receives these updates automatically.</p></li>
  </ol><p className="notice">Use “Preview” to check a document. “Send another copy” is only needed when a customer asks for it. Previewing or downloading does not send an email.</p></section>}
  <section className="panel admin-help-section"><h2>Your three business mailboxes</h2><dl className="admin-mailbox-guide"><div><dt>info@homeretreatdirect.com</dt><dd>General enquiries, suppliers and business communication.</dd></div><div><dt>orders@homeretreatdirect.com</dt><dd>Order confirmations, invoices, payment instructions and receipts.</dd></div><div><dt>support@homeretreatdirect.com</dt><dd>Customer questions, delivery issues, cancellations and refunds.</dd></div></dl><p>Website enquiries appear in Customer messages. Replies sent directly to your business mailbox are read in Spacemail; the admin does not sync that mailbox.</p></section>
  <section className="panel admin-help-section"><h2>How to tell whether an email was sent</h2><p><strong>Waiting to send</strong> means it is saved for the email worker, which checks about once a minute. <strong>Sending</strong> means delivery is in progress. <strong>Sent to email provider</strong> means the provider accepted it; check a real inbox to confirm arrival. If a message fails, read its error before retrying. If delivery is uncertain, check the mailbox or provider first so you do not send duplicate emails.</p><p>Previously saved messages keep their original PDF and design. Newly created messages use your latest business details and document design.</p></section>
 </>;
}
