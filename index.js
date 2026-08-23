#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const pc = require('picocolors');
const logger = require('./src/utils/logger');
const config = require('./src/config');
const audit = require('./src/utils/audit');
const { runRevivePay } = require('./src/pipeline');

const program = new Command();

program
  .name('revivepay')
  .description('RevivePay — Merchant Revenue Recovery & Growth Agent CLI.')
  .option('-m, --mock', 'Run in Simulation Mode with realistic synthetic customers (default if no API keys found)', true)
  .option('-l, --live', 'Run in Live Mode using real Razorpay test-mode API keys')
  .option('-s, --safety', 'Enable interactive safety confirmation prompt before executing outreach')
  .option('-c, --config <path>', 'Path to a custom JSON configuration file to override safety caps')
  .option('-a, --view-audit', 'Display the persistent audit trail log table and exit')
  .option('--no-fail', 'Disable simulated Gateway Timeout failure in Mock Mode')
  .action(async (options) => {
    // 1. Check if user wants to view the audit trail table
    if (options.viewAudit) {
      audit.printAuditTrailTable();
      process.exit(0);
    }

    logger.header('REVIVEPAY MERCHANT GROWTH AGENT');

    // 2. Load configurations
    const activeConfig = config.loadConfig(options.config);
    logger.info('Safety bounds and caps loaded successfully:');
    console.log(pc.dim(`   Max Discount: ${activeConfig.MAX_DISCOUNT_PERCENT}%`));
    console.log(pc.dim(`   Batch Spend Limit: INR ${activeConfig.MAX_BATCH_SPEND_LIMIT}`));
    console.log(pc.dim(`   One-time Buyer Inactivity: ${activeConfig.MIN_DAYS_SINCE_LAST_PURCHASE} days`));
    console.log(pc.dim(`   Contact Cooldown Frequency: ${activeConfig.MAX_OUTREACH_FREQUENCY_DAYS} days`));
    logger.divider();

    // 3. Determine run mode
    let useMock = true;
    if (options.live) {
      // Validate Razorpay keys are present
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        logger.error('Error: Live Mode requested but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET are missing in .env.');
        logger.info('Falling back to Simulation/Mock Mode.');
        useMock = true;
      } else {
        logger.info(pc.green('Live Mode Active: Connecting to Razorpay Test API...'));
        useMock = false;
      }
    } else {
      logger.info(pc.yellow('Simulation Mode Active: Sourcing synthetic Razorpay customers...'));
      useMock = true;
    }

    const demoFailures = options.fail !== false; // default true, unless --no-fail is passed

    // Validate Brevo key for Stage 4 if NOT in mock/simulator fallback
    const brevoKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.SENDER_EMAIL;
    if (brevoKey && senderEmail) {
      logger.info(`Email outreach delivery: ${pc.green('Brevo SMTP Active')} (Sender: ${senderEmail})`);
    } else {
      logger.info(`Email outreach delivery: ${pc.yellow('Simulator Fallback')} (No Brevo keys detected, will print templates)`);
    }
    logger.divider();

    try {
      const batchLogs = await runRevivePay(useMock, demoFailures, options.safety);

      // Print the audit table for the current run
      logger.header('BATCH EXECUTION AUDIT SUMMARY');
      audit.printAuditTrailTable(batchLogs);

    } catch (err) {
      logger.error('RevivePay execution encountered a critical error:', err.stack);
      process.exit(1);
    }
  });

program.parse(process.argv);
