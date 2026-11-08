# TikTok Shop Affiliate OAuth callback

This directory is a static callback page for VideoGenerate. Upload `index.html` to a public HTTPS host only when the browser must return through a hosted URL.

Register the exact uploaded URL in Partner Center, for example:

```text
https://your-domain.example/tiktok-affiliate-oauth-callback/
```

The page does not contain an App Secret and does not exchange tokens. It forwards the OAuth `code` and `state` to the running VideoGenerate desktop app at:

```text
http://127.0.0.1:47960/plugins/tiktok-creator-outreach/oauth/callback
```

The desktop app performs the code exchange, validates the pending state, stores tokens using Electron secure storage, and validates the selected shop.

For a desktop-only setup, use the local callback directly instead of uploading this page:

```text
http://127.0.0.1:47960/plugins/tiktok-creator-outreach/oauth/callback
```

The exact URL in Partner Center must match the URL saved in the application, including scheme, host, path, and trailing slash rules. Use HTTPS for any hosted page. Never put `app_secret`, access tokens, or refresh tokens in this HTML or browser JavaScript.
