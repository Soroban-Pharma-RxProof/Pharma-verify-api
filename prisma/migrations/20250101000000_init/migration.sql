-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('REGULATOR', 'MANUFACTURER', 'DISTRIBUTOR', 'PHARMACY', 'ADMIN');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "stellarAddress" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "nonce" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantApplication" (
    "id" TEXT NOT NULL,
    "applicantAddress" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseDocUrl" TEXT NOT NULL,
    "metadataHash" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "onChainTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "manufacturerAddress" TEXT NOT NULL,
    "currentCustodian" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "dispensedCount" INTEGER NOT NULL DEFAULT 0,
    "totalStrips" INTEGER NOT NULL DEFAULT 1,
    "unitsPerStrip" INTEGER NOT NULL DEFAULT 10,
    "expiryTimestamp" BIGINT NOT NULL,
    "metadataHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "recallReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackSerial" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "serialHash" TEXT NOT NULL,
    "encryptedSerial" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "leafIndex" INTEGER NOT NULL,
    "isDispensed" BOOLEAN NOT NULL DEFAULT false,
    "dispensedStripsMask" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "ledgerSequence" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "serialHash" TEXT NOT NULL,
    "pharmacyAddress" TEXT NOT NULL,
    "stripIndex" INTEGER,
    "txHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispenseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyAlert" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "serialHash" TEXT,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnomalyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCheckpoint" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastLedger" BIGINT NOT NULL DEFAULT 0,
    "lastCursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stellarAddress_key" ON "User"("stellarAddress");
CREATE INDEX "User_stellarAddress_idx" ON "User"("stellarAddress");
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantApplication_applicantAddress_key" ON "ParticipantApplication"("applicantAddress");
CREATE INDEX "ParticipantApplication_status_idx" ON "ParticipantApplication"("status");
CREATE INDEX "ParticipantApplication_role_idx" ON "ParticipantApplication"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchId_key" ON "Batch"("batchId");
CREATE INDEX "Batch_batchId_idx" ON "Batch"("batchId");
CREATE INDEX "Batch_manufacturerAddress_idx" ON "Batch"("manufacturerAddress");
CREATE INDEX "Batch_currentCustodian_idx" ON "Batch"("currentCustodian");
CREATE INDEX "Batch_status_idx" ON "Batch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PackSerial_serialHash_key" ON "PackSerial"("serialHash");
CREATE INDEX "PackSerial_batchId_idx" ON "PackSerial"("batchId");
CREATE INDEX "PackSerial_serialHash_idx" ON "PackSerial"("serialHash");

-- CreateIndex
CREATE INDEX "CustodyLog_batchId_idx" ON "CustodyLog"("batchId");
CREATE INDEX "CustodyLog_fromAddress_idx" ON "CustodyLog"("fromAddress");
CREATE INDEX "CustodyLog_toAddress_idx" ON "CustodyLog"("toAddress");

-- CreateIndex
CREATE INDEX "DispenseLog_batchId_idx" ON "DispenseLog"("batchId");
CREATE INDEX "DispenseLog_serialHash_idx" ON "DispenseLog"("serialHash");
CREATE INDEX "DispenseLog_pharmacyAddress_idx" ON "DispenseLog"("pharmacyAddress");

-- CreateIndex
CREATE INDEX "AnomalyAlert_rule_idx" ON "AnomalyAlert"("rule");
CREATE INDEX "AnomalyAlert_severity_idx" ON "AnomalyAlert"("severity");
CREATE INDEX "AnomalyAlert_resolved_idx" ON "AnomalyAlert"("resolved");

-- AddForeignKey
ALTER TABLE "ParticipantApplication" ADD CONSTRAINT "ParticipantApplication_applicantAddress_fkey" FOREIGN KEY ("applicantAddress") REFERENCES "User"("stellarAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackSerial" ADD CONSTRAINT "PackSerial_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("batchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyLog" ADD CONSTRAINT "CustodyLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("batchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseLog" ADD CONSTRAINT "DispenseLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("batchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyAlert" ADD CONSTRAINT "AnomalyAlert_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("batchId") ON DELETE SET NULL ON UPDATE CASCADE;
