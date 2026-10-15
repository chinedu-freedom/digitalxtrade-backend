import prisma from '../lib/prisma.js';
import { sendReferralCommissionEmail } from './emailService.js';

const DEFAULT_LEVELS = [
  { level: 1, percent: 6.00 },
  { level: 2, percent: 2.50 },
  { level: 3, percent: 1.00 }
];

/**
 * Auto-heal and ensure the referral_settings table exists in PostgreSQL
 */
export async function initReferralTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS referral_settings (
        id VARCHAR(64) PRIMARY KEY,
        enabled BOOLEAN DEFAULT true,
        levels JSONB DEFAULT '[{"level": 1, "percent": 10}, {"level": 2, "percent": 5}, {"level": 3, "percent": 3}]'::jsonb,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO referral_settings (id, enabled, levels, "updatedAt")
      VALUES ('default', true, '[{"level": 1, "percent": 10}, {"level": 2, "percent": 5}, {"level": 3, "percent": 3}]'::jsonb, NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
  } catch (err) {
    console.warn('[referralService] Table init warning:', err.message);
  }
}

/**
 * Fetch live referral commission settings from real PostgreSQL database
 */
export async function getReferralSettings() {
  try {
    await initReferralTable();
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM referral_settings WHERE id = 'default' LIMIT 1`);
    if (rows && rows.length > 0) {
      const row = rows[0];
      let levels = row.levels;
      if (typeof levels === 'string') {
        try {
          levels = JSON.parse(levels);
        } catch (e) {}
      }
      return {
        enabled: Boolean(row.enabled),
        levels: Array.isArray(levels) && levels.length > 0 ? levels : DEFAULT_LEVELS
      };
    }
  } catch (err) {
    console.error('[referralService] getReferralSettings error:', err.message);
  }

  return {
    enabled: true,
    levels: DEFAULT_LEVELS
  };
}

/**
 * Save updated referral settings into real PostgreSQL database
 */
export async function saveReferralSettings({ enabled, levels }) {
  await initReferralTable();

  const cleanLevels = (Array.isArray(levels) ? levels : DEFAULT_LEVELS).slice(0, 3).map((d, idx) => ({
    level: idx + 1,
    percent: parseFloat(d.percent !== undefined ? d.percent : d.percentage || 0)
  }));

  const jsonStr = JSON.stringify(cleanLevels);
  const isEnabled = Boolean(enabled);

  await prisma.$executeRawUnsafe(
    `INSERT INTO referral_settings (id, enabled, levels, "updatedAt")
     VALUES ('default', $1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET enabled = $1, levels = $2::jsonb, "updatedAt" = NOW()`,
    isEnabled,
    jsonStr
  );

  return {
    enabled: isEnabled,
    levels: cleanLevels
  };
}

/**
 * Multi-Tier (Up to 3 levels) Referral Commission Engine
 * Executes across deposit confirmations (manual & crypto gateway) and plan activations.
 */
export async function distributeReferralCommissions({ userId, depositAmount, depositUser, source = 'deposit' }) {
  try {
    const numAmount = parseFloat(depositAmount || 0);
    if (isNaN(numAmount) || numAmount <= 0) return [];

    const settings = await getReferralSettings();
    if (!settings.enabled) {
      console.log(`[referralService] Referral commissions are currently DISABLED by administrator.`);
      return [];
    }

    const levels = settings.levels || DEFAULT_LEVELS;
    const distributedLogs = [];

    let currentUserId = userId;
    const referee = depositUser || await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, fullName: true, email: true, referredById: true }
    });

    if (!referee) return [];

    const refereeName = referee.username ? `@${referee.username}` : (referee.fullName || 'referral');

    // Traverse up to 3 upline levels
    for (let i = 0; i < levels.length && i < 3; i++) {
      const levelConfig = levels[i];
      const levelNum = i + 1;
      const percent = parseFloat(levelConfig.percent || 0);

      // Find the direct upline inviter for the current user
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { id: true, referredById: true }
      });

      if (!currentUser || !currentUser.referredById) {
        break; // No further upline
      }

      const inviter = await prisma.user.findUnique({
        where: { id: currentUser.referredById }
      });

      if (!inviter) {
        break; // Upline user account not found
      }

      if (percent > 0) {
        const commissionAmount = numAmount * (percent / 100);

        if (commissionAmount > 0) {
          // Increment inviter balances in real PostgreSQL database
          await prisma.user.update({
            where: { id: inviter.id },
            data: {
              balance: { increment: commissionAmount },
              profitBalance: { increment: commissionAmount },
              referralCommissions: { increment: commissionAmount }
            }
          });

          // Create permanent Transaction record for referral commission
          const txDesc = `Level ${levelNum} (${percent.toFixed(2)}%) Referral Commission from ${refereeName}'s ${source} of $${numAmount.toFixed(2)}`;
          const tx = await prisma.transaction.create({
            data: {
              userId: inviter.id,
              type: 'COMMISSION',
              amount: commissionAmount,
              description: txDesc,
              status: 'COMPLETED'
            }
          });

          // Dispatch official referral commission email asynchronously
          sendReferralCommissionEmail({
            inviter,
            referee,
            commissionAmount,
            depositAmount: numAmount,
            level: levelNum,
            percentage: percent
          }).catch(e => console.error(`[referralService] Error sending Level ${levelNum} referral email:`, e));

          distributedLogs.push({
            level: levelNum,
            inviterId: inviter.id,
            inviterUsername: inviter.username,
            amount: commissionAmount,
            percent
          });

          console.log(`[referralService] Credited $${commissionAmount.toFixed(2)} Level ${levelNum} (${percent}%) to @${inviter.username || inviter.email}`);
        }
      }

      // Move upline to the next tier
      currentUserId = inviter.id;
    }

    return distributedLogs;
  } catch (err) {
    console.error('[referralService] distributeReferralCommissions error:', err);
    return [];
  }
}
