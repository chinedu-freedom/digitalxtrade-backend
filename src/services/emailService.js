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

// Helper: Render Master Email Template with Dual-Theme (Light/Dark mode) support
export function renderEmailTemplate({ siteName = 'DigitalXTrade', siteLogo = null, subject, content, emailType }) {
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
          <h2 class="email-title" style="color:#0f172a; margin-bottom:12px; font-size:22px; font-weight:700; line-height:1.3; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${cleanSubject}</h2>
          <p class="email-desc" style="color:#475569; font-size:15px; line-height:1.6; margin-bottom: 22px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            Please use the confirmation code below to authorize your request:
          </p>

          <div style="margin:24px 0; text-align:center; white-space: nowrap !important;">
            <span class="email-code-box" style="
              background: #fef9c3;
              color: #b58117;
              padding: 13px 30px;
              font-size: 26px;
              font-weight: 900;
              letter-spacing: 6px;
              border: 2px dashed #b58117;
              border-radius: 12px;
              display: inline-block;
              white-space: nowrap !important;
              word-break: keep-all !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
            ">
              ${displayCode}
            </span>
          </div>

          <p class="email-notice" style="font-size:14px; color:#64748b; margin-top:18px; line-height:1.5;">
            This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.
          </p>
          <p class="email-subnotice" style="font-size:12px; color:#94a3b8; margin-top:24px; line-height:1.5;">
            If you did not make this request, please secure your account immediately or contact support.
          </p>
        </div>
      `;
    } else {
      innerContentHtml = `
        <div class="email-desc" style="color: #334155; font-size: 15px; line-height: 1.7; font-weight: 500; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${cleanSubject}</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: #0b0d14 !important; }
      .email-card { background-color: #12151e !important; border-color: #1f2333 !important; box-shadow: 0 12px 36px rgba(0,0,0,0.5) !important; }
      .email-title { color: #ffffff !important; }
      .email-desc { color: #cbd5e1 !important; }
      .email-label { color: #ffffff !important; }
      .email-val { color: #cbd5e1 !important; }
      .email-detail-row { color: #e2e8f0 !important; }
      .email-notice { color: #94a3b8 !important; }
      .email-subnotice { color: #94a3b8 !important; }
      .email-link { color: #60a5fa !important; }
      .email-code-box { background-color: #241c08 !important; border-color: #cca01d !important; color: #facc15 !important; }
      .email-table-card { background-color: #161c28 !important; border-color: #232b3e !important; }
      .email-row-alt { background-color: #1a202c !important; border-bottom-color: #232b3e !important; }
      .email-row-norm { border-bottom-color: #232b3e !important; }
      .email-footer-bg { background-color: #0b0d13 !important; border-top-color: #1a1e2b !important; }
      .email-footer-text { color: #64748b !important; }
    }
    [data-ogsc] body, [data-ogsc] .email-bg { background-color: #0b0d14 !important; }
    [data-ogsc] .email-card { background-color: #12151e !important; border-color: #1f2333 !important; }
    [data-ogsc] .email-title { color: #ffffff !important; }
    [data-ogsc] .email-desc { color: #cbd5e1 !important; }
    [data-ogsc] .email-label { color: #ffffff !important; }
    [data-ogsc] .email-val { color: #cbd5e1 !important; }
    [data-ogsc] .email-detail-row { color: #e2e8f0 !important; }
    [data-ogsc] .email-notice { color: #94a3b8 !important; }
    [data-ogsc] .email-subnotice { color: #94a3b8 !important; }
    [data-ogsc] .email-link { color: #60a5fa !important; }
    [data-ogsc] .email-code-box { background-color: #241c08 !important; border-color: #cca01d !important; color: #facc15 !important; }
    [data-ogsc] .email-table-card { background-color: #161c28 !important; border-color: #232b3e !important; }
    [data-ogsc] .email-row-alt { background-color: #1a202c !important; }
    [data-ogsc] .email-footer-bg { background-color: #0b0d13 !important; border-top-color: #1a1e2b !important; }
    [data-ogsc] .email-footer-text { color: #64748b !important; }
  </style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" class="email-bg" style="background-color:#f1f5f9; padding:32px 14px;">
     <tr>
      <td align="center">
        <!-- Main Card: White in Light Theme, Dark Charcoal in Dark Theme -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" class="email-card" style="max-width:540px; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 8px 30px rgba(0,0,0,0.06);">
          <!-- Golden Brand Banner -->
          <tr>
            <td align="center" style="background-color:#b58117; padding:26px 20px; text-align:center;">
              ${siteLogo ? `<img src="${siteLogo}" alt="${siteName}" style="max-height:38px; max-width:220px; display:block; margin:0 auto 6px; object-fit:contain;" />` : ''}
              <h1 style="color:#ffffff; margin:0; font-size:22px; letter-spacing:1.5px; font-weight:900; text-transform:uppercase; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${siteName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:34px 28px 28px;">
              ${innerContentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="email-footer-bg" style="background-color:#f8fafc; padding:20px 28px; text-align:center; border-top:1px solid #e2e8f0;">
              <p class="email-footer-text" style="margin:0; color:#64748b; font-size:12px; line-height:1.6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
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
// 1. TRANSACTION EMAIL TEMPLATE (DUAL-THEME LIGHT/DARK + GOLD)
// ==========================================

export function renderDarkGoldTransactionEmail({
  siteName = 'DigitalXTrade',
  siteLogo = null,
  title,
  messageHtml,
  details = [],
  buttonText = 'Visit Your Dashboard',
  buttonUrl,
  resetPasswordUrl,
  supportUrl,
  subNoticeText = ''
}) {
  const detailsHtml = details
    .map(
      (item) => `
        <div class="email-detail-row" style="margin: 9px 0; color: #334155; font-size: 15px; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <strong class="email-label" style="color: #0f172a; font-weight: 700;">${item.label}:</strong> <span class="email-val" style="${item.style || 'color: #334155;'}">${item.value}</span>
        </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: #0b0d14 !important; }
      .email-card { background-color: #12151e !important; border-color: #1f2333 !important; box-shadow: 0 12px 36px rgba(0,0,0,0.5) !important; }
      .email-title { color: #ffffff !important; }
      .email-desc { color: #cbd5e1 !important; }
      .email-label { color: #ffffff !important; }
      .email-val { color: #cbd5e1 !important; }
      .email-detail-row { color: #e2e8f0 !important; }
      .email-notice { color: #94a3b8 !important; }
      .email-subnotice { color: #94a3b8 !important; }
      .email-link { color: #60a5fa !important; }
      .email-footer-bg { background-color: #0b0d13 !important; border-top-color: #1a1e2b !important; }
      .email-footer-text { color: #64748b !important; }
    }
    [data-ogsc] body, [data-ogsc] .email-bg { background-color: #0b0d14 !important; }
    [data-ogsc] .email-card { background-color: #12151e !important; border-color: #1f2333 !important; }
    [data-ogsc] .email-title { color: #ffffff !important; }
    [data-ogsc] .email-desc { color: #cbd5e1 !important; }
    [data-ogsc] .email-label { color: #ffffff !important; }
    [data-ogsc] .email-val { color: #cbd5e1 !important; }
    [data-ogsc] .email-detail-row { color: #e2e8f0 !important; }
    [data-ogsc] .email-notice { color: #94a3b8 !important; }
    [data-ogsc] .email-subnotice { color: #94a3b8 !important; }
    [data-ogsc] .email-link { color: #60a5fa !important; }
    [data-ogsc] .email-footer-bg { background-color: #0b0d13 !important; border-top-color: #1a1e2b !important; }
    [data-ogsc] .email-footer-text { color: #64748b !important; }
  </style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" class="email-bg" style="background-color:#f1f5f9; padding:32px 14px;">
    <tr>
      <td align="center">
        <!-- Main Card: White in Light Theme, Dark Charcoal in Dark Theme -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" class="email-card" style="max-width:520px; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 8px 30px rgba(0,0,0,0.06);">
          <!-- Golden Brand Header Banner -->
          <tr>
            <td align="center" style="background-color:#b58117; padding:26px 20px; text-align:center;">
              ${siteLogo ? `<img src="${siteLogo}" alt="${siteName}" style="max-height:38px; max-width:220px; display:block; margin:0 auto 6px; object-fit:contain;" />` : ''}
              <span style="display:inline-block; font-size:22px; font-weight:900; letter-spacing:1.5px; color:#ffffff; text-transform:uppercase; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${siteName}
              </span>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding:34px 28px 28px; text-align:left;">
              <h1 class="email-title" style="color:#0f172a; font-size:24px; font-weight:700; margin:0 0 16px 0; line-height:1.3; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${title}
              </h1>
              <p class="email-desc" style="color:#334155; font-size:15px; line-height:1.6; margin:0 0 24px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${messageHtml}
              </p>

              <!-- Transaction Specs -->
              <div style="margin:0 0 26px 0;">
                ${detailsHtml}
              </div>

              <!-- Action Button -->
              <div style="margin:28px 0 24px 0; text-align:center;">
                <a href="${buttonUrl}" target="_blank" style="display:inline-block; background-color:#b58117; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; padding:13px 36px; border-radius:8px; box-shadow:0 4px 14px rgba(181, 129, 23, 0.4); text-align:center; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  ${buttonText}
                </a>
              </div>

              <!-- Security Notice with Working Links -->
              <p class="email-notice" style="color:#64748b; font-size:13px; line-height:1.6; margin:22px 0 10px 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                If you don't recognize this activity, please <a href="${resetPasswordUrl}" target="_blank" class="email-link" style="color:#2563eb; text-decoration:underline; font-weight:600;">reset your password</a> and contact <a href="${supportUrl}" target="_blank" class="email-link" style="color:#2563eb; text-decoration:underline; font-weight:600;">customer support</a> immediately.
              </p>

              ${subNoticeText ? `
              <p class="email-subnotice" style="color:#64748b; font-size:12px; line-height:1.5; margin:10px 0 0 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${subNoticeText}
              </p>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="email-footer-bg" style="padding:16px 24px; background-color:#f8fafc; text-align:center; border-top:1px solid #e2e8f0;">
              <p class="email-footer-text" style="margin:0; color:#64748b; font-size:12px; line-height:1.5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
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

export const renderDualThemeTransactionEmail = renderDarkGoldTransactionEmail;

// ==========================================
// 2. DEPOSIT EMAIL NOTIFICATIONS
// ==========================================

export const sendDepositSubmittedEmail = async () => {
  // Disabled as per user requirement: do not send email for pending deposits
  return;
};

export const sendDepositApprovedEmail = async ({ user, deposit }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const siteLogo = settings?.site_logo || null;
    const frontendUrl = (process.env.FRONTEND_URL || 'https://digitalxtrade.com').replace(/\/+$/, '');
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const resetPasswordUrl = `${frontendUrl}/forgot-password`;
    const supportUrl = `${frontendUrl}/support`;

    const amountFormatted = parseFloat(deposit.amount || 0).toFixed(2);
    const currency = deposit.currency || 'USDT-TRC20';
    const planName = deposit.planName || 'Standard Investment Plan';

    const details = [
      { label: 'Deposit Amount', value: amountFormatted },
      { label: 'Deposit Currency', value: currency },
      { label: 'Deposit Plan', value: planName },
    ];

    if (deposit.targetWalletLabel) {
      details.push({
        label: 'Credited Wallet',
        value: deposit.targetWalletLabel,
        style: 'color: #0284c7; font-weight: 600;'
      });
    }

    const html = renderDarkGoldTransactionEmail({
      siteName,
      siteLogo,
      title: 'Deposit Activated',
      messageHtml: `You've successfully deposited <strong class="email-label" style="color: #0f172a;">${amountFormatted} ${currency}</strong> into your account.`,
      details,
      buttonText: 'Visit Your Dashboard',
      buttonUrl: dashboardUrl,
      resetPasswordUrl,
      supportUrl,
      subNoticeText: 'Deposits are usually confirmed within minutes. Please check your dashboard for real-time status.'
    });

    return await sendEmail({
      to: user.email,
      subject: 'Deposit Successful',
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
    const siteLogo = settings?.site_logo || null;
    const frontendUrl = (process.env.FRONTEND_URL || 'https://digitalxtrade.com').replace(/\/+$/, '');
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const resetPasswordUrl = `${frontendUrl}/forgot-password`;
    const supportUrl = `${frontendUrl}/support`;

    const amountFormatted = parseFloat(deposit.amount || 0).toFixed(2);
    const currency = deposit.currency || 'USDT';

    const details = [
      { label: 'Deposit Amount', value: amountFormatted },
      { label: 'Deposit Currency', value: currency },
      { label: 'Deposit Status', value: 'Rejected', style: 'color: #dc2626; font-weight: 700;' },
      { label: 'Reason', value: reason || 'Deposit verification failed or unconfirmed blockchain transaction', style: 'color: #64748b;' }
    ];

    const html = renderDarkGoldTransactionEmail({
      siteName,
      siteLogo,
      title: 'Deposit Request Declined',
      messageHtml: 'Your deposit request could not be completed and has been declined.',
      details,
      buttonText: 'Visit Your Dashboard',
      buttonUrl: dashboardUrl,
      resetPasswordUrl,
      supportUrl,
      subNoticeText: 'If you have already sent funds on-chain, please contact customer support immediately with your transaction hash.'
    });

    return await sendEmail({
      to: user.email,
      subject: 'Deposit Request Declined',
      html,
      emailType: 'DEPOSIT_REJECTED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendDepositRejectedEmail error:', err);
  }
};

// ==========================================
// 3. WITHDRAWAL EMAIL NOTIFICATIONS
// ==========================================

export const sendWithdrawalSubmittedEmail = async () => {
  // Disabled as per user requirement: do not send email for pending withdrawals
  return;
};

export const sendWithdrawalApprovedEmail = async ({ user, withdrawal }) => {
  try {
    if (!user || !user.email) return;
    const settings = await prisma.settings.findFirst().catch(() => null);
    const siteName = settings?.site_name || settings?.site_title || 'DigitalXTrade';
    const siteLogo = settings?.site_logo || null;
    const frontendUrl = (process.env.FRONTEND_URL || 'https://digitalxtrade.com').replace(/\/+$/, '');
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const resetPasswordUrl = `${frontendUrl}/forgot-password`;
    const supportUrl = `${frontendUrl}/support`;

    const amountFormatted = parseFloat(withdrawal.netAmount || withdrawal.amount || 0).toFixed(2);
    const currency = withdrawal.currency || 'USDT-TRC20';

    const details = [
      { label: 'Withdrawal Amount', value: amountFormatted },
      { label: 'Withdrawal Currency', value: currency },
    ];

    if (withdrawal.walletAddress) {
      details.push({
        label: 'Destination Address',
        value: withdrawal.walletAddress,
        style: 'color: #475569; font-family: monospace; font-size: 13px; word-break: break-all;'
      });
    }

    const html = renderDarkGoldTransactionEmail({
      siteName,
      siteLogo,
      title: 'Withdrawal Successful',
      messageHtml: `You've successfully withdrawn <strong class="email-label" style="color: #0f172a;">${amountFormatted} ${currency}</strong> from your account.`,
      details,
      buttonText: 'Visit Your Dashboard',
      buttonUrl: dashboardUrl,
      resetPasswordUrl,
      supportUrl,
      subNoticeText: 'Withdrawals are processed promptly. Please check your external wallet or blockchain explorer for confirmation.'
    });

    return await sendEmail({
      to: user.email,
      subject: 'Withdrawal Successful',
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
    const siteLogo = settings?.site_logo || null;
    const frontendUrl = (process.env.FRONTEND_URL || 'https://digitalxtrade.com').replace(/\/+$/, '');
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const resetPasswordUrl = `${frontendUrl}/forgot-password`;
    const supportUrl = `${frontendUrl}/support`;

    const amountFormatted = parseFloat(withdrawal.amount || 0).toFixed(2);
    const currency = withdrawal.currency || 'USDT';

    const details = [
      { label: 'Refunded Amount', value: amountFormatted },
      { label: 'Withdrawal Currency', value: currency },
      { label: 'Withdrawal Status', value: 'Rejected & Refunded', style: 'color: #dc2626; font-weight: 700;' },
      { label: 'Reason', value: reason || 'Destination address verification or security check', style: 'color: #64748b;' }
    ];

    const html = renderDarkGoldTransactionEmail({
      siteName,
      siteLogo,
      title: 'Withdrawal Request Declined',
      messageHtml: 'Your withdrawal request could not be processed and your funds have been refunded to your account balance.',
      details,
      buttonText: 'Visit Your Dashboard',
      buttonUrl: dashboardUrl,
      resetPasswordUrl,
      supportUrl,
      subNoticeText: 'If you believe this was in error, please review your withdrawal wallet details and contact customer support.'
    });

    return await sendEmail({
      to: user.email,
      subject: 'Withdrawal Request Declined',
      html,
      emailType: 'WITHDRAWAL_REJECTED',
      userId: user.id,
    });
  } catch (err) {
    console.error('sendWithdrawalRejectedEmail error:', err);
  }
};

// ==========================================
// 4. REFERRAL COMMISSION EMAIL NOTIFICATIONS
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
      <h2 class="email-title" style="color: #0f172a; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Referral Commission Received</h2>
      <p class="email-desc" style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Hi <b class="email-label" style="color: #0f172a;">${inviterName}</b>,</p>
      <p class="email-desc" style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 20px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Great news! You have earned a referral commission from an active deposit made by a user in your referral network.</p>
      <table width="100%" cellpadding="12" cellspacing="0" class="email-table-card" style="border-collapse: collapse; margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff;">
        <tbody>
          <tr class="email-row-alt" style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td class="email-desc" style="font-weight: 700; color: #475569; width: 45%;">Commission Earned</td>
            <td style="font-weight: 800; color: #10b981;">+$${commFormatted}</td>
          </tr>
          <tr class="email-row-norm" style="border-bottom: 1px solid #e2e8f0;">
            <td class="email-desc" style="font-weight: 700; color: #475569;">Referred User</td>
            <td class="email-label" style="font-weight: 700; color: #0f172a;">${refereeIdentifier}</td>
          </tr>
          <tr class="email-row-alt" style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td class="email-desc" style="font-weight: 700; color: #475569;">Deposit Amount</td>
            <td class="email-label" style="font-weight: 700; color: #0f172a;">$${depFormatted}</td>
          </tr>
          <tr class="email-row-norm" style="border-bottom: 1px solid #e2e8f0;">
            <td class="email-desc" style="font-weight: 700; color: #475569;">Commission Tier</td>
            <td style="font-weight: 700; color: #b58117;">Level ${level} (${percentage}%)</td>
          </tr>
          <tr class="email-row-alt" style="background-color: #f8fafc;">
            <td class="email-desc" style="font-weight: 700; color: #475569;">Credit Status</td>
            <td style="font-weight: 700; color: #10b981;">Credited to Balance</td>
          </tr>
        </tbody>
      </table>
      <p class="email-desc" style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">This bonus has been added directly to your account balance and is immediately available for withdrawal or reinvestment.</p>
      <p class="email-notice" style="color: #64748b; font-size: 13px; line-height: 1.6; margin-top: 12px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Keep sharing your referral link to earn even more passive rewards from your network!</p>
      <p class="email-title" style="color: #0f172a; font-weight: 700; margin-top: 20px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Thank you for partnering with ${siteName}.</p>
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
  if (['APPROVED', 'COMPLETED', 'CONFIRMED'].includes(status)) {
    return sendDepositApprovedEmail({ user, deposit });
  } else if (['REJECTED', 'DECLINED'].includes(status)) {
    return sendDepositRejectedEmail({ user, deposit, reason: deposit?.adminNote });
  }
  // Pending deposit: Do not send email as requested
  return;
};

export const sendWithdrawalEmail = async ({ user, withdrawal, action }) => {
  const status = (withdrawal?.status || action || 'PENDING').toUpperCase();
  if (['APPROVED', 'COMPLETED', 'CONFIRMED'].includes(status)) {
    return sendWithdrawalApprovedEmail({ user, withdrawal });
  } else if (['REJECTED', 'DECLINED'].includes(status)) {
    return sendWithdrawalRejectedEmail({ user, withdrawal, reason: withdrawal?.adminNote });
  }
  // Pending withdrawal: Do not send email as requested
  return;
};
