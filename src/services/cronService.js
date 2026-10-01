

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Checks if a given Date is listed in the earning_holidays table.
 * Matches by exact YYYY-MM-DD or standard recurring holiday names (e.g., Sunday).
 */
export async function isEarningHoliday(date, holidaysCache = null) {
  try {
    const holidays = holidaysCache || await prisma.earningHoliday.findMany();
    if (!holidays || holidays.length === 0) return false;

    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const isoDateStr = `${yyyy}-${mm}-${dd}`;

    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = daysOfWeek[d.getDay()];

    return holidays.some((h) => {
      const hDate = (h.date || '').trim();
      const hDesc = (h.description || '').toLowerCase();
      // Match exact YYYY-MM-DD
      if (hDate === isoDateStr) return true;
      // Match recurring day of week description (e.g., "Sunday", "Weekend")
      if (hDesc.includes(currentDayName)) return true;
      if (hDesc.includes('weekend') && (currentDayName === 'saturday' || currentDayName === 'sunday')) return true;
      return false;
    });
  } catch (err) {
    console.error('[CRON] Error checking earning holiday:', err);
    return false;
  }
}

/**
 * Main automated profit payout & investment maturity processor.
 * Respects:
 * - Hourly vs Daily profit cycles
 * - Delayed Earning Start (delayEarningDays)
 * - Earning Holidays (earning_holidays table)
 * - Daily Compounding vs Simple Profit
 * - Earnings Holding Period (holdEarningsDays)
 * - Principal/Capital Return on Maturity
 */
