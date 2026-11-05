# Soroban Pharma RxProof API 🛡️💊

Enterprise backend service for counterfeit medicine verification, batch custody tracking, and supply chain anomaly detection powered by **Stellar Soroban smart contracts**.

[![CI](https://github.com/Soroban-Pharma-RxProof/Pharma-verify-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Soroban-Pharma-RxProof/Pharma-verify-api/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Stellar: Soroban v22](https://img.shields.io/badge/Soroban-SDK%20v22-brightgreen.svg)](https://stellar.org)
[![Fastify: 5.x](https://img.shields.io/badge/Fastify-5.2-black.svg?logo=fastify)](https://fastify.dev/)
[![Prisma: 6.x](https://img.shields.io/badge/Prisma-6.4-2D3748.svg?logo=prisma)](https://www.prisma.io/)
[![Database: PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-336791.svg?logo=postgresql)](https://www.postgresql.org/)

---

## 🏛️ Architecture Overview

The **Pharma-Verify-API** serves as the cryptographic and operational bridge between off-chain enterprise ERPs / manufacturing lines and the immutable **Soroban smart contract** (`CA2JMBWAT2DDZZHCULUJXWBZ7N27QO2LRADSPNR4CDUULBWIGCJ2CAZO`) deployed on Stellar Testnet.

```
                              ┌───────────────────────────────────┐
                              │     Stellar Network / Soroban     │
                              │  (RxProofContract v22 on Testnet) │
                              └──────────────▲───┬────────────────┘
                                             │   │
                     Contract Invocations    │   │ Soroban RPC getEvents
                     & Proof Verifications   │   │ (Ledger Checkpoint Poller)
                                             │   ▼
┌─────────────────────────┐           ┌───────────────────────────────────┐
│ Next.js Web App / PWA   │◄─────────►│       Pharma-Verify-API (Fastify) │
│ • Public Verifier       │  REST API │ • SEP-10 Stellar Web3 Auth        │
│ • Pharmacy Scanner      │   + JWT   │ • Sorted-Pair Merkle Tree Engine  │
│ • Regulator Dashboard   │           │ • AES-256-GCM Encrypted Serials   │
└─────────────────────────┘           │ • Anomaly Detection Heuristics    │
                                      └──────────────▲────────────────────┘
                                                     │
                                                     ▼
                                      ┌───────────────────────────────────┐
                                      │   PostgreSQL 16 Storage (Prisma)  │
                                      │ • Batches & Merkle Roots          │
                                      │ • Encrypted Pack Serials          │
                                      │ • Custody & Dispense Audit Logs   │
                                      │ • Anomaly Alerts & Checkpoints    │
                                      └───────────────────────────────────┘
```

---

## 🔒 Threat Model & Security Mitigations

### 1. Counterfeit Serial Cloning & QR Replay Attacks
- **Threat**: Counterfeiters print authentic serial numbers copied from genuine packs onto thousands of fake cartons.
- **Mitigation**: Every pack serial is **burned upon first dispense** on the Soroban smart contract and recorded in the database. Any subsequent scan of a previously dispensed serial instantly returns `SUSPICIOUS_CLONED`, dispatches a `CRITICAL` anomaly alert to regulators, and pins the geographical and temporal delta of the duplicate event.

### 2. Rogue Participant / Supply Chain Bypassing
- **Threat**: A rogue distributor attempts to sell diverted medicine batches directly to consumer markets without legitimate chain of custody.
- **Mitigation**: The on-chain contract and backend enforce strict linear custody progression: `Manufacturer ➔ Distributor ➔ Pharmacy`. Only the entity currently designated as `current_custody` can transfer custody or dispense packs. Direct jumps (e.g. `Manufacturer ➔ Pharmacy`) trigger automatic `CUSTODY_SKIP` alerts.

### 3. Merkle Tree Preimage & Proof Malleability
- **Threat**: Forging artificial Merkle inclusion proofs to pass unissued packs as genuine.
- **Mitigation**: Off-chain tree generation and on-chain Soroban contract verification strictly use **lexicographically sorted SHA-256 pairs**:
  $$\text{Parent} = \text{SHA256}(\min(A, B) \mathbin{\Vert} \max(A, B))$$
  Proof depth is capped at 32 steps to protect on-chain gas execution limits.

### 4. API Compromise & Serial Number Protection
- **Threat**: Database breach leaking unissued serial numbers to counterfeit syndicates.
- **Mitigation**: All individual serial numbers are encrypted at rest with **AES-256-GCM** using authenticated ciphertext tags. Public APIs only expose 32-byte leaf hashes (`serialHash`). The plaintext serial is only decrypted during authorized manufacturer label exports.

### 5. Sybil Reporting & Consumer Spam
- **Threat**: Bad actors flooding the reporting endpoint to trigger false alarms on competing brands.
- **Mitigation**: Anomaly detection applies time-windowed **burst rate algorithms** and correlates public adverse reports against verified batch records and on-chain status before escalating alert severity.

---

## ⚡ Core Features

1. **SEP-10 Stellar Authentication**: Cryptographic challenge-response wallet authentication issuing role-scoped JWT tokens (`REGULATOR`, `MANUFACTURER`, `DISTRIBUTOR`, `PHARMACY`).
2. **Dynamic Sorted-Pair Merkle Tree Engine**: Generates 32-byte cryptographic Merkle roots for batches up to 100,000 packs with isolated $O(\log N)$ proof extraction.
3. **Soroban RPC Event Indexer**: Resilient background daemon polling `getEvents`, updating database checkpoints, and keeping custody states synchronized in real-time.
4. **Automated Anomaly Detection Engine**: Continuous analysis of duplicate scans, out-of-order custody handoffs, and burst reporting.
5. **Interactive OpenAPI / Swagger Documentation**: Available at `/docs` with interactive request builders and schema models.

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20.0.0 LTS
- Docker and Docker Compose
- PostgreSQL 16 (or run via Docker)

### Environment Setup
Create a `.env` file based on `.env.example`:
```env
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pharma_rxproof?schema=public
STELLAR_NETWORK=TESTNET
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
CONTRACT_ID=CA2JMBWAT2DDZZHCULUJXWBZ7N27QO2LRADSPNR4CDUULBWIGCJ2CAZO
JWT_SECRET=rxproof_enterprise_jwt_secret_key_minimum_32_chars_2026
AES_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Installation
```bash
# Clone the repository
git clone https://github.com/Soroban-Pharma-RxProof/Pharma-verify-api.git
cd Pharma-verify-api

# Install dependencies deterministically
npm ci
```

### Database Initialization
```bash
# Run PostgreSQL container via Docker
docker run --name rxproof-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pharma_rxproof -p 5432:5432 -d postgres:16-alpine

# Apply Prisma migrations
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

### Development & Service Commands
```bash
# Start API dev server with live reload
npm run dev

# Start background Soroban event indexer daemon
npm run indexer

# Run unit and integration test suites
npm test

# Build production bundle
npm run build
npm start
```

---

## 🤝 Contributing & Security

- Read our [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflows and branching conventions.
- Consult [SECURITY.md](SECURITY.md) for vulnerability disclosure guidelines and cryptographic security details.

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).
Built for the Stellar Community and global pharmaceutical security.
