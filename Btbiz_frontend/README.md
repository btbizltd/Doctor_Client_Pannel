# MediGraph (Btbiz Clinic Suite) — Frontend

Clinic operations + patient portal web app for doctors, assistants, lab, pharmacy, and patients.

This repo folder (`Btbiz_frontend`) is the **React UI**. It talks to `Btbiz_backend` (Express + MongoDB) over REST and Socket.IO.

---

## What the product does

| Area | Capabilities |
|------|----------------|
| **Public** | Home, how-it-works, doctor directory, book appointment (OTP + family members) |
| **Patient portal** | OTP login, profile, history, upload prescriptions, request lab tests / medicines |
| **Doctor** | Dashboard, appointments, patient search/history, assistants, availability, OCR tool |
| **Assistant** | Check-in, vitals + refer, prescription upload, **AI-assisted verify & release** |
| **Lab** | Incoming test requests, accept/complete, report upload, mark paid |
| **Lab manager** | Manage lab assistant accounts |
| **Pharmacy** | Incoming medicine requests, dispense, payment, receipts |
| **Super Admin** | Approve/manage doctors, pharmacy/lab tenants, intelligence dashboard |

Brand shown in the UI: **MEDIGRAPH** / Btbiz Clinic Suite.

---

## Tech stack

| Layer | Stack |
|-------|--------|
| UI | React 19, TypeScript, Vite 7, React Router 7 |
| Styling | Tailwind CSS 4, shared UI components under `src/components/ui` |
| HTTP | Axios (`api`, `patientApi`, public client) |
| Realtime | Socket.IO client (doctor referrals, availability) |
| Charts | Recharts (super-admin intelligence) |
| Backend (sibling) | Express, TypeScript, MongoDB/Mongoose, JWT, Multer, Tesseract OCR, Google Gemini (prescription reading), Nodemailer |

---

## Project layout

```
Btbiz doctor/
├── Btbiz_frontend/          ← this app (React + Vite)
│   ├── src/
│   │   ├── App.tsx          # all routes
│   │   ├── pages/           # screens by role / public flow
│   │   ├── components/      # layouts, auth gates, UI kit
│   │   ├── services/api.ts  # API + sockets
│   │   ├── utils/           # auth/patient storage, portals, helpers
│   │   ├── constants/
│   │   └── styles/
│   ├── .env                 # local (optional)
│   ├── .env.production      # production API base URL
│   └── package.json
└── Btbiz_backend/           # API server (required for the app to work)
    ├── src/
    ├── .env                 # MongoDB, JWT, Gemini, SMTP, …
    └── package.json
```

### Important frontend pages

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Public | Landing / home |
| `/how-it-works` | Public | Product overview |
| `/doctors` | Public | Doctor directory |
| `/book-appointment` | Public | OTP family booking |
| `/patient-login` | Patient | OTP login |
| `/patient-profile` | Patient (JWT) | Profile, requests, documents |
| `/portal` | Staff | Role cards → login / register |
| `/login` | Staff | Role-based staff login |
| `/register` | Doctor | Doctor registration (needs Super Admin approval) |
| `/register-lab-manager` | Lab manager | Self-register |
| `/register-medicine` | Pharmacy | Self-register |
| `/dashboard` | Doctor | Main doctor workspace |
| `/assistant` | Assistant | Desk + Rx verify |
| `/lab` | Lab assistant / manager | Lab order inbox |
| `/lab-manager` | Lab manager | Staff management |
| `/medicine` | Pharmacy | Pharmacy inbox |
| `/super-admin` | Super Admin | Tenants & approvals |
| `/super-admin/intelligence` | Super Admin | Analytics |
| `/search-patients`, `/patient/:id` | Doctor | Search & patient details |
| `/ocr` | Doctor | Handwriting / OCR helper |

---

## Prerequisites

- **Node.js** 18+ (recommended 20+)
- **npm**
- **MongoDB** running locally or a cloud URI
- Backend env configured (see below)

---

## Environment variables

### Frontend (`Btbiz_frontend`)

| Variable | When | Meaning |
|----------|------|---------|
| `VITE_API_BASE_URL` | Production / optional local | Absolute API origin (e.g. `https://your-api.example.com`). Leave **empty** in local Vite so requests use same origin + proxy. |
| `VITE_DEV_PROXY_TARGET` | Local only | Backend URL for Vite proxy. Default: `http://localhost:4000` |

Example local `.env` (optional):

```env
# leave empty to use Vite proxy → localhost:4000
VITE_API_BASE_URL=
VITE_DEV_PROXY_TARGET=http://localhost:4000
```

Production build uses `.env.production` (`VITE_API_BASE_URL=...`).

### Backend (`Btbiz_backend/.env`)

Copy from `.env.example`:

```env
MONGODB_URI=mongodb://localhost:27017/btbiz_doctor
PORT=4000
JWT_SECRET=change-me
JWT_EXPIRES_IN=1h
GEMINI_API_KEY=          # required for AI prescription reading in assistant verify
GEMINI_MODEL=gemini-2.5-flash
```

Other runtime options (see backend `config/env.ts`): `PUBLIC_APP_BASE_URL`, WhatsApp webhook, SMTP, Super Admin credentials, tenant flags.

---

## How to run (local)

Open **two terminals**.

### 1) Backend (port 4000)

```bash
cd Btbiz_backend
cp .env.example .env
# edit .env — set MONGODB_URI, JWT_SECRET, GEMINI_API_KEY if needed
npm install
npm run dev
```

