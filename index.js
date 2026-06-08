#!/usr/bin/env node

require('dotenv').config();
const { Command } = require('commander');
const inquirer = require('inquirer');
const pc = require('picocolors');
const logger = require('./src/utils/logger');
const { getLookalikes } = require('./src/api/lookalikes');
const { getDecisionMakers } = require('./src/api/prospeo');
const { resolveEmail } = require('./src/api/prospeoEnrich');
const { sendOutreachEmail } = require('./src/api/brevo');

// Initialize Commander
const program = new Command();

program
  .name('outreach-pipeline')
  .description('Automated 4-stage outbound sales outreach pipeline CLI.')
  .argument('[seed-domain]', 'Seed company domain to find lookalikes for (e.g. stripe.com)')
  .option('-l, --limit <number>', 'Number of lookalike companies to source', '3')
  .option('-s, --safety', 'Enable safety checkpoint interactive Y/N prompt before sending')
  .option('-d, --demo', 'Demo mode: targets project.samarops@gmail.com and samar@casmed.in only')
  .option('-t, --stage <type>', 'Execution stage: exec (full run) or mail (only mock/outreach mail)', 'exec')
  .action(runPipeline);

async function runPipeline(seedDomain, options) {
  logger.header('AUTOMATED OUTREACH PIPELINE');
  
  const stage = options.stage || 'exec';
  if (stage !== 'exec' && stage !== 'mail') {
    logger.error(`Invalid stage: ${stage}. Please specify either 'exec' or 'mail'.`);
    process.exit(1);
  }

  if (stage === 'exec' && !seedDomain) {
    logger.error('Error: seed-domain argument is required when running in "exec" stage.');
    logger.info('Usage: node index.js <seed-domain> [options]');
    process.exit(1);
  }

  const limit = parseInt(options.limit, 10);
  if (isNaN(limit) || limit <= 0) {
    logger.error('Invalid limit. Please specify a positive number.');
    process.exit(1);
  }

  // Validate environment variables
  const requiredKeys = stage === 'mail'
    ? ['BREVO_API_KEY', 'SENDER_EMAIL']
    : ['APOLLO_API_KEY', 'PROSPEO_API_KEY', 'BREVO_API_KEY', 'SENDER_EMAIL'];
    
  const missingKeys = requiredKeys.filter(key => !process.env[key]);
  if (missingKeys.length > 0) {
    logger.error(`Missing required environment variables: ${missingKeys.join(', ')}`);
    logger.info('Please check your .env file against .env.example.');
    process.exit(1);
  }

  if (stage === 'exec') {
    logger.info(`Starting pipeline with seed domain: ${pc.bold(seedDomain)} (limit: ${limit} companies)`);
  } else {
    logger.info('Starting pipeline in mail-only stage...');
  }
  logger.divider();

  try {
    let targetContacts = [];

    if (stage === 'mail') {
      if (options.demo) {
        logger.info(pc.yellow('Demo Mode active: Overriding target list with test emails (skipping Stages 1 to 3).'));
        targetContacts = [
          {
            firstName: 'Samar',
            lastName: 'Ops',
            jobTitle: 'Head of Operations',
            companyName: 'SamarOps',
            domain: 'samarops.com',
            email: 'project.samarops@gmail.com'
          },
          {
            firstName: 'Samar',
            lastName: 'Casmed',
            jobTitle: 'Founder',
            companyName: 'Casmed',
            domain: 'casmed.in',
            email: 'samar@casmed.in'
          }
        ];
      } else {
        logger.error('Error: Running stage "mail" without --demo is not supported (no target list is sourced).');
        logger.info('Please run with both --stage mail and --demo flags to execute the outreach mail mock.');
        process.exit(1);
      }
    } else {
      // ==========================================
      // STAGE 1: Lookalike Sourcing
      // ==========================================
      logger.step('1', `Sourcing lookalike companies similar to ${seedDomain}...`);
      let lookalikeDomains = [];
      try {
        lookalikeDomains = await getLookalikes(seedDomain, limit);
      } catch (err) {
        if (!options.demo) throw err;
        logger.warn(`Stage 1 Sourcing failed: ${err.message}. Continuing due to Demo Mode.`);
      }
      
      if ((!lookalikeDomains || lookalikeDomains.length === 0) && !options.demo) {
        logger.warn('No lookalike companies found. Halted pipeline.');
        process.exit(0);
      }
      logger.divider();

      // ==========================================
      // STAGE 2: Decision Maker Identification
      // ==========================================
      logger.step('2', `Searching for C-level/VP decision makers in lookalike domains...`);
      const rawDecisionMakers = [];
      
      for (const domain of lookalikeDomains) {
        try {
          const companyDMs = await getDecisionMakers(domain);
          rawDecisionMakers.push(...companyDMs);
        } catch (err) {
          logger.warn(`Stage 2 Search failed for domain ${domain}: ${err.message}.`);
        }
        // Subtle pause to respect API rate limits (Prospeo allows 1 request/sec)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (rawDecisionMakers.length === 0 && !options.demo) {
        logger.warn('No decision makers found with LinkedIn profiles. Halted pipeline.');
        process.exit(0);
      }
      logger.divider();

      // ==========================================
      // STAGE 3: Email Resolution
      // ==========================================
      logger.step('3', `Resolving verified business email addresses from LinkedIn profiles...`);
      const verifiedContacts = [];

      for (const dm of rawDecisionMakers) {
        try {
          const email = await resolveEmail(dm.linkedinUrl);
          if (email) {
            verifiedContacts.push({
              ...dm,
              email
            });
          }
        } catch (err) {
          logger.warn(`Stage 3 Resolution failed for ${dm.firstName}: ${err.message}.`);
        }
        // Pause to avoid hitting Prospeo rate limits (Prospeo allows 1 request/sec)
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      logger.divider();

      // Override targets if demo mode is enabled
      targetContacts = verifiedContacts;
      if (options.demo) {
        logger.info(pc.yellow('Demo Mode active: Overriding target list with test emails.'));
        targetContacts = [
          {
            firstName: 'Samar',
            lastName: 'Ops',
            jobTitle: 'Head of Operations',
            companyName: 'SamarOps',
            domain: 'samarops.com',
            email: 'project.samarops@gmail.com'
          },
          {
            firstName: 'Samar',
            lastName: 'Casmed',
            jobTitle: 'Founder',
            companyName: 'Casmed',
            domain: 'casmed.in',
            email: 'samar@casmed.in'
          }
        ];
      }
    }

    if (targetContacts.length === 0) {
      logger.warn('No verified emails could be resolved for any decision-makers. Halted pipeline.');
      process.exit(0);
    }

    // ==========================================
    // SAFETY CHECKPOINT
    // ==========================================
    logger.header('SAFETY CHECKPOINT');
    console.log(pc.yellow(pc.bold('Ready to launch campaign. Summary of target list:')));
    
    // Draw a premium ASCII summary table
    const colWidths = { name: 22, title: 25, company: 18, email: 28 };
    const tableHeader = 
      `| ${'Name'.padEnd(colWidths.name)} | ${'Job Title'.padEnd(colWidths.title)} | ${'Company'.padEnd(colWidths.company)} | ${'Email'.padEnd(colWidths.email)} |`;
    const tableDivider = `+${'-'.repeat(colWidths.name + 2)}+${'-'.repeat(colWidths.title + 2)}+${'-'.repeat(colWidths.company + 2)}+${'-'.repeat(colWidths.email + 2)}+`;
    
    console.log(pc.cyan(tableDivider));
    console.log(pc.cyan(tableHeader));
    console.log(pc.cyan(tableDivider));
    
    targetContacts.forEach(c => {
      const fullName = `${c.firstName} ${c.lastName}`.substring(0, colWidths.name);
      const title = c.jobTitle.substring(0, colWidths.title);
      const company = c.companyName.substring(0, colWidths.company);
      const email = c.email.substring(0, colWidths.email);
      
      console.log(pc.white(
        `| ${fullName.padEnd(colWidths.name)} | ${title.padEnd(colWidths.title)} | ${company.padEnd(colWidths.company)} | ${email.padEnd(colWidths.email)} |`
      ));
    });
    console.log(pc.cyan(tableDivider));
    console.log(`\nFound ${pc.green(pc.bold(targetContacts.length))} verified email(s) across target lookalike companies.`);
    console.log(pc.dim(`Sender configuration: ${process.env.SENDER_NAME} <${process.env.SENDER_EMAIL}>\n`));

    let confirmSend = true;
    if (options.safety) {
      // Ask user for permission to send
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmSend',
          message: 'Do you want to send the personalized outreach campaign to these contacts?',
          default: false
        }
      ]);
      confirmSend = answers.confirmSend;
    } else {
      logger.info(pc.yellow('Safety Checkpoint bypassed (--safety flag not passed). Proceeding immediately.'));
    }

    // ==========================================
    // STAGE 4: Email Outreach
    // ==========================================
    if (confirmSend) {
      logger.step('4', `Initiating personalized email outreach campaign via Brevo SMTP...`);
      let successCount = 0;

      for (const contact of targetContacts) {
        const success = await sendOutreachEmail(
          contact.email, 
          contact.firstName, 
          contact.companyName, 
          contact.jobTitle
        );
        if (success) successCount++;
        // Small delay between sends to prevent Brevo delivery spikes
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.divider();
      logger.success(`Pipeline Execution Completed successfully!`);
      console.log(pc.green(`   Campaign Sent: ${successCount} / ${targetContacts.length} emails delivered successfully.`));
    } else {
      logger.warn('Pipeline execution halted by user. No outreach emails were sent.');
    }

  } catch (error) {
    logger.error('Pipeline execution failed due to an unexpected error:', error.stack);
    process.exit(1);
  }
}

program.parse(process.argv);
