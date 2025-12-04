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



