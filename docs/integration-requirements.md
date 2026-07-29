# External Integration Requirements

This document describes the prerequisites and field definitions for each external integration available under **Settings → Integrations** in the NRS Risk Management Portal. All integrations are stored as JSON in the `system_settings` table under the listed `setting_key`. The current UI is a configuration placeholder — API wiring will be activated as each integration moves from "Coming Soon" to "Configured".

---

## 1. M-Files EDRMS (`integration_mfiles`)

**Purpose** — Sync the Control Document Repository with the enterprise document management system. Provides version control, check-in/check-out, and metadata-driven retrieval.

| Field | Description |
|-------|-------------|
| `endpoint` | M-Files server base URL (e.g. `https://mfiles.company.com`) |
| `vault_id` | Vault GUID (e.g. `{ABC123-...-XYZ}`) |
| `api_key` | Application token issued by the vault administrator |

**Onboarding** — Request a service application registration from the M-Files admin team. Required scopes: read/write on the configured vault, plus access to standard object types (Document, Policy).

---

## 2. Active Directory (`integration_active_directory`)

**Purpose** — Single Sign-On (SSO) and automated user/role provisioning. Maps AD security groups to NRS roles (RC/RR/RO/RMD/CRO/etc.).

| Field | Description |
|-------|-------------|
| `domain` | AD domain name (e.g. `corp.company.com`) |
| `ldap_url` | LDAP/LDAPS endpoint (e.g. `ldaps://ad.company.com:636`) |
| `bind_dn` | Distinguished Name of a read-only service account |
| `bind_password` | Service account password |

**Onboarding** — Provision a service account with read access to the user and group OUs. Group-to-role mapping is maintained server-side and reviewed quarterly.

---

## 3. CAC Registry (`integration_cac`)

**Purpose** — Verify taxpayer corporate registration details against the **Corporate Affairs Commission** registry during compliance risk creation.

| Field | Description |
|-------|-------------|
| `endpoint` | CAC API base URL |
| `environment` | `sandbox` or `production` |
| `api_key` | API key issued by CAC eRegistration |

**Onboarding** — Apply via CAC eRegistration for an Integration Partner account. Use sandbox keys for testing; production keys are issued after CAC review.

---

## 4. NIMC (`integration_nimc`)

**Purpose** — National Identity verification for officers, treatment owners, and other key contacts.

| Field | Description |
|-------|-------------|
| `endpoint` | NIMC API base URL |
| `merchant_id` | Merchant / Agent ID assigned by NIMC |
| `api_key` | API key |

**Onboarding** — Accreditation required under the NIMC Verification Service Provider (VSP) program. Includes legal review and a security assessment.

---

## 5. NITDA (`integration_nitda`)

**Purpose** — File annual data-protection compliance reports and submit breach notifications under the **Nigeria Data Protection Act (NDPA)**.

| Field | Description |
|-------|-------------|
| `endpoint` | NITDA reporting API endpoint |
| `organisation_code` | Code issued upon NDPA registration |
| `api_key` | API key |

**Onboarding** — Register the organisation with NITDA via its DPCO portal. Codes are issued on completion of the NDPA registration cycle.

---

## Implementation Status

All five integrations currently render as **placeholders**. The Lovable Cloud schema reserves storage for credentials and exposes an enable toggle. Once the corresponding edge function is deployed, the integration card will switch from **Coming Soon** to **Configured** automatically based on `setting_value.status`.
