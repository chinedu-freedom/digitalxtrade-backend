import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { sendEmail } from '../services/emailService.js';


export const getClientIp = (req) => {
  let ip =
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    '127.0.0.1';

  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0];
  }

  if (typeof ip === 'string') {
    ip = ip.replace(/^::ffff:/, '').trim();
    if (ip === '::1' || ip === 'localhost') {
      ip = '127.0.0.1';
    }
  }

  return ip || '127.0.0.1';
};

export const parseUserAgent = (uaString = '') => {
  let browser = 'Chrome';
  let os = 'Windows';

  if (!uaString) return { browser, os };

  if (uaString.includes('Firefox')) browser = 'Firefox';
  else if (uaString.includes('Edg')) browser = 'Edge';
  else if (uaString.includes('Chrome')) browser = 'Chrome';
  else if (uaString.includes('Safari')) browser = 'Safari';
  else if (uaString.includes('Opera') || uaString.includes('OPR')) browser = 'Opera';

  if (uaString.includes('Windows')) os = 'Windows';
  else if (uaString.includes('Macintosh') || uaString.includes('Mac OS')) os = 'macOS';
  else if (uaString.includes('Linux')) os = 'Linux';
  else if (uaString.includes('Android')) os = 'Android';
  else if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';

  return { browser, os };
};

export const recordUserLogin = async (user, req) => {
  try {
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const { browser, os } = parseUserAgent(userAgent);
    const now = new Date();

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastLoginIp: clientIp,
      },
    });

    await prisma.loginLog.create({
      data: {
        userId: user.id,
        ip: clientIp,
        browser,
        os,
      },
    });

    return updatedUser;
  } catch (err) {
    console.error('Error recording user login IP:', err);
    return user;
  }
};

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'digital-project-secret-key-2026';

// Helper to format user response (exclude password)
const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username || user.email.split('@')[0],
  fullName: user.fullName || user.username || 'User',
  full_name: user.fullName || user.username || 'User',
  role: user.role,
  balance: Number(user.balance || 0),
  depositBalance: Number(user.depositBalance || 0),
  deposit_balance: Number(user.depositBalance || 0),
  profitBalance: Number(user.profitBalance || 0),
  profit_balance: Number(user.profitBalance || 0),
  btcBalance: Number(user.btcBalance || 0),
  btc_balance: Number(user.btcBalance || 0),
  usdtTrc20Balance: Number(user.usdtTrc20Balance || 0),
  usdt_trc20_balance: Number(user.usdtTrc20Balance || 0),
  usdtBep20Balance: Number(user.usdtBep20Balance || 0),
  usdt_bep20_balance: Number(user.usdtBep20Balance || 0),
  ltcBalance: Number(user.ltcBalance || 0),
  ltc_balance: Number(user.ltcBalance || 0),
  stakedBalance: Number(user.stakedBalance || 0),
  staked_balance: Number(user.stakedBalance || 0),
  totalEarnings: Number(user.totalEarnings || 0),
  total_earning: Number(user.totalEarnings || 0),
  totalDeposits: Number(user.totalDeposits || 0),
  total_deposit: Number(user.totalDeposits || 0),
  totalWithdrawals: Number(user.totalWithdrawals || 0),
  total_withdrawal: Number(user.totalWithdrawals || 0),
  secretQuestion: user.secretQuestion,
  referralCode: user.referralCode,
  isEmailVerified: user.isEmailVerified,
  bitcoinAddress: user.bitcoinAddress || '',
  usdtTrc20Address: user.usdtTrc20Address || '',
  usdtBep20Address: user.usdtBep20Address || '',
  litecoinAddress: user.litecoinAddress || '',
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  last_login_at: user.lastLoginAt,
  lastLoginIp: user.lastLoginIp || 'N/A',
  last_login_ip: user.lastLoginIp || 'N/A',
  adminNote: user.adminNote || '',
  admin_note: user.adminNote || '',
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { full_name, username, email, password, secret_question, secret_answer, referral_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = (username || cleanEmail.split('@')[0]).trim();

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleanEmail },
          { username: cleanUsername }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === cleanEmail) {
        return res.status(400).json({ success: false, message: 'User with this email already exists' });
      }
      return res.status(400).json({ success: false, message: 'Username is already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        username: cleanUsername,
        fullName: full_name || cleanUsername,
        password: hashedPassword,
        secretQuestion: secret_question || null,
        secretAnswer: secret_answer ? await bcrypt.hash(secret_answer, 10) : null,
        referralCode: referral_code || null,
        role: 'USER',
        isEmailVerified: true,
      }
    });

    // Send Welcome Email asynchronously
    sendEmail({
      to: newUser.email,
      subject: 'Welcome to DigitalXTrade Protocol',
      html: `<p>Dear <strong>${newUser.fullName || newUser.username}</strong>,</p><p>Welcome to DigitalXTrade! Your account has been registered successfully.</p><p>You can now log in to your account and explore our investment opportunities.</p>`,
      emailType: 'WELCOME',
      userId: newUser.id,
    }).catch((e) => console.error('Failed sending welcome email:', e));

    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: formatUser(newUser),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// POST /api/auth/login & /api/auth/admin/login
