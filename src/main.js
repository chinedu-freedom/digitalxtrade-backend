import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Auth and Admin Routes
app.use('/api/auth', authRoutes);
app.use('/api', authRoutes);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Digital Backend API Server Running', timestamp: new Date() });
});

// Security Settings State (persisted with fallback default)
let securitySettings = {
  ipSensitivity: 'disabled', // 'disabled' | 'medium' | 'high' | 'paranoic'
  browserChange: 'disabled', // 'disabled' | 'enabled'
  twoFactorEnabled: false,
  secretCode: 'JRZE4OI7K5GLALIG',
  otpAuthUrl: 'otpauth://totp/DigitalXTrade:user?secret=JRZE4OI7K5GLALIG&issuer=DigitalXTrade',
  updatedAt: new Date().toISOString()
};

// GET current security settings
app.get('/api/security', (req, res) => {
  res.json({
    success: true,
    settings: securitySettings
  });
});

// POST update security settings (IP Sensitivity and Browser Change)
app.post('/api/security/settings', (req, res) => {
  const { ipSensitivity, browserChange } = req.body;
  
  if (ipSensitivity && ['disabled', 'medium', 'high', 'paranoic'].includes(ipSensitivity.toLowerCase())) {
    securitySettings.ipSensitivity = ipSensitivity.toLowerCase();
  }

  if (browserChange && ['disabled', 'enabled'].includes(browserChange.toLowerCase())) {
    securitySettings.browserChange = browserChange.toLowerCase();
  }

  securitySettings.updatedAt = new Date().toISOString();

  res.json({
    success: true,
    message: 'Security settings updated successfully',
    settings: securitySettings
  });
});

// POST enable 2FA
app.post('/api/security/2fa/enable', (req, res) => {
  const { token, secretCode } = req.body;

  if (!token || !/^\d{6}$/.test(token.toString().trim())) {
    return res.status(400).json({
      success: false,
      message: 'Invalid two-factor authentication token. Please enter a valid 6-digit code.'
    });
  }

  securitySettings.twoFactorEnabled = true;
  if (secretCode) {
    securitySettings.secretCode = secretCode;
  }
  securitySettings.updatedAt = new Date().toISOString();

  res.json({
    success: true,
    message: 'Two-Factor Authentication enabled successfully',
    settings: securitySettings
  });
});

// POST disable 2FA
app.post('/api/security/2fa/disable', (req, res) => {
  const { token } = req.body;

  if (!token || !/^\d{6}$/.test(token.toString().trim())) {
    return res.status(400).json({
      success: false,
      message: 'Invalid token. Please enter your 6-digit authentication code to disable 2FA.'
    });
  }

  securitySettings.twoFactorEnabled = false;
  securitySettings.updatedAt = new Date().toISOString();

  res.json({
    success: true,
    message: 'Two-Factor Authentication has been disabled',
    settings: securitySettings
  });
});

// Withdrawal State and Wallets
let withdrawalData = {
  accountBalance: 0.00,
  pendingWithdrawals: 0.00,
  currencies: [
    {
      id: 'bitcoin',
      symbol: 'BTC',
      name: 'BITCOIN',
      available: 0.00,
      pending: 0.00,
      accountId: '88888888',
      minWithdrawal: 20.00,
      fee: 0.00
    },
    {
      id: 'usdt_trc20',
      symbol: 'USDT-TRC20',
      name: 'USDT(TRC20)',
      available: 0.00,
      pending: 0.00,
      accountId: '88888888',
      minWithdrawal: 10.00,
      fee: 0.00
    },
    {
      id: 'usdt_bep20',
      symbol: 'USDT-BEP20',
      name: 'USDT(BEP20)',
      available: 0.00,
      pending: 0.00,
      accountId: 'Bbsjeie',
      minWithdrawal: 10.00,
      fee: 0.00
    },
    {
      id: 'litecoin',
      symbol: 'LTC',
      name: 'LITECOIN',
      available: 0.00,
      pending: 0.00,
      accountId: 'Jsjwkwkw',
      minWithdrawal: 15.00,
      fee: 0.00
    }
  ],
  transactions: []
};

