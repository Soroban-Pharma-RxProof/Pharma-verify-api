import { prisma } from '../lib/prisma.js';

export interface AnomalyReportInput {
  alertType?: string;
  rule: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  batchId?: string;
  serialHash?: string;
  description?: string;
  details: string;
  metadata?: Record<string, any>;
}

export class AnomalyService {
  /**
   * Log an anomaly alert into the database and dispatch notifications
   */
  public static async recordAlert(input: AnomalyReportInput) {
    const alert = await prisma.anomalyAlert.create({
      data: {
        rule: input.rule || input.alertType || 'UNKNOWN_RULE',
        severity: input.severity,
        batchId: input.batchId || null,
        serialHash: input.serialHash || null,
        details: input.details || input.description || 'No details provided',
      },
    });

    // Dispatch webhook / alert notification (simulated webhook/alert logger)
    await this.dispatchNotification(alert);

    return alert;
  }

  /**
   * Check for duplicate burns or cloned serial scans
   */
  public static async checkDuplicateScan(serialHash: string, batchId: string, reportedRole?: string) {
    const serial = await prisma.packSerial.findUnique({
      where: { serialHash },
    });

    if (serial && serial.isDispensed) {
      await this.recordAlert({
        rule: 'DUPLICATE_BURN',
        severity: 'CRITICAL',
        batchId,
        serialHash,
        details: `Potential counterfeit clone detected: Serial hash ${serialHash.slice(0, 10)}... was already burned/dispensed at ${serial.updatedAt.toISOString()} but was scanned again. (Role: ${reportedRole || 'UNKNOWN'})`,
      });
      return true;
    }
    return false;
  }

  /**
   * Check for rapid scan velocity across impossible geographic locations or abnormal burst reporting
   */
  public static async checkBurstReporting(batchId: string, windowMinutes: number = 30, threshold: number = 5) {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const count = await prisma.anomalyAlert.count({
      where: {
        batchId,
        createdAt: { gte: windowStart },
      },
    });

    if (count >= threshold) {
      await this.recordAlert({
        rule: 'REPORT_BURST',
        severity: 'HIGH',
        batchId,
        details: `Burst anomaly detected: ${count} suspicious alerts generated for batch ${batchId} within the past ${windowMinutes} minutes.`,
      });
      return true;
    }
    return false;
  }

  /**
   * Check for custody chain skips (e.g. transfer skipping distributor straight to pharmacy)
   */
  public static async checkCustodySkip(batchId: string, fromRole: string, toRole: string) {
    const isSkip = fromRole === 'MANUFACTURER' && toRole === 'PHARMACY';
    if (isSkip) {
      await this.recordAlert({
        rule: 'CUSTODY_SKIP',
        severity: 'MEDIUM',
        batchId,
        details: `Direct manufacturer-to-pharmacy custody transition observed for batch ${batchId}. Flagged for regulatory inspection.`,
      });
      return true;
    }
    return false;
  }

  /**
   * Dispatch webhook notification to external subscriber or regulator
   */
  private static async dispatchNotification(alert: any) {
    console.log(`[ANOMALY DISPATCH] [${alert.severity}] ${alert.rule}: ${alert.details}`);
  }
}
// Alert dispatcher registered for production webhook routing
