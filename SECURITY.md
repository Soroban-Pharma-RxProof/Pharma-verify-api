# Security Policy

## Supported Versions

Only the current major release of `Pharma-verify-api` on the `main` branch receives active security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

---

## Reporting a Vulnerability

The RxProof team treats all security issues affecting patient safety and cryptographic integrity with utmost urgency.

If you believe you have discovered a vulnerability in this API, please **DO NOT** disclose it through public GitHub issues or public forums.

Instead, please report it privately:
- **Email:** `security@rxproof.example`
- **GPG Key:** Available upon request

Please include:
1. Impact summary and potential exploitation scenario.
2. Step-by-step reproduction instructions or proof-of-concept curl commands.
3. Suggested patches or mitigations if available.

We will acknowledge receipt within 48 hours and work with you on coordinated disclosure.

---

## Threat Model & API Defenses

- **SEP-10 Cryptographic Authentication:** All mutating endpoints require valid SEP-10 signed challenges verifying Stellar cryptographic key custody.
- **Strict Role-Based Access Control (RBAC):** Endpoints enforce granular role checks (`REGULATOR`, `MANUFACTURER`, `DISTRIBUTOR`, `PHARMACY`).
- **Encrypted Serial Secrets:** Raw batch serial numbers are encrypted with AES-256-GCM before database storage; only cryptographic hashes and Merkle proofs are exposed.
- **Rate Limiting & Helmet:** Hardened with `@fastify/helmet` CSP headers and IP/account-based rate limiting to thwart brute-force and DoS probes.
- **Production Secret Guard:** Refuses to boot in `production` mode if default placeholder secrets (`JWT_SECRET`, `AES_ENCRYPTION_KEY`) are detected.
