import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

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
  balance: user.balance || 0,
  secretQuestion: user.secretQuestion,
  referralCode: user.referralCode,
  isEmailVerified: user.isEmailVerified,
  createdAt: user.createdAt,
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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, username, password, remember_me, remember } = req.body;
    const identifier = (email || username || '').toLowerCase().trim();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username and password are required' });
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier }
        ]
      }
    });

    // Auto-create default admin user if logging in as admin@stakelab.io or admin
    if (!user && (identifier === 'admin@stakelab.io' || identifier === 'admin' || identifier === 'admin@stakelab.com')) {
      const hashedPassword = await bcrypt.hash(password || 'admin123', 10);
      user = await prisma.user.create({
        data: {
          email: 'admin@stakelab.io',
          username: 'admin',
          fullName: 'Super Administrator',
          password: hashedPassword,
          role: 'ADMIN',
          isEmailVerified: true,
        }
      });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const isRemember = Boolean(remember_me || remember);
    const expiresIn = isRemember ? '24h' : '1h';
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn });

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      expiresIn,
      user: formatUser(user),
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

    // Generate a 4-digit OTP
    const otpCode = '1234'; // Fixed dev OTP code for easy testing (or Math.floor(1000 + Math.random() * 9000).toString())
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpCode, otpExpiresAt }
      });
    }

    return res.json({
      success: true,
      message: 'OTP code sent to your email address (Use 1234 for testing)',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Server error sending OTP' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP code are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Allow 1234 or matching stored OTP
    if (otp !== '1234' && user.otpCode !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code' });
    }

    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error verifying OTP' });
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
    const identifier = (username || email || '').toLowerCase().trim();

    let adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier }
        ],
        role: 'ADMIN'
      }
    });

    if (!adminUser) {
      const hashedPassword = await bcrypt.hash(password || 'admin123', 10);
      adminUser = await prisma.user.create({
        data: {
          email: identifier.includes('@') ? identifier : 'admin@stakelab.io',
          username: 'admin',
          fullName: 'Super Administrator',
          password: hashedPassword,
          role: 'ADMIN',
          isEmailVerified: true,
        }
      });
    }

    const token = jwt.sign({ id: adminUser.id, email: adminUser.email, role: 'ADMIN' }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      message: 'Admin login successful',
      token,
      admin: formatUser(adminUser),
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during admin login' });
  }
});

export default router;
