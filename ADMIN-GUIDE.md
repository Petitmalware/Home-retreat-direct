# Running Home Retreat Direct

Sign in at **https://homeretreatdirect.com/admin** using your staff account. The owner email is **info@homeretreatdirect.com**. Use the password saved in the database; changing `SEED_OWNER_PASSWORD` alone does not change an existing account. The password reset instructions are in VPS-HOSTING.md.

The admin Home page starts with everyday tasks. “Settings & records” holds less frequent setup tasks. “How to use your admin” is available from the sidebar and Help button.

## Handle an order

Open **Orders**, then open the customer's order. Follow **Your next step** at the top. The order buttons send the appropriate customer emails automatically; you do not have to choose a template each time.

| Step | What you do | What the customer receives |
| --- | --- | --- |
| Order placed | No manual email needed | Order confirmation with a PDF summary; no payment collected |
| Approve & send invoice | Check availability and address; enter confirmed shipping and tax | Invoice showing the approved charges and amount due |
| Send payment instructions | Choose your saved business payment method | Actual payment instructions with the invoice attached |
| Confirm payment & send receipt | Verify funds in your bank/provider, then record the exact received amount and reference | Payment receipt with the confirmed amount and reference |
| Prepare and ship | Prepare the items; enter actual carrier and tracking details after shipment | Preparation and tracking updates |
| Mark delivered | Verify delivery with the carrier | Delivery confirmation and review invitations |

**An invoice asks for payment. A receipt confirms money was received.** Never confirm a payment merely because a customer sends a screenshot. Recording a payment or refund in the admin does not move funds.

To set up payment instructions, the owner opens **Settings & records → Store settings & payments → Payment methods**. Save only the actual approved business payee details or secure payment instructions. Other staff should ask the owner if no method is available.

“Other order actions” holds cancellations, charge corrections and refunds. Existing approval, stock, exact amount and permission checks still apply.

## Preview, download or resend

An order's **Emails & documents** panel has three previews: order confirmation, invoice and payment receipt. Invoices are available after the charges are approved; receipts are available after full payment is confirmed.

Opening a preview or downloading its PDF **does not send an email**. Choose **Send another copy** only when the customer needs the document again. To send a personal message, use the envelope button beside the panel heading.

The invoice and receipt show saved order prices, quantities, approved shipping and tax. Product edits or later discounts do not change a saved order's financial record. Business address and phone appear when staff have supplied them in Contact details. No invented registration, tax number or address is added.

## Check delivery status

- **Waiting to send:** saved for the background worker, which checks about once a minute.
- **Sending:** a delivery attempt is in progress.
- **Sent to email provider:** the provider accepted the message. Confirm actual arrival in the customer's or a controlled inbox, including spam.
- **Could not send:** read the error and correct the cause before using Retry sending.
- **Check delivery before retrying:** the result is uncertain. Check the provider or mailbox first to avoid duplicate messages.

The customer email history refreshes while messages are waiting. Staff alert emails are separate from the customer's history. Previously saved emails and attachments keep their original design and amounts; new emails use the new design.

## Use the right mailbox

| Mailbox | Purpose |
| --- | --- |
| info@homeretreatdirect.com | General enquiries, suppliers and business communication |
| orders@homeretreatdirect.com | Order confirmations, approvals, invoices, payment instructions and receipts |
| support@homeretreatdirect.com | Customer questions, delivery issues, cancellations, refunds and privacy requests |

Website enquiries are saved in **Customer messages**, where staff can reply. Incoming mail sent directly to these addresses is read in **Spacemail**; the admin does not import those mailbox conversations. Outgoing credentials stay in the private server environment.

## Other everyday tasks

**Christmas on / off:** open this page under **Your business** to show or hide the entire Christmas collection. The switch saves immediately. Optional dates can show it automatically for a season. Product photos, videos, prices and old orders stay saved when hidden. See [CHRISTMAS-COLLECTION.md](CHRISTMAS-COLLECTION.md) for the seasonal catalog and deployment details.

**Products & photos:** open a product to change its images, description, prices or discount. Save the changes. **Contact details:** add verified phone, address and hours; new documents and the contact page use them. **Shipping & store policies:** edit and publish your adopted business terms. Access depends on the staff role assigned by the owner.

## Install this admin update on the existing VPS

In your SSH terminal, run the following as one block. It uses the existing database and private settings. It does not reinitialize products, alter launch approval or enable a previously stopped email worker. There are no database migrations in this admin/document update.

```bash
sudo -H -u administrator git -C /opt/home-retreat-direct/current pull --ff-only &&
cd /opt/home-retreat-direct/current &&
sudo bash -eu <<'SH'
hrd() { docker compose --env-file /opt/home-retreat-direct/private/server.env -f /opt/home-retreat-direct/current/deploy/compose.yml -p hrd "$@"; }
worker_was_running=$(hrd ps --status running -q email-worker)
bash deploy/start-production.sh --resume
if [ -n "$worker_was_running" ]; then hrd up -d --wait email-worker; fi
curl --fail --show-error --max-time 20 https://homeretreatdirect.com/api/health
hrd ps
SH
```

After it finishes, refresh the admin browser page. Open Help and an existing order. Check the invoice preview; check a receipt only for an order with a genuine confirmed payment. Send a requested copy to a controlled customer inbox to verify SMTP delivery. If a command fails, stop and inspect the error; do not use `--fresh` or delete Docker volumes.
