# Connect the shared PhotoSpace gallery

This learning setup uses a public gallery: visitors can read and add photos and notes without signing in. Images are public. The database policies do not allow visitors to edit or delete shared content.

1. Create a Supabase project.
2. Open **SQL Editor**, paste in `supabase/schema.sql`, and run it.
3. In **Project Settings → API**, copy the Project URL and publishable key into `scripts/config.js`.
4. Open the site through a local web server or GitHub Pages. The browser Supabase client is loaded from jsDelivr.

Use only the project URL and publishable key in the browser. Never put a `service_role` key in this repository or frontend code.

Anyone can upload up to 10 MB per image and add public notes. Public, unauthenticated uploads can be spammed, and content cannot be attributed to a person or moderated from the app yet. This setup is for learning; add authentication, abuse controls, and moderation before opening a public production gallery.

The app no longer reads the previous IndexedDB photo store. Existing browser-stored photos are left on that browser but are not imported into the shared gallery.
