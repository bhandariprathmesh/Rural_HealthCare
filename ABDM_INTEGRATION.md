# ABDM Integration Architecture & Mock Adapter Guide
**RuralCare — Smart India Hackathon 2026 (SIH 26133)**  
**Target Milestone Compliance**: ABDM M1 (ABHA), M2 (HPR/HFR), M3 (Consent Manager)

---

## 1. Overview & Context

Real ABDM Sandbox access requires an approved NHA developer account, client credentials, and mutual TLS certificates. To prevent blocking core clinical and referral workflows while developer approval is pending, RuralCare implements a **pluggable Adapter pattern**:

```
                                    +-----------------------+
                                    |    RuralCare APIs     |
                                    | (Patients, Consents)  |
                                    +-----------------------+
                                                |
                                                v
                                    +-----------------------+
                                    |   <<AbdmAdapter>>     |
                                    |  TypeScript Interface |
                                    +-----------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
        +-------------------------------+               +-------------------------------+
        |        MockAbdmAdapter        |               |        RealAbdmAdapter        |
        | - Backed by PostgreSQL DB     |               | - ABDM Gateway (dev.abdm.gov) |
        | - Seeded HPR/HFR/ABHA records |               | - M1/M2/M3 OAuth & mTLS       |
        | - isMock: true, source: "mock"|               | - Swapped via ABDM_MODE=live  |
        +-------------------------------+               +-------------------------------+
```

---

## 2. The `AbdmAdapter` Interface Contract

All components communicate through `server/src/services/abdm/abdm.interface.ts`:

* `createAbhaByMobile(params)`: Generates compliant 14-digit ABHA (`91-XXXX-XXXX-XXXX`) and `@abdm` address.
* `verifyAbha(identifier)`: Validates 14-digit format or looks up existing seeded patient records.
* `lookupHprDoctor(hprId)`: Validates doctor against Healthcare Professionals Registry.
* `lookupHfrFacility(hfrId)`: Validates PHC/CHC/DH against Health Facility Registry.
* `requestConsent(params)`: Dispatches consent artifact for patient record sharing.
* `checkConsentStatus(consentCode)`: Polls consent status (`GRANTED`, `REVOKED`, `EXPIRED`).

---

## 3. Mock Data & Database Transparency

Every response from `MockAbdmAdapter` contains explicit transparency flags:
```json
{
  "isMock": true,
  "source": "mock"
}
```
This guarantees that judges or auditors inspecting the database or network tab can instantly distinguish simulated test records from official government registries.

### Seeded Mock Registries Available Locally:

* **Doctor HPR IDs**:
  - `HPR-2024-00142`: Dr. Ankit Sharma (PHC Lunkaransar)
  - `HPR-2024-00289`: Dr. Priya Mehta (CHC Bikaner)
  - `HPR-2024-00371`: Dr. Suresh Gupta (District Hospital Bikaner)
* **Facility HFR IDs**:
  - `HFR-2024-00891`: PHC Lunkaransar
  - `HFR-2024-00289`: CHC Bikaner
  - `HFR-2024-00371`: District Hospital Bikaner
  - `HFR-2024-00892` to `HFR-2024-00895`: PHC Kolayat, Nokha, Deshnok, Dungargarh

---

## 4. Active ABDM REST Endpoints

The mock adapter is wired to the following live endpoints under `/api/v1/abdm`:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/abdm/abha/create` | Generates 14-digit ABHA from mobile number & demographic data |
| `POST` | `/api/v1/abdm/abha/verify` | Verifies ABHA number or address against database |
| `GET`  | `/api/v1/abdm/hpr/:hprId` | Fetches doctor credentials and facility association |
| `GET`  | `/api/v1/abdm/hfr/:hfrId` | Fetches facility accreditation, type, and GPS coordinates |
| `POST` | `/api/v1/abdm/consent/request` | Creates patient consent artifact with granular data scope |
| `GET`  | `/api/v1/abdm/consent/:consentCode/status` | Returns consent lifecycle state |

---

## 5. How to Switch to Live ABDM Sandbox

Once NHA developer approval is received:

1. Open `server/.env`
2. Add your sandbox credentials:
   ```env
   ABDM_MODE="live"
   ABDM_SANDBOX_BASE_URL="https://dev.abdm.gov.in/gateway"
   ABDM_CLIENT_ID="your_nha_client_id"
   ABDM_CLIENT_SECRET="your_nha_client_secret"
   ```
3. Restart the backend (`npm run dev`).
4. The factory `getAbdmAdapter()` will automatically instantiate `RealAbdmAdapter` without any refactoring of routes or controllers.
