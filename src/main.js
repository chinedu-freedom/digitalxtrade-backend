import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from './lib/prisma.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { initCron, runProfitPayouts } from './services/cronService.js';
import {
  companyDepositWallets,
  getActiveCompanyWallets,
  DEFAULT_COMPANY_WALLETS
} from './lib/store.js';
import { ensureDatabaseBootstrapped } from './lib/bootstrap.js';
import { sendDepositEmail, sendWithdrawalEmail, sendReferralCommissionEmail } from './services/emailService.js';

dotenv.config();

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'digital-project-secret-key-2026';

// Bulletproof Universal CORS & Preflight middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ||
      'Content-Type, Authorization, X-Requested-With, Accept, x-user-id, x-auth-token, Cache-Control, Pragma, Origin'
  );
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(cors({
  origin: true, // Echo origin to allow credentials safely across subdomains
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-user-id', 'x-auth-token'],
  credentials: true
}));

app.use(express.json());

// API Auth and Admin Routes (DigitalXTrade Database Synced)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', authRoutes);
app.use('/api', adminRoutes);
app.use('/admin', adminRoutes);
app.use('/', authRoutes);
app.use('/', adminRoutes);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Digital Backend API Server Running', timestamp: new Date() });
});

// Helper to extract authenticated user from request
const getAuthUser = async (req) => {
  const authHeader = req.headers.authorization;
  let userId = req.headers['x-user-id'] || req.query.userId;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) {
        userId = decoded.id;
      }
    } catch (e) {}
  }

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          deposits: { orderBy: { createdAt: 'desc' } },
          withdrawals: { orderBy: { createdAt: 'desc' } },
          transactions: { orderBy: { createdAt: 'desc' } }
        }
      });
      return user;
    } catch (err) {
      console.warn('Database user fetch error:', err.message);
    }
  }

  // Fallback to first USER in database if development testing without token
  try {
    const firstUser = await prisma.user.findFirst({
      where: { role: 'USER' },
      include: {
        deposits: { orderBy: { createdAt: 'desc' } },
        withdrawals: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } }
      }
    });
    return firstUser;
  } catch (err) {
    return null;
  }
};

// Helper to get or initialize security settings from database
const getOrCreateSecuritySettings = async () => {
  let settings = await prisma.securitySetting.findFirst();
  if (!settings) {
    settings = await prisma.securitySetting.create({
      data: {
        ipSensitivity: 'disabled',
        browserChange: 'disabled',
        twoFactorEnabled: false,
        secretCode: 'JRZE4OI7K5GLALIG',
        otpAuthUrl: 'otpauth://totp/DigitalXTrade:user?secret=JRZE4OI7K5GLALIG&issuer=DigitalXTrade'
      }
    });
  }
  return settings;
};

// GET current security settings
app.get('/api/security', async (req, res) => {
  try {
    const settings = await getOrCreateSecuritySettings();
    return res.json({
      success: true,
      settings
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch security settings' });
  }
});

// POST update security settings (IP Sensitivity and Browser Change)
app.post('/api/security/settings', async (req, res) => {
  try {
    const { ipSensitivity, browserChange } = req.body;
    let settings = await getOrCreateSecuritySettings();

    const dataToUpdate = {};
    if (ipSensitivity && ['disabled', 'medium', 'high', 'paranoic'].includes(ipSensitivity.toLowerCase())) {
      dataToUpdate.ipSensitivity = ipSensitivity.toLowerCase();
    }

    if (browserChange && ['disabled', 'enabled'].includes(browserChange.toLowerCase())) {
      dataToUpdate.browserChange = browserChange.toLowerCase();
    }

    if (Object.keys(dataToUpdate).length > 0) {
      settings = await prisma.securitySetting.update({
        where: { id: settings.id },
        data: dataToUpdate
      });
    }

    return res.json({
      success: true,
      message: 'Security settings updated successfully in database',
      settings
    });
  } catch (err) {
    console.error('Failed to update security settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to update security settings' });
  }
});

// POST enable 2FA
app.post('/api/security/2fa/enable', async (req, res) => {
  try {
    const code = req.body.token || req.body.code;
    const secret = req.body.secretCode || req.body.secret;

    if (!code || String(code).trim().length !== 6) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit verification code.' });
    }

    let settings = await getOrCreateSecuritySettings();

    const dataToUpdate = {
      twoFactorEnabled: true
    };
    if (secret) {
      dataToUpdate.secretCode = secret;
      dataToUpdate.otpAuthUrl = `otpauth://totp/DigitalXTrade:user?secret=${secret}&issuer=DigitalXTrade`;
    }

    settings = await prisma.securitySetting.update({
      where: { id: settings.id },
      data: dataToUpdate
    });

    return res.json({
      success: true,
      message: 'Two-Factor Authentication enabled successfully!',
      settings
    });
  } catch (err) {
    console.error('Failed to enable 2FA:', err);
    return res.status(500).json({ success: false, message: 'Failed to enable Two-Factor Authentication' });
  }
});

// POST disable 2FA
app.post('/api/security/2fa/disable', async (req, res) => {
  try {
    let settings = await getOrCreateSecuritySettings();

    settings = await prisma.securitySetting.update({
      where: { id: settings.id },
      data: { twoFactorEnabled: false }
    });

    return res.json({
      success: true,
      message: 'Two-Factor Authentication has been disabled',
      settings
    });
  } catch (err) {
    console.error('Failed to disable 2FA:', err);
    return res.status(500).json({ success: false, message: 'Failed to disable Two-Factor Authentication' });
  }
});


