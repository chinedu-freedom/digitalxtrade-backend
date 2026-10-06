import axios from 'axios';
import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';

async function getZohoAccessToken() {
  const response = await axios.post(
    'https://accounts.zoho.com/oauth/v2/token',
    null,
    {
      params: {
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
      },
    }
  );
  return response.data.access_token;
}

// Clean all emojis and icons for mature corporate emails
export function stripEmojisAndIcons(str) {
  if (!str) return '';
  return str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{303D}\u{00A9}\u{00AE}\u{2122}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Render Master Email Template matching StakeLab design system
export function renderEmailTemplate({ siteName, siteLogo, subject, content, emailType }) {
  const cleanSubject = stripEmojisAndIcons(subject || 'Notification').replace(/stakelab|everstake/gi, siteName);

  if (typeof content === 'string' && content.includes('<!DOCTYPE')) {
    return content;
  }

  // Detect verification code if present (4 to 8 digits)
  const codeMatch = typeof content === 'string' ? content.match(/\b\d{4,8}\b/) : null;
  const extractedCode = codeMatch ? codeMatch[0] : null;

  let innerContentHtml = content;

  if (typeof content === 'string') {
    let cleanContent = stripEmojisAndIcons(content);

    const isOtpType = ['PIN_RESET_OTP', 'EMAIL_VERIFICATION', 'VERIFICATION', 'PASSWORD_RESET', 'WITHDRAWAL_OTP', 'OTP'].includes(emailType);

    if (isOtpType) {
      const displayCode = extractedCode || '******';

      innerContentHtml = `
        <div style="text-align:center; padding:10px 0;">
          <h2 style="color:#0f172a; margin-bottom:10px;">${cleanSubject}</h2>
          <p style="color:#475569; font-size:15px; line-height:1.6; margin-bottom: 20px;">
            Please use the confirmation code below to authorize your request:
          </p>

          <div style="margin:24px 0; text-align:center; white-space: nowrap !important;">
            <span style="
              background: #eaf4fb;
              color: #0085d0;
              padding: 12px 28px;
              font-size: 26px;
              font-weight: 900;
              letter-spacing: 6px;
              border: 2px dashed #0085d0;
              border-radius: 12px;
              display: inline-block;
              white-space: nowrap !important;
              word-break: keep-all !important;
            ">
              ${displayCode}
            </span>
          </div>

          <p style="font-size:14px; color:#64748b; margin-top:16px;">
            This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.
          </p>
          <p style="font-size:12px; color:#94a3b8; margin-top:24px;">
            If you did not make this request, please secure your account immediately or contact support.
          </p>
        </div>
      `;
    } else {
      innerContentHtml = `
        <div style="color: #0f172a; font-size: 15px; line-height: 1.7; font-weight: 500;">
          ${cleanContent}
        </div>
      `;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f8f9fa; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8f9fa; padding:40px 0;">
     <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="background-color:#0085d0; padding:30px 40px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:28px; letter-spacing:1px; font-weight: 900; text-transform: uppercase;">${siteName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${innerContentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f1f5f9; padding:24px 40px; text-align:center;">
              <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6;">
                &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.<br>
                You received this email because you are registered on ${siteName}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const sendEmail = async ({ to, subject, html, emailType, userId }) => {
  let formattedSubject = subject || 'Notification';
  try {
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const siteLogo = settings?.site_logo || null;

    formattedSubject = emailType === 'FREE_SPIN_REWARD'
      ? (subject || 'Notification').replace(/stakelab|everstake/gi, siteName)
      : stripEmojisAndIcons(subject || 'Notification').replace(/stakelab|everstake/gi, siteName);

    const formattedHtml = renderEmailTemplate({
      siteName,
      siteLogo,
      subject: formattedSubject,
      content: html,
      emailType,
    });

    // 1. Direct Zoho Mail API
    if (
      process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET &&
      process.env.ZOHO_REFRESH_TOKEN &&
      process.env.ZOHO_MAIL_ACCOUNT_ID
    ) {
      try {
        const accessToken = await getZohoAccessToken();
        const url = `https://mail.zoho.com/api/accounts/${process.env.ZOHO_MAIL_ACCOUNT_ID}/messages`;

        await axios.post(
          url,
          {
            fromAddress: process.env.ZOHO_FROM_EMAIL || 'info@digitalxtrade.com',
            toAddress: to,
            subject: formattedSubject,
            content: formattedHtml,
            mailFormat: 'html',
          },
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(`[ZOHO MAIL] Email sent successfully to ${to}`);
        if (userId) {
          await prisma.emailLog.create({
            data: {
              user_id: userId,
              recipient: to,
              subject: formattedSubject,
              email_type: emailType || 'NOTIFICATION',
              status: 'SENT',
            },
          }).catch(() => { });
        }
        return { success: true };
      } catch (zohoErr) {
        console.error('Zoho Mail API error, trying SMTP fallback:', zohoErr.response?.data || zohoErr.message);
      }
    }

    // 2. SMTP Transporter fallback
    let emailSettings = await prisma.emailSettings.findFirst().catch(() => null);
    if (!emailSettings) {
      emailSettings = {
        smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtp_port: parseInt(process.env.SMTP_PORT || '587'),
        smtp_user: process.env.SMTP_USER || '',
        smtp_pass: process.env.SMTP_PASS || '',
        from_email: process.env.FROM_EMAIL || 'noreply@digitalxtrade.com',
        from_name: process.env.FROM_NAME || siteName,
      };
    }

    if (emailSettings.smtp_user && emailSettings.smtp_pass) {
      const transporter = nodemailer.createTransport({
        host: emailSettings.smtp_host,
        port: emailSettings.smtp_port,
        secure: emailSettings.smtp_port === 465,
        auth: {
          user: emailSettings.smtp_user,
          pass: emailSettings.smtp_pass,
        },
      });

      await transporter.sendMail({
        from: `"${siteName}" <${emailSettings.from_email}>`,
        to,
        subject: formattedSubject,
        html: formattedHtml,
      });

      if (userId) {
        await prisma.emailLog.create({
          data: {
            user_id: userId,
            recipient: to,
            subject: formattedSubject,
            email_type: emailType || 'NOTIFICATION',
            status: 'SENT',
          },
        }).catch(() => { });
      }
      return { success: true };
    }

    // 3. Fallback simulation
    console.log(`[EMAIL SIMULATION] To: ${to} | Subject: ${formattedSubject}`);
    if (userId) {
      await prisma.emailLog.create({
        data: {
          user_id: userId,
          recipient: to,
          subject: formattedSubject,
          email_type: emailType || 'SIMULATED',
          status: 'SIMULATED',
        },
      }).catch(() => { });
    }
    return { success: true, simulated: true };
  } catch (error) {
    console.error('Email error:', error);
    if (userId) {
      await prisma.emailLog.create({
        data: {
          user_id: userId,
          recipient: to,
          subject: formattedSubject || subject || 'Notification',
          email_type: emailType || 'ERROR',
          status: 'FAILED',
          error_msg: error.message,
        },
      }).catch(() => { });
    }
    return { success: false, error: error.message };
  }
};

export async function sendAdminNotificationEmail({ subject, title, details }) {
  return { success: true, message: 'Admin notification emails logged' };
}

// ==========================================
// 1. DEPOSIT EMAIL NOTIFICATIONS
// ==========================================

export const sendDepositSubmittedEmail = async ({ user, deposit }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const userName = user.fullName || user.username || 'Valued Trader';
    const amountFormatted = parseFloat(deposit.amount || 0).toFixed(2);
    const currency = deposit.currency || 'Crypto';
    const planName = deposit.planName || 'Standard Investment Plan';

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Deposit Request Received</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${userName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your deposit request has been received and is currently pending review & verification.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Deposit Amount</td>
            <td style="font-weight: 800; color: #0f172a;">$${amountFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Payment Method</td>
            <td style="color: #0f172a;">${currency}</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Investment Plan</td>
            <td style="font-weight: 700; color: #0085d0;">${planName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Deposit Status</td>
            <td style="font-weight: 700; color: #d97706;">Pending Review</td>
          </tr>
          ${deposit.walletAddress && deposit.walletAddress !== 'Account Balance' ? `
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Deposit Address</td>
            <td style="font-family: monospace; font-size: 12px; color: #334155; word-break: break-all;">${deposit.walletAddress}</td>
          </tr>
          ` : ''}
          ${deposit.txHash ? `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Transaction Hash / ID</td>
            <td style="font-family: monospace; font-size: 12px; color: #334155; word-break: break-all;">${deposit.txHash}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>
      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.6;">Once your blockchain transaction is confirmed, your deposit will be credited automatically to your account.</p>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for choosing ${siteName}.</p>
    `;

    return await sendEmail({
      to: user.email,
      subject: 'Deposit Request Received',
      html,
      emailType: 'DEPOSIT_SUBMITTED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendDepositSubmittedEmail error:', err);
  }
};

export const sendDepositApprovedEmail = async ({ user, deposit }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const userName = user.fullName || user.username || 'Valued Trader';
    const amountFormatted = parseFloat(deposit.amount || 0).toFixed(2);
    const currency = deposit.currency || 'Crypto';
    const planName = deposit.planName || 'Standard Investment Plan';

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Deposit Successfully Confirmed & Credited</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${userName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your deposit of <b>$${amountFormatted}</b> via <b>${currency}</b> has been successfully verified and credited to your account.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Credited Amount</td>
            <td style="font-weight: 800; color: #10b981;">$${amountFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Payment Method</td>
            <td style="color: #0f172a;">${currency}</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Investment Plan</td>
            <td style="font-weight: 700; color: #0085d0;">${planName}</td>
          </tr>
          ${deposit.targetWalletLabel ? `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Credited Wallet</td>
            <td style="font-weight: 700; color: #0085d0;">${deposit.targetWalletLabel}</td>
          </tr>
          ` : ''}
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Deposit Status</td>
            <td style="font-weight: 700; color: #10b981;">Confirmed & Credited</td>
          </tr>
        </tbody>
      </table>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 16px;">Kindly log in to your account to monitor your investment and active trade yields.</p>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for choosing ${siteName}.</p>
    `;

    return await sendEmail({
      to: user.email,
      subject: 'Deposit Successfully Confirmed & Credited',
      html,
      emailType: 'DEPOSIT_APPROVED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendDepositApprovedEmail error:', err);
  }
};

export const sendDepositRejectedEmail = async ({ user, deposit, reason }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const userName = user.fullName || user.username || 'Valued Trader';
    const amountFormatted = parseFloat(deposit.amount || 0).toFixed(2);
    const currency = deposit.currency || 'Crypto';

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Deposit Request Rejected</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${userName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your deposit request could not be processed at this time.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Amount</td>
            <td style="font-weight: 800; color: #0f172a;">$${amountFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Payment Method</td>
            <td style="color: #0f172a;">${currency}</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Status</td>
            <td style="font-weight: 700; color: #ef4444;">Rejected</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Reason</td>
            <td style="color: #64748b;">${reason || 'Deposit verification failed or unconfirmed transaction hash'}</td>
          </tr>
        </tbody>
      </table>
      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.6;">If you have already sent funds on-chain, please contact our support team with your transaction details.</p>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for choosing ${siteName}.</p>
    `;

    return await sendEmail({
      to: user.email,
      subject: 'Deposit Request Rejected',
      html,
      emailType: 'DEPOSIT_REJECTED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendDepositRejectedEmail error:', err);
  }
};

// ==========================================
// 2. WITHDRAWAL EMAIL NOTIFICATIONS
// ==========================================

export const sendWithdrawalSubmittedEmail = async ({ user, withdrawal }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const userName = user.fullName || user.username || 'Valued Trader';
    const amountFormatted = parseFloat(withdrawal.amount || 0).toFixed(2);
    const feeFormatted = parseFloat(withdrawal.charge || 0).toFixed(2);
    const netFormatted = parseFloat(withdrawal.netAmount || withdrawal.amount || 0).toFixed(2);
    const currency = withdrawal.currency || 'Crypto';

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Withdrawal Request Received</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${userName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your withdrawal request has been received and is currently pending review & processing.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Withdrawal Amount</td>
            <td style="font-weight: 800; color: #0f172a;">$${amountFormatted}</td>
          </tr>
          ${parseFloat(feeFormatted) > 0 ? `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Withdrawal Fee</td>
            <td style="font-weight: 700; color: #ef4444;">-$${feeFormatted}</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Net Payout Amount</td>
            <td style="font-weight: 800; color: #0085d0;">$${netFormatted}</td>
          </tr>
          ` : ''}
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Payout Method</td>
            <td style="color: #0f172a;">${currency}</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Destination Address</td>
            <td style="font-family: monospace; font-size: 12px; color: #334155; word-break: break-all;">${withdrawal.walletAddress || 'N/A'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Withdrawal Status</td>
            <td style="font-weight: 700; color: #d97706;">Pending Review</td>
          </tr>
        </tbody>
      </table>
      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.6;">If you did not initiate this withdrawal, please lock your account and contact our support team immediately.</p>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for choosing ${siteName}.</p>
    `;

    return await sendEmail({
      to: user.email,
      subject: 'Withdrawal Request Received',
      html,
      emailType: 'WITHDRAWAL_PROCESSING',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendWithdrawalSubmittedEmail error:', err);
  }
};

export const sendWithdrawalApprovedEmail = async ({ user, withdrawal }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const userName = user.fullName || user.username || 'Valued Trader';
    const amountFormatted = parseFloat(withdrawal.netAmount || withdrawal.amount || 0).toFixed(2);
    const currency = withdrawal.currency || 'Crypto';

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Withdrawal Successfully Processed</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${userName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your withdrawal request has been successfully processed and disbursed.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Disbursed Amount</td>
            <td style="font-weight: 800; color: #10b981;">$${amountFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Withdrawal Status</td>
            <td style="font-weight: 700; color: #10b981;">Completed</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Payout Method</td>
            <td style="color: #0f172a;">${currency}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Destination Address</td>
            <td style="font-family: monospace; font-size: 12px; color: #334155; word-break: break-all;">${withdrawal.walletAddress || 'N/A'}</td>
          </tr>
        </tbody>
      </table>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for choosing ${siteName}.</p>
    `;

    return await sendEmail({
      to: user.email,
      subject: 'Withdrawal Successfully Processed',
      html,
      emailType: 'WITHDRAWAL_APPROVED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendWithdrawalApprovedEmail error:', err);
  }
};

export const sendWithdrawalRejectedEmail = async ({ user, withdrawal, reason }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const userName = user.fullName || user.username || 'Valued Trader';
    const amountFormatted = parseFloat(withdrawal.amount || 0).toFixed(2);

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Withdrawal Request Rejected</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${userName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your withdrawal request could not be completed and the amount has been refunded to your account balance.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Refunded Amount</td>
            <td style="font-weight: 800; color: #0f172a;">$${amountFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Withdrawal Status</td>
            <td style="font-weight: 700; color: #ef4444;">Rejected & Refunded</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Reason</td>
            <td style="color: #64748b;">${reason || 'Security review check or destination address verification'}</td>
          </tr>
        </tbody>
      </table>
      <p style="color: #64748b; font-size: 13px; margin-top: 20px; line-height: 1.6;">If you have questions regarding this decision, please reach out to our support team.</p>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for choosing ${siteName}.</p>
    `;

    return await sendEmail({
      to: user.email,
      subject: 'Withdrawal Request Rejected',
      html,
      emailType: 'WITHDRAWAL_REJECTED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendWithdrawalRejectedEmail error:', err);
  }
};

// ==========================================
// 3. REFERRAL COMMISSION EMAIL NOTIFICATIONS
// ==========================================

export const sendReferralCommissionEmail = async ({ inviter, referee, commissionAmount, depositAmount, level = 1, percentage = 10 }) => {
  try {
    if (!inviter || !inviter.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const inviterName = inviter.fullName || inviter.username || 'Valued Partner';
    const refereeIdentifier = referee?.username ? `@${referee.username}` : (referee?.fullName || referee?.email || 'Your referral');
    const commFormatted = parseFloat(commissionAmount || 0).toFixed(2);
    const depFormatted = parseFloat(depositAmount || 0).toFixed(2);

    const html = `
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 800; margin-top: 0; margin-bottom: 16px;">Referral Commission Received</h2>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">Hi <b>${inviterName}</b>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Great news! You have earned a referral commission from an active deposit made by a user in your referral network.</p>
      <table width="100%" cellpadding="12" cellspacing="0" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-family: sans-serif;">
        <tbody>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569; width: 45%;">Commission Earned</td>
            <td style="font-weight: 800; color: #10b981;">+$${commFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Referred User</td>
            <td style="font-weight: 700; color: #0f172a;">${refereeIdentifier}</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Deposit Amount</td>
            <td style="font-weight: 700; color: #0f172a;">$${depFormatted}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Commission Tier</td>
            <td style="font-weight: 700; color: #0085d0;">Level ${level} (${percentage}%)</td>
          </tr>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="font-weight: 700; color: #475569;">Credit Status</td>
            <td style="font-weight: 700; color: #10b981;">Credited to Balance</td>
          </tr>
        </tbody>
      </table>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 16px;">This bonus has been added directly to your account balance and is immediately available for withdrawal or reinvestment.</p>
      <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin-top: 12px;">Keep sharing your referral link to earn even more passive rewards from your network!</p>
      <p style="color: #0f172a; font-weight: 700; margin-top: 20px;">Thank you for partnering with ${siteName}.</p>
    `;

    return await sendEmail({
      to: inviter.email,
      subject: `Referral Commission Earned - +$${commFormatted}`,
      html,
      emailType: 'REFERRAL_COMMISSION',
      userId: inviter.id,
    });
  } catch (err) {
    console.error('sendReferralCommissionEmail error:', err);
  }
};

// ==========================================
// 4. BACKWARD COMPATIBILITY HELPERS
// ==========================================

export const sendDepositEmail = async ({ user, deposit, action }) => {
  const status = (deposit?.status || action || 'PENDING').toUpperCase();
  if (status === 'APPROVED') {
    return sendDepositApprovedEmail({ user, deposit });
  } else if (status === 'REJECTED') {
    return sendDepositRejectedEmail({ user, deposit, reason: deposit.adminNote });
  } else {
    return sendDepositSubmittedEmail({ user, deposit });
  }
};

export const sendWithdrawalEmail = async ({ user, withdrawal, action }) => {
  const status = (withdrawal?.status || action || 'PENDING').toUpperCase();
  if (status === 'APPROVED') {
    return sendWithdrawalApprovedEmail({ user, withdrawal });
  } else if (status === 'REJECTED') {
    return sendWithdrawalRejectedEmail({ user, withdrawal, reason: withdrawal.adminNote });
  } else {
    return sendWithdrawalSubmittedEmail({ user, withdrawal });
  }
};
