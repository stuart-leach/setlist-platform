# Community Platform

A branded SaaS community platform with topic channels, direct messaging, SSO, and Intercom Fin support.

## Stack

- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — PostgreSQL database, realtime, auth
- **Intercom Fin** — AI support widget + CRM user sync
- **Vercel** — hosting at `community.yoursite.com`

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in .env.local with your real values
npm run dev
```

## Setup Checklist

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL Editor
3. Enable realtime on `messages` and `dm_messages`:
   ```sql
   alter publication supabase_realtime add table public.messages;
   alter publication supabase_realtime add table public.dm_messages;
   ```
4. Copy your project URL and keys into `.env.local`

### 2. SSO with your existing product

The SSO flow works by having your product redirect users to:
```
https://community.yoursite.com/auth/sso?token=<JWT>
```

The JWT must be signed with `HS256` using `SSO_JWT_SECRET` and contain:
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "Full Name",
  "avatar_url": "https://...",
  "exp": 1234567890
}
```

Example (Node.js):
```js
import { SignJWT } from "jose";
const secret = new TextEncoder().encode(process.env.SSO_JWT_SECRET);
const token = await new SignJWT({ sub: user.id, email: user.email, name: user.name })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("5m")
  .sign(secret);
// redirect to: https://community.yoursite.com/auth/sso?token=${token}
```

### 3. Intercom

1. Get your App ID from **Intercom → Settings → Installation**
2. Create an access token at **Intercom → Settings → Developers → Access Tokens**
3. Copy the identity secret from **Intercom → Settings → Installation → Identity Verification**
4. Set up a Supabase webhook:
   - Go to **Supabase → Database → Webhooks → Create webhook**
   - Table: `profiles` | Event: `INSERT`
   - URL: `https://community.yoursite.com/api/intercom/sync`
   - Add header: `x-webhook-secret: <your SUPABASE_WEBHOOK_SECRET>`

### 4. Branding

Edit `app/globals.css` — update the CSS variables at the top to match your product:

```css
:root {
  --brand-500: #3b82f6;   /* primary color */
  --brand-600: #2563eb;   /* buttons */
  --sidebar-bg: #1e1e2e;  /* sidebar background */
  /* ... */
}
```

Replace the `C` logo placeholder in `components/ChannelSidebar.tsx` with your actual logo.

### 5. Deploy to Vercel

```bash
# Push to GitHub, then:
vercel --prod
```

Add your custom domain `community.yoursite.com` in the Vercel dashboard and point a CNAME record to `cname.vercel-dns.com`.

## Adding Channels

Channels are managed in the database. To add a new channel:

```sql
insert into public.channels (slug, name, description)
values ('new-feature', 'New Feature', 'Discussion about New Feature');
```

## Project Structure

```
app/
  (auth)/sso/route.ts          ← SSO JWT bridge
  (auth)/login/page.tsx        ← Magic link fallback login
  (community)/layout.tsx       ← Sidebar + Intercom wrapper
  (community)/channels/[slug]/ ← Channel pages with realtime
  (community)/dm/[userId]/     ← Direct message pages with realtime
  api/intercom/sync/route.ts   ← Supabase webhook → Intercom sync
components/
  ChannelSidebar.tsx
  MessageFeed.tsx
  MessageInput.tsx
  UserAvatar.tsx
  IntercomProvider.tsx
lib/
  supabase/client.ts           ← Browser client
  supabase/server.ts           ← Server client + service client
  supabase/types.ts            ← TypeScript types
  intercom.ts                  ← Intercom REST API helpers
supabase/
  migrations/001_initial_schema.sql
```
