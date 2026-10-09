'use client';

import {useId, useRef, useState} from 'react';
import {Star} from 'lucide-react';
import {api} from './provider';

const ratingDescriptions = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function ReviewForm({token, productId, email = ''}: {token?: string; productId?: string; email?: string}) {
  const formId = useId();
  const files = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (rating === null) {
      setError('Please choose a rating from 1 to 5 stars.');
      return;
    }
    const data = Object.fromEntries(new FormData(event.currentTarget));
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const photos: {url: string; grant: string}[] = [];
      if (token) {
        for (const file of Array.from(files.current?.files ?? []).slice(0, 4)) {
          const form = new FormData();
          form.set('file', file);
          form.set('token', token);
          form.set('email', String(data.email));
          const response = await fetch('/api/review-uploads', {method: 'POST', body: form});
          const photo = await response.json() as {url: string; grant: string; error?: string};
          if (!response.ok) throw new Error(photo.error || 'Your photo could not be uploaded. Please try again.');
          photos.push(photo);
        }
      }
      await api('/api/reviews', 'POST', {...data, rating, token, productId, photos});
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your review could not be submitted. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (done) {
    return <div className="success-note" role="status">Thank you for sharing your experience. Your review has been submitted and will appear after moderation.</div>;
  }

  return <form className="review-form" onSubmit={submit} aria-busy={busy}>
    <p className="muted">Tell other customers what worked well and what could be better. All ratings are welcome.</p>
    <fieldset className="review-rating-picker" disabled={busy}>
      <legend>Your rating</legend>
      <div className="review-star-picker">
        {[1, 2, 3, 4, 5].map(value => <label className="review-rating-choice" key={value}>
          <input type="radio" name="rating" value={value} required checked={rating === value} onChange={() => setRating(value)} aria-describedby={`${formId}-rating-description`}/>
          <Star aria-hidden="true" fill={rating !== null && value <= rating ? 'currentColor' : 'none'}/>
          <span>{value} {value === 1 ? 'star' : 'stars'}</span>
        </label>)}
      </div>
      <p className="review-rating-description small muted" id={`${formId}-rating-description`} aria-live="polite">{rating === null ? 'Choose 1 star for poor through 5 stars for excellent.' : `${rating} ${rating === 1 ? 'star' : 'stars'} — ${ratingDescriptions[rating - 1]}`}</p>
    </fieldset>
    <label className="field">Name<input name="name" required minLength={2} maxLength={100} autoComplete="name" disabled={busy}/></label>
    <div className="field"><label htmlFor={`${formId}-email`}>Email</label><input id={`${formId}-email`} name="email" type="email" required defaultValue={email} autoComplete="email" disabled={busy} aria-describedby={`${formId}-email-help`}/><span id={`${formId}-email-help`} className="small muted">Your email address will not be displayed with your review.</span></div>
    <label className="field">Review title<input name="title" required minLength={3} maxLength={120} disabled={busy}/></label>
    <label className="field">Your experience<textarea name="body" required minLength={15} maxLength={5000} rows={4} disabled={busy}/></label>
    {!token && <label className="field">Order number (optional)<input name="orderNumber" disabled={busy}/></label>}
    {token && <div className="field"><label htmlFor={`${formId}-photos`}>Photos (optional, up to four)</label><input id={`${formId}-photos`} ref={files} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} aria-describedby={`${formId}-photos-help`}/><span id={`${formId}-photos-help`} className="small muted">Photos are moderated with your review. Maximum 8 MB each.</span></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button dark" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</button>
  </form>;
}

