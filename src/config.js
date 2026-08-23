const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const DEFAULTS = {
  MAX_DISCOUNT_PERCENT: 20,          // Maximum allowed discount %
  MAX_BATCH_SPEND_LIMIT: 300,         // Maximum cumulative discount value in INR per run
  MIN_DAYS_SINCE_LAST_PURCHASE: 30,  // Threshold for one-time buyer inactivity
  MAX_OUTREACH_FREQUENCY_DAYS: 7,    // Cool-down period before contacting same customer again
};

let currentConfig = { ...DEFAULTS };

/**
 * Loads configuration, optionally overriding with values from a JSON file.
 * @param {string} [customConfigPath] - Absolute or relative path to a JSON configuration file.
 */
function loadConfig(customConfigPath = null) {
  currentConfig = { ...DEFAULTS };

  // 1. Load from environment variables if present
  if (process.env.MAX_DISCOUNT_PERCENT) {
    currentConfig.MAX_DISCOUNT_PERCENT = parseFloat(process.env.MAX_DISCOUNT_PERCENT);
  }
  if (process.env.MAX_BATCH_SPEND_LIMIT) {
    currentConfig.MAX_BATCH_SPEND_LIMIT = parseFloat(process.env.MAX_BATCH_SPEND_LIMIT);
  }
  if (process.env.MIN_DAYS_SINCE_LAST_PURCHASE) {
    currentConfig.MIN_DAYS_SINCE_LAST_PURCHASE = parseInt(process.env.MIN_DAYS_SINCE_LAST_PURCHASE, 10);
  }
  if (process.env.MAX_OUTREACH_FREQUENCY_DAYS) {
    currentConfig.MAX_OUTREACH_FREQUENCY_DAYS = parseInt(process.env.MAX_OUTREACH_FREQUENCY_DAYS, 10);
  }

  // 2. Load from custom JSON file if provided
  if (customConfigPath) {
    const resolvedPath = path.resolve(customConfigPath);
    try {
      if (fs.existsSync(resolvedPath)) {
        const fileContent = fs.readFileSync(resolvedPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        
        // Merge valid keys
        for (const key of Object.keys(DEFAULTS)) {
          if (parsed[key] !== undefined) {
            currentConfig[key] = parsed[key];
          }
        }
        logger.info(`Loaded custom config overrides from: ${resolvedPath}`);
      } else {
        logger.warn(`Custom config file not found at: ${resolvedPath}. Using defaults.`);
      }
    } catch (error) {
      logger.error(`Error reading custom config file at ${resolvedPath}: ${error.message}`);
    }
  }

  return currentConfig;
}

function getConfig() {
  return currentConfig;
}

module.exports = {
  loadConfig,
  getConfig,
  DEFAULTS
};
