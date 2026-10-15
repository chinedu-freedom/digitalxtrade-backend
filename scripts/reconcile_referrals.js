import prisma from '../src/lib/prisma.js';
import { saveReferralSettings } from '../src/services/referralService.js';

/**
 * Reconcile and fix referral commissions across all 3 tiers (6%, 2.5%, 1%)
 * Run: node scripts/reconcile_referrals.js
 */
async function runReconciliation() {
  console.log('====================================================');
  console.log('🔄 STARTING REFERRAL COMMISSION RECONCILIATION');
  console.log('Target Tiers: Level 1 = 6.00% | Level 2 = 2.50% | Level 3 = 1.00%');
  console.log('====================================================\n');

  try {
    // 1. Force save the exact intended settings into database
    console.log('1️⃣ Updating database referral_settings to 6%, 2.5%, 1%...');
    await saveReferralSettings({
      enabled: true,
      levels: [
        { level: 1, percent: 6.00 },
        { level: 2, percent: 2.50 },
        { level: 3, percent: 1.00 }
      ]
    });
    console.log('✅ Settings saved in PostgreSQL: Level 1 = 6%, Level 2 = 2.5%, Level 3 = 1%\n');

    // 2. Fetch all approved/completed deposits for referred users
    console.log('2️⃣ Analyzing existing approved deposits...');
    const deposits = await prisma.deposit.findMany({
      where: {
        status: { in: ['APPROVED', 'COMPLETED'] },
        user: { referredById: { not: null } }
      },
      include: {
        user: true
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`Found ${deposits.length} approved deposit(s) from referred members.\n`);

    if (deposits.length === 0) {
      console.log('No approved deposits with active referrers found. Nothing to backfill.');
      return;
    }

    let totalCreditedL1 = 0;
    let totalAdjustedL1 = 0;
    let totalCreditedL2 = 0;
    let totalCreditedL3 = 0;
    let actionsCount = 0;

    for (const dep of deposits) {
      const depositor = dep.user;
      const depAmount = parseFloat(dep.amount || 0);
      if (depAmount <= 0) continue;

      const depositorRefName = depositor.username ? `@${depositor.username}` : (depositor.fullName || depositor.email || depositor.id);
      console.log(`\n📌 Processing Deposit ${dep.id}: $${depAmount.toFixed(2)} by ${depositorRefName}`);

      // Build 3-tier upline chain
      const upliners = [];
      let currentId = depositor.referredById;

      for (let lvl = 1; lvl <= 3; lvl++) {
        if (!currentId) break;
        const uplineUser = await prisma.user.findUnique({
          where: { id: currentId }
        });
        if (!uplineUser) break;
        upliners.push({ level: lvl, user: uplineUser });
        currentId = uplineUser.referredById;
      }

      console.log(`   Upline Chain: ${upliners.map(u => `L${u.level}: @${u.user.username || u.user.email}`).join(' -> ') || 'None'}`);

      // Target percentages
      const targetRates = {
        1: 0.06,  // 6%
        2: 0.025, // 2.5%
        3: 0.01   // 1%
      };

      for (const { level, user: inviter } of upliners) {
        const rate = targetRates[level];
        const correctComm = parseFloat((depAmount * rate).toFixed(2));

        // Check existing commission transactions for this inviter from this depositor
        const existingTxList = await prisma.transaction.findMany({
          where: {
            userId: inviter.id,
            type: 'COMMISSION',
            description: {
              contains: depositor.username ? `@${depositor.username}` : (depositor.fullName || depositor.email)
            }
          }
        });

        // Sum existing commission already received for this depositor's deposit
        const alreadyReceived = existingTxList.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);

        if (level === 1) {
          // If Level 1 was previously given 10% (or no commission)
          const old10Percent = parseFloat((depAmount * 0.10).toFixed(2));

          if (existingTxList.length > 0 && Math.abs(alreadyReceived - old10Percent) < 0.1) {
            // Already received 10%, adjust down by 4% to match 6%
            const excess = parseFloat((alreadyReceived - correctComm).toFixed(2));
            if (excess > 0) {
              await prisma.user.update({
                where: { id: inviter.id },
                data: {
                  balance: { decrement: excess },
                  profitBalance: { decrement: excess },
                  referralCommissions: { decrement: excess }
                }
              });

              await prisma.transaction.create({
                data: {
                  userId: inviter.id,
                  type: 'COMMISSION',
                  amount: -excess,
                  description: `Commission adjustment for Level 1 from 10% to 6% on ${depositorRefName}'s deposit of $${depAmount.toFixed(2)} (-$${excess.toFixed(2)})`,
                  status: 'COMPLETED'
                }
              });

              console.log(`   ⚖️ Adjusted L1 @${inviter.username}: Reduced from 10% to 6% (-$${excess.toFixed(2)}). New net commission: $${correctComm.toFixed(2)}`);
              totalAdjustedL1 += excess;
              actionsCount++;
            }
          } else if (existingTxList.length === 0) {
            // Received 0%, credit full 6%
            await prisma.user.update({
              where: { id: inviter.id },
              data: {
                balance: { increment: correctComm },
                profitBalance: { increment: correctComm },
                referralCommissions: { increment: correctComm }
              }
            });

            await prisma.transaction.create({
              data: {
                userId: inviter.id,
                type: 'COMMISSION',
                amount: correctComm,
                description: `Level 1 (6.00%) Referral Commission from ${depositorRefName}'s deposit of $${depAmount.toFixed(2)}`,
                status: 'COMPLETED'
              }
            });

            console.log(`   🎁 Credited L1 @${inviter.username}: +$${correctComm.toFixed(2)} (6%)`);
            totalCreditedL1 += correctComm;
            actionsCount++;
          } else {
            console.log(`   ℹ️ L1 @${inviter.username} already has custom commission record ($${alreadyReceived.toFixed(2)}). Left untouched.`);
          }
        } else if (level === 2) {
          // Level 2 received 0% previously
          const hasL2Tx = existingTxList.some(t => t.description.includes('Level 2'));
          if (!hasL2Tx && correctComm > 0) {
            await prisma.user.update({
              where: { id: inviter.id },
              data: {
                balance: { increment: correctComm },
                profitBalance: { increment: correctComm },
                referralCommissions: { increment: correctComm }
              }
            });

            await prisma.transaction.create({
              data: {
                userId: inviter.id,
                type: 'COMMISSION',
                amount: correctComm,
                description: `Level 2 (2.50%) Referral Commission from ${depositorRefName}'s deposit of $${depAmount.toFixed(2)}`,
                status: 'COMPLETED'
              }
            });

            console.log(`   🎁 Credited L2 @${inviter.username}: +$${correctComm.toFixed(2)} (2.5%)`);
            totalCreditedL2 += correctComm;
            actionsCount++;
          } else {
            console.log(`   ℹ️ L2 @${inviter.username} already credited.`);
          }
        } else if (level === 3) {
          // Level 3 received 0% previously
          const hasL3Tx = existingTxList.some(t => t.description.includes('Level 3'));
          if (!hasL3Tx && correctComm > 0) {
            await prisma.user.update({
              where: { id: inviter.id },
              data: {
                balance: { increment: correctComm },
                profitBalance: { increment: correctComm },
                referralCommissions: { increment: correctComm }
              }
            });

            await prisma.transaction.create({
              data: {
                userId: inviter.id,
                type: 'COMMISSION',
                amount: correctComm,
                description: `Level 3 (1.00%) Referral Commission from ${depositorRefName}'s deposit of $${depAmount.toFixed(2)}`,
                status: 'COMPLETED'
              }
            });

            console.log(`   🎁 Credited L3 @${inviter.username}: +$${correctComm.toFixed(2)} (1%)`);
            totalCreditedL3 += correctComm;
            actionsCount++;
          } else {
            console.log(`   ℹ️ L3 @${inviter.username} already credited.`);
          }
        }
      }
    }

    console.log('\n====================================================');
    console.log('🎉 RECONCILIATION COMPLETED SUCCESSFULLY');
    console.log(`Total Actions Performed: ${actionsCount}`);
    console.log(`L1 Fresh Commissions Credited (6%): +$${totalCreditedL1.toFixed(2)}`);
    console.log(`L1 Excess Deductions Adjusted (from 10% to 6%): -$${totalAdjustedL1.toFixed(2)}`);
    console.log(`L2 Commissions Credited (2.5%): +$${totalCreditedL2.toFixed(2)}`);
    console.log(`L3 Commissions Credited (1%): +$${totalCreditedL3.toFixed(2)}`);
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Reconciliation error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runReconciliation();
