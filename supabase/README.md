# Supabase setup for PhotoSpace accounts

This version adds email/password accounts, public member profiles, and personal photo galleries. Anyone can browse profiles and photos. Only signed-in users can upload or manage their own photos. Photo images remain publicly viewable.

## Apply the database update

1. Open the existing Supabase project and go to **SQL Editor → New query**.
2. Paste the complete contents of `supabase/schema.sql` and click **Run**. It updates the old shared-gallery policies, adds profile ownership, and creates profiles for new sign-ups.
3. Old community uploads have no account owner. They remain in the database but won’t appear as a member's photos on profile pages.

## Configure email sign-in

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to the deployed site root, for example `https://your-name.github.io/PhotoSpace/`.
3. Add that site root and the local development address you use to **Redirect URLs**. The signup confirmation link redirects to the site's `index.html`.
4. Open **Authentication → Providers → Email** and keep Email enabled. Email confirmation can stay enabled; users confirm their address before signing in.

The Supabase free email sender is rate-limited. If confirmation emails do not arrive or signup limits are reached, check **Authentication → Logs** and the Supabase email configuration.

## Deploy

Keep the project URL and publishable key in `scripts/config.js`, commit the code, and push it to GitHub. The publishable key is intended for browser use. Never put a Supabase secret or `service_role` key in the site.

## Current account behavior

- Each account has a unique username, display name, bio, and public profile picture.
- Visitors can explore and view profiles without signing in.
- A signed-in member can upload photos, add notes, edit their profile, and delete their own photos.
- Photo content is public. Account deletion and password recovery are not implemented in the site yet.
