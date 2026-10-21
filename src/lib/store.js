// DigitalXTrade Company Deposit Wallets & Live Resolvers

export const DEFAULT_COMPANY_WALLETS = {
  bitcoin: {
    id: 'bitcoin',
    currency: 'bitcoin',
    name: 'BITCOIN',
    symbol: 'BTC',
    address: 'bc1qwz6fqarhsuhgllxnqz3ekq8krdfgctkl6r5utk',
    network: 'Bitcoin Mainnet'
  },
  usdt_trc20: {
    id: 'usdt_trc20',
    currency: 'usdt_trc20',
    name: 'USDT(TRC20)',
    symbol: 'USDT',
    address: 'TQsUzgqcBhJe47Tx8fCzEi9GJJUpfpYyio',
    network: 'Tron (TRC-20)'
  },
  usdt_bep20: {
    id: 'usdt_bep20',
    currency: 'usdt_bep20',
    name: 'USDT(BEP20)',
    symbol: 'USDT',
    address: '0x003848D153e45DDdd24d498B921A888a5567C9c3',
    network: 'BNB Smart Chain (BEP-20)'
  },
  litecoin: {
    id: 'litecoin',
    currency: 'litecoin',
    name: 'LITECOIN',
    symbol: 'LTC',
    address: 'ltc1qzhnnvz4gqe7ejhkxgw4jcys28wj6ru2ce79tan',
    network: 'Litecoin Mainnet'
  }
};

export const companyDepositWallets = DEFAULT_COMPANY_WALLETS;

/**
 * Resolves active company wallets by querying PostgreSQL company_wallets table.
 * If an address is empty, missing, or null in the database, automatically falls back
 * to DEFAULT_COMPANY_WALLETS.
 */
export async function getActiveCompanyWallets(prismaClient) {
  const wallets = JSON.parse(JSON.stringify(DEFAULT_COMPANY_WALLETS));
  if (!prismaClient) return wallets;

  try {
    const dbWallets = await prismaClient.companyWallet.findMany();
    for (const dbW of dbWallets) {
      const key = (dbW.currency || '').toLowerCase();
      if (wallets[key]) {
        const trimmed = (dbW.address || '').trim();
        const fallback = DEFAULT_COMPANY_WALLETS[key].address;
        const hasCustom = trimmed.length > 0 && trimmed !== fallback;
        wallets[key] = {
          ...wallets[key],
          dbId: dbW.id,
          name: dbW.name || wallets[key].name,
          network: dbW.network || wallets[key].network,
          address: trimmed.length > 0 ? trimmed : fallback,
          fallbackAddress: fallback,
          isCustom: hasCustom,
          updatedAt: dbW.updatedAt
        };
      }
    }
} catch (err) {
    console.warn('Error reading CompanyWallet from DB, using fallbacks:', err.message);
  }
  return wallets;
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'depositWithdrawalConfig.json');

export const DEFAULT_DEPOSIT_WITHDRAWAL_CONFIG = {
  dailyWithdrawLimit: '5',
  maxDailyWithdrawalAmount: '50000',
  maxDailyBtcWithdrawal: '20000',
  maxDailyUsdtWithdrawal: '50000',
  maxDailyEthWithdrawal: '20000',
  maxDailyLtcWithdrawal: '10000',
  minDeposit: '10',
  maxDeposit: '1000000',
  minPayout: '10',
  maxPayout: '50000',
  payoutCharge: '5', // Default 5% platform withdrawal fee
  rechargeNotice: 'Deposit funds using our supported decentralized gateways. All payments require standard network confirmations.',
  withdrawNotice: 'Withdrawals are processed promptly to your verified wallet address.'
};

let currentDepositWithdrawalConfig = { ...DEFAULT_DEPOSIT_WITHDRAWAL_CONFIG };

// Load saved config on boot
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    currentDepositWithdrawalConfig = { ...DEFAULT_DEPOSIT_WITHDRAWAL_CONFIG, ...parsed };
  }
} catch (e) {
  console.warn('Could not read depositWithdrawalConfig.json, using defaults:', e.message);
}

export function getDepositWithdrawalConfig() {
  return { ...currentDepositWithdrawalConfig };
}

export function updateDepositWithdrawalConfig(newSettings) {
  if (newSettings && typeof newSettings === 'object') {
    currentDepositWithdrawalConfig = { ...currentDepositWithdrawalConfig, ...newSettings };
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentDepositWithdrawalConfig, null, 2), 'utf8');
    } catch (e) {
      console.warn('Could not write depositWithdrawalConfig.json:', e.message);
    }
  }
  return { ...currentDepositWithdrawalConfig };
}

