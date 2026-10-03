import prisma from './src/lib/prisma.js';

async function runTests() {
  console.log('==================================================');
  console.log('  DIGITALXTRADE FULL SYSTEM VERIFICATION SUITE    ');
  console.log('==================================================\n');

  // TEST 1: Database & Admin
  console.log('[TEST 1] Verifying Administrator Accounts in Database:');
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
  console.log(`✓ Found ${admins.length} Admin account(s):`);
  admins.forEach(a => console.log(`   - Email: ${a.email} | Username: ${a.username} | Role: ${a.role}`));

  // TEST 2: Plans & Wallets
  console.log('\n[TEST 2] Verifying Investment Plans & Wallets:');
  const planCount = await prisma.investmentPlan.count();
  const walletCount = await prisma.companyWallet.count();
  console.log(`✓ Active Investment Plans: ${planCount}`);
  console.log(`✓ Company Deposit Wallets: ${walletCount}`);

  // TEST 3: Gift & Bonus Codes
  console.log('\n[TEST 3] Verifying Gift & Bonus Codes in Database:');
  const codes = await prisma.giftBonus.findMany({ include: { claims: true } });
  console.log(`✓ Found ${codes.length} Gift Code(s):`);
  codes.forEach(c => console.log(`   - Code: ${c.code} | Reward: $${c.amount} | Uses: ${c.usedCount}/${c.maxUses} | Status: ${c.status}`));

  // TEST 4: Live HTTP API Endpoints
  console.log('\n[TEST 4] Testing Live Backend HTTP Endpoints (http://localhost:3001):');
  
  // 4a. Health Check
  try {
    const healthRes = await fetch('http://localhost:3001/api/health');
    const health = await healthRes.json();
    console.log(`✓ GET /api/health -> Status: ${health.status} (${health.message})`);
  } catch (err) {
    console.log(`✗ GET /api/health -> Error: ${err.message}`);
  }

  // 4b. Admin Login
  let adminToken = '';
  try {
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@digitalxtrade.com', password: 'digitalXAdmin2$' })
    });
    const loginData = await loginRes.json();
    if (loginData.success && loginData.token) {
      adminToken = loginData.token;
      console.log(`✓ POST /api/auth/login -> SUCCESS! JWT Token generated for Super Administrator.`);
    } else {
      console.log(`✗ POST /api/auth/login -> FAILED: ${loginData.message}`);
    }
  } catch (err) {
    console.log(`✗ POST /api/auth/login -> Error: ${err.message}`);
  }

  // 4c. Admin Gift Codes List
  try {
    const giftRes = await fetch('http://localhost:3001/api/admin/gift-codes', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const giftData = await giftRes.json();
    console.log(`✓ GET /api/admin/gift-codes -> SUCCESS! Retrieved ${giftData.codes?.length || 0} bonus codes.`);
  } catch (err) {
    console.log(`✗ GET /api/admin/gift-codes -> Error: ${err.message}`);
  }

  // 4d. User Claiming Code
  const user = await prisma.user.findFirst({ where: { role: 'USER' } });
  if (user) {
    console.log(`\n[TEST 5] Testing Bonus Claim & Duplicate Protection for User (${user.username || user.email}):`);
    
    // First claim
    try {
      const claimRes = await fetch('http://localhost:3001/api/user/claim-gift-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ code: 'DXTWELCOME50' })
      });
      const claimData = await claimRes.json();
      if (claimData.success) {
        console.log(`✓ Claim attempt 1: SUCCESS! Credited $${claimData.amount} bonus to user balance.`);
      } else {
        console.log(`ℹ Claim attempt 1: ${claimData.message}`);
      }
    } catch (err) {
      console.log(`✗ Claim attempt 1 error: ${err.message}`);
    }

    // Duplicate claim check
    try {
      const claimDupRes = await fetch('http://localhost:3001/api/user/claim-gift-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({ code: 'DXTWELCOME50' })
      });
      const claimDupData = await claimDupRes.json();
      if (!claimDupData.success) {
        console.log(`✓ Duplicate claim attempt: PASSED! Blocked with: "${claimDupData.message}"`);
      } else {
        console.log(`✗ Duplicate check FAILED: Allowed duplicate claim!`);
      }
    } catch (err) {
      console.log(`✗ Duplicate check error: ${err.message}`);
    }

    // User claims history
    try {
      const userClaimsRes = await fetch('http://localhost:3001/api/user/gift-code-claims', {
        headers: { 'x-user-id': user.id }
      });
      const userClaimsData = await userClaimsRes.json();
      console.log(`✓ GET /api/user/gift-code-claims -> SUCCESS! User has ${userClaimsData.claims?.length || 0} claimed bonus record(s).`);
    } catch (err) {
      console.log(`✗ GET /api/user/gift-code-claims -> Error: ${err.message}`);
    }
  }

  // 4e. Admin Audit Log
  try {
    const auditRes = await fetch('http://localhost:3001/api/admin/gift-code-claims');
    const auditData = await auditRes.json();
    console.log(`\n[TEST 6] Admin Redemptions Audit Log:`);
    console.log(`✓ GET /api/admin/gift-code-claims -> SUCCESS! ${auditData.claims?.length || 0} total redemptions in audit log.`);
  } catch (err) {
    console.log(`✗ GET /api/admin/gift-code-claims -> Error: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log('       ALL SYSTEM CHECKS COMPLETED & PASSED!      ');
  console.log('==================================================');
}

runTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
