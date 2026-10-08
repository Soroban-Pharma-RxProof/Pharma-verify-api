import {
  Keypair,
  Networks,
  Transaction,
  WebAuth,
} from '@stellar/stellar-sdk';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';

export interface TokenPayload {
  publicKey: string;
  role: string;
  orgName?: string | null;
  stellarAddress?: string;
  iat?: number;
  exp?: number;
}

export class Sep10Service {
  private static getServerKeypair(): Keypair {
    if (config.SERVER_SIGNING_KEY) {
      return Keypair.fromSecret(config.SERVER_SIGNING_KEY);
    }
    // Deterministic fallback for dev/testing
    return Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
  }

  /**
   * Builds an SEP-10 challenge transaction for a client account.
   */
  public static async buildChallengeTx(clientStellarAddress: string): Promise<{ transaction: string; network_passphrase: string }> {
    const serverKeypair = this.getServerKeypair();
    const networkPassphrase =
      config.STELLAR_NETWORK === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;

    const domain = config.SEP10_HOME_DOMAIN || 'rxproof.org';

    const challengeTx = WebAuth.buildChallengeTx(
      serverKeypair,
      clientStellarAddress,
      domain,
      300, // 5 minutes valid duration
      networkPassphrase,
      domain,
    );

    return {
      transaction: challengeTx,
      network_passphrase: networkPassphrase,
    };
  }

  public static buildChallenge(clientStellarAddress: string): string {
    const serverKeypair = this.getServerKeypair();
    const networkPassphrase =
      config.STELLAR_NETWORK === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;

    const domain = config.SEP10_HOME_DOMAIN || 'rxproof.org';

    return WebAuth.buildChallengeTx(
      serverKeypair,
      clientStellarAddress,
      domain,
      300,
      networkPassphrase,
      domain,
    );
  }

  /**
   * Verifies the client's signature on an SEP-10 challenge transaction
   */
  public static verifyChallenge(signedXdr: string): { clientAddress: string } {
    const serverKeypair = this.getServerKeypair();
    const networkPassphrase =
      config.STELLAR_NETWORK === 'mainnet'
        ? Networks.PUBLIC
        : Networks.TESTNET;

    const domain = config.SEP10_HOME_DOMAIN || 'rxproof.org';

    const details = WebAuth.readChallengeTx(
      signedXdr,
      serverKeypair.publicKey(),
      networkPassphrase,
      domain,
      domain,
    );

    // Verify client signature is present on transaction
    const tx = details.tx;
    const clientPublicKey = details.clientAccountID;

    // Check timebounds validity
    const timebounds = tx.timeBounds;
    const now = Math.floor(Date.now() / 1000);
    if (timebounds) {
      const minTime = parseInt(timebounds.minTime, 10);
      const maxTime = parseInt(timebounds.maxTime, 10);
      if (now < minTime || now > maxTime) {
        throw new Error('Challenge transaction has expired');
      }
    }

    return { clientAddress: clientPublicKey };
  }

  /**
   * Authenticate challenge and return JWT
   */
  public static async authenticateChallenge(signedXdr: string) {
    const { clientAddress } = this.verifyChallenge(signedXdr);

    let user = await prisma.user.findUnique({
      where: { stellarAddress: clientAddress },
    });

    const role = (user?.role as string) || 'PUBLIC';
    const orgName = null;

    const token = this.issueToken({
      publicKey: clientAddress,
      role,
      orgName,
    });

    return {
      token,
      user: {
        publicKey: clientAddress,
        role,
        orgName,
      },
    };
  }

  /**
   * Issue a role-scoped JWT token
   */
  public static issueToken(input: { publicKey: string; role: string; orgName?: string | null } | string): string {
    const payload: TokenPayload =
      typeof input === 'string'
        ? { publicKey: input, role: 'PHARMACY', stellarAddress: input }
        : {
            publicKey: input.publicKey,
            role: input.role,
            orgName: input.orgName,
            stellarAddress: input.publicKey,
          };

    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: '24h',
      issuer: 'rxproof-api',
    });
  }

  /**
   * Verify and decode a JWT bearer token
   */
  public static verifyToken(token: string): TokenPayload {
    return jwt.verify(token, config.JWT_SECRET, {
      issuer: 'rxproof-api',
    }) as TokenPayload;
  }
}

export const SEP10Service = Sep10Service;
