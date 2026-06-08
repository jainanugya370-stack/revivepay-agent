const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Stage 3: Resolving LinkedIn Profile to Verified Email
 * Uses Prospeo Enrich Person API (via PROSPEO_API_KEY) to retrieve a verified work email from a LinkedIn URL.
 * 
 * @param {string} linkedinUrl - The LinkedIn profile URL of the contact.
 * @returns {Promise<string|null>} The verified email address, or null if not found.
 */
async function resolveEmail(linkedinUrl) {
  const apiKey = process.env.PROSPEO_API_KEY;

  if (!apiKey) {
    throw new Error('PROSPEO_API_KEY is not defined in the environment variables.');
  }

  logger.info(`Prospeo Enrich: Resolving email for LinkedIn profile: ${linkedinUrl}`);

  try {
    const response = await axios.post('https://api.prospeo.io/enrich-person', {
      only_verified_email: true,
      enrich_mobile: false,
      data: {
        linkedin_url: linkedinUrl
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': apiKey
      }
    });

    const person = response.data.person;
    const emailInfo = person?.email;
    if (emailInfo && emailInfo.email) {
      const email = emailInfo.email;
      const status = emailInfo.status ? emailInfo.status.toLowerCase() : 'unknown';
      logger.info(`Status returned: ${status}`);
      
      if (status === 'verified' || status === 'catch-all' || status === 'safe') {
        logger.success(`Successfully resolved email: ${email} (Status: ${status})`);
        return email;
      } else {
        logger.warn(`Resolved email ${email} but status was: ${status}. Skipping to maintain high deliverability.`);
        return null;
      }
    } else {
      logger.warn(`No email found for LinkedIn profile: ${linkedinUrl}`);
      return null;
    }

  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(`Error resolving email for ${linkedinUrl}: ${errorMsg}`);
    if (error.response?.data) {
      logger.error(`Full response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    // Return null to keep orchestrator running rather than crashing
    return null;
  }
}

module.exports = { resolveEmail };