Production-style (builds `dist` then runs):

```bash
npm run build
npm run start
```

> If you use `npm start`, always **rebuild** after backend code changes (`prestart` already runs build).

### 2) Frontend (port 5173)

```bash
cd Btbiz_frontend
npm install
npm run dev
```

Open: **http://localhost:5173**

### Scripts (frontend)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | Typecheck + production bundle → `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | ESLint |

---

## How frontend ↔ backend works

1. In **dev**, `VITE_API_BASE_URL` is usually empty. Axios calls `/patients`, `/auth`, … on the Vite origin.
2. Vite **proxies** those paths to the backend (`VITE_DEV_PROXY_TARGET` or `http://localhost:4000`):
   - `/auth`, `/public`, `/patients`, `/appointments`, `/orders`, `/pharmacy`, `/notifications`
   - `/super-admin` (API only; HTML navigations stay on the React app)
   - `/socket.io` (WebSocket)
3. Staff requests send `Authorization: Bearer <staff JWT>` (`authStorage`).
4. Patient portal uses a separate client + patient JWT (`patientStorage`).
5. Family / OTP booking uses an unauthenticated client so a leftover staff token cannot break OTP.

---

## Roles & login portals

| Role | How to enter | Home after login |
|------|----------------|------------------|
| Patient | `/patient-login` (OTP) | `/patient-profile` |
| Doctor | `/login` (doctor portal) | `/dashboard` |
| Assistant | `/login` (assistant / lab portal) | `/assistant` |
| Lab assistant | same | `/lab` |
| Lab manager | `/login` or register | `/lab-manager` |
| Pharmacy | `/login` or register | `/medicine` |
| Super Admin | `/login` (super-admin portal; env credentials) | `/super-admin` |

Routes are guarded by `ProtectedRoute` (staff roles) and `ProtectedPatientRoute` (patient JWT). Wrong role is redirected to that role’s home.

---

## Core user flows (short)

### Book appointment

1. Open `/book-appointment`
2. Enter mobile → OTP verify (family account)
3. Pick / add family member
4. Choose doctor, slot, pay online or cash-at-clinic
5. Confirmation + optional live location updates

### Patient profile

1. OTP login → `/patient-profile`
2. View history, appointments, documents
3. Request **multiple** lab tests / medicines (chips + suggestions from last verified prescription)
4. Upload documents; pick lab/pharmacy providers when needed

### Assistant — prescription verify (AI)

1. Assistant uploads Rx (or opens pending queue)
2. Verify modal opens with OCR suggestions
3. Backend Gemini `ai-extract` fills medicines / tests (confidence highlighting)
4. Assistant edits → **Save structured data & release**
5. Patient can see the document; lab/pharmacy use structured preview

Gemini is **backend-only** (`GEMINI_API_KEY`). If the key is missing, verify still works with OCR / manual entry.

### Lab / Pharmacy

- Patient or WhatsApp creates requests → staff dashboards show grouped items
- Accept → complete / dispense → mark payment as needed

---

## Auth & security notes (for evaluators)

- Staff and patient sessions are separate JWTs.
- Session expiry surfaces a dialog and clears storage.
- Prescription file access is role-restricted on the API (e.g. lab/pharmacy use secure preview links, not raw file browse for all roles).
- Super Admin is configured via backend env, not the normal Doctor collection.
- Multi-tenant soft scoping exists on the backend (`tenant` middleware / plugins).

---

## Production build

```bash
cd Btbiz_frontend
# ensure .env.production has the correct VITE_API_BASE_URL
npm run build
```

Output: `Btbiz_frontend/dist`. The backend can serve this SPA when `NODE_ENV=production` (see backend `app.ts` / deploy setup).

---

## Default ports

| Service | Port |
|---------|------|
| Frontend (Vite) | `5173` |
| Backend API | `4000` (unless `PORT` in backend `.env`) |

---

## Troubleshooting

| Problem | Check |
|---------|--------|
| API calls fail / CORS in local | Run backend on 4000; leave `VITE_API_BASE_URL` empty; restart `npm run dev` after proxy/env changes |
| Backend ignores code changes | You are on `npm start` → rebuild + restart, or use `npm run dev` |
| AI verify does nothing | Set `GEMINI_API_KEY` in backend `.env`, restart backend; file must be JPG/PNG/WEBP/PDF |
| OTP / family weird errors after staff login | Patient OTP uses a clean client; clear site storage if stuck |
| Mongo connection errors | Start MongoDB / fix `MONGODB_URI` |

---

## Team submission checklist

- [ ] MongoDB running + `Btbiz_backend/.env` filled
- [ ] Backend: `npm install` → `npm run dev` (or build + start)
- [ ] Frontend: `npm install` → `npm run dev`
- [ ] Open http://localhost:5173 — public home loads
- [ ] Staff login portals work for demo roles
- [ ] Book appointment OTP flow works (WhatsApp/SMS or your OTP path as configured)
- [ ] Assistant upload → AI/OCR verify → release
- [ ] Lab + pharmacy dashboards show multi-item requests
- [ ] Optional: `GEMINI_API_KEY` set for AI demo

---

## License / notes

Backend package license: MIT. Frontend is private (`"private": true` in `package.json`).

For API details, env extras, and scripts (`backfill:tenant`, `test:gemini-rx`), see `Btbiz_backend`.
