const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Stage 1: Sourcing Lookalike Companies
 * Uses Apollo.io API to find companies similar to the seed domain.
 * 
 * @param {string} seedDomain - The domain to find lookalikes for (e.g. 'stripe.com').
 * @param {number} limit - Maximum number of lookalike domains to return.
 * @returns {Promise<string[]>} List of lookalike company domains.
 */
async function getLookalikes(seedDomain, limit = 5) {
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not defined in the environment variables.');
  }

  // Ensure the domain is clean (remove http://, https://, www., and trailing slashes)
  const cleanSeedDomain = seedDomain
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .toLowerCase();

  logger.info(`Attempting to enrich seed domain: ${cleanSeedDomain}`);

  let industries = [];
  let keyword = null;

  try {
    // 1. Enrich the seed domain to extract its keywords/industries (GET request)
    const enrichResponse = await axios.get(`https://api.apollo.io/api/v1/organizations/enrich?domain=${cleanSeedDomain}`, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey
      }
    });

    const org = enrichResponse.data.organization;
    if (org) {
      industries = org.industries || [];
      if (org.industry && !industries.includes(org.industry)) {
        industries.push(org.industry);
      }
      if (org.keyword_tags && org.keyword_tags.length > 0) {
        keyword = org.keyword_tags[0];
      }
      logger.success(`Successfully enriched ${cleanSeedDomain}. Found industries: ${industries.slice(0, 3).join(', ')} | keyword: ${keyword || 'N/A'}`);
    } else {
      logger.warn(`Could not find enrichment data for ${cleanSeedDomain}. Falling back to default filters.`);
    }
  } catch (error) {
    logger.warn(`Failed to enrich ${cleanSeedDomain}: ${error.message}. Falling back to default filters.`);
  }

  // Fallback if enrichment failed or returned nothing
  if (industries.length === 0) {
    industries = ['Software', 'Information Technology & Services', 'Internet'];
  }

  logger.info(`Searching for lookalike companies in industries: ${industries.slice(0, 3).join(', ')}...`);

  try {
    // 2. Search for organizations matching the industries and keyword
    const searchResponse = await axios.post('https://api.apollo.io/api/v1/organizations/search', {
      organization_industries: industries.length > 0 ? industries : undefined,
      q_organization_keyword: keyword || undefined,
      page: 1,
      per_page: limit * 2 // Fetch more than limit to filter out seed domain and duplicates
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      }
    });

    const orgs = searchResponse.data.organizations || [];
    const domains = new Set();

    for (const org of orgs) {
      if (!org.primary_domain && !org.website_url) continue;

      // Extract domain from website_url if primary_domain is missing
      let domain = org.primary_domain || org.website_url;
      domain = domain
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .split('/')[0]
        .toLowerCase();

      // Filter out empty domains, the seed domain itself, and duplicates
      if (domain && domain !== cleanSeedDomain && domain.includes('.')) {
        domains.add(domain);
      }

      if (domains.size >= limit) {
        break;
      }
    }

    const lookalikeList = Array.from(domains);

    // If search returned nothing, fall back to a sensible list of active tech domains to keep the pipeline functional
    if (lookalikeList.length === 0) {
      logger.warn('Search returned 0 similar domains. Using resilient industry fallback list.');
      const fallbacks = ['stripe.com', 'zoom.us', 'slack.com', 'salesforce.com', 'hubspot.com']
        .filter(d => d !== cleanSeedDomain)
        .slice(0, limit);
      return fallbacks;
    }

    logger.success(`Stage 1 Complete: Found ${lookalikeList.length} lookalike companies:`);
    lookalikeList.forEach((d, i) => console.log(`   ${i + 1}. ${d}`));
    return lookalikeList;

  } catch (error) {
    logger.error(`Failed to fetch lookalike companies: ${error.message}`);
    // If the API fails completely, fall back to a resilient default list to ensure the next stages run
    logger.warn('API error encountered. Falling back to resilient default company list to continue pipeline.');
    return ['stripe.com', 'zoom.us', 'slack.com', 'salesforce.com', 'hubspot.com']
      .filter(d => d !== cleanSeedDomain)
      .slice(0, limit);
  }
}

module.exports = { getLookalikes };