export async function runProfitPayouts(targetUserId = null) {
  const stats = {
    processedDeposits: 0,
    cyclesPaid: 0,
    holidaysSkipped: 0,
    totalProfitCredited: 0,
    completedInvestments: 0,
    capitalReturned: 0,
  };

  try {
    const now = new Date();

    // 1. Fetch active approved deposits / investments
    const activeDeposits = await prisma.deposit.findMany({
      where: {
        status: { in: ['APPROVED', 'ACTIVE'] },
        ...(targetUserId ? { userId: targetUserId } : {}),
      },
      include: {
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (activeDeposits.length === 0) {
      return stats;
    }

    // 2. Pre-fetch plans & earning holidays for efficient lookups
    const [allPlans, allHolidays] = await Promise.all([
      prisma.investmentPlan.findMany(),
      prisma.earningHoliday.findMany(),
    ]);

    for (const deposit of activeDeposits) {
      try {
        stats.processedDeposits += 1;
        const user = deposit.user;
        if (!user || user.isSuspended) continue;

        // Match the plan from DB
        let plan = allPlans.find((p) => p.id === deposit.planId);
        if (!plan && deposit.planName) {
          const pNameLower = deposit.planName.toLowerCase();
          plan = allPlans.find((p) => (p.name || '').toLowerCase() === pNameLower || pNameLower.includes((p.name || '').toLowerCase()));
        }
        if (!plan) {
          plan = allPlans.find((p) => p.status === 'Active') || {
            name: deposit.planName || 'Standard Plan',
            dailyProfit: 2.0,
            durationDays: 30,
            durationHours: null,
            paymentPeriod: 'Daily',
            capitalReturn: true,
            isCompounding: false,
            holdEarningsDays: 0,
            delayEarningDays: 0,
          };
        }

        const depositAmount = parseFloat(deposit.amount || 0);
        if (depositAmount <= 0) continue;

        // Determine if Hourly or Daily plan
        const paymentPeriod = String(plan.paymentPeriod || '').toLowerCase();
        const profitType = String(plan.profitType || '').toLowerCase();
        const isHourly = paymentPeriod === 'hourly' || Boolean(plan.durationHours) || profitType.includes('hour');

        const cycleMs = isHourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        const totalCycles = isHourly
          ? (plan.durationHours || (plan.durationDays ? plan.durationDays * 24 : 72))
          : (plan.durationDays || 30);

        const delayDays = parseInt(plan.delayEarningDays || 0);
        const holdDays = parseInt(plan.holdEarningsDays || 0);
        const capitalReturn = plan.capitalReturn !== false;
        const isCompounding = Boolean(plan.isCompounding);

        const startDate = new Date(deposit.createdAt);
        const earningStartTime = new Date(startDate.getTime() + delayDays * 24 * 60 * 60 * 1000);

        // If currently in the delay period, skip payout for this cycle
        if (now < earningStartTime) {
          continue;
        }

        // Determine base date for payouts
        const baseDate = deposit.lastProfitAt
          ? new Date(deposit.lastProfitAt)
          : earningStartTime;

        const diffMs = now.getTime() - baseDate.getTime();
        if (diffMs < cycleMs) {
          // Check if investment has reached maturity without extra cycle due
          const totalDurationMs = (delayDays * 24 * 60 * 60 * 1000) + (totalCycles * cycleMs);
          const maturityDate = new Date(startDate.getTime() + totalDurationMs);
          if (now >= maturityDate && deposit.payoutsCount >= totalCycles) {
            await finalizeCompletedInvestment(deposit, user, plan, capitalReturn, stats);
          }
          continue;
        }

        const cyclesDue = Math.floor(diffMs / cycleMs);
        const payoutsDone = deposit.payoutsCount || 0;
        const remainingCycles = Math.max(0, totalCycles - payoutsDone);
        const cyclesToPay = Math.min(cyclesDue, remainingCycles);

        if (cyclesToPay <= 0) {
          // Completed all cycles, finalize
          await finalizeCompletedInvestment(deposit, user, plan, capitalReturn, stats);
          continue;
        }

        let profitRate = parseFloat(plan.dailyProfit || 2.0) / 100;
        let runningAccumulatedProfit = parseFloat(deposit.totalProfitEarned || 0);
        let totalCyclePayout = 0;
        let actualPaidCycles = 0;

        // Process each due cycle (step-by-step to respect earning holidays)
        for (let i = 1; i <= cyclesToPay; i++) {
          const cycleDate = new Date(baseDate.getTime() + i * cycleMs);

          // Check Earning Holidays
          const isHoliday = await isEarningHoliday(cycleDate, allHolidays);
          if (isHoliday) {
            stats.holidaysSkipped += 1;
            continue; // Profit is skipped on earning holidays
          }

          let cycleProfit = 0;
          if (isCompounding) {
            // Exactly matching stakelab-backend: currentBase = depositAmount + previousAccumulatedProfit
            const currentBase = depositAmount + runningAccumulatedProfit;
            cycleProfit = currentBase * profitRate;
            runningAccumulatedProfit += cycleProfit;
          } else {
            cycleProfit = depositAmount * profitRate;
          }

          totalCyclePayout += cycleProfit;
          actualPaidCycles += 1;

          // Record detailed ProfitLog
          await prisma.$executeRawUnsafe(
            `INSERT INTO "profit_logs" ("id", "userId", "depositId", "planName", "amount", "rate", "cycleType", "paidAt", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            `PL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            user.id,
            deposit.id,
            plan.name,
            cycleProfit,
            parseFloat(plan.dailyProfit || 2.0),
            isHourly ? 'HOURLY' : 'DAILY',
            cycleDate,
            now
          ).catch((e) => console.warn('[CRON] ProfitLog insert warning:', e.message));
        }

        const newPayoutsCount = payoutsDone + cyclesToPay;
        const newLastProfitAt = new Date(baseDate.getTime() + cyclesToPay * cycleMs);
        const newTotalProfit = parseFloat(deposit.totalProfitEarned || 0) + totalCyclePayout;

        // Determine destination: holding locked vs immediate withdrawable balance
        const holdEndTime = new Date(startDate.getTime() + holdDays * 24 * 60 * 60 * 1000);
        const isHolding = holdDays > 0 && now < holdEndTime;

        // Update User & Deposit in Transaction
        const dbOperations = [];

        // 1. Update deposit progress
        dbOperations.push(
          prisma.deposit.update({
            where: { id: deposit.id },
            data: {
              lastProfitAt: newLastProfitAt,
              totalProfitEarned: newTotalProfit,
              payoutsCount: newPayoutsCount,
            },
          })
        );

        // 2. Credit User Balances
        if (totalCyclePayout > 0) {
          stats.totalProfitCredited += totalCyclePayout;
          stats.cyclesPaid += actualPaidCycles;

          const userUpdate = {
            totalEarnings: { increment: totalCyclePayout },
          };

          if (isHolding) {
            // Held in staked balance until hold period expires
            userUpdate.stakedBalance = { increment: totalCyclePayout };
          } else {
            // Immediately available in account balance
            userUpdate.balance = { increment: totalCyclePayout };

            // Also increment currency field if matched
            const currField = getCurrencyBalanceField(deposit.currency);
            if (currField) {
              userUpdate[currField] = { increment: totalCyclePayout };
            }
          }

          dbOperations.push(
            prisma.user.update({
              where: { id: user.id },
              data: userUpdate,
            })
          );

          // 3. Create persistent Transaction entry (matching stakelab-backend STAKE_PROFIT type)
          const cycleLabel = isHourly ? 'Hourly' : 'Daily';
          const periodUnit = isHourly ? (actualPaidCycles > 1 ? 'hours' : 'hour') : (actualPaidCycles > 1 ? 'days' : 'day');
          const periodText = `${actualPaidCycles} ${periodUnit}`;
          dbOperations.push(
            prisma.transaction.create({
              data: {
                userId: user.id,
                type: 'STAKE_PROFIT',
                amount: totalCyclePayout,
                description: `${cycleLabel} Yield Payout: $${totalCyclePayout.toFixed(2)} (${periodText}) from ${plan.name}${isHolding ? ' [Held]' : ''}`,
                status: 'COMPLETED',
              },
            })
          );
        }

        await prisma.$transaction(dbOperations);

        // Check if investment is now fully completed
        if (newPayoutsCount >= totalCycles) {
          await finalizeCompletedInvestment(
            { ...deposit, totalProfitEarned: newTotalProfit, payoutsCount: newPayoutsCount },
            user,
            plan,
            capitalReturn,
            stats
          );
        }
      } catch (depositErr) {
        console.error(`[CRON] Error processing deposit ${deposit.id}:`, depositErr);
      }
    }

    return stats;
  } catch (error) {
    console.error('[CRON] Profit Payout Cron error:', error);
    throw error;
  }
}

/**
 * Handles investment completion and capital/principal return.
 */
async function finalizeCompletedInvestment(deposit, user, plan, capitalReturn, stats) {
  try {
    const depositAmount = parseFloat(deposit.amount || 0);
    const now = new Date();

    const ops = [
      prisma.deposit.update({
        where: { id: deposit.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      }),
    ];

    const userUpdate = {
      stakedBalance: { decrement: depositAmount },
    };

    // Capital / Principal Return handling (matching stakelab-backend)
    if (capitalReturn) {
      stats.capitalReturned += depositAmount;
      userUpdate.balance = {
        ...userUpdate.balance,
        increment: (userUpdate.balance?.increment || 0) + depositAmount,
      };

      const currField = getCurrencyBalanceField(deposit.currency);
      if (currField) {
        userUpdate[currField] = {
          ...userUpdate[currField],
          increment: (userUpdate[currField]?.increment || 0) + depositAmount,
        };
      }

      ops.push(
        prisma.transaction.create({
          data: {
            userId: user.id,
            type: 'CAPITAL_RETURN',
            amount: depositAmount,
            description: `Capital Return: $${depositAmount.toFixed(2)} principal returned from completed ${plan.name}`,
            status: 'COMPLETED',
          },
        })
      );
    } else {
      ops.push(
        prisma.transaction.create({
          data: {
            userId: user.id,
            type: 'CAPITAL_RETURN',
            amount: 0,
            description: `Investment package completed: ${plan.name} (Non-refundable principal)`,
            status: 'COMPLETED',
          },
        })
      );
    }

    ops.push(
      prisma.user.update({
        where: { id: user.id },
        data: userUpdate,
      })
    );

    await prisma.$transaction(ops);
    stats.completedInvestments += 1;
    console.log(`[CRON] Investment ${deposit.id} for user ${user.email} marked COMPLETED.`);
  } catch (err) {
    console.error(`[CRON] Error finalizing investment ${deposit.id}:`, err);
  }
}

function getCurrencyBalanceField(currency) {
  if (!currency) return null;
  const c = currency.toLowerCase();
  if (c.includes('btc') || c.includes('bitcoin')) return 'btcBalance';
  if (c.includes('trc20')) return 'usdtTrc20Balance';
  if (c.includes('bep20')) return 'usdtBep20Balance';
  if (c.includes('ltc') || c.includes('litecoin')) return 'ltcBalance';
  return null;
}

let cronIntervalId = null;

/**
 * Initializes the automated background cron runner.
 * Runs every 60 seconds.
 */
export function initCron() {
  if (cronIntervalId) {
    clearInterval(cronIntervalId);
  }

  console.log('[CRON] Automated Investment Yield & Profit Engine starting...');

  // Run once on launch
  runProfitPayouts()
    .then((stats) => {
      console.log(`[CRON] Initial cycle complete: ${stats.processedDeposits} deposits checked, ${stats.cyclesPaid} cycles credited ($${stats.totalProfitCredited.toFixed(2)}).`);
    })
    .catch((err) => {
      console.error('[CRON] Initial cron run warning:', err.message);
    });

  // Schedule to run every 60 seconds (1 minute)
  cronIntervalId = setInterval(async () => {
    try {
      await runProfitPayouts();
    } catch (err) {
      console.error('[CRON] Periodic cron run error:', err);
    }
  }, 60 * 1000);

  console.log('[CRON] Automated Investment Yield & Profit Engine active (interval: 60s).');
}

export default {
  initCron,
  runProfitPayouts,
  isEarningHoliday,
};
