const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Stage 4: Sending Personalized Email Outreach via Brevo SMTP API
 * 
 * @param {string} toEmail - The recipient's email address.
 * @param {string} firstName - The recipient's first name.
 * @param {string} companyName - The recipient's company name.
 * @param {string} jobTitle - The recipient's job title.
 * @returns {Promise<boolean>} True if email sent successfully, false otherwise.
 */
async function sendOutreachEmail(toEmail, firstName, companyName, jobTitle) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SENDER_EMAIL;
  const senderName = process.env.SENDER_NAME || 'Anugya Jain';

  if (!apiKey || !senderEmail) {
    throw new Error('BREVO_API_KEY and SENDER_EMAIL must be defined in the environment variables.');
  }

  // Formatting name for personalization (capitalize first letter)
  const capitalizedFirstName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : 'there';
  const formattedCompany = companyName ? companyName.trim() : 'your company';

  // Construct a sharp, highly personalized email template
  const subject = `Outreach automation for ${formattedCompany} — quick question, ${capitalizedFirstName}`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333;">
        <p>Hi ${capitalizedFirstName},</p>
        <p>I noticed that <strong>${formattedCompany}</strong> is doing great work, and given your role as <strong>${jobTitle}</strong>, I wanted to reach out with a quick question.</p>
        <p>Are you currently looking to automate your lead sourcing and outreach pipeline? I have built an automated outbound outreach engine in Node.js that coordinates lookalike company sourcing (Apollo.io), discovery (Prospeo), verification, and Brevo based email delivery.</p>
        <p>I'd love to share the source code and show you a quick demo. Are you free for a brief chat this week?</p>
        <p>Best regards,</p>
        <p><strong>${senderName}</strong><br>
        Software Development Engineering Intern Candidate<br>
        <a href="mailto:${senderEmail}">${senderEmail}</a></p>
      </body>
    </html>
  `;

  logger.info(`Sending email to ${capitalizedFirstName} (${toEmail}) at ${formattedCompany}...`);

  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [
        {
          email: toEmail,
          name: `${firstName} ${jobTitle}`
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
      logger.success(`Email successfully sent to ${toEmail} (MessageId: ${response.data.messageId || 'unknown'})`);
      return true;
    } else {
      logger.warn(`Brevo returned unexpected status code ${response.status}: ${JSON.stringify(response.data)}`);
      return false;
    }

  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(`Failed to send email to ${toEmail} via Brevo: ${errorMsg}`);
    return false;
  }
}

module.exports = { sendOutreachEmail };
