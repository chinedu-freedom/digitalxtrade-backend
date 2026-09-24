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
function stripEmojisAndIcons(str) {
  if (!str) return '';
  return str
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{303D}\u{00A9}\u{00AE}\u{2122}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Render Master Email Template
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
    // Dynamically fetch site_name and site_logo from Settings table
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

    // 1. Direct Zoho Mail API (from .env credentials)
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
            fromAddress: process.env.ZOHO_FROM_EMAIL || 'info@digitalxtrade.vip',
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
          }).catch(() => {});
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
        from_email: process.env.FROM_EMAIL || 'noreply@digitalxtrade.vip',
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
        }).catch(() => {});
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
      }).catch(() => {});
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
      }).catch(() => {});
    }
    return { success: false, error: error.message };
  }
};

export async function sendAdminNotificationEmail({ subject, title, details }) {
  return { success: true, message: 'Admin notification emails disabled' };
}

export const sendDepositEmail = async ({ user, deposit }) => {
  try {
    const siteSettings = await prisma.settings.findFirst().catch(() => null);
    const siteName = siteSettings?.site_name || 'DigitalXTrade';
    const subject = `Deposit Notification: ${deposit.status || 'Pending'}`;
    const amountStr = `$${parseFloat(deposit.amount || 0).toFixed(2)}`;

    const html = `<h2>Deposit Update</h2><p>Dear ${user.fullName || user.username},</p><p>Your deposit of <strong>${amountStr}</strong> via ${deposit.gateway || 'Crypto'} status is now <strong>${deposit.status}</strong>.</p>`;

    await sendEmail({
      to: user.email,
      subject,
      html,
      emailType: 'DEPOSIT_NOTIFICATION',
      userId: user.id,
    });
  } catch (err) {
    console.error('Error sending deposit email:', err);
  }
};

export const sendWithdrawalEmail = async ({ user, withdrawal }) => {
  try {
    const siteSettings = await prisma.settings.findFirst().catch(() => null);
    const siteName = siteSettings?.site_name || 'DigitalXTrade';
    const subject = `Withdrawal Notification: ${withdrawal.status || 'Pending'}`;
    const amountStr = `$${parseFloat(withdrawal.amount || 0).toFixed(2)}`;

    const html = `<h2>Withdrawal Update</h2><p>Dear ${user.fullName || user.username},</p><p>Your withdrawal request of <strong>${amountStr}</strong> status is now <strong>${withdrawal.status}</strong>.</p>`;

    await sendEmail({
      to: user.email,
      subject,
      html,
      emailType: 'WITHDRAWAL_NOTIFICATION',
      userId: user.id,
    });
  } catch (err) {
    console.error('Error sending withdrawal email:', err);
  }
};
