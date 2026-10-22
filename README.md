# Company Attendance Management System (MERN)

A full-stack attendance and leave application built with MongoDB, Express, React, and Node.js.

## Features

### Admin console (5 sections)
- **Dashboard** — total employees, present today, absent today, on leave today, late arrivals, unmarked accounts and pending self-marks.
- **Employees** — create employee logins, reset passwords, deactivate/reactivate accounts, delete employees.
- **Attendance** — check-in/check-out times, hours worked, full-day/half-day, late and early-checkout flags, filters, and corrections.
- **Leave Management** — pending/approved/rejected tabs, employee filter, leave history, approve/reject with attendance stamping.
- **Reports** — monthly team report or individual employee report, with Excel (`.xlsx`) and PDF downloads.

### Employee workspace
- Check in and check out for today; times are auto-captured and confirmed by an admin.
- Self-mark a missed day as Present or Absent (pending admin approval).
- Personal attendance calendar and monthly history, including check-in/out times.
- Apply for leave, track status, and withdraw a pending request.

### Access rules
- Admins can view and manage all employees' attendance and leave.
- Employees can only view and change their own attendance and leave.
- Employee accounts cannot reach the Admin Screen (`/admin` redirects, and every admin API is protected).
- Admins create employee credentials; there is no public employee sign-up.
- Admin sign-up is available at the unlisted `/admin-signup` route. The route is not linked from any page, but anyone who knows the URL can create an admin account. Keep the URL private, or add an invite/allowlist before using this in production.

### Attendance rules
- One global shift, configured in `server/.env`:
  - `SHIFT_START` / `SHIFT_END` (default `09:30`–`18:00`)
  - `GRACE_MINUTES` (default `10`): late = check-in after shift start + grace
  - `HALF_DAY_MINUTES` (default `240`): worked time below this becomes a half day
  - `WORKING_DAYS` (default `1,2,3,4,5,6` = Monday–Saturday, `0` = Sunday)
- Admins can override the day type when correcting a record.
- Attendance percentage = weighted present ÷ (weighted present + absent). A half day counts as `0.5`; leave and non-working days are excluded.
- Times are stored as company-local `HH:mm` alongside the `YYYY-MM-DD` date, so there is no timezone date drift.

## Requirements
- Node.js 18+
- MongoDB local instance or MongoDB Atlas connection string

## Quick start (recommended)

From the project root:

```bash
npm install          # installs the dev runner (concurrently)
npm run install:all  # installs server and client dependencies once
```

Copy `server/.env.example` to `server/.env` and set `MONGO_URI` and `JWT_SECRET`.

Then start both apps with one command:

```bash
npm run dev
```

- API: `http://localhost:5000`
- Web: `http://localhost:5173`

The browser calls `/api` on port 5173 and Vite proxies it to port 5000, so the two servers stay same-origin in development. The API must still be running for data and downloads.

Stop any existing frontend/backend terminals before using `npm run dev`, since ports 5173 and 5000 must be free.

### Optional client configuration

Create `client/.env` only if the defaults do not fit:

```env
# Where the Vite dev/preview proxy sends /api requests
VITE_PROXY_TARGET=http://localhost:5000

# For a production build hosted separately from the API
VITE_API_URL=http://localhost:5000/api
```

### Run separately

Backend:
```bash
cd server
npm install
npm run dev
```

Frontend, in another terminal:
```bash
cd client
npm install
npm run dev
```

## Troubleshooting: "Network Error" or ERR_CONNECTION_REFUSED

This means the browser could not reach the backend; it is not an Excel/PDF generation failure.

1. Make sure the API is running:
   ```bash
   npm run dev
   ```
   or `cd server && npm run dev`.
2. Confirm health:
   ```text
   http://localhost:5000/api/health
   ```
   It must return `{"status":"ok"}`.
3. The app shows a **Backend not reachable** banner with a **Retry** button when the API is down. Report downloads are disabled until the report preview loads, and a failed preview offers **Retry**.
4. If port 5000 or 5173 is already in use, stop the old process before starting again.

## First admin
Open `/admin-signup` directly in the browser (for example `http://localhost:5173/admin-signup`). The route is deliberately not linked from the app, so no "Sign up" link appears on the login pages. After creating the first admin, further admins can also be created from **Employees**.

## Google sign-in setup
1. In the Google Cloud Console, configure the OAuth consent screen.
2. Create an OAuth 2.0 Client ID of type **Web application**.
3. Add the frontend origins under **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - your deployed frontend origin (for example `https://client-ams.vercel.app`)
4. Set the same client ID in both places:
   ```env
   # server/.env
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   ```
   ```env
   # client/.env (baked in at build time)
   VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   ```
No client secret or redirect URI is needed for the ID-token flow. If the client ID is missing, the button shows a "not configured" message instead of breaking the page.

## API overview

