import {setTimeout as delay} from 'node:timers/promises';

const endpoint = process.env.EMAIL_JOB_URL ?? 'http://app:3000/api/jobs/email';
const secret = process.env.JOB_SECRET;
const interval = Number(process.env.EMAIL_JOB_INTERVAL_MS ?? 60000);
if (!secret || secret.length < 32) throw new Error('Set a random JOB_SECRET of at least 32 characters.');
if (!Number.isInteger(interval) || interval < 10000) throw new Error('Email worker interval must be at least ten seconds.');
const url = new URL(endpoint);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid email job URL.');

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
while (!controller.signal.aborted) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {authorization: `Bearer ${secret}`},
      redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
    });
    // Do not log email addresses, document contents, secrets or provider errors.
    if (!response.ok) console.error(`Email queue job returned HTTP ${response.status}.`);
  } catch {
    if (!controller.signal.aborted) console.error('Email queue job could not complete; the next interval will retry.');
  }
  try { await delay(interval, undefined, {signal: controller.signal}); } catch { break; }
}