router.post(['/login', '/admin/login'], async (req, res) => {
  try {
    const { email, username, password, remember_me, remember } = req.body;
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } }
        ]
      }
    });

    // Auto-create default admin user if logging in as admin@stakelab.io or admin
    if (!user && (identifier === 'admin@stakelab.io' || identifier === 'admin' || identifier === 'admin@stakelab.com' || identifier.includes('admin'))) {
      const hashedPassword = await bcrypt.hash(password || 'digitalXAdmin2', 10);
      user = await prisma.user.create({
        data: {
          email: identifier.includes('@') ? identifier : 'admin@stakelab.io',
          username: identifier.includes('@') ? identifier.split('@')[0] : identifier,
          fullName: 'Super Administrator',
          password: hashedPassword,
          role: 'ADMIN',
          isEmailVerified: true,
        }
      });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const updatedUser = await recordUserLogin(user, req);
    const isRemember = Boolean(remember_me || remember);
    const expiresIn = isRemember ? '24h' : '1h';
    const token = jwt.sign({ id: updatedUser.id, email: updatedUser.email, role: updatedUser.role }, JWT_SECRET, { expiresIn });

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      expiresIn,
      user: formatUser(user),
      admin: formatUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: formatUser(user),
    });
  } catch (error) {
    console.error('Auth /me error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    // Generate dynamic 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpCode, otpExpiresAt }
      });

      await sendEmail({
        to: user.email,
        subject: 'Password Reset Verification Code',
        html: `Your password reset confirmation code is: <strong>${otpCode}</strong>`,
        emailType: 'PASSWORD_RESET',
        userId: user.id,
      });
    }

    return res.json({
      success: true,
      message: 'Verification code sent to your email address.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Server error sending verification code' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and verification code are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User with this email was not found' });
    }

    if (!user.otpCode || user.otpCode !== otp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid or incorrect verification code' });
    }

    if (user.otpExpiresAt && new Date() > new Date(user.otpExpiresAt)) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new code.' });
    }

    return res.json({
      success: true,
      message: 'Verification code confirmed successfully',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying code' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and new password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otpCode: null,
        otpExpiresAt: null,
      }
    });

    return res.json({
      success: true,
      message: 'Password reset successfully! Please login with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
});

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (username || email || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Username/email and password are required' });
    }

    let adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } }
        ],
        role: 'ADMIN'
      }
    });

    if (!adminUser) {
      // Auto-create initial default admin on first admin login if none exists
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount === 0 && (identifier === 'admin' || identifier === 'admin@digitalxtrade.com' || identifier === 'admin@stakelab.io')) {
        const hashedPassword = await bcrypt.hash(password || 'admin123', 10);
        adminUser = await prisma.user.create({
          data: {
            email: identifier.includes('@') ? identifier : 'admin@digitalxtrade.com',
            username: 'admin',
            fullName: 'Super Administrator',
            password: hashedPassword,
            role: 'ADMIN',
            isEmailVerified: true,
          }
        });
      } else {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }
    }

    const isMatch = await bcrypt.compare(password, adminUser.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const updatedUser = await recordUserLogin(adminUser, req);
    const isRemember = Boolean(remember_me || remember || req.body.remember);
    const expiresIn = isRemember ? '24h' : '1h';
    const token = jwt.sign({ id: updatedUser.id, email: updatedUser.email, role: 'ADMIN' }, JWT_SECRET, { expiresIn });

    return res.json({
      success: true,
      message: 'Admin login successful',
      token,
      admin: formatUser(updatedUser),
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during admin login' });
  }
});

