# Company Attendance Management System (MERN)

A full-stack starter project using MongoDB, Express, React, and Node.js.

## Features
- Admin registration and login (JWT authentication)
- Admin dashboard: create employees, view employee list, mark attendance
- Attendance statuses: Present, Absent, Leave
- Employee login and personal dashboard
- Monthly calendar: green = Present, red = Absent, amber = Leave
- Present/absent/leave counts and attendance percentage
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
- `GET /api/attendance` — admin attendance records; employee gets own records
- `POST /api/attendance` — admin marks attendance for an employee/date
- `GET /api/attendance/summary?month=YYYY-MM` — attendance counts/percentage
- `GET /api/attendance/calendar?month=YYYY-MM` — calendar records for logged-in employee

## Attendance percentage
`Present days / (Present days + Absent days) * 100`. Leave days are excluded from the denominator. If there are no present/absent records, percentage is 0%.

## Notes before production
Add email verification/password reset, audit logs, rate limiting, CSRF strategy if moving away from bearer tokens, stricter admin registration, backups, and a company-specific holiday/weekend policy. This is a starter application, not a production security audit.
