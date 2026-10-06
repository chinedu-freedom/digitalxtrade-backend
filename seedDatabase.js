import bcrypt from 'bcryptjs';
import prisma from './src/lib/prisma.js';

async function main() {
  console.log('=== DigitalXTrade Full Database Seeding ===\n');

  // 1. Seed or update Administrator Account
  console.log('[1/5] Seeding Admin Account...');
  const adminEmail = 'admin@digitalxtrade.com';
  const adminPassword = 'digitalXAdmin2$';
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: adminEmail },
        { username: 'admin' },
        { role: 'ADMIN' }
      ]
    }
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        email: adminEmail,
        username: 'admin',
        fullName: 'Super Administrator',
        password: adminHash,
        role: 'ADMIN',
        isEmailVerified: true
      }
    });
    console.log('✓ Admin account updated (admin@digitalxtrade.com)');
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        username: 'admin',
        fullName: 'Super Administrator',
        password: adminHash,
        role: 'ADMIN',
        isEmailVerified: true
      }
    });
    console.log('✓ Admin account created (admin@digitalxtrade.com)');
  }

  // 2. Seed Investment Plans
  console.log('\n[2/5] Seeding Investment Plans...');
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
    {
      name: 'Wealth Plan',
      planLabel: 'Plan 4',
      minAmount: 20000,
      maxAmount: null,
      dailyProfit: 10.5,
      profitType: 'Daily Profit (%)',
      durationDays: 30,
      durationHours: null,
      paymentPeriod: 'Daily',
      capitalReturn: true,
      isCompounding: false,
      isPromo: false,
      status: 'Active',
    },
  ];

  for (const p of defaultPlans) {
    const existingPlan = await prisma.investmentPlan.findFirst({ where: { name: p.name } });
    if (!existingPlan) {
      await prisma.investmentPlan.create({ data: p });
    }
  }
  console.log('✓ 6 Investment Plans verified in database.');

  // 3. Seed Company Deposit Wallets
  console.log('\n[3/5] Seeding Company Deposit Wallets...');
  const wallets = [
    { currency: 'bitcoin', name: 'Bitcoin (BTC)', network: 'Bitcoin Mainnet', address: 'bc1qwz6fqarhsuhgllxnqz3ekq8krdfgctkl6r5utk' },
    { currency: 'usdt_trc20', name: 'USDT (TRC20)', network: 'Tron (TRC-20)', address: 'TQsUzgqcBhJe47Tx8fCzEi9GJJUpfpYyio' },
    { currency: 'usdt_bep20', name: 'USDT (BEP20)', network: 'BNB Smart Chain (BEP-20)', address: '0x003848D153e45DDdd24d498B921A888a5567C9c3' },
    { currency: 'litecoin', name: 'Litecoin (LTC)', network: 'Litecoin Mainnet', address: 'ltc1qzhnnvz4gqe7ejhkxgw4jcys28wj6ru2ce79tan' },
  ];

  for (const w of wallets) {
    const existingWallet = await prisma.companyWallet.findFirst({ where: { currency: w.currency } });
    if (!existingWallet) {
      await prisma.companyWallet.create({ data: w });
    } else {
      await prisma.companyWallet.update({ where: { id: existingWallet.id }, data: w });
    }
  }
  console.log('✓ Company Deposit Wallets verified in database.');

  // 4. Seed Security Settings
  console.log('\n[4/5] Seeding Security Settings...');
  const existingSec = await prisma.securitySetting.findFirst();
  if (!existingSec) {
    await prisma.securitySetting.create({
      data: {
        ipSensitivity: 'high',
        browserChange: 'enabled',
        twoFactorEnabled: false,
        secretCode: 'JRZE4OI7K5GLALIG',
        otpAuthUrl: 'otpauth://totp/DigitalXTrade:user?secret=JRZE4OI7K5GLALIG&issuer=DigitalXTrade',
      }
    });
    console.log('✓ Security settings initialized.');
  } else {
    console.log('✓ Security settings already exist.');
  }

  // 5. Seed Default Gift Bonus Codes
  console.log('\n[5/5] Seeding Default Gift & Bonus Codes...');
  const defaultCodes = [
    { code: 'DXTWELCOME50', codeName: 'Welcome Bonus Voucher', amount: 50.0, maxUses: 100 },
    { code: 'DXTBONUS100', codeName: 'VIP Launch Promo', amount: 100.0, maxUses: 50 },
  ];

  for (const c of defaultCodes) {
    const existingCode = await prisma.giftBonus.findUnique({ where: { code: c.code } });
    if (!existingCode) {
      await prisma.giftBonus.create({
        data: {
          code: c.code,
          codeName: c.codeName,
          amount: c.amount,
          maxUses: c.maxUses,
          usedCount: 0,
          status: 'ACTIVE',
          expireAt: new Date('2026-12-31')
        }
      });
      console.log(`✓ Gift code created: ${c.code} ($${c.amount})`);
    }
  }

  console.log('\n==================================================');
  console.log('✓ Full Database Seeding Complete!');
  console.log('Admin Credentials:');
  console.log('- URL:      https://admin.digitalxtrade.com/admin/login');
  console.log('- Email:    admin@digitalxtrade.com');
  console.log('- Password: digitalXAdmin2$');
  console.log('==================================================');
}

main()
  .catch((e) => {
    console.error('Error during full database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