### Auth
- `POST /api/auth/register-admin` — create an admin account (`name`, `phone`, `email`, `password`, `acceptTerms`)
- `POST /api/auth/login` — admin or employee login
- `POST /api/auth/google/login` — sign in an existing account with a Google ID token
- `POST /api/auth/google/register-admin` — create an admin from a Google ID token (Terms required)
- `GET /api/auth/me` — current user
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — password reset flow

### Employees (admin only)
- `POST /api/employees` — create an employee account and login credentials
- `GET /api/employees` — list employees and admins
- `PATCH /api/employees/:id/status` — activate/deactivate
- `PATCH /api/employees/:id/password` — reset a password (≥ 8 chars)
- `DELETE /api/employees/:id` — permanently delete an employee and their records

### Attendance
- `GET /api/attendance` — records; admin can filter by `employeeId`, `month`, `date`, `from`, `to`, `status`, `approval`, `late=true`; employees are always scoped to their own records
- `GET /api/attendance/summary?month=YYYY-MM` — present/absent/leave/half-day/late counts and attendance percentage
- `GET /api/attendance/calendar?month=YYYY-MM` — calendar records for the signed-in employee
- `GET /api/attendance/today` — the signed-in employee's record for today
- `GET /api/attendance/config` — shift, grace, half-day and working-day rules
- `POST /api/attendance` — admin marks any employee; employees mark only themselves (Present/Absent, pending approval)
- `POST /api/attendance/check-in` / `POST /api/attendance/check-out` — employee self check-in/out for today
- `PATCH /api/attendance/:id` — **admin** corrects status, times, day type or note
- `GET /api/attendance/pending` — **admin** queue of self-marks awaiting approval
- `PATCH /api/attendance/:id/review` — **admin** confirms/rejects a self-mark

### Leave
- `POST /api/leaves` — employee applies for leave
- `GET /api/leaves` — employee: own requests; admin: all requests (`employeeId`, `status` filters)
- `PATCH /api/leaves/:id/review` — admin approves/rejects; approving writes `Leave` into attendance for every date in the range
- `DELETE /api/leaves/:id` — employee withdraws their own pending request

### Dashboard and reports (admin only)
- `GET /api/dashboard` — today's headline numbers and shift rules
- `GET /api/reports/attendance?month=YYYY-MM&employeeId=` — JSON report preview
- `GET /api/reports/attendance.xlsx?month=YYYY-MM&employeeId=` — Excel download
- `GET /api/reports/attendance.pdf?month=YYYY-MM&employeeId=` — PDF download

## Deployment

The frontend and API are hosted separately. The browser talks to the API directly, so both sides need to know about each other.

### Frontend (Vercel)

Set the project **Root Directory** to `client`, with build command `npm run build` and output directory `dist`.

Add one environment variable in **Project → Settings → Environment Variables**:

```env
VITE_API_URL=https://<your-render-service>.onrender.com/api
```

Vite bakes this value into the build, so change it before building, not after.

`client/vercel.json` contains the single-page-app rewrite:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Deployment note: set `VITE_GOOGLE_CLIENT_ID` in the Vercel project too, and add the Vercel origin to the Google OAuth client's authorized JavaScript origins.

Routes such as `/admin-login`, `/admin-signup`, `/terms`, `/login`, `/reset-password` and `/employee` exist only in the browser (React Router with `BrowserRouter`). Without that rewrite, Vercel looks for a matching file, finds none and returns its own `404 NOT_FOUND` page before React can load. Existing files (`/assets/*`) are still served first, so the catch-all only affects unknown paths.

If the Vercel Root Directory is the repository root instead of `client`, move `vercel.json` to the repository root and set the output directory to `client/dist`; a config file inside `client/` is ignored in that setup.

### Backend (Render)

Root directory `server`, build command `npm install`, start command `npm start`.

Environment variables:

```env
MONGO_URI=<MongoDB Atlas connection string>
JWT_SECRET=<long random string>
CLIENT_URL=https://client-ams.vercel.app
GOOGLE_CLIENT_ID=<Google OAuth web client ID>
```

Do not set `PORT` on Render; the platform injects it and the server already reads `process.env.PORT`. Also configure the optional SMTP and shift variables from `server/.env.example` if password-reset email or non-default attendance rules are needed.

`CLIENT_URL` is the only origin allowed by CORS besides `http://localhost:5173`. If the frontend domain changes, update it and redeploy; otherwise every login and API call fails with a CORS error.

Health check: `GET /api/health` returns `{"status":"ok"}`.

## Notes before production
Add email verification, audit logs, rate limiting, CSRF strategy if moving away from bearer tokens, an invite code or allowlist for `/admin-signup`, backups, and a company-specific holiday policy. Times are company-local wall-clock values; staff in other timezones would need per-employee timezone support. Password resets are admin-driven with an email fallback. This is a starter application, not a production security audit.
