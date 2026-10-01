// Shared In-Memory Application Store for DigitalXTrade Backend

export const securitySettings = {
  ipSensitivity: 'disabled', // 'disabled' | 'medium' | 'high' | 'paranoic'
  browserChange: 'disabled', // 'disabled' | 'enabled'
  twoFactorEnabled: false,
  secretCode: 'JRZE4OI7K5GLALIG',
  otpAuthUrl: 'otpauth://totp/DigitalXTrade:user?secret=JRZE4OI7K5GLALIG&issuer=DigitalXTrade',
  updatedAt: new Date().toISOString()
};

export const withdrawalData = {
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

export const depositPlans = [
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

export const companyDepositWallets = {
  bitcoin: {
    name: 'BITCOIN',
    address: 'bc1qwz6fqarhsuhgllxnqz3ekq8krdfgctkl6r5utk',
    network: 'Bitcoin Mainnet'
  },
  usdt_trc20: {
    name: 'USDT(TRC20)',
    address: 'TQsUzgqcBhJe47Tx8fCzEi9GJJUpfpYyio',
    network: 'Tron (TRC-20)'
  },
  usdt_bep20: {
    name: 'USDT(BEP20)',
    address: '0x003848D153e45DDdd24d498B921A888a5567C9c3',
    network: 'BNB Smart Chain (BEP-20)'
  },
  litecoin: {
    name: 'LITECOIN',
    address: 'ltc1qzhnnvz4gqe7ejhkxgw4jcys28wj6ru2ce79tan',
    network: 'Litecoin Mainnet'
  }
};

export const userDepositsList = [];
