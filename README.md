# Goofgram Supabase

This is the Netlify-ready version.

## Files To Upload To Netlify

Upload these files:

```text
index.html
app.js
styles.css
```

Do not upload `server.js` for this version.

## Before Uploading

Open `app.js` and replace:

```js
const SUPABASE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";
```

with your Supabase publishable key.

Your Supabase URL is already set to:

```js
const SUPABASE_URL = "https://ungxrpngvrivzvwifidr.supabase.co";
```

## Supabase Settings

For easiest testing:

1. Go to Supabase
2. Open Authentication
3. Open Providers
4. Open Email
5. Turn off email confirmation if available

If email confirmation stays on, users must confirm their email before logging in.

