# Water Tank Admin Panel

Next.js admin panel for managing water tank monitoring devices.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp env.example .env.local
```

3. Configure `.env.local` with your actual values:
   - Backend API URL
   - Firebase client configuration

4. Start development server:
```bash
npm run dev
```

The admin panel will run on `http://localhost:3001` by default.

## Environment Variables

See `env.example` for all required environment variables.

All variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Pages

- `/` - Redirects to login or dashboard
- `/login` - Admin login page
- `/dashboard` - System overview dashboard
- `/devices` - Device management
- `/devices/[deviceId]` - Device detail page
- `/firmware` - Firmware upload and management
- `/analytics` - Analytics and reports
- `/tenants` - Tenant management










### Tank visual preview

Run the Vite dev server and open `/tank-preview.html` to exercise the shared
Reservoir tank style with full, low, leak, empty, missing, and stale readings.
The preview uses sample values and is not a production build entry.

To use an existing API from a local frontend, put its URL in the ignored
`.env.local` file as `DEV_API_PROXY_TARGET`, and set `NEXT_PUBLIC_API_URL=/`.
Vite proxies `/api` requests during development. Keep the normal Firebase client
configuration and sign in locally; no token override is needed. This does not
change the production API's CORS configuration.

The renderer consumes the existing `level_percent`, `level_percent_stale`, device
status, alert, and tank-profile fields. Cuboidal profiles use squarer corners;
connected-unit diagrams use `parallel_unit_count`. Empty (0%) and missing (null)
readings remain distinct. Stale/offline readings stop the waves, offscreen waves
pause, and reduced-motion preferences disable motion.
