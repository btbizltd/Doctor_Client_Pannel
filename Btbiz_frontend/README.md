# MediGraph (Btbiz Clinic Suite)

Full-stack clinic operations platform: public booking, patient portal, and staff dashboards for doctors, assistants, lab, pharmacy, and super admin.

| Folder | Role |
|--------|------|
| `Btbiz_frontend` | React + Vite SPA (this README lives here) |
| `Btbiz_backend` | Express + TypeScript + MongoDB API + Socket.IO |
| Root `package.json` | Production build/start helpers (e.g. Replit) |

---

## Table of contents

1. [Project setup](#1-project-setup)
2. [Architecture](#2-architecture)
3. [Deployment](#3-deployment)
4. [Technical details](#4-technical-details)

---

## 1. Project setup

### 1.1 Prerequisites

- Node.js **18+** (20+ recommended)
- npm
- MongoDB (local or Atlas URI)
- Optional: Google Gemini API key (AI prescription reading)
- Optional: SMTP + WhatsApp webhook for OTP / notifications

### 1.2 Clone & install

```bash
cd "Btbiz doctor"

cd Btbiz_backend
npm install

cd ../Btbiz_frontend
npm install
```

### 1.3 Backend environment

Create `Btbiz_backend/.env` from `.env.example`:

```env
MONGODB_URI=mongodb://localhost:27017/btbiz_doctor
PORT=4000
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1h
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Additional variables used by the backend (`src/config/env.ts`):

| Variable | Purpose |
|----------|---------|
| `PUBLIC_APP_BASE_URL` | Public origin for file / preview links |
| `WHATSAPP_WEBHOOK_URL` | WhatsApp outbound messages |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` | Super Admin login (defaults exist for local) |
| `TENANT_ENFORCE` | Hard multi-tenant enforcement (`true` / unset) |
| `TENANT_PLUGIN_ENFORCE` | Mongoose plugin tenant scoping |
| `TENANT_LEGACY_ORPHAN_READ` | Allow docs without `tenantId` during migration |

Defaults if unset: `PORT=4000`, Mongo `mongodb://localhost:27017/btbiz_doctor`, Super Admin `superadmin@medigraph.com` / `Admin@123`.

### 1.4 Frontend environment

**Local (recommended):** leave API base empty so Vite proxies to the backend.

```env
# Btbiz_frontend/.env  (optional)
VITE_API_BASE_URL=
VITE_DEV_PROXY_TARGET=http://localhost:4000
```

**Production build:** set absolute HTTPS API origin in `.env.production`:

```env
VITE_API_BASE_URL=https://your-deployed-host.example.com
```

| Variable | Meaning |
|----------|---------|
| `VITE_API_BASE_URL` | Axios base URL. Empty in local → same-origin + Vite proxy |
| `VITE_DEV_PROXY_TARGET` | Backend target for proxy (default `http://localhost:4000`) |

### 1.5 Run locally (two terminals)

```bash
# Terminal 1 — API
cd Btbiz_backend
npm run dev
# → http://localhost:4000  (GET /health → { "status": "ok" })

# Terminal 2 — UI
cd Btbiz_frontend
npm run dev
# → http://localhost:5173
```

| Script | Where | What it does |
|--------|-------|----------------|
| `npm run dev` | backend | `ts-node-dev` hot reload |
| `npm run build` / `npm start` | backend | Compile to `dist/` then `node dist/server.js` (`prestart` builds) |
| `npm run dev` | frontend | Vite HMR on **5173** |
| `npm run build` | frontend | `tsc -b` + Vite production bundle → `dist/` |
| `npm run preview` | frontend | Preview production build |
| `npm run lint` | frontend | ESLint |
| `npm run test:gemini-rx` | backend | Local Gemini prescription test script |

Open **http://localhost:5173**. Staff entry: `/portal`. Patient: `/patient-login` or `/book-appointment`.

---

## 2. Architecture

### 2.1 High-level system

```
┌─────────────────┐     REST + JWT      ┌──────────────────────┐
│  React SPA      │◄───────────────────►│  Express API         │
│  Vite / Browser │     Socket.IO       │  + Socket.IO server  │
└────────┬────────┘◄───────────────────►└──────────┬───────────┘
         │                                         │
         │  Dev: Vite proxy                        ├── MongoDB (Mongoose)
         │  Prod: same origin static               ├── Uploads (disk / Buffer)
         │                                         ├── Tesseract OCR
         │                                         ├── Gemini (prescription AI)
         │                                         ├── SMTP / WhatsApp (optional)
         └─────────────────────────────────────────┘
```

**Local:** browser → Vite `:5173` → proxy → API `:4000`.  
**Production:** API serves `Btbiz_frontend/dist` as static SPA (`NODE_ENV=production`) and handles API + HTML fallback on one port.

### 2.2 Frontend structure

```
Btbiz_frontend/src/
├── App.tsx                 # Route table + toast + session dialog
├── main.tsx
├── pages/                  # One screen per route / role
├── components/
│   ├── ProtectedRoute.tsx / ProtectedPatientRoute.tsx
│   ├── layout/             # AppLayout, PublicLayout
│   ├── ui/                 # Button, Card, DataTable, TextField, …
│   └── …                   # Notifications, OCR UI, prescription helpers
├── services/api.ts         # axios instances, all API helpers, sockets origin
├── utils/                  # authStorage, patientStorage, login portals, …
├── constants/
└── styles/
```

**HTTP clients** (`services/api.ts`):

| Client | Auth | Used for |
|--------|------|----------|
| `api` | Staff JWT | `/patients`, `/appointments`, `/orders`, … |
| `patientApi` | Patient JWT | Patient portal |
| Public / family client | None | OTP, booking (avoids sending leftover staff JWT) |

**Auth gates:** `ProtectedRoute` checks staff role → redirect to role home. `ProtectedPatientRoute` requires patient JWT.

### 2.3 Backend structure

```
Btbiz_backend/src/
├── server.ts               # HTTP + Socket.IO + DB connect
├── app.ts                  # Middleware, routes, prod static SPA
├── config/                 # env, db, public base URL
├── routes/                 # auth, patients, public, appointments, orders, …
├── controllers/
├── services/               # patient, auth, Gemini, email, WhatsApp, tenants, …
├── models/                 # Doctor, Patient, Visit, PatientDocument, …
├── middleware/             # JWT staff, Super Admin, uploads
├── tenant/                 # Soft multi-tenant middleware + plugins
├── utils/
└── scripts/                # tenant backfill, Gemini Rx test
```

**Mounted API prefixes** (`app.ts`):

| Prefix | Purpose |
|--------|---------|
| `/auth` | Staff / Super Admin login, register |
| `/patients` | Staff patient CRUD, documents, AI extract, verify |
| `/public` | Booking, family OTP, public doctor data |
| `/public/patient` | Authenticated patient portal APIs |
| `/appointments` | Appointment operations |
| `/orders` | Lab / medicine request inbox for staff |
| `/pharmacy` | Dispense / pharmacy actions |
| `/notifications` | Doctor notification APIs |
| `/api/ocr` | OCR helper |
| `/super-admin` | Super Admin APIs (HTML GET `/` stays SPA) |
| `/health` | Liveness |

### 2.4 Roles & route map

| Role | UI routes | Typical work |
|------|-----------|--------------|
| Public | `/`, `/how-it-works`, `/doctors`, `/book-appointment` | Discover, book |
| Patient | `/patient-login`, `/patient-profile` | OTP, history, requests, uploads |
| Doctor | `/dashboard`, `/search-patients`, `/patient/:id`, `/ocr` | Appointments, history, OCR |
| Assistant | `/assistant` | Check-in, vitals, refer, Rx verify + AI |
| Lab assistant | `/lab` | Test requests, reports, payment |
| Lab manager | `/lab-manager`, `/lab` | Lab staff accounts |
| Pharmacy | `/medicine` | Medicine requests, dispense |
| Super Admin | `/super-admin`, `/super-admin/intelligence` | Approvals, tenants, analytics |

### 2.5 Data & domain flow (simplified)

```
Family OTP ──► FamilyAccount / FamilyMember ──► Visit (appointment)
Patient OTP ──► Patient JWT ──► profile / requests / uploads

Assistant upload ──► PatientDocument (PENDING_ASSISTANT)
                 ├── Tesseract OCR + parse hints
                 └── Gemini ai-extract (cached on document)
Assistant verify ──► verifiedExtract + PUBLISHED
                 └── Lab / Pharmacy secure preview uses structured data

PatientTestRequest / PatientMedicineRequest
  └── optional requestGroupId for multi-item groups
        └── LabDashboard / MedicineDashboard
```

### 2.6 Realtime (Socket.IO)

- Server attaches Socket.IO to the same HTTP server (`server.ts`).
- Clients pass `doctorId` in handshake query.
- Rooms: `doctor:{id}`, `assistants-of-doctor:{id}`, hospital desk room by `tenantId`.
- Events include referral alerts and doctor availability changes (consumed by frontend listeners).

### 2.7 Multi-tenancy

- Soft by default (`TENANT_ENFORCE` not `true`).
- `tenantMiddleware` resolves tenant context; Mongoose plugins can scope queries.
- Tenant types support clinic / pharmacy / lab style isolation for Super Admin–managed providers.
- Backfill: `npm run backfill:tenant` / `backfill:tenant:dry` in backend.

---

## 3. Deployment

### 3.1 Production model (current codebase)

One Node process serves **API + built SPA**:

1. Build frontend → `Btbiz_frontend/dist`
2. Build backend → `Btbiz_backend/dist`
3. Start with `NODE_ENV=production` so Express:
   - Serves `/assets` with long cache
   - Serves other static files from frontend `dist`
   - Falls back `GET *` → `index.html` (SPA routing)
   - Continues to serve all API routes above

Path used by backend: `Btbiz_backend/dist` → `../../Btbiz_frontend/dist` (sibling folders must stay next to each other).

### 3.2 Build & start (generic VPS / VM)

```bash
# Frontend
cd Btbiz_frontend
# Set VITE_API_BASE_URL in .env.production to your public HTTPS origin
# (same host is fine if API and SPA share one origin)
npm ci
npm run build

# Backend
cd ../Btbiz_backend
# Configure .env (MongoDB Atlas, JWT_SECRET, GEMINI_API_KEY, PUBLIC_APP_BASE_URL, …)
npm ci
npm run build

NODE_ENV=production PORT=5000 node dist/server.js
```

Root monorepo helpers (paths assume Replit-style workspace):

```bash
# from repo root
npm run build   # installs + builds frontend then backend
npm start       # NODE_ENV=production PORT=5000 node Btbiz_backend/dist/server.js
```

Adjust root scripts if your host paths differ from `/home/runner/workspace/...`.

### 3.3 Environment checklist (production)

- [ ] Strong `JWT_SECRET`
- [ ] `MONGODB_URI` (Atlas or managed Mongo)
- [ ] `NODE_ENV=production`
- [ ] `PORT` as required by host (e.g. `5000`)
- [ ] `PUBLIC_APP_BASE_URL=https://your-domain` (no trailing slash)
- [ ] `VITE_API_BASE_URL` matching the public origin used by the browser
- [ ] `GEMINI_API_KEY` if AI verify is required
- [ ] SMTP / WhatsApp if OTP & messaging must work in prod
- [ ] Super Admin password changed from defaults
- [ ] CORS: origins already allow `*.replit.app`, `*.replit.dev`, `*.trycloudflare.com`, localhost; add custom domain in `app.ts` / Socket.IO CORS if needed

### 3.4 Hosting notes

| Topic | Behavior |
|-------|----------|
| Reverse proxy / TLS | `trust proxy` is enabled for correct protocol/host |
| Health check | `GET /health` → `{ "status": "ok" }` |
| Uploads | Stored under backend uploads root; ensure persistent disk volume |
| WebSockets | Proxy must support `/socket.io` upgrade (ws) |
| Replit / Cloudflare | CORS allowlists already include common suffixes |
| Asset cache | Hashed `/assets/*` cached 1y; missing chunks return 404 + reload hint; HTML `no-store` |

### 3.5 Frontend-only vs combined deploy

- **Combined (default in code):** set `VITE_API_BASE_URL` to the same public origin (or relative empty if you inject at serve time carefully).
- **Split (CDN SPA + API):** host `Btbiz_frontend/dist` on static hosting; set `VITE_API_BASE_URL` to API origin; extend CORS allowlist for the SPA origin; Socket.IO must reach the API host.

---

## 4. Technical details

### 4.1 Stack versions (from package.json)

| Layer | Libraries |
|-------|-----------|
| Frontend | React 19, React Router 7, Vite 7, TypeScript 5.9, Axios, Tailwind 4, react-toastify, socket.io-client, recharts |
| Backend | Express 4, Mongoose 8, JWT, bcrypt, multer, Helmet, CORS, Morgan, Socket.IO 4, Tesseract.js, pdf-parse, Nodemailer |

### 4.2 Auth model

| Actor | Mechanism |
|-------|-----------|
| Staff (Doctor, Assistant, Lab, Pharmacy, …) | JWT in `Authorization: Bearer` via `authenticateDoctor` |
| Super Admin | Separate env credentials + `authenticateSuperAdmin` |
| Patient | OTP → patient JWT (`type: patient`) on `patientApi` |
| Family booking | OTP on family account (members linked for booking) |

Sessions expire per `JWT_EXPIRES_IN`. Frontend shows `SessionExpiredDialog` and clears storage.

### 4.3 Prescription pipeline

1. Staff uploads file → `PatientDocument` (`fileData` / path, `PENDING_ASSISTANT`).
2. Tesseract OCR → `ocrText` + keyword `suggestedParse`.
3. Assistant opens verify modal → `POST .../documents/:id/ai-extract` (Gemini JSON schema, cached as `aiExtract`).
4. Assistant edits structured medicines / tests / notes → `PATCH .../verify-for-patient`.
5. Document published for patient; lab/pharmacy use verified structured preview (not free-form OCR alone).

Supported AI mime types: JPEG, PNG, WEBP, HEIC/HEIF, PDF (see `geminiPrescriptionService`). Without `GEMINI_API_KEY`, verify still works with OCR/manual entry.

### 4.4 Lab & pharmacy multi-item requests

- Patient portal can submit arrays of tests / medicines.
- Backend stores rows with shared `requestGroupId` when count > 1.
- Order APIs group items; dashboards list one line per test/medicine.

### 4.5 Vite proxy map (local)

Proxied to `VITE_DEV_PROXY_TARGET`:

- `/auth`, `/public`, `/patients`, `/appointments`, `/orders`, `/pharmacy`, `/notifications`
- `/super-admin` — API only; HTML document requests bypass to `index.html`
- `/socket.io` — WebSocket

### 4.6 Security-related middleware

- Helmet CSP tuned for blob document previews (`object-src` / `frame-src` include `blob:`)
- CORS origin allowlist (no Error callback that would 500)
- Role checks on document file access and verify endpoints
- Rate limits / validation on sensitive public OTP routes (backend)

### 4.7 Key models (backend)

`Doctor`, `Patient`, `Visit`, `PatientDocument`, `FamilyAccount`, `FamilyMember`, `PatientTestRequest`, `PatientMedicineRequest`, `PharmacyDispensation`, `DiagnosticTest`, `DoctorNotification`, `Tenant`, `AnalyticsEvent`, …

### 4.8 Demo walkthrough (for submission)

1. Start MongoDB + backend `npm run dev` + frontend `npm run dev`
2. Open `/` → `/book-appointment` (OTP family book) or `/portal` for staff
3. Super Admin approve doctor if needed → Doctor dashboard
4. Assistant: create visit / upload Rx → AI verify → release
5. Patient profile: request multiple tests/medicines from last prescription suggestions
6. Lab + Pharmacy dashboards: accept and complete grouped requests

### 4.9 Troubleshooting

| Issue | Fix |
|-------|-----|
| API 404 / network errors in local | Backend on 4000; empty `VITE_API_BASE_URL`; restart Vite after proxy changes |
| Code changes not applying on API | Using `npm start` → rebuild or switch to `npm run dev` |
| AI verify empty / 503 | Set `GEMINI_API_KEY`, restart backend; use image/PDF |
| Prod blank page / old JS | Rebuild frontend; hard refresh; `/assets` 404 means stale chunk — reload |
| Socket not connecting | Ensure proxy/ws support; same CORS rules as HTTP |
| SPA route 404 on refresh (prod) | Must run with `NODE_ENV=production` so `GET *` → `index.html` |

---

## License

Backend package: MIT. Frontend package is private (`"private": true`).
