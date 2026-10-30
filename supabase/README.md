# PhotoSpace production setup

This update adds email/password recovery, private profiles, owner-managed photos/comments, likes, sharing, report review, and upload limits. The migration keeps existing community photos (they remain public/unowned) and changes the `photos` bucket to private. Signed URLs are issued only after RLS verifies profile visibility.

## 1. Apply the database migration

In Supabase **SQL Editor → New query**, paste the complete `supabase/schema.sql` and click **Run**. It is designed to rerun and replaces the PhotoSpace policies with owner, privacy, report, and upload-reservation rules. Do this before deploying the matching client code.

The database caps each account at 40 file reservations per rolling 24 hours (a photo uses two objects: full image and thumbnail), and 20 comments per 10 minutes. Source images must be at most 10 MB; the app converts them to WebP and limits dimensions before upload.

## 2. Configure Auth redirect URLs

In **Authentication → URL Configuration**, set the Site URL to `https://himanshu-grow.github.io/PhotoSpace/`. Add these exact production redirect URLs:

- `https://himanshu-grow.github.io/PhotoSpace/index.html`
- `https://himanshu-grow.github.io/PhotoSpace/password-update.html`

Keep email confirmation enabled. Before inviting the public, configure a custom SMTP sender in Supabase; the built-in test email sender is rate-limited. CAPTCHA is not wired into this frontend yet, so do not turn on an Auth CAPTCHA challenge until a site key and token integration have been added.

## 3. Deploy account deletion function

Account deletion needs an Edge Function because only server-side code can securely remove a Supabase Auth user. From the repository root, install/login/link the Supabase CLI, then set the function secret and deploy:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set SUPABASE_SECRET_KEY=YOUR_SECRET_KEY
supabase functions deploy delete-account
```

Use a Supabase secret key (or legacy service-role key) only as the Edge Function secret. Never put it in `scripts/config.js` or frontend code. The function deletes the account’s stored images before asking Auth to delete the user and cascading database rows.

## 4. Assign moderators

After creating your own account, copy its UUID from **Authentication → Users**. Run this once in SQL Editor, replacing the sample UUID:

```sql
insert into public.moderators (user_id)
values ('YOUR_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

That account gets a **Moderation** link. Moderators can review reports, hide or restore a photo/comment/profile, or dismiss a report. Regular users cannot set moderation fields.

## Privacy and public behavior

- Public profiles, photos, comments, likes, and thumbnails are visible without sign-in.
- Private profiles and all their media are visible only to that account.
- Only signed-in users can like, comment, report, or manage their own profile/photos/comments.
- The report queue requires a moderator. It does not provide automated content detection.
- Account deletion is unavailable until the Edge Function is deployed and its secret is configured.
- Existing photos with no `owner_id` remain public and cannot be managed by a member account.