// GET withdrawal information
app.get('/api/withdraw', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const totalUserBal = user ? parseFloat(user.balance || 0) : 0.00;

    let btcBal = user ? parseFloat(user.btcBalance || 0) : 0.00;
    let trcBal = user ? parseFloat(user.usdtTrc20Balance || 0) : 0.00;
    let bepBal = user ? parseFloat(user.usdtBep20Balance || 0) : 0.00;
    let ltcBal = user ? parseFloat(user.ltcBalance || 0) : 0.00;

    // Fallback if legacy account credited funds to main balance directly
    if (btcBal + trcBal + bepBal + ltcBal === 0 && totalUserBal > 0) {
      trcBal = totalUserBal;
    }

    const getPendingForCurrency = (currencyMatchList) => {
      if (!user || !user.withdrawals) return 0.00;
      return user.withdrawals
        .filter(w => w.status === 'PENDING' && currencyMatchList.includes((w.currency || '').toUpperCase()))
        .reduce((acc, w) => acc + parseFloat(w.amount || 0), 0);
    };

    const totalPendingSum = user && user.withdrawals
      ? user.withdrawals
          .filter(w => w.status === 'PENDING')
          .reduce((acc, w) => acc + parseFloat(w.amount || 0), 0)
      : 0.00;

    const btcPending = getPendingForCurrency(['BTC', 'BITCOIN']);
    const trcPending = getPendingForCurrency(['USDT', 'USDT-TRC20', 'USDT (TRC20)', 'TRC20']);
    const bepPending = getPendingForCurrency(['USDT-BEP20', 'USDT (BEP20)', 'BEP20']);
    const ltcPending = getPendingForCurrency(['LTC', 'LITECOIN']);

    const currencies = [
      {
        id: 'bitcoin',
        symbol: 'BTC',
        name: 'BITCOIN',
        available: btcBal,
        pending: btcPending,
        accountId: user?.bitcoinAddress || '',
        minWithdrawal: 20.00,
        fee: 0.00
      },
      {
        id: 'usdt_trc20',
        symbol: 'USDT-TRC20',
        name: 'USDT(TRC20)',
        available: trcBal,
        pending: trcPending,
        accountId: user?.usdtTrc20Address || '',
        minWithdrawal: 10.00,
        fee: 0.00
      },
      {
        id: 'usdt_bep20',
        symbol: 'USDT-BEP20',
        name: 'USDT(BEP20)',
        available: bepBal,
        pending: bepPending,
        accountId: user?.usdtBep20Address || '',
        minWithdrawal: 10.00,
        fee: 0.00
      },
      {
        id: 'litecoin',
        symbol: 'LTC',
        name: 'LITECOIN',
        available: ltcBal,
        pending: ltcPending,
        accountId: user?.litecoinAddress || '',
        minWithdrawal: 15.00,
        fee: 0.00
      }
    ];

    return res.json({
      success: true,
      data: {
        accountBalance: totalUserBal,
        pendingWithdrawals: totalPendingSum,
        maxDailyWithdraw: user ? (user.maxDailyWithdraw !== null && user.maxDailyWithdraw !== undefined ? parseFloat(user.maxDailyWithdraw) : 50000.00) : 50000.00,
        currencies,
        transactions: user ? user.withdrawals : []
      }
    });
  } catch (err) {
    console.error('Get withdrawal error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch withdrawal info' });
  }
});

// POST cancel/release active investment (50% principal refund)
app.post(['/api/user/deposits/:id/cancel', '/api/investments/:id/cancel', '/api/deposit/:id/cancel'], async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Please log in to cancel an investment.' });
    }

    const { id } = req.params;
    const deposit = await prisma.deposit.findUnique({
      where: { id }
    });

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit or investment not found.' });
    }

    if (deposit.userId !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this deposit.' });
    }

    const statusUpper = (deposit.status || '').toUpperCase();
    if (statusUpper === 'CANCELLED' || statusUpper === 'RELEASED') {
      return res.status(400).json({ success: false, message: 'This investment has already been cancelled.' });
    }

    const origAmount = parseFloat(deposit.amount || 0);
    if (origAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid deposit amount for cancellation.' });
    }

    // Calculate 50% refund
    const refundAmount = origAmount * 0.50;

    // Determine user's target wallet balance field based on currency
    const curr = (deposit.currency || '').toUpperCase();
    let walletField = 'usdtTrc20Balance';
    if (curr.includes('BTC') || curr.includes('BITCOIN')) walletField = 'btcBalance';
    else if (curr.includes('BEP20')) walletField = 'usdtBep20Balance';
    else if (curr.includes('LTC') || curr.includes('LITECOIN')) walletField = 'ltcBalance';

    // Update User balances: +50% refund to main balance & crypto balance, -100% from staked balance
    const currentStaked = parseFloat(user.stakedBalance || 0);
    const stakeDecrement = Math.min(origAmount, currentStaked);

    await prisma.user.update({
      where: { id: deposit.userId },
      data: {
        balance: { increment: refundAmount },
        [walletField]: { increment: refundAmount },
        stakedBalance: { decrement: stakeDecrement }
      }
    });

    // Update Deposit status
    const updatedDeposit = await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: 'CANCELLED' }
    });

    // Create Transaction record for the refund
    await prisma.transaction.create({
      data: {
        userId: deposit.userId,
        type: 'STAKE_CANCEL',
        amount: refundAmount,
        description: `Early investment cancellation of ${origAmount.toFixed(2)} (50% principal refund of ${refundAmount.toFixed(2)} returned to balance)`,
        status: 'APPROVED'
      }
    });

    return res.json({
      success: true,
      message: `Investment cancelled successfully! 50% principal refund of ${refundAmount.toFixed(2)} has been returned to your account.`,
      refundAmount,
      deposit: updatedDeposit
    });
  } catch (err) {
    console.error('Cancel investment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel investment.' });
  }
});

