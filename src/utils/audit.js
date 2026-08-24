const fs = require('fs');
const path = require('path');
const pc = require('picocolors');

// Paths for log storage
const PROJECT_OUTPUT_DIR = path.resolve(__dirname, '../../output');
const PROJECT_JSON_LOG = path.join(PROJECT_OUTPUT_DIR, 'audit_log.json');
const PROJECT_MD_LOG = path.join(PROJECT_OUTPUT_DIR, 'audit_log.md');

/**
 * Creates directories if they do not exist
 */
function ensureDirectories() {
  if (!fs.existsSync(PROJECT_OUTPUT_DIR)) {
    fs.mkdirSync(PROJECT_OUTPUT_DIR, { recursive: true });
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
 * @param {boolean} [isMock=false] - Whether pipeline is running in simulation/mock mode
 * @returns {boolean} - True if already contacted within cool-down, false otherwise
 */
function isUnderFrequencyCap(customerId, frequencyDays, isMock = false) {
  // In simulation/demo mode, do not read pre-existing disk logs so that demo runs behave deterministically
  if (isMock) return false;

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
  
  // 1. Write to JSON logs
  const jsonContent = JSON.stringify(logs, null, 2);
  fs.writeFileSync(PROJECT_JSON_LOG, jsonContent, 'utf8');

  // 2. Append/Re-generate Markdown logs
  const mdContent = generateMarkdownLog(logs);
  fs.writeFileSync(PROJECT_MD_LOG, mdContent, 'utf8');
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
    
    // Sanitize pipeline chars and newlines in cell content for valid markdown table syntax
    const cleanReason = (log.decisionReasoning || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const cleanDetails = (log.actionDetails || 'None').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    
    md += `| ${log.timestamp} | ${customerDesc} | ${log.signalType} | ${statusLabel} | ${cleanReason} | ${outcomeLabel} | ${cleanDetails} |\n`;
  }
  return md;
}

/**
 * Helper to split text into lines of at most `maxWidth` characters (word-wrapped).
 */
function wrapText(str, maxWidth) {
  if (!str) return [''];
  const words = String(str).split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      let rem = word;
      while (rem.length > maxWidth) {
        lines.push(rem.substring(0, maxWidth));
        rem = rem.substring(maxWidth);
      }
      currentLine = rem;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
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

  const colWidths = {
    time: 8,      // HH:MM:ss
    customer: 18,
    signal: 30,   // Fits "subscriptions nearing renewal" (29 chars) on one line
    status: 10,   // "APPROVED" / "GATED"
    outcome: 9,   // "SUCCESS" / "FAILED" / "GATED"
    reason: 55    // Decision reasoning (wrapped onto multi-line if longer)
  };

  const header = `| ${'Time'.padEnd(colWidths.time)} | ${'Customer'.padEnd(colWidths.customer)} | ${'Signal Type'.padEnd(colWidths.signal)} | ${'Decision'.padEnd(colWidths.status)} | ${'Outcome'.padEnd(colWidths.outcome)} | ${'Decision Reasoning'.padEnd(colWidths.reason)} |`;
  const divider = `+${'-'.repeat(colWidths.time + 2)}+${'-'.repeat(colWidths.customer + 2)}+${'-'.repeat(colWidths.signal + 2)}+${'-'.repeat(colWidths.status + 2)}+${'-'.repeat(colWidths.outcome + 2)}+${'-'.repeat(colWidths.reason + 2)}+`;

  console.log('\n' + pc.magenta(pc.bold('='.repeat(header.length))));
  console.log(pc.magenta(pc.bold('                               REVIVEPAY AUDIT TRAIL')));
  console.log(pc.magenta(pc.bold('='.repeat(header.length))));

  console.log(pc.cyan(divider));
  console.log(pc.cyan(header));
  console.log(pc.cyan(divider));

  // Rows (print last 15 entries for readability if total log is huge)
  const displayLogs = logs.slice(-15);
  displayLogs.forEach(log => {
    const timeStr = (log.timestamp || new Date().toISOString()).split('T')[1].substring(0, 8);
    
    const timeLines = wrapText(timeStr, colWidths.time);
    const customerLines = wrapText(log.customerName, colWidths.customer);
    const signalLines = wrapText(log.signalType, colWidths.signal);
    const reasonLines = wrapText(log.decisionReasoning, colWidths.reason);
    
    const numLines = Math.max(
      timeLines.length,
      customerLines.length,
      signalLines.length,
      reasonLines.length
    );

    for (let i = 0; i < numLines; i++) {
      const timeCell = (timeLines[i] || '').padEnd(colWidths.time);
      const customerCell = (customerLines[i] || '').padEnd(colWidths.customer);
      const signalCell = (signalLines[i] || '').padEnd(colWidths.signal);
      const reasonCell = (reasonLines[i] || '').padEnd(colWidths.reason);

      let statusCell = ''.padEnd(colWidths.status);
      let outcomeCell = ''.padEnd(colWidths.outcome);

      if (i === 0) {
        if (log.decisionStatus === 'APPROVED') {
          statusCell = pc.green(pc.bold('APPROVED'.padEnd(colWidths.status)));
        } else {
          statusCell = pc.yellow(pc.bold('GATED'.padEnd(colWidths.status)));
        }

        if (log.outcome === 'SUCCESS') {
          outcomeCell = pc.green('SUCCESS'.padEnd(colWidths.outcome));
        } else if (log.outcome === 'FAILED') {
          outcomeCell = pc.red(pc.bold('FAILED'.padEnd(colWidths.outcome)));
        } else {
          outcomeCell = pc.dim('GATED'.padEnd(colWidths.outcome));
        }
      }

      console.log(`| ${timeCell} | ${customerCell} | ${signalCell} | ${statusCell} | ${outcomeCell} | ${reasonCell} |`);
    }
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