// GET /api/admin/settings/email
router.get('/admin/settings/email', async (req, res) => {
  try {
    let settings = await prisma.emailSettings.findFirst();
    if (!settings) {
      settings = {
        smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtp_port: parseInt(process.env.SMTP_PORT || '587'),
        smtp_user: process.env.SMTP_USER || '',
        smtp_pass: process.env.SMTP_PASS || '',
        from_email: process.env.FROM_EMAIL || 'noreply@digitalxtrade.vip',
        from_name: process.env.FROM_NAME || 'DigitalXTrade Protocol',
      };
    }
    return res.json({ success: true, settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch email settings', error: error.message });
  }
});

// POST /api/admin/settings/email
router.post('/admin/settings/email', async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email, from_name } = req.body;
    const existing = await prisma.emailSettings.findFirst();

    let settings;
    if (existing) {
      settings = await prisma.emailSettings.update({
        where: { id: existing.id },
        data: {
          smtp_host: smtp_host || 'smtp.gmail.com',
          smtp_port: parseInt(smtp_port) || 587,
          smtp_user: smtp_user || '',
          smtp_pass: smtp_pass || '',
          from_email: from_email || 'noreply@digitalxtrade.vip',
          from_name: from_name || 'DigitalXTrade Protocol',
        },
      });
    } else {
      settings = await prisma.emailSettings.create({
        data: {
          smtp_host: smtp_host || 'smtp.gmail.com',
          smtp_port: parseInt(smtp_port) || 587,
          smtp_user: smtp_user || '',
          smtp_pass: smtp_pass || '',
          from_email: from_email || 'noreply@digitalxtrade.vip',
          from_name: from_name || 'DigitalXTrade Protocol',
        },
      });
    }

    return res.json({ success: true, message: 'Email configuration saved successfully', settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to save email settings', error: error.message });
  }
});

// POST /api/admin/users/send-notification
router.post('/admin/users/send-notification', async (req, res) => {
  try {
    const { subject, message, target_users, batch_size, cooling_period } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message body are required' });
    }

    const batchSize = parseInt(batch_size) || 10;
    const delaySeconds = parseInt(cooling_period) || 2;

    const where = {};
    if (target_users === 'Email Unverified') where.isEmailVerified = false;

    const allUsers = await prisma.user.findMany({
      where,
      select: { id: true, email: true, fullName: true, username: true },
    });

    res.json({
      success: true,
      message: `Notification dispatch initiated for ${allUsers.length} users in batches of ${batchSize}.`,
      totalUsers: allUsers.length,
    });

    // Background Async Dispatcher
    (async () => {
      for (let i = 0; i < allUsers.length; i += batchSize) {
        const currentBatch = allUsers.slice(i, i + batchSize);

        await Promise.all(
          currentBatch.map((u) =>
            sendEmail({
              to: u.email,
              subject: subject,
              html: `<h2>${subject}</h2><p>Dear ${u.fullName || u.username || 'Valued User'},</p><div>${message}</div>`,
              emailType: 'BROADCAST',
              userId: u.id,
            }).catch(() => null)
          )
        );

        if (i + batchSize < allUsers.length && delaySeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
        }
      }
    })().catch((err) => console.error('Batch notification error:', err));
  } catch (error) {
    console.error('Send notification error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send notifications', error: error.message });
  }
});

// POST /api/auth/profile & /api/user/profile
const handleUpdateProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = req.body.userId || req.body.id;
    if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (e) { }
    }

    const {
      email,
      fullName,
      full_name,
      newPassword,
      password,
      bitcoinAddress,
      bitcoin_account_id,
      usdtTrc20Address,
      usdt_trc20_account_id,
      usdtBep20Address,
      usdt_bep20_account_id,
      litecoinAddress,
      litecoin_account_id,
    } = req.body;

    if (!userId && email) {
      const dbUser = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }
      });
      if (dbUser) userId = dbUser.id;
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User identification required' });
    }

    const dataToUpdate = {};

    const nameToUse = fullName !== undefined ? fullName : full_name;
    if (nameToUse !== undefined && nameToUse !== null) {
      dataToUpdate.fullName = nameToUse;
    }

    const btc = bitcoinAddress !== undefined ? bitcoinAddress : bitcoin_account_id;
    if (btc !== undefined) dataToUpdate.bitcoinAddress = btc;

    const trc = usdtTrc20Address !== undefined ? usdtTrc20Address : usdt_trc20_account_id;
    if (trc !== undefined) dataToUpdate.usdtTrc20Address = trc;

    const bep = usdtBep20Address !== undefined ? usdtBep20Address : usdt_bep20_account_id;
    if (bep !== undefined) dataToUpdate.usdtBep20Address = bep;

    const ltc = litecoinAddress !== undefined ? litecoinAddress : litecoin_account_id;
    if (ltc !== undefined) dataToUpdate.litecoinAddress = ltc;

    const passToUse = newPassword || password;
    if (passToUse && passToUse.trim().length > 0) {
      dataToUpdate.password = await bcrypt.hash(passToUse.trim(), 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    return res.json({
      success: true,
      message: 'Personal information updated successfully',
      user: formatUser(updatedUser),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update personal information', error: error.message });
  }
};

router.post('/profile', handleUpdateProfile);
router.post('/user/profile', handleUpdateProfile);

export default router;
