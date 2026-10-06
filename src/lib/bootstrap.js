import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

export async function ensureDatabaseBootstrapped() {
  try {
    // 1. Ensure Default Investment Plans exist
    const planCount = await prisma.investmentPlan.count();
    if (planCount === 0) {
      console.log('[bootstrap] Seeding initial investment plans into database...');
      const defaultPlans = [
        {
          name: 'FOUNDATION PLAN',
          planLabel: 'Plan 1',
          minAmount: 40,
          maxAmount: 4999,
          dailyProfit: 2.8,
          profitType: 'Daily Profit (%)',
          durationDays: 30,
          durationHours: null,
          paymentPeriod: 'Daily',
          capitalReturn: true,
          isCompounding: false,
          status: 'Active',
        },
        {
          name: 'Spark',
          planLabel: 'Plan 1',
          minAmount: 100,
          maxAmount: 999,
          dailyProfit: 2.0,
          profitType: 'Daily Profit (%)',
          durationDays: 30,
          durationHours: null,
          paymentPeriod: 'Hourly',
          capitalReturn: true,
          isCompounding: true,
          status: 'Active',
        },
        {
          name: 'DIGITALXTRADE MAX PLAN(250% In 48 hours)',
          planLabel: 'PROMO PLAN 1',
          minAmount: 1000,
          maxAmount: 4999,
          dailyProfit: 300,
          profitType: 'Daily Profit (%)',
          durationDays: 2,
          durationHours: 48,
          paymentPeriod: 'Daily',
          capitalReturn: true,
          isCompounding: false,
          isPromo: true,
          status: 'Active',
        },
        {
          name: 'ACCELERATION PLAN',
          planLabel: 'Plan 2',
          minAmount: 5000,
          maxAmount: 9999,
          dailyProfit: 5.5,
          profitType: 'Daily Profit (%)',
          durationDays: 30,
          durationHours: null,
          paymentPeriod: 'Daily',
          capitalReturn: true,
          isCompounding: false,
          status: 'Active',
        },
        {
          name: 'DIGITALXTRADE SUPER PLAN(500% In 72 hours)',
          planLabel: 'PROMO PLAN 2',
          minAmount: 5000,
          maxAmount: 100000,
          dailyProfit: 500,
          profitType: 'Daily Profit (%)',
          durationDays: 3,
          durationHours: 72,
          paymentPeriod: 'Daily',
          capitalReturn: true,
          isCompounding: false,
          isPromo: true,
          status: 'Active',
        },
        {
          name: 'STABILITY PLAN',
          planLabel: 'Plan 3',
          minAmount: 10000,
          maxAmount: 19999,
          dailyProfit: 8.5,
          profitType: 'Daily Profit (%)',
          durationDays: 30,
          durationHours: null,
          paymentPeriod: 'Daily',
          capitalReturn: true,
          isCompounding: false,
          status: 'Active',
        },
      ];

      for (const p of defaultPlans) {
        await prisma.investmentPlan.create({ data: p });
      }
      console.log('[bootstrap] 6 investment plans created successfully.');
    }

    // 1b. Ensure WEALTH PLAN exists
    const wealthPlan = await prisma.investmentPlan.findFirst({
      where: { name: { contains: 'WEALTH', mode: 'insensitive' } }
    });
    if (!wealthPlan) {
      await prisma.investmentPlan.create({
        data: {
          name: 'WEALTH PLAN',
          planLabel: 'Plan 4',
          minAmount: 20000,
          maxAmount: 0,
          dailyProfit: 10.5,
          profitType: 'Daily Profit (%)',
          durationDays: 30,
          durationHours: null,
          paymentPeriod: 'Daily',
          capitalReturn: true,
          isCompounding: false,
          status: 'Active',
        }
      });
      console.log('[bootstrap] WEALTH PLAN created successfully.');
    }

    // 2. Ensure Default Company Deposit Wallets exist with latest verified addresses
    const defaultWallets = [
      { currency: 'bitcoin', name: 'Bitcoin (BTC)', network: 'Bitcoin Mainnet', address: 'bc1qwz6fqarhsuhgllxnqz3ekq8krdfgctkl6r5utk' },
      { currency: 'usdt_trc20', name: 'USDT (TRC20)', network: 'Tron (TRC-20)', address: 'TQsUzgqcBhJe47Tx8fCzEi9GJJUpfpYyio' },
      { currency: 'usdt_bep20', name: 'USDT (BEP20)', network: 'BNB Smart Chain (BEP-20)', address: '0x003848D153e45DDdd24d498B921A888a5567C9c3' },
      { currency: 'litecoin', name: 'Litecoin (LTC)', network: 'Litecoin Mainnet', address: 'ltc1qzhnnvz4gqe7ejhkxgw4jcys28wj6ru2ce79tan' },
    ];

    for (const w of defaultWallets) {
      const existing = await prisma.companyWallet.findUnique({ where: { currency: w.currency } });
      if (!existing) {
        await prisma.companyWallet.create({ data: w });
      }
    }

    // 3. Ensure Security Settings exist
    const secCount = await prisma.securitySetting.count();
    if (secCount === 0) {
      await prisma.securitySetting.create({
        data: {
          ipSensitivity: 'high',
          browserChange: 'enabled',
          twoFactorEnabled: false,
          secretCode: 'JRZE4OI7K5GLALIG',
          otpAuthUrl: 'otpauth://totp/DigitalXTrade:user?secret=JRZE4OI7K5GLALIG&issuer=DigitalXTrade',
        }
      });
      console.log('[bootstrap] Security settings initialized.');
    }

    // 4. Ensure Default Admin User exists
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      console.log('[bootstrap] Creating default administrator user...');
      const hash = await bcrypt.hash('digitalXAdmin2$', 10);
      await prisma.user.create({
        data: {
          email: 'admin@digitalxtrade.com',
          username: 'admin',
          fullName: 'Super Administrator',
          password: hash,
          role: 'ADMIN',
          isEmailVerified: true,
        }
      });
      console.log('[bootstrap] Admin user created (admin@digitalxtrade.com).');
    }
  } catch (err) {
    console.warn('[bootstrap] Database bootstrap check warning:', err.message);
  }
}
