import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { SEP10Service } from '../src/services/sep10.service.js';

describe('SEP10Service', () => {
  it('should generate a valid challenge transaction for a client account', async () => {
    const clientKeypair = Keypair.random();
    const challenge = await SEP10Service.buildChallengeTx(clientKeypair.publicKey());

    expect(challenge.transaction).toBeDefined();
    expect(challenge.network_passphrase).toBeDefined();
  });

  it('should issue and verify JWT tokens containing user roles and claims', () => {
    const testPayload = {
      publicKey: 'GBDP5K4GJBEUSNVTSFDPVD76S5WJ5QQENYCIZIQRVRJ5JCUAKOIX2LPC',
      role: 'REGULATOR',
      orgName: 'National Health Oversight',
    };

    const token = SEP10Service.issueToken(testPayload);
    expect(token).toBeDefined();

    const decoded = SEP10Service.verifyToken(token);
    expect(decoded.publicKey).toBe(testPayload.publicKey);
    expect(decoded.role).toBe(testPayload.role);
    expect(decoded.orgName).toBe(testPayload.orgName);
  });
});