// GET withdrawal information
app.get('/api/withdraw', (req, res) => {
  res.json({
    success: true,
    data: withdrawalData
  });
});

// POST submit a withdrawal request
app.post('/api/withdraw', (req, res) => {
  const { currencyId, amount } = req.body;
  const numAmount = parseFloat(amount);

  const currency = withdrawalData.currencies.find(c => c.id === currencyId);
  if (!currency) {
    return res.status(400).json({
      success: false,
      message: 'Invalid currency selected for withdrawal.'
    });
  }

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid withdrawal amount.'
    });
  }

  if (numAmount > currency.available) {
    return res.status(400).json({
      success: false,
      message: `You have insufficient ${currency.name} balance. Available: $${currency.available.toFixed(2)}`
    });
  }

  if (numAmount < currency.minWithdrawal) {
    return res.status(400).json({
      success: false,
      message: `Minimum withdrawal for ${currency.name} is $${currency.minWithdrawal.toFixed(2)}.`
    });
  }

  // Deduct available, add to pending
  currency.available -= numAmount;
  currency.pending += numAmount;
  withdrawalData.accountBalance = withdrawalData.currencies.reduce((s, c) => s + c.available, 0);
  withdrawalData.pendingWithdrawals = withdrawalData.currencies.reduce((s, c) => s + c.pending, 0);

  const tx = {
    id: `WD-${Date.now()}`,
    currency: currency.name,
    amount: numAmount,
    destination: currency.accountId,
    status: 'Pending',
    createdAt: new Date().toISOString()
  };
  withdrawalData.transactions.unshift(tx);

  res.json({
    success: true,
    message: `Withdrawal request for $${numAmount.toFixed(2)} ${currency.name} submitted successfully!`,
    data: withdrawalData,
    transaction: tx
  });
});

// POST update withdrawal account address
app.post('/api/withdraw/account', (req, res) => {
  const { currencyId, accountId } = req.body;
  const currency = withdrawalData.currencies.find(c => c.id === currencyId);
  if (!currency) {
    return res.status(400).json({ success: false, message: 'Currency not found.' });
  }

  currency.accountId = accountId || '';
  res.json({
    success: true,
    message: `Account address updated for ${currency.name}`,
    data: withdrawalData
  });
});

// Deposit Plans and Deposit Management State
const depositPlans = [
  {
    id: 'foundation',
    name: 'FOUNDATION PLAN',
    planLabel: 'Plan 1',
    minAmount: 40.00,
    maxAmount: 4999.00,
    dailyProfit: 2.80,
    profitType: 'Daily Profit (%)',
    durationDays: 30,
    isPromo: false
  },
  {
    id: 'acceleration',
    name: 'ACCELERATION PLAN',
    planLabel: 'Plan 2',
    minAmount: 5000.00,
    maxAmount: 9999.00,
    dailyProfit: 5.50,
    profitType: 'Daily Profit (%)',
    durationDays: 30,
    isPromo: false
  },
  {
    id: 'stability',
    name: 'STABILITY PLAN',
    planLabel: 'Plan 3',
    minAmount: 10000.00,
    maxAmount: 19999.00,
    dailyProfit: 8.50,
    profitType: 'Daily Profit (%)',
    durationDays: 30,
    isPromo: false
  },
  {
    id: 'wealth',
    name: 'WEALTH PLAN',
    planLabel: 'Plan 4',
    minAmount: 20000.00,
    maxAmount: null,
    dailyProfit: 10.50,
    profitType: 'Daily Profit (%)',
    durationDays: 30,
    isPromo: false
  },
  {
    id: 'promo1',
    name: 'DIGITALXTRADE MAX PLAN(250% In 48 hours)',
    planLabel: 'PROMO PLAN1',
    minAmount: 1000.00,
    maxAmount: 4999.00,
    dailyProfit: 300.00,
    profitType: 'Profit (%)',
    durationHours: 48,
    isPromo: true
  },
  {
    id: 'promo2',
    name: 'DIGITALXTRADE SUPER PLAN(500% In 72 hours)',
    planLabel: 'PROMO PLAN 2',
    minAmount: 5000.00,
    maxAmount: 100000.00,
    dailyProfit: 500.00,
    profitType: 'Profit (%)',
    durationHours: 72,
    isPromo: true
  }
];

