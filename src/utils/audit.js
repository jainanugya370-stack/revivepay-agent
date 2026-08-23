const fs = require('fs');
const path = require('path');
const pc = require('picocolors');

// Paths for log storage
const PROJECT_OUTPUT_DIR = path.resolve(__dirname, '../../output');
const PROJECT_JSON_LOG = path.join(PROJECT_OUTPUT_DIR, 'audit_log.json');
const PROJECT_MD_LOG = path.join(PROJECT_OUTPUT_DIR, 'audit_log.md');

// App data brain storage
const BRAIN_DIR = 'C:\\Users\\anugy\\.gemini\\antigravity\\brain\\c01a8fa8-56c2-4b9e-ae56-132c79a024d4';
const BRAIN_JSON_LOG = path.join(BRAIN_DIR, 'audit_log.json');
const BRAIN_MD_LOG = path.join(BRAIN_DIR, 'audit_log.md');

/**
 * Creates directories if they do not exist
 */
function ensureDirectories() {
  if (!fs.existsSync(PROJECT_OUTPUT_DIR)) {
    fs.mkdirSync(PROJECT_OUTPUT_DIR, { recursive: true });
  }
  try {
    if (!fs.existsSync(BRAIN_DIR)) {
      fs.mkdirSync(BRAIN_DIR, { recursive: true });
    }
  } catch (err) {
    // Suppress errors writing to IDE app data if permissions differ
  }
}

/**
 * Read audit logs from file
 * @returns {Array} - List of audit records
 */
