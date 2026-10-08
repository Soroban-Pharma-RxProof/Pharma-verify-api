import { PrismaClient, UserRole } from '@prisma/client';
import { SerialService } from '../src/services/serial.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed for Soroban Pharma RxProof API...');

  // 1. Seed Roles & Participants
  const regulator = await prisma.user.upsert({
    where: { stellarAddress: 'GBDP5K4GJBEUSNVTSFDPVD76S5WJ5QQENYCIZIQRVRJ5JCUAKOIX2LPC' },
    update: {},
    create: {
      stellarAddress: 'GBDP5K4GJBEUSNVTSFDPVD76S5WJ5QQENYCIZIQRVRJ5JCUAKOIX2LPC',
      role: UserRole.REGULATOR,
      active: true,
    },
  });

  const manufacturer = await prisma.user.upsert({
    where: { stellarAddress: 'GAKDLYVCFW2W6XZUFLKFF7DEX2G5V5L77V46F7Y5Y2H5Y3Y6Y7Y8Y9AA' },
    update: {},
    create: {
      stellarAddress: 'GAKDLYVCFW2W6XZUFLKFF7DEX2G5V5L77V46F7Y5Y2H5Y3Y6Y7Y8Y9AA',
      role: UserRole.MANUFACTURER,
      active: true,
    },
  });

  const distributor = await prisma.user.upsert({
    where: { stellarAddress: 'GBX56R5FLKZ774K24JJL5N4M2L3Q6X7Y8Z9AA112233445566778899BB' },
    update: {},
    create: {
      stellarAddress: 'GBX56R5FLKZ774K24JJL5N4M2L3Q6X7Y8Z9AA112233445566778899BB',
      role: UserRole.DISTRIBUTOR,
      active: true,
    },
  });

  const pharmacy = await prisma.user.upsert({
    where: { stellarAddress: 'GCY77R6GMKZ885L35KKL6O5N3M4R7Y8Z9AA223344556677889900CC' },
    update: {},
    create: {
      stellarAddress: 'GCY77R6GMKZ885L35KKL6O5N3M4R7Y8Z9AA223344556677889900CC',
      role: UserRole.PHARMACY,
      active: true,
    },
  });

  console.log('✅ Seeded Users: Regulator, Manufacturer, Distributor, Pharmacy');

  // 2. Seed a Sample Batch
  const batchId = 'ACT-500-2026-B1';
  const totalQuantity = 10;
  const generated = await SerialService.generateBatchSerials(batchId, totalQuantity);

  const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600); // 1 year from now

  const batch = await prisma.batch.upsert({
    where: { batchId },
    update: {},
    create: {
      batchId,
      productName: 'Artemether-Lumefantrine 20/120mg (Antimalarial)',
      dosage: 'Tablets',
      totalQuantity,
      totalStrips: 2,
      unitsPerStrip: 12,
      expiryTimestamp,
      merkleRoot: generated.merkleRoot,
      metadataHash: '0x00',
      status: 'ACTIVE',
      manufacturerAddress: manufacturer.stellarAddress,
      currentCustodian: pharmacy.stellarAddress,
    },
  });

  console.log(`✅ Seeded Batch: ${batchId} with ${totalQuantity} packs and Merkle Root: ${generated.merkleRoot}`);

  // 3. Mark one serial as already dispensed for clone testing
  const firstSerialHash = generated.packs[0].serialHash;
  await prisma.packSerial.update({
    where: { serialHash: firstSerialHash },
    data: {
      isDispensed: true,
      dispensedStripsMask: 0xffffffff,
    },
  });

  await prisma.dispenseLog.create({
    data: {
      batchId,
      serialHash: firstSerialHash,
      pharmacyAddress: pharmacy.stellarAddress,
      txHash: '0xmock_burn_tx_hash_2026',
      stripIndex: null,
    },
  });
  console.log(`✅ Seeded Burned Pack (Clone Test): Serial Hash ${firstSerialHash}`);

  // 4. Seed Custody Logs
  await prisma.custodyLog.create({
    data: {
      batchId,
      fromAddress: manufacturer.stellarAddress,
      toAddress: distributor.stellarAddress,
      txHash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
      ledgerSequence: 100001n,
    },
  });

  await prisma.custodyLog.create({
    data: {
      batchId,
      fromAddress: distributor.stellarAddress,
      toAddress: pharmacy.stellarAddress,
      txHash: '1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e',
      ledgerSequence: 100050n,
    },
  });
  console.log('✅ Seeded Custody chain history (Manufacturer -> Distributor -> Pharmacy)');

  // 5. Seed Checkpoint
  await prisma.indexerCheckpoint.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      lastLedger: 100000n,
    },
  });

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