// POST submit a withdrawal request
app.post('/api/withdraw', async (req, res) => {
    try {
      const { currencyId, amount, address, walletType, wallet_type } = req.body;
      const numAmount = parseFloat(amount);
      const user = await getAuthUser(req);

      if (!user) {
        return res.status(401).json({ success: false, message: 'Please login to submit a withdrawal.' });
      }

      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Please enter a valid withdrawal amount.' });
      }

      const chosenWallet = (walletType || wallet_type || 'profit').toLowerCase();
      const depositBal = parseFloat(user.depositBalance || user.deposit_balance || 0);
      const profitBal = parseFloat(user.profitBalance || user.profit_balance || 0);
      const totalUserBal = parseFloat(user.balance || 0);

      let availableWalletBal = chosenWallet === 'deposit' ? depositBal : profitBal;

      // Fallback if balances were non-zero on main balance directly
      if (depositBal + profitBal === 0 && totalUserBal > 0) {
        availableWalletBal = totalUserBal;
      }

      if (numAmount > availableWalletBal) {
        const walletName = chosenWallet === 'deposit' ? 'Deposit Balance (Capital)' : 'Profit Balance (Earnings)';
        return res.status(400).json({
          success: false,
          message: `Insufficient ${walletName} (${availableWalletBal.toFixed(2)}). You requested ${numAmount.toFixed(2)}.`
        });
      }

    const minWithdrawal = currencyId === 'bitcoin' ? 20.00 : currencyId === 'litecoin' ? 15.00 : 10.00;
    if (numAmount < minWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal is ${minWithdrawal.toFixed(2)}.`
      });
    }

    // Enforce User Max Daily Withdrawal Limit
    const userMaxDaily = user.maxDailyWithdraw !== null && user.maxDailyWithdraw !== undefined
      ? parseFloat(user.maxDailyWithdraw)
      : 50000.00;

    if (userMaxDaily > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayWithdrawals = await prisma.withdrawal.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: startOfDay },
          status: { not: 'REJECTED' }
        }
      });

      const todayTotal = todayWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);

      if (todayTotal + numAmount > userMaxDaily) {
        const remainingDaily = Math.max(0, userMaxDaily - todayTotal);
        return res.status(400).json({
          success: false,
          message: `Daily withdrawal limit of ${userMaxDaily.toLocaleString('en-US', { minimumFractionDigits: 2 })} exceeded. You have ${remainingDaily.toLocaleString('en-US', { minimumFractionDigits: 2 })} remaining today.`
        });
      }
    }

    // Determine target wallet address
    let targetAddress = address;
    if (!targetAddress) {
      if (currencyId === 'bitcoin') targetAddress = user.bitcoinAddress;
      else if (currencyId === 'usdt_trc20') targetAddress = user.usdtTrc20Address;
      else if (currencyId === 'usdt_bep20') targetAddress = user.usdtBep20Address;
      else if (currencyId === 'litecoin') targetAddress = user.litecoinAddress;
    }

    if (!targetAddress) {
      return res.status(400).json({
        success: false,
        message: 'Please set or enter your withdrawal address first.'
      });
    }

    // Deduct user balance in PostgreSQL
      const dataToDecrement = { balance: { decrement: numAmount } };
      if (chosenWallet === 'deposit') {
        dataToDecrement.depositBalance = { decrement: numAmount };
      } else {
        dataToDecrement.profitBalance = { decrement: numAmount };
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: dataToDecrement
      });

    const currencyName = currencyId === 'bitcoin' ? 'BTC' : currencyId === 'litecoin' ? 'LTC' : (currencyId === 'usdt_bep20' ? 'USDT-BEP20' : 'USDT-TRC20');

    // Calculate 50% early withdrawal fee for Deposit Balance (Capital Wallet)
    const feeRate = chosenWallet === 'deposit' ? 0.50 : 0.00;
    const charge = numAmount * feeRate;
    const netAmount = numAmount - charge;

    // Create persistent Withdrawal record
    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId: user.id,
        amount: numAmount,
        netAmount: netAmount,
        charge: charge,
        currency: currencyName,
        walletAddress: targetAddress,
        status: 'PENDING'
      }
    });

    // Create persistent Transaction record
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'WITHDRAWAL',
        amount: numAmount,
        description: chosenWallet === 'deposit'
          ? `Deposit balance withdrawal of ${numAmount.toFixed(2)} (50% fee: ${charge.toFixed(2)}, Net Payout: ${netAmount.toFixed(2)}) to ${targetAddress} (${currencyName})`
          : `Profit balance withdrawal of ${numAmount.toFixed(2)} to ${targetAddress} (${currencyName})`,
        status: 'PENDING'
      }
    });


    const successMsg = chosenWallet === 'deposit'
      ? `Withdrawal request for ${numAmount.toFixed(2)} submitted! 50% capital withdrawal fee applied (Fee: ${charge.toFixed(2)}, Net Payout: ${netAmount.toFixed(2)}).`
      : `Withdrawal request for ${numAmount.toFixed(2)} submitted successfully!`;

    return res.json({
      success: true,
      message: successMsg,
      withdrawal,
      newBalance: updatedUser.balance
    });
  } catch (err) {
    console.error('Submit withdrawal error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process withdrawal request' });
  }
});

// POST update withdrawal account address
app.post('/api/withdraw/account', async (req, res) => {
  try {
    const { currencyId, accountId } = req.body;
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    let updateField = {};
    if (currencyId === 'bitcoin' || currencyId === 'BTC') updateField.bitcoinAddress = accountId;
    else if (currencyId === 'usdt_trc20' || currencyId === 'USDT-TRC20') updateField.usdtTrc20Address = accountId;
    else if (currencyId === 'usdt_bep20' || currencyId === 'USDT-BEP20') updateField.usdtBep20Address = accountId;
    else if (currencyId === 'litecoin' || currencyId === 'LTC') updateField.litecoinAddress = accountId;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateField
    });

    return res.json({
      success: true,
      message: 'Account address updated successfully',
      user: updatedUser
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update address' });
  }
});

// GET deposit plans and company deposit addresses
app.get('/api/deposit/plans', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const userBalance = user ? parseFloat(user.balance || 0) : 0.00;

    let btcBal = user ? parseFloat(user.btcBalance || 0) : 0.00;
    let trcBal = user ? parseFloat(user.usdtTrc20Balance || 0) : 0.00;
    let bepBal = user ? parseFloat(user.usdtBep20Balance || 0) : 0.00;
    let ltcBal = user ? parseFloat(user.ltcBalance || 0) : 0.00;

    if (btcBal + trcBal + bepBal + ltcBal === 0 && userBalance > 0) {
      trcBal = userBalance;
    }

    const userBalances = {
      bitcoin: btcBal,
      usdt_trc20: trcBal,
      usdt_bep20: bepBal,
      litecoin: ltcBal
    };

    const dbPlans = await prisma.investmentPlan.findMany({
      where: { status: 'Active' },
      orderBy: { minAmount: 'asc' }
    });

    const formattedPlans = dbPlans.map((p) => {
      const minLabel = `$${Number(p.minAmount).toFixed(2)}`;
      const maxLabel = p.maxAmount ? `$${Number(p.maxAmount).toFixed(2)}` : '∞';
      return {
        id: p.id,
        name: p.name,
        title: p.name,
        planName: p.planLabel || 'Investment Plan',
        planLabel: p.planLabel || 'Investment Plan',
        minAmount: Number(p.minAmount),
        maxAmount: p.maxAmount ? Number(p.maxAmount) : null,
        depositRange: `${minLabel} - ${maxLabel}`,
        profitRate: `${Number(p.dailyProfit).toFixed(2)}%`,
        profitNumber: Number(p.dailyProfit),
        dailyProfit: Number(p.dailyProfit),
        profitLabel: (p.paymentPeriod?.toLowerCase() === 'hourly' || p.payment_period?.toLowerCase() === 'hourly') ? 'Hourly Profit (%)' : (p.profitType || 'Daily Profit (%)'),
        paymentPeriod: p.paymentPeriod || 'Daily',
        payment_period: p.paymentPeriod || 'Daily',
        durationDays: p.durationDays || (p.durationHours ? Math.ceil(p.durationHours / 24) : 30),
        duration: `${p.durationDays || (p.durationHours ? Math.ceil(p.durationHours / 24) : 30)} Days`,
        isPromo: Boolean(p.isPromo),
        status: p.status,
        createdAt: p.createdAt
      };
    });

    const activeWallets = await getActiveCompanyWallets(prisma);

    return res.json({
      success: true,
      plans: formattedPlans,
      wallets: activeWallets,
      accountBalance: userBalance,
      userBalances
    });
  } catch (err) {
    console.error('Failed to fetch deposit plans from database:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch deposit plans' });
  }
});

// POST create / spend a deposit order
app.post(['/api/deposit', '/api/deposits'], async (req, res) => {
  try {
    const { planId, amount, paymentMethod, processorId, payment_method, mode, depositMode } = req.body;
    const numAmount = parseFloat(amount);
    const selectedProcId = processorId || (payment_method ? payment_method.toLowerCase() : 'bitcoin');
    const selectedPlanId = planId || 'foundation';

    // Find the real plan from PostgreSQL database
    let plan = await prisma.investmentPlan.findUnique({
      where: { id: selectedPlanId }
    }).catch(() => null);

    if (!plan) {
      plan = await prisma.investmentPlan.findFirst({
        where: {
          OR: [
            { name: { contains: selectedPlanId, mode: 'insensitive' } },
            { planLabel: { contains: selectedPlanId, mode: 'insensitive' } }
          ]
        }
      });
    }

    if (!plan) {
      plan = await prisma.investmentPlan.findFirst({ orderBy: { minAmount: 'asc' } });
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid deposit amount.' });
    }

    if (plan && numAmount < Number(plan.minAmount)) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit for ${plan.name} is $${Number(plan.minAmount).toFixed(2)}.`
      });
    }

    if (plan && plan.maxAmount && numAmount > Number(plan.maxAmount)) {
      return res.status(400).json({
        success: false,
        message: `Maximum deposit for ${plan.name} is $${Number(plan.maxAmount).toFixed(2)}.`
      });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Please log in to activate an investment deposit.' });
    }

    const activeWallets = await getActiveCompanyWallets(prisma);
    const walletInfo = activeWallets[selectedProcId] || activeWallets.bitcoin;

    // Direct spend from account balance
    if (paymentMethod === 'balance') {
      let currencyBalanceField = null;
      let currencyLabel = 'Account';
      if (selectedProcId === 'bitcoin' || selectedProcId === 'btc') {
        currencyBalanceField = 'btcBalance';
        currencyLabel = 'Bitcoin';
      } else if (selectedProcId === 'usdt_trc20' || selectedProcId === 'usdt-trc20') {
        currencyBalanceField = 'usdtTrc20Balance';
        currencyLabel = 'USDT (TRC20)';
      } else if (selectedProcId === 'usdt_bep20' || selectedProcId === 'usdt-bep20') {
        currencyBalanceField = 'usdtBep20Balance';
        currencyLabel = 'USDT (BEP20)';
      } else if (selectedProcId === 'litecoin' || selectedProcId === 'ltc') {
        currencyBalanceField = 'ltcBalance';
        currencyLabel = 'Litecoin';
      }

      const specificBal = currencyBalanceField ? parseFloat(user[currencyBalanceField] || 0) : parseFloat(user.balance || 0);
      if (specificBal < numAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient ${currencyLabel} balance ($${specificBal.toFixed(2)}). You requested $${numAmount.toFixed(2)}. Please choose the Crypto Topup option or select a currency with sufficient funds.`
        });
      }

      // Deduct from specific currency balance & user wallet (profit/deposit), add to staked balance in PostgreSQL
      const updateData = {
        balance: { decrement: numAmount },
        stakedBalance: { increment: numAmount },
        totalDeposits: { increment: numAmount }
      };
      if (currencyBalanceField) {
        updateData[currencyBalanceField] = { decrement: numAmount };
      }

      // Primary deduction from Deposit Balance (Capital Wallet). Fallback to Profit Balance if insufficient.
      const userDeposit = parseFloat(user.depositBalance || user.deposit_balance || 0);
      const userProfit = parseFloat(user.profitBalance || user.profit_balance || 0);

      const depositDeduct = Math.min(userDeposit, numAmount);
      const profitDeduct = numAmount - depositDeduct;

      if (depositDeduct > 0) {
        updateData.depositBalance = { decrement: depositDeduct };
      }
      if (profitDeduct > 0) {
        updateData.profitBalance = { decrement: profitDeduct };
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });

      // Create persistent Deposit record in PostgreSQL
      const depositOrder = await prisma.deposit.create({
        data: {
          userId: user.id,
          planId: plan.id,
          planName: plan.name,
          amount: numAmount,
          currency: walletInfo.name,
          paymentMethod: 'balance',
          walletAddress: 'Account Balance',
          status: 'APPROVED'
        }
      });

      // Create persistent Transaction record
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'STAKE',
          amount: numAmount,
          description: `Plan ${plan.name} activated directly from account balance`,
          status: 'COMPLETED'
        }
      });

      // Send deposit email notification asynchronously
      sendDepositEmail({
        user,
        deposit: depositOrder,
        action: 'APPROVED'
      }).catch(e => console.error('Error sending balance deposit email:', e));

      return res.json({
        success: true,
        message: `Plan ${plan.name} activated successfully from account balance!`,
        newBalance: updatedUser.balance,
        order: depositOrder,
        deposit: depositOrder
      });
    }

    // Direct crypto deposit (Automatic or Manual Gateway)
    const targetMode = depositMode || mode || 'automatic';
    const OXAPAY_MERCHANT_KEY = process.env.OXAPAY_MERCHANT_KEY;
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

    // If Automatic deposit mode and OxaPay Merchant Key is configured, generate dynamic crypto address
    if (targetMode === 'automatic' && OXAPAY_MERCHANT_KEY) {
      try {
        let payCurrency = 'USDT';
        let oxapayNetwork = 'trc20';

        const procLower = (selectedProcId || '').toLowerCase();
        if (procLower.includes('bep20') || procLower.includes('bsc')) {
          payCurrency = 'USDT';
          oxapayNetwork = 'bep20';
        } else if (procLower.includes('trc20') || procLower.includes('tron')) {
          payCurrency = 'USDT';
          oxapayNetwork = 'trc20';
        } else if (procLower.includes('btc') || procLower.includes('bitcoin')) {
          payCurrency = 'BTC';
          oxapayNetwork = 'btc';
        } else if (procLower.includes('ltc') || procLower.includes('litecoin')) {
          payCurrency = 'LTC';
          oxapayNetwork = 'ltc';
        } else if (procLower.includes('eth') || procLower.includes('erc20')) {
          payCurrency = 'ETH';
          oxapayNetwork = 'erc20';
        }

        const invoiceRes = await fetch('https://api.oxapay.com/merchants/request/whitelabel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant: OXAPAY_MERCHANT_KEY,
            amount: numAmount,
            payCurrency,
            network: oxapayNetwork,
            feePaidByPayer: 0,
            callbackUrl: `${BACKEND_URL}/api/oxapay-webhook`,
            description: `DigitalXTrade Deposit - ${walletInfo.name}`
          })
        });

        const json = await invoiceRes.json();
        const returnedAddress = json.payAddress || json.address;

        if (json.result === 100 && returnedAddress) {
          const depositOrder = await prisma.deposit.create({
            data: {
              userId: user.id,
              planId: plan.id,
              planName: plan.name,
              amount: numAmount,
              currency: walletInfo.name,
              paymentMethod: 'crypto_automatic',
              walletAddress: returnedAddress,
              txHash: String(json.trackId),
              adminNote: `TrackID: ${json.trackId}`,
              status: 'PENDING'
            }
          });

          await prisma.transaction.create({
            data: {
              id: depositOrder.id,
              userId: user.id,
              type: 'DEPOSIT',
              amount: numAmount,
              description: `Automatic deposit initiated via ${walletInfo.name} for ${plan.name} (TrackID: ${json.trackId})`,
              status: 'PENDING'
            }
          });


          return res.json({
            success: true,
            message: 'Automatic payment address generated successfully',
            dynamic: true,
            address: returnedAddress,
            payAddress: returnedAddress,
            trackId: json.trackId,
            order: {
              ...depositOrder,
              payAddress: returnedAddress,
              address: returnedAddress,
              network: walletInfo.network,
              processorName: walletInfo.name,
              trackId: json.trackId
            },
            deposit: depositOrder
          });
        }
      } catch (oxaErr) {
        console.error('OXAPAY_INVOICE_ERROR:', oxaErr);
      }
    }

    // Manual crypto deposit or fallback static wallet address
    const depositOrder = await prisma.deposit.create({
      data: {
        userId: user.id,
        planId: plan.id,
        planName: plan.name,
        amount: numAmount,
        currency: walletInfo.name,
        paymentMethod: 'crypto_manual',
        walletAddress: walletInfo.address,
        status: 'PENDING'
      }
    });

    await prisma.transaction.create({
      data: {
        id: depositOrder.id,
        userId: user.id,
        type: 'DEPOSIT',
        amount: numAmount,
        description: `Manual deposit initiated via ${walletInfo.name} for ${plan.name}`,
        status: 'PENDING'
      }
    });


    return res.json({
      success: true,
      message: 'Deposit invoice generated successfully',
      dynamic: false,
      address: walletInfo.address,
      payAddress: walletInfo.address,
      order: {
        ...depositOrder,
        payAddress: walletInfo.address,
        address: walletInfo.address,
        network: walletInfo.network,
        processorName: walletInfo.name
      },
      deposit: depositOrder
    });
  } catch (err) {
    console.error('Create deposit error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process deposit' });
  }
});

// OxaPay Automated Webhook Listener
app.all(['/api/oxapay-webhook', '/oxapay-webhook'], async (req, res) => {
  try {
    const payload = req.body || {};
    const signature = req.headers['x-oxapay-signature'];
    const OXAPAY_MERCHANT_KEY = process.env.OXAPAY_MERCHANT_KEY;

    if (OXAPAY_MERCHANT_KEY && signature) {
      const hmac = crypto.createHmac('sha512', OXAPAY_MERCHANT_KEY);
      const expectedSignature = hmac.update(JSON.stringify(payload)).digest('hex');
      if (signature !== expectedSignature) {
        console.error('OXAPAY_WEBHOOK_INVALID_SIGNATURE');
        return res.status(200).json({ ok: false, error: 'Invalid signature' });
      }
    }

    const rawStatus = payload?.status;

    if (rawStatus === 2 || rawStatus === 'Paid') {
      const paidAmount = Number(payload.amount) || 0;
      const trackId = payload.trackId ? String(payload.trackId) : '';

      let deposit = null;
      if (trackId) {
        deposit = await prisma.deposit.findFirst({
          where: {
            OR: [
              { txHash: trackId, status: 'PENDING' },
              { id: trackId, status: 'PENDING' },
              { adminNote: { contains: trackId }, status: 'PENDING' }
            ]
          }
        });
      }

      if (!deposit) {
        deposit = await prisma.deposit.findFirst({
          where: {
            amount: paidAmount,
            status: 'PENDING'
          }
        });
      }

      if (deposit && deposit.status !== 'APPROVED') {
        await prisma.$transaction(async (tx) => {
          await tx.deposit.update({
            where: { id: deposit.id },
            data: { status: 'APPROVED' }
          });

          await tx.user.update({
            where: { id: deposit.userId },
            data: {
              balance: { increment: deposit.amount },
              totalDeposits: { increment: deposit.amount }
            }
          });

          const existingTx = await tx.transaction.findFirst({
            where: {
              OR: [
                { id: deposit.id },
                { userId: deposit.userId, amount: deposit.amount, status: 'PENDING', type: 'DEPOSIT' }
              ]
            },
            orderBy: { createdAt: 'desc' }
          });
          if (existingTx) {
            await tx.transaction.update({
              where: { id: existingTx.id },
              data: {
                status: 'COMPLETED',
                description: `Automated Deposit of ${deposit.amount} (${deposit.currency}) via OxaPay`
              }
            });
          } else {
            await tx.transaction.create({
              data: {
                id: deposit.id,
                userId: deposit.userId,
                type: 'DEPOSIT',
                amount: deposit.amount,
                description: `Automated Deposit of ${deposit.amount} (${deposit.currency}) via OxaPay`,
                status: 'COMPLETED'
              }
            });
          }
        });

        // Send email notification to user asynchronously
        prisma.user.findUnique({ where: { id: deposit.userId }, include: { referredBy: true } })
          .then(async depositUser => {
            if (depositUser) {
              sendDepositEmail({
                user: depositUser,
                deposit: { ...deposit, status: 'APPROVED' },
                action: 'APPROVED'
              }).catch(e => console.error('Error sending OxaPay deposit email:', e));

              // Process 10% referral commission for inviter
              try {
                const inviter = depositUser.referredBy || (depositUser.referredById ? await prisma.user.findUnique({ where: { id: depositUser.referredById } }) : null);
                if (inviter) {
                  const commAmount = parseFloat((deposit.amount * 0.10).toFixed(2));
                  if (commAmount > 0) {
                    await prisma.user.update({
                      where: { id: inviter.id },
                      data: {
                        balance: { increment: commAmount },
                        referralCommissions: { increment: commAmount }
                      }
                    });
                    await prisma.transaction.create({
                      data: {
                        userId: inviter.id,
                        type: 'COMMISSION',
                        amount: commAmount,
                        description: `10% Referral Commission from @${depositUser.username || depositUser.fullName || 'referral'}'s deposit of ${deposit.amount.toFixed(2)}`,
                        status: 'COMPLETED'
                      }
                    });
                    sendReferralCommissionEmail({
                      inviter,
                      referee: depositUser,
                      commissionAmount: commAmount,
                      depositAmount: deposit.amount,
                      level: 1,
                      percentage: 10
                    }).catch(e => console.error('Error sending OxaPay referral commission email:', e));
                  }
                }
              } catch (refErr) {
                console.error('Error processing referral commission on OxaPay deposit:', refErr);
              }
            }
          })
          .catch(emailErr => console.error('Error querying user for OxaPay deposit email:', emailErr));

        return res.status(200).json({ ok: true, message: 'Deposit credited automatically' });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('OXAPAY_WEBHOOK_ERROR:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET Deposit Status
app.get(['/api/deposit/status/:id', '/api/deposits/status/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const deposit = await prisma.deposit.findUnique({ where: { id } });

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit record not found' });
    }

    const isConfirmed = deposit.status === 'APPROVED';

    return res.json({
      success: true,
      status: deposit.status,
      isConfirmed,
      amount: deposit.amount,
      paymentMethod: deposit.currency,
      deposit
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to query deposit status' });
  }
});

// POST confirm deposit with TXID
app.post('/api/deposit/confirm', async (req, res) => {
  try {
    const { orderId, txHash } = req.body;
    const deposit = await prisma.deposit.findUnique({ where: { id: orderId } });
    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit order not found.' });
    }

    const updated = await prisma.deposit.update({
      where: { id: orderId },
      data: {
        txHash: txHash || '',
        status: 'PENDING',
        adminNote: `User submitted TXID: ${txHash}`
      }
    });


    return res.json({
      success: true,
      message: 'Payment confirmation received. Your deposit will be credited after confirmation.',
      order: updated
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to submit payment confirmation' });
  }
});

// GET user transactions endpoint
app.get(['/api/transactions', '/api/user/transactions'], async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const userId = user ? user.id : req.query.userId;

    const whereClause = userId ? { userId } : {};
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    const formatted = transactions.map(t => ({
      id: t.id,
      type: t.type,
      description: t.description,
      amount: t.amount,
      status: t.status,
      created_at: t.createdAt,
      createdAt: t.createdAt
    }));

    return res.json({
      success: true,
      transactions: formatted,
      data: formatted
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user transactions' });
  }
});

// GET user referral statistics and team list
app.get(['/api/referrals', '/api/user/referrals'], async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.json({
        success: true,
        totalMembers: 0,
        totalActiveReferrals: 0,
        teamCommission: 0.00,
        referrals: []
      });
    }

    const team = await prisma.user.findMany({
      where: { referredById: user.id },
      include: { deposits: true },
      orderBy: { createdAt: 'desc' }
    });

    const activeMembersCount = team.filter(m => {
      const hasDeposits = m.deposits && m.deposits.some(d => d.status === 'APPROVED' || d.status === 'ACTIVE' || d.status === 'COMPLETED');
      const hasBalance = parseFloat(m.balance || 0) > 0 || parseFloat(m.stakedBalance || 0) > 0 || parseFloat(m.totalDeposits || 0) > 0;
      return !m.isSuspended && (hasDeposits || hasBalance);
    }).length;

    const referralsList = team.map(m => {
      const hasDeposits = m.deposits && m.deposits.some(d => d.status === 'APPROVED' || d.status === 'ACTIVE' || d.status === 'COMPLETED');
      const hasBalance = parseFloat(m.balance || 0) > 0 || parseFloat(m.stakedBalance || 0) > 0 || parseFloat(m.totalDeposits || 0) > 0;
      const isActive = !m.isSuspended && (hasDeposits || hasBalance);

      return {
        id: m.id,
        username: m.username || m.email,
        level: 'Level 1',
        registeredAt: m.createdAt,
        created_at: m.createdAt,
        status: m.isSuspended ? 'Suspended' : (isActive ? 'Active' : 'Inactive'),
        isActive,
        commission: 0.00
      };
    });

    return res.json({
      success: true,
      totalMembers: team.length,
      totalActiveReferrals: activeMembersCount,
      teamCommission: parseFloat(user.referralCommissions || 0),
      referrals: referralsList
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch referrals' });
  }
});

// GET user dashboard statistics & recent transactions
app.get('/api/user/dashboard', async (req, res) => {
  try {
    const user = await getAuthUser(req);

    if (!user) {
      return res.json({
        success: true,
        user: null,
        data: {
          balance: 0.00,
          earnedTotal: 0.00,
          totalDeposit: 0.00,
          lastDeposit: 0.00,
          pendingWithdrawal: 0.00,
          withdrewTotal: 0.00,
          lastWithdrawal: 0.00,
          transactions: []
        }
      });
    }

    // Real-time staking yield processing on user dashboard fetch (matching stakelab-backend pattern)
    try {
      await runProfitPayouts(user.id);
    } catch (yieldErr) {
      console.error('[YIELD] Error processing user yields on dashboard fetch:', yieldErr.message);
    }

    // Refresh user records with latest yields and balances
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        deposits: { orderBy: { createdAt: 'desc' } },
        withdrawals: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } }
      }
    });
    const activeUser = freshUser || user;

    // Real database calculations for this user
    const approvedDeposits = activeUser.deposits.filter(d => d.status === 'APPROVED');
    const totalDeposit = approvedDeposits.reduce((acc, d) => acc + parseFloat(d.amount || 0), 0);
    const lastDepositObj = activeUser.deposits.length > 0 ? activeUser.deposits[0] : null;
    const lastDeposit = lastDepositObj ? parseFloat(lastDepositObj.amount || 0) : 0.00;

    const pendingWithdrawals = activeUser.withdrawals.filter(w => w.status === 'PENDING');
    const pendingWithdrawal = pendingWithdrawals.reduce((acc, w) => acc + parseFloat(w.amount || 0), 0);
    const approvedWithdrawals = activeUser.withdrawals.filter(w => w.status === 'APPROVED');
    const withdrewTotal = approvedWithdrawals.reduce((acc, w) => acc + parseFloat(w.amount || 0), 0);
    const lastWithdrawalObj = activeUser.withdrawals.length > 0 ? activeUser.withdrawals[0] : null;
    const lastWithdrawal = lastWithdrawalObj ? parseFloat(lastWithdrawalObj.amount || 0) : 0.00;

    const transactions = activeUser.transactions.map(t => ({
      id: t.id,
      type: t.type,
      description: t.description,
      amount: t.amount,
      status: t.status,
      created_at: t.createdAt,
      createdAt: t.createdAt
    }));

    return res.json({
      success: true,
      user: {
        id: activeUser.id,
        email: activeUser.email,
        username: activeUser.username,
        fullName: activeUser.fullName,
        balance: parseFloat(activeUser.balance || 0),
        btcBalance: parseFloat(activeUser.btcBalance || 0),
        usdtTrc20Balance: parseFloat(activeUser.usdtTrc20Balance || 0),
        usdtBep20Balance: parseFloat(activeUser.usdtBep20Balance || 0),
        ltcBalance: parseFloat(activeUser.ltcBalance || 0),
        stakedBalance: parseFloat(activeUser.stakedBalance || 0),
        adminNote: activeUser.adminNote || '',
        admin_note: activeUser.adminNote || '',
        deposits: activeUser.deposits,
        withdrawals: activeUser.withdrawals,
        createdAt: activeUser.createdAt
      },
      data: {
        balance: parseFloat(activeUser.balance || 0),
        btcBalance: parseFloat(activeUser.btcBalance || 0),
        usdtTrc20Balance: parseFloat(activeUser.usdtTrc20Balance || 0),
        usdtBep20Balance: parseFloat(activeUser.usdtBep20Balance || 0),
        ltcBalance: parseFloat(activeUser.ltcBalance || 0),
        stakedBalance: parseFloat(activeUser.stakedBalance || 0),
        adminNote: activeUser.adminNote || '',
        admin_note: activeUser.adminNote || '',
        earnedTotal: parseFloat(activeUser.totalEarnings || 0),
        totalDeposit,
        lastDeposit,
        pendingWithdrawal,
        withdrewTotal,
        lastWithdrawal,
        transactions: transactions.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('User dashboard API error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load user dashboard stats' });
  }
});


