# Contributing to Pharma Verify API

Thank you for your interest in contributing to **Pharma Verify API**, the high-throughput Fastify and Prisma backend microservice providing SEP-10 authentication, cryptographic Merkle proof calculations, Soroban event indexing, and real-time counterfeit anomaly detection for the RxProof ecosystem.

---

## Code of Conduct

All contributors and maintainers must maintain a professional, collaborative, and inclusive environment. Harassment of any kind will not be tolerated.

---

## Prerequisites

- **Node.js**: `v20.x` LTS or later
- **npm**: `v10.x` or later
- **PostgreSQL**: `v16.x`
- **Docker & Docker Compose** (recommended for local PostgreSQL service)

---

## Local Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/<your-username>/Pharma-verify-api.git
   cd Pharma-verify-api
   ```

2. **Install Dependencies:**
   ```bash
   npm ci
   ```

3. **Start Local Database:**
   ```bash
   docker run --name rxproof-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pharma_rxproof -p 5432:5432 -d postgres:16-alpine
   ```

4. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pharma_rxproof?schema=public"
   PORT=4000
   JWT_SECRET="local-dev-jwt-secret-at-least-32-chars-long!"
   AES_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
   ```

5. **Run Prisma Migrations & Generate Client:**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

6. **Start Development Server:**
   ```bash
   npm run dev
   ```

---

## Verification & Testing

Before submitting a Pull Request, verify your changes pass all quality checks:

```bash
# Typecheck
npm run lint

# Run Unit and Integration Test Suites
npm test

# Build production bundle
npm run build
```

---

## Branching & Commit Message Format

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat:` New endpoints or background services
- `fix:` Bug fixes or data consistency patches
- `docs:` Documentation improvements
- `test:` Adding or refining test coverage
- `refactor:` Code improvements without behavioral change
- `ci:` Pipeline and container adjustments
- `chore:` Dependency maintenance

---

## Pull Request Guidelines

1. Ensure new endpoints have corresponding route documentation and Swagger schema definitions.
2. If modifying schema models, include the migration SQL generated via Prisma.
3. Open a Pull Request referencing the tracked issue ID.
