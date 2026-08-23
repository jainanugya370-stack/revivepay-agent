const axios = require('axios');
const logger = require('../utils/logger');
const pc = require('picocolors');

/**
 * Stage 4: Send Recovery Emails via Brevo (or simulation fallback)
 * 
 * @param {object} customer - Customer data (name, email)
 * @param {string} signalType - Type of opportunity (one-time buyer, abandoned checkout, etc.)
 * @param {object} actionDetails - Action context (discountPercent, paymentLink, planName, amount)
 * @returns {Promise<boolean>} True if sent or simulated successfully, false on error.
 */
async function sendRecoveryEmail(customer, signalType, actionDetails) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL;
  const senderName = process.env.SENDER_NAME || 'RevivePay Merchant Agent';

  const toEmail = customer.email;
  const firstName = customer.name.split(' ')[0] || 'Customer';
  const discount = actionDetails.discountPercent || 0;
  const payLink = actionDetails.paymentLink || '#';
  const plan = actionDetails.planName || 'your subscription plan';

  let subject = '';
  let htmlContent = '';

  // 1. Map recovery email templates based on signalType
  if (signalType === 'one-time buyer') {
    subject = `We missed you, ${firstName}! Here is ${discount}% off your next order`;
    htmlContent = `
      <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-bottom: 20px;">We'd love to welcome you back!</h2>
          <p>Hi ${firstName},</p>
          <p>It's been a while since your last purchase. We value having you as a customer and wanted to offer you a special coupon code for <strong>${discount}% off</strong> your next order.</p>
          <p style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 1.2rem; font-weight: bold; letter-spacing: 2px; border-radius: 4px; margin: 20px 0;">
            WELCOMEBACK${discount}
          </p>
          <p>This offer is valid for the next 7 days. Just apply this code at checkout to claim your savings!</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 0.85rem; color: #64748b;">Best regards,<br><strong>${senderName}</strong></p>
        </body>
      </html>
    `;
  } else if (signalType === 'abandoned checkout') {
    subject = `Complete your order, ${firstName} (Special ${discount}% discount included)`;
    htmlContent = `
      <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-bottom: 20px;">Retrieve Your Shopping Cart</h2>
          <p>Hi ${firstName},</p>
          <p>We noticed you left some items in your cart. To help you finish checking out, we've generated a secure payment link with a <strong>${discount}% discount</strong> already applied!</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${payLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">
              Complete Your Purchase Now &rarr;
            </a>
          </p>
          <p style="font-size: 0.9rem; color: #64748b; text-align: center;">
            Or copy this link: <a href="${payLink}">${payLink}</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 0.85rem; color: #64748b;">Best regards,<br><strong>${senderName}</strong></p>
        </body>
      </html>
    `;
  } else if (signalType === 'subscriptions nearing renewal') {
    subject = `Friendly reminder: Your subscription is renewing soon`;
    htmlContent = `
      <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-bottom: 20px;">Subscription Renewal Notice</h2>
          <p>Hi ${firstName},</p>
          <p>This is a quick friendly reminder that your subscription for <strong>${plan}</strong> is scheduled to renew in 2 days.</p>
          <p>No action is required from your end. The subscription amount of <strong>INR ${actionDetails.amount || 0}</strong> will be automatically charged to your default card on file.</p>
          <p>If you'd like to update your details or review your plan, you can access your profile here: <a href="${payLink}">${payLink}</a></p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 0.85rem; color: #64748b;">Best regards,<br><strong>${senderName}</strong></p>
        </body>
      </html>
    `;
  } else if (signalType === 'failed subscription') {
    subject = `Action Required: Subscription renewal payment failed`;
    htmlContent = `
      <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #ef4444; margin-bottom: 20px;">Payment Declined</h2>
          <p>Hi ${firstName},</p>
          <p>We attempted to renew your subscription for <strong>${plan}</strong>, but the payment failed. Your account is currently in a retry state.</p>
          <p>To avoid service interruptions, please update your billing details and retry the payment using the link below:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${payLink}" style="background-color: #ef4444; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">
              Update Billing & Retry Payment &rarr;
            </a>
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 0.85rem; color: #64748b;">Best regards,<br><strong>${senderName}</strong></p>
        </body>
      </html>
    `;
  } else {
    // Fallback template
    subject = `Important update from ${senderName}`;
    htmlContent = `<p>Hi ${firstName}, this is a recovery notice regarding your order.</p>`;
  }

  // 2. Fallback if keys are missing - Simulator Mode
  if (!apiKey || !senderEmail) {
    logger.info(`[Brevo Simulator] Simulating email delivery to ${pc.cyan(customer.name)} (${pc.underline(toEmail)}):`);
    console.log(pc.dim(`   Subject: ${subject}`));
    console.log(pc.dim(`   (Email content simulated successfully, skipping HTTP request since credentials are absent.)`));
    return true;
  }

  // 3. Send using real Brevo API
  logger.info(`Sending email via Brevo to ${customer.name} (${toEmail})...`);
  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: toEmail,
          name: customer.name
        }
      ],
      subject: subject,
      htmlContent: htmlContent
    }, {
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      }
    });

    if (response.status === 201 || response.status === 200) {
      logger.success(`Email successfully sent to ${toEmail} (MsgID: ${response.data.messageId || 'unknown'})`);
      return true;
    } else {
      logger.warn(`Brevo returned unexpected status ${response.status}: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(`Failed to send email to ${toEmail} via Brevo API: ${errorMsg}`);
    return false;
  }
}

module.exports = { sendRecoveryEmail };