function readAuditLogs() {
  ensureDirectories();
  if (fs.existsSync(PROJECT_JSON_LOG)) {
    try {
      const data = fs.readFileSync(PROJECT_JSON_LOG, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Checks if a customer was contacted within the last frequency limit
 * @param {string} customerId - Razorpay customer ID
 * @param {number} frequencyDays - Frequency cap in days
 * @returns {boolean} - True if already contacted within cool-down, false otherwise
 */
function isUnderFrequencyCap(customerId, frequencyDays) {
  const logs = readAuditLogs();
  const now = Date.now();
  const limitMs = frequencyDays * 86400 * 1000;

  // Filter logs for this customer with SUCCESS outcome
  const recentContact = logs.find(log => {
    if (log.customerId !== customerId) return false;
    if (log.decisionStatus !== 'APPROVED' || log.outcome !== 'SUCCESS') return false;
    
    const logTime = new Date(log.timestamp).getTime();
    return (now - logTime) < limitMs;
  });

  return !!recentContact;
}

/**
 * Appends a new audit record to both JSON and Markdown log files
 * @param {object} record - The audit trail event
 */
function logAuditRecord(record) {
  ensureDirectories();
  const logs = readAuditLogs();
  
  const enrichedRecord = {
    timestamp: new Date().toISOString(),
    ...record
  };
  
  logs.push(enrichedRecord);
  
  // 1. Write to JSON logs (Project and Brain)
  const jsonContent = JSON.stringify(logs, null, 2);
  fs.writeFileSync(PROJECT_JSON_LOG, jsonContent, 'utf8');
  try {
    fs.writeFileSync(BRAIN_JSON_LOG, jsonContent, 'utf8');
  } catch (e) {}

  // 2. Append/Re-generate Markdown logs
  const mdContent = generateMarkdownLog(logs);
  fs.writeFileSync(PROJECT_MD_LOG, mdContent, 'utf8');
  try {
    fs.writeFileSync(BRAIN_MD_LOG, mdContent, 'utf8');
  } catch (e) {}
}

/**
 * Helper to turn JSON logs array into a clean markdown document
 */
function generateMarkdownLog(logs) {
  let md = `# RevivePay — Merchant Revenue Recovery Audit Trail\n\n`;
  md += `This document records every money-touching decision and automated action taken by the RevivePay agent.\n\n`;
  md += `| Timestamp | Customer | Signal | Status | Reason | Outcome | Detail |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  // Write in reverse chronological order (newest first)
  const sortedLogs = [...logs].reverse();
  for (const log of sortedLogs) {
    const statusLabel = log.decisionStatus === 'APPROVED' ? `✅ **APPROVED**` : `⚠️ **GATED**`;
    const outcomeLabel = log.outcome === 'SUCCESS' ? `🟩 SUCCESS` : log.outcome === 'FAILED' ? `🟥 FAILED` : `⬜ GATED`;
    const customerDesc = `${log.customerName} (${log.customerId})`;
    
    md += `| ${log.timestamp} | ${customerDesc} | ${log.signalType} | ${statusLabel} | ${log.decisionReasoning} | ${outcomeLabel} | ${log.actionDetails || 'None'} |\n`;
  }
  return md;
}

/**
 * Outputs a beautiful formatted table of the current run's log to the console
 */
function printAuditTrailTable(currentRunLogs = null) {
  const logs = currentRunLogs || readAuditLogs();
  if (logs.length === 0) {
    console.log(pc.yellow('No audit trail records found.'));
    return;
  }

  // Header
  console.log('\n' + pc.magenta(pc.bold('========================================= REVIVEPAY AUDIT TRAIL =========================================')));
  
  const colWidths = {
    time: 9, // showing only HH:MM:ss
    customer: 18,
    signal: 20,
    status: 10,
    outcome: 9,
    reason: 45
  };

  const header = `| ${'Time'.padEnd(colWidths.time)} | ${'Customer'.padEnd(colWidths.customer)} | ${'Signal Type'.padEnd(colWidths.signal)} | ${'Decision'.padEnd(colWidths.status)} | ${'Outcome'.padEnd(colWidths.outcome)} | ${'Decision Reasoning'.padEnd(colWidths.reason)} |`;
  const divider = `+${'-'.repeat(colWidths.time + 2)}+${'-'.repeat(colWidths.customer + 2)}+${'-'.repeat(colWidths.signal + 2)}+${'-'.repeat(colWidths.status + 2)}+${'-'.repeat(colWidths.outcome + 2)}+${'-'.repeat(colWidths.reason + 2)}+`;

  console.log(pc.cyan(divider));
  console.log(pc.cyan(header));
  console.log(pc.cyan(divider));

  // Rows (print last 15 entries for readability if total log is huge)
  const displayLogs = logs.slice(-15);
  displayLogs.forEach(log => {
    const timeStr = (log.timestamp || new Date().toISOString()).split('T')[1].substring(0, 8);
    const time = timeStr.padEnd(colWidths.time);
    
    const nameStr = log.customerName.substring(0, colWidths.customer);
    const customer = nameStr.padEnd(colWidths.customer);
    
    const sigStr = log.signalType.substring(0, colWidths.signal);
    const signal = sigStr.padEnd(colWidths.signal);

    let status = '';
    if (log.decisionStatus === 'APPROVED') {
      status = pc.green(pc.bold('APPROVED'.padEnd(colWidths.status)));
    } else {
      status = pc.yellow(pc.bold('GATED'.padEnd(colWidths.status)));
    }

    let outcome = '';
    if (log.outcome === 'SUCCESS') {
      outcome = pc.green('SUCCESS'.padEnd(colWidths.outcome));
    } else if (log.outcome === 'FAILED') {
      outcome = pc.red(pc.bold('FAILED'.padEnd(colWidths.outcome)));
    } else {
      outcome = pc.dim('GATED'.padEnd(colWidths.outcome));
    }

    const reasonStr = log.decisionReasoning.substring(0, colWidths.reason);
    const reason = reasonStr.padEnd(colWidths.reason);

    console.log(`| ${time} | ${customer} | ${signal} | ${status} | ${outcome} | ${reason} |`);
  });

  console.log(pc.cyan(divider));
  console.log(pc.dim(`Total Logs Recorded: ${logs.length}. Audit logs saved at: ./output/audit_log.json`));
  console.log(pc.dim(`Human-readable Markdown report: ./output/audit_log.md\n`));
}

module.exports = {
  logAuditRecord,
  isUnderFrequencyCap,
  printAuditTrailTable,
  readAuditLogs
};