// POST support ticket / contact message
app.post(['/api/support', '/api/support/ticket'], async (req, res) => {
  try {
    const { name, email, message, subject } = req.body;
    const authUser = await getAuthUser(req);
    const ticketId = 'TCK-' + Math.floor(100000 + Math.random() * 900000);

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketId,
        userId: authUser?.id || null,
        name: name || authUser?.fullName || 'Anonymous',
        email: email || authUser?.email || '',
        subject: subject || 'Support Request from Contact Form',
        message: message || '',
        status: 'OPEN',
        priority: 'MEDIUM',
        messages: {
          create: [
            {
              senderRole: 'USER',
              senderName: name || authUser?.fullName || 'User',
              message: message || ''
            }
          ]
        }
      }
    });

    return res.status(201).json({ success: true, message: 'Support ticket submitted successfully', ticket });
  } catch (err) {
    console.error('Failed to create support ticket:', err);
    return res.status(500).json({ success: false, message: 'Failed to create support ticket' });
  }
});

// Manual / External endpoint to run profit & yield cron on demand
app.all(['/api/cron/run', '/api/cron/run-yields', '/api/admin/cron/run'], async (req, res) => {
  try {
    const stats = await runProfitPayouts();
    return res.json({
      success: true,
      message: 'Automated profit payout cron executed successfully.',
      timestamp: new Date(),
      stats
    });
  } catch (err) {
    console.error('Manual cron trigger error:', err);
    return res.status(500).json({ success: false, message: 'Cron execution error: ' + err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`[digital-backend] Server running on http://localhost:${PORT}`);
  // Bootstrap database tables and seed initial records if empty
  await ensureDatabaseBootstrapped();
  // Initialize Automated Investment Yield & Profit Engine (every 60s)
  initCron();
});


// Nodemon reload trigger: 1790878412871