const companyDepositWallets = {
  bitcoin: {
    name: 'BITCOIN',
    address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    network: 'Bitcoin Mainnet'
  },
  usdt_trc20: {
    name: 'USDT(TRC20)',
    address: 'TYDzsYUEpvnYmQk4zGP9sWWcTEd3GL6X7b',
    network: 'Tron (TRC-20)'
  },
  usdt_bep20: {
    name: 'USDT(BEP20)',
    address: '0x71C83605273C1964f4fB34b07D14187f58b0D892',
    network: 'BNB Smart Chain (BEP-20)'
  },
  litecoin: {
    name: 'LITECOIN',
    address: 'ltc1qg62u6e45p20a6e026y24s9gsv9e49v3z27j7ea',
    network: 'Litecoin Mainnet'
  }
};

let userDepositsList = [];

// GET deposit plans and company deposit addresses
app.get('/api/deposit/plans', (req, res) => {
  res.json({
    success: true,
    plans: depositPlans,
    wallets: companyDepositWallets,
    accountBalance: withdrawalData.accountBalance
  });
});

// POST create / spend a deposit order
app.post('/api/deposit', (req, res) => {
  const { planId, amount, paymentMethod, processorId } = req.body;
  const numAmount = parseFloat(amount);

  const plan = depositPlans.find(p => p.id === planId);
  if (!plan) {
    return res.status(400).json({ success: false, message: 'Invalid plan selected.' });
  }

  if (isNaN(numAmount) || numAmount < plan.minAmount) {
    return res.status(400).json({
      success: false,
      message: `Minimum deposit for ${plan.name} is $${plan.minAmount.toFixed(2)}.`
    });
  }

  if (plan.maxAmount && numAmount > plan.maxAmount) {
    return res.status(400).json({
      success: false,
      message: `Maximum deposit for ${plan.name} is $${plan.maxAmount.toFixed(2)}.`
    });
  }

  const walletInfo = companyDepositWallets[processorId] || companyDepositWallets.bitcoin;

  const depositOrder = {
    id: `DEP-${Date.now()}`,
    planId: plan.id,
    planName: plan.name,
    planLabel: plan.planLabel,
    amount: numAmount,
    paymentMethod: paymentMethod || 'topup', // 'topup' or 'balance'
    processorId: processorId || 'bitcoin',
    processorName: walletInfo.name,
    payAddress: walletInfo.address,
    network: walletInfo.network,
    status: paymentMethod === 'balance' ? 'Active' : 'Awaiting Payment',
    createdAt: new Date().toISOString()
  };

  userDepositsList.unshift(depositOrder);

  res.json({
    success: true,
    message: 'Deposit invoice generated successfully',
    order: depositOrder
  });
});

// POST confirm deposit with TXID
app.post('/api/deposit/confirm', (req, res) => {
  const { orderId, txHash } = req.body;
  const order = userDepositsList.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  order.txHash = txHash || '';
  order.status = 'Under Review';
  order.confirmedAt = new Date().toISOString();

  res.json({
    success: true,
    message: 'Payment confirmation received. Your deposit will be credited after blockchain confirmation.',
    order
  });
});

app.listen(PORT, () => {
  console.log(`[digital-backend] Server running on http://localhost:${PORT}`);
});

