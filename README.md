# Company Attendance Management System (MERN)

A full-stack starter project using MongoDB, Express, React, and Node.js.

## Features
- Admin registration and login (JWT authentication)
- **Separate role-based screens**: `/admin` (admins only) and `/employee` (employees only), guarded on both client and server
- Admin dashboard: create employees, view employee list, mark attendance for anyone
- **Admin leave management**: view the whole team's leave requests and approve/reject them
- **Admin resets an employee's password** to a new temporary value (no self-service reset; employees ask their admin)
- **Leave workflow**: employees apply for leave (date range + reason); approved ranges are recorded as `Leave` in attendance
- **Employee self-marking**: employees mark their own day as Present or Absent
- Employee dashboard: personal calendar, all-month attendance history, apply for/track leave
- Attendance statuses: Present, Absent, Leave
- Monthly calendar: green = Present, red = Absent, amber = Leave
- Present/absent/leave counts and attendance percentage
- **Show/hide password toggle** on every password field
- Role-based API access and password hashing
- Attendance is unique per employee per date

## Requirements
- Node.js 18+
- MongoDB local instance or MongoDB Atlas connection string

## Run locally

### 1. Backend
```bash
cd server
cp .env.example .env
# Set MONGO_URI and JWT_SECRET in .env
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Frontend
In another terminal:
```bash
cd client
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

## First admin
Open the app and choose **Admin Register**. Admin registration is open in this starter build. For production, disable public admin registration after creating the first admin or add an invite/secret-code flow.

## API overview
- `POST /api/auth/register-admin` — create an admin
- `POST /api/auth/login` — admin or employee login
- `GET /api/auth/me` — current user
- `POST /api/employees` — admin creates an employee account
- `GET /api/employees` — admin lists employees
- `PATCH /api/employees/:id/status` — admin activates/deactivates an employee
- `PATCH /api/employees/:id/password` — admin resets an employee's password (≥ 8 chars)
- `GET /api/attendance` — admin attendance records (all or `employeeId`); employee gets own records only
- `POST /api/attendance` — admin marks any employee (Present/Absent/Leave); **employee marks only their own day as Present/Absent**
- `GET /api/attendance/summary?month=YYYY-MM` — attendance counts/percentage
- `GET /api/attendance/calendar?month=YYYY-MM` — calendar records for logged-in employee
- `POST /api/leaves` — employee applies for leave (`startDate`, `endDate`, `reason`)
- `GET /api/leaves` — employee: own requests; admin: all requests (optional `employeeId`, `status` filters)
- `PATCH /api/leaves/:id/review` — admin approves/rejects (`action: 'approve'|'reject'`); approving writes `Leave` into attendance for every date in range
- `DELETE /api/leaves/:id` — employee withdraws their own pending request

## Attendance percentage
`Present days / (Present days + Absent days) * 100`. Leave days are excluded from the denominator. If there are no present/absent records, percentage is 0%.

## Notes before production
Add email verification, audit logs, rate limiting, CSRF strategy if moving away from bearer tokens, stricter admin registration, backups, and a company-specific holiday/weekend policy. Password resets are intentionally admin-driven (no self-service / email flow). This is a starter application, not a production security audit.
