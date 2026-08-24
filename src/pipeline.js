const razorpay = require('./api/razorpay');
const brevo = require('./api/brevo');
const audit = require('./utils/audit');
const logger = require('./utils/logger');
const config = require('./config');
const pc = require('picocolors');
const inquirer = require('inquirer');

/**
 * Executes the RevivePay Revenue Recovery Pipeline
 * @param {boolean} useMock - Whether to run in Simulation Mode
 * @param {boolean} demoFailures - Whether to deliberately trigger simulated failure cases
 * @param {boolean} safetyPrompt - Whether safety checkpoints are enabled
 * @returns {Promise<Array>} List of current batch audit logs
 */
async function runRevivePay(useMock = false, demoFailures = true, safetyPrompt = false) {
  const activeConfig = config.getConfig();
  const currentBatchLogs = [];
  
  // ==========================================
  // STAGE 1: SIGNAL DETECTION
  // ==========================================
  logger.step('1', 'Scanning Razorpay merchant data for revenue opportunities...');
  
  let customers = [];
  let orders = [];
  let subscriptions = [];
  
  try {
    customers = await razorpay.fetchCustomers(useMock);
    orders = await razorpay.fetchOrders(useMock);
    subscriptions = await razorpay.fetchSubscriptions(useMock);
    logger.info(`Sourced ${customers.length} Customers, ${orders.length} Orders, and ${subscriptions.length} Subscriptions.`);
  } catch (error) {
    logger.error('Failed to load initial data from Razorpay API. Halting pipeline.', error.stack);
    throw error;
  }
  
  const opportunities = [];
  const now = Math.floor(Date.now() / 1000);
  
  // Detect Signals:
  // (a) One-Time Buyers (inactive > N days)
  for (const customer of customers) {
    const custOrders = orders.filter(o => o.customer_id === customer.id && o.status === 'paid');
    
    if (custOrders.length === 1) {
      const order = custOrders[0];
      const inactiveDays = Math.floor((now - order.created_at) / 86400);
      
      if (inactiveDays >= activeConfig.MIN_DAYS_SINCE_LAST_PURCHASE) {
        // Double check no active subscription exists
        const activeSub = subscriptions.find(s => s.customer_id === customer.id && s.status === 'active');
        if (!activeSub) {
          opportunities.push({
            customer,
            signalType: 'one-time buyer',
            orderValue: order.amount / 100, // convert paise to INR
            lastOrderDate: new Date(order.created_at * 1000),
            inactiveDays,
            supportingData: {
              orderId: order.id,
              created_at: order.created_at
            }
          });
        }
      }
    }
  }
  
  // (b) Abandoned Checkouts
  for (const order of orders) {
    if (order.status === 'created' && order.amount_paid === 0) {
      const ageHours = Math.floor((now - order.created_at) / 3600);
      // Older than 1 hour, newer than 7 days
      if (ageHours >= 1 && ageHours <= 168) {
        const customer = customers.find(c => c.id === order.customer_id);
        if (customer) {
          opportunities.push({
            customer,
            signalType: 'abandoned checkout',
            orderValue: order.amount / 100,
            lastOrderDate: new Date(order.created_at * 1000),
            inactiveDays: 0,
            supportingData: {
              orderId: order.id,
              created_at: order.created_at
            }
          });
        }
      }
    }
  }
  
  // (c) Subscriptions Nearing Renewal (renewing in <= 3 days)
  for (const sub of subscriptions) {
    if (sub.status === 'active') {
      const daysToRenewal = Math.floor((sub.current_end - now) / 86400);
      if (daysToRenewal >= 0 && daysToRenewal <= 3) {
        const customer = customers.find(c => c.id === sub.customer_id);
        if (customer) {
          // Look up corresponding order value to get price
          const subOrders = orders.filter(o => o.customer_id === customer.id);
          const val = subOrders.length > 0 ? (subOrders[0].amount / 100) : 1000; // fallback if no orders found
          opportunities.push({
            customer,
            signalType: 'subscriptions nearing renewal',
            orderValue: val,
            lastOrderDate: new Date(sub.current_start * 1000),
            inactiveDays: 0,
            supportingData: {
              subscriptionId: sub.id,
              planId: sub.plan_id,
              renewalTime: sub.current_end
            }
          });
        }
      }
    }
    
    // (d) Failed Subscriptions (status is halted or pending)
    if (sub.status === 'halted' || sub.status === 'pending') {
      const customer = customers.find(c => c.id === sub.customer_id);
      if (customer) {
        const subOrders = orders.filter(o => o.customer_id === customer.id);
        const val = subOrders.length > 0 ? (subOrders[0].amount / 100) : 1000;
        opportunities.push({
          customer,
          signalType: 'failed subscription',
          orderValue: val,
          lastOrderDate: new Date(sub.current_start * 1000),
          inactiveDays: 0,
          supportingData: {
            subscriptionId: sub.id,
            planId: sub.plan_id,
            status: sub.status
          }
        });
      }
    }
  }
  
  logger.success(`Stage 1 Complete: Detected ${opportunities.length} recovery opportunities.`);
  logger.divider();
  
  // ==========================================
  // STAGE 2: CUSTOMER CONTEXT ENRICHMENT
  // ==========================================
  logger.step('2', 'Enriching customer context and auditing communication limits...');
  
  const enrichedOpportunities = [];
  
  for (const opp of opportunities) {
    const cust = opp.customer;
    
    // Calculate LTV and Order Count
    const custOrders = orders.filter(o => o.customer_id === cust.id);
    const paidOrders = custOrders.filter(o => o.status === 'paid');
    const totalSpent = paidOrders.reduce((sum, o) => sum + (o.amount / 100), 0);
    const aov = paidOrders.length > 0 ? (totalSpent / paidOrders.length) : 0;
    
    // Check communication frequency cap in audit log
    const contactedRecently = audit.isUnderFrequencyCap(cust.id, activeConfig.MAX_OUTREACH_FREQUENCY_DAYS, useMock);
    
    enrichedOpportunities.push({
      ...opp,
      enrichment: {
        ltv: totalSpent,
        aov: aov,
        orderCount: custOrders.length,
        paidOrderCount: paidOrders.length,
        contactedRecently: contactedRecently
      }
    });
  }
  
  logger.success(`Stage 2 Complete: Enriched context for all ${enrichedOpportunities.length} opportunities.`);
  logger.divider();
  
  // ==========================================
  // STAGE 3: DECISION + BOUNDING LOGIC
  // ==========================================
  logger.step('3', 'Evaluating safety gates, caps, and formulating recovery decisions...');
  
  let runningBatchSpend = 0;
  const decisions = [];
  
  for (const opp of enrichedOpportunities) {
    const cust = opp.customer;
    const signal = opp.signalType;
    const ltv = opp.enrichment.ltv;
    
    let discountPercent = 0;
    let strategy = '';
    
    // 1. Personalization Rule Logic
    if (signal === 'one-time buyer') {
      if (opp.inactiveDays > 60) {
        discountPercent = 15;
      } else {
        discountPercent = 10;
      }
      strategy = 'Win-back Discount';
    } else if (signal === 'abandoned checkout') {
      discountPercent = 10;
      strategy = 'Checkout Recovery Nudge';
    } else if (signal === 'subscriptions nearing renewal') {
      discountPercent = 0; // Renewal alerts do not require extra discount
      strategy = 'Upcoming Renewal Notice';
    } else if (signal === 'failed subscription') {
      discountPercent = 10; // Renewal billing failure update nudge with 10% discount
      strategy = 'Billing Recovery Nudge';
    }
    
    const proposedDiscountValue = opp.orderValue * (discountPercent / 100);
    
    // 2. Evaluate Safety Bounding Gates
    let gated = false;
    let rejectionReason = '';
    const gatesChecked = {
      discountCap: `Approved (Proposed: ${discountPercent}%, Cap: ${activeConfig.MAX_DISCOUNT_PERCENT}%)`,
      frequencyCap: `Approved (Not contacted in last ${activeConfig.MAX_OUTREACH_FREQUENCY_DAYS} days)`,
      spendCap: `Approved (Proposed: INR ${proposedDiscountValue}, Batch Limit: INR ${activeConfig.MAX_BATCH_SPEND_LIMIT})`
    };
    
    // Gate 1: Discount Percent Cap
    if (discountPercent > activeConfig.MAX_DISCOUNT_PERCENT) {
      gated = true;
      rejectionReason = `Proposed discount (${discountPercent}%) violates maximum discount percentage cap (${activeConfig.MAX_DISCOUNT_PERCENT}%).`;
      gatesChecked.discountCap = `REJECTED (Proposed: ${discountPercent}%, Cap: ${activeConfig.MAX_DISCOUNT_PERCENT}%)`;
    }
    
    // Gate 2: Contact Frequency Cap
    if (opp.enrichment.contactedRecently) {
      gated = true;
      rejectionReason = `Customer was already contacted within the last ${activeConfig.MAX_OUTREACH_FREQUENCY_DAYS} days cool-down period.`;
      gatesChecked.frequencyCap = `REJECTED (Contacted recently)`;
    }
    
    // Gate 3: Batch Spend Limit Cap
    if (!gated && (runningBatchSpend + proposedDiscountValue > activeConfig.MAX_BATCH_SPEND_LIMIT)) {
      gated = true;
      rejectionReason = `Discount value (INR ${proposedDiscountValue.toFixed(2)}) would push batch spend (INR ${(runningBatchSpend + proposedDiscountValue).toFixed(2)}) over the maximum cap (INR ${activeConfig.MAX_BATCH_SPEND_LIMIT}).`;
      gatesChecked.spendCap = `REJECTED (Exceeds cumulative spend limit)`;
    }
    
    // 3. Assemble Decision Record
    let explanation = '';
    if (gated) {
      explanation = `GATED: ${rejectionReason}`;
      logger.gated(`Customer ${cust.name} (${cust.id}) gated. Reason: ${rejectionReason}`);
    } else {
      runningBatchSpend += proposedDiscountValue;
      explanation = `APPROVED: Offered ${strategy} (${discountPercent}% discount) to ${cust.name}. Total LTV: INR ${ltv.toFixed(2)}. Inactive days: ${opp.inactiveDays || 0}. Current Batch Spend: INR ${runningBatchSpend.toFixed(2)}/${activeConfig.MAX_BATCH_SPEND_LIMIT} INR.`;
      logger.success(`Customer ${cust.name} (${cust.id}) APPROVED. Reason: ${strategy} approved.`);
    }
    
    decisions.push({
      customerId: cust.id,
      customerName: cust.name,
      email: cust.email,
      signalType: signal,
      decisionStatus: gated ? 'GATED' : 'APPROVED',
      decisionReasoning: explanation,
      gatingChecks: gatesChecked,
      proposedDiscountValue,
      discountPercent,
      orderValue: opp.orderValue,
      supportingData: opp.supportingData,
      customerObject: cust // hold for execution
    });
  }
  
  logger.success(`Stage 3 Complete: Gating evaluated for all decisions. Approved: ${decisions.filter(d => d.decisionStatus === 'APPROVED').length}, Gated: ${decisions.filter(d => d.decisionStatus === 'GATED').length}.`);
  logger.divider();
  
  // ==========================================
  // STAGE 4: EXECUTION / DELIVERY
  // ==========================================
  const approvedCount = decisions.filter(d => d.decisionStatus === 'APPROVED').length;
  if (approvedCount > 0 && safetyPrompt) {
    logger.header('SAFETY CHECKPOINT');
    console.log(pc.yellow(pc.bold('Ready to execute the following approved recovery actions:')));
    decisions.filter(d => d.decisionStatus === 'APPROVED').forEach(d => {
      console.log(pc.white(` - ${pc.bold(d.customerName)} (${d.email}): ${pc.cyan(d.signalType)} -> discount: ${d.discountPercent}%`));
    });
    console.log('');
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmRun',
        message: 'Do you want to proceed with executing these recovery actions?',
        default: false
      }
    ]);
    if (!answers.confirmRun) {
      logger.warn('Execution halted by user. Gating all approved actions.');
      for (const d of decisions) {
        if (d.decisionStatus === 'APPROVED') {
          d.decisionStatus = 'GATED';
          d.decisionReasoning = 'GATED: Halted by user safety confirmation checkpoint.';
        }
      }
    }
  }

  logger.step('4', 'Executing recovery strategies, generating payment links, and delivering emails...');
  
  // Keep track of final outcomes in this batch to record in the audit trail
  const batchLogRecords = [];
  
  for (const decision of decisions) {
    const auditRecord = {
      customerId: decision.customerId,
      customerName: decision.customerName,
      email: decision.email,
      signalType: decision.signalType,
      decisionStatus: decision.decisionStatus,
      decisionReasoning: decision.decisionReasoning,
      gatingChecks: decision.gatingChecks,
      actionDetails: 'None (Gated)',
      outcome: 'GATED'
    };
    
    if (decision.decisionStatus === 'APPROVED') {
      try {
        let paymentLink = '#';
        let actionDetailsText = '';
        
        // 1. Generate Payment Links for Abandoned Checkouts and Subscriptions
        if (decision.signalType === 'abandoned checkout' || decision.signalType === 'failed subscription') {
          // Construct billing parameters
          const amountInPaise = Math.round(decision.orderValue * (1 - decision.discountPercent / 100) * 100);
          
          // Deliberately trigger simulated Gateway Timeout for "Sarah D'Souza" in mock run to satisfy failure requirement
          const simulateTimeoutName = (demoFailures && useMock) ? "Sarah D'Souza" : "";
          
          logger.info(`Generating Razorpay Payment Link for ${decision.customerName} (value: INR ${amountInPaise / 100})...`);
          
          const plLink = await razorpay.createPaymentLink({
            amount: amountInPaise,
            currency: 'INR',
            accept_partial: false,
            description: `Payment Recovery Link for ${decision.signalType}`,
            customer: {
              name: decision.customerName,
              email: decision.email,
              contact: decision.customerObject.contact
            }
          }, useMock, simulateTimeoutName);
          
          paymentLink = plLink.short_url;
          actionDetailsText = `Razorpay Payment Link generated (${paymentLink}). `;
        } else if (decision.signalType === 'subscriptions nearing renewal') {
          // Subscriptions might provide pre-existing self-service link
          paymentLink = decision.supportingData.subscriptionId ? `https://rzp.io/i/${decision.supportingData.subscriptionId}` : '#';
          actionDetailsText = `Subscription renewal notice prepared. `;
        } else {
          actionDetailsText = `Win-back discount coupon code generated. `;
        }
        
        // 2. Deliver outreach campaign via Brevo email sender
        if (decision.customerName === "Sarah D'Souza" && demoFailures && useMock) {
          throw new Error("SMTP Protocol Error (554): Connection reset by peer while sending to sarah.dsouza@example.com.");
        }

        const deliveryResult = await brevo.sendRecoveryEmail(
          decision.customerObject,
          decision.signalType,
          {
            discountPercent: decision.discountPercent,
            paymentLink: paymentLink,
            planName: decision.supportingData.planId || 'Premium Monthly Sub',
            amount: decision.orderValue
          }
        );
        
        if (deliveryResult) {
          logger.success(`Successfully processed recovery for customer ${decision.customerName}.`);
          auditRecord.actionDetails = actionDetailsText + `Outreach email delivered successfully.`;
          auditRecord.outcome = 'SUCCESS';
        } else {
          logger.error(`Failed to send email recovery for customer ${decision.customerName}.`);
          auditRecord.actionDetails = actionDetailsText + `Email delivery failed via API.`;
          auditRecord.outcome = 'FAILED';
        }
        
      } catch (error) {
        // GRACEFUL FAILURE HANDLING
        // Catch any execution error (e.g. Gateway Timeout, invalid data) without crashing the CLI.
        logger.error(`Handled execution error for customer ${decision.customerName}: ${error.message}`);
        auditRecord.actionDetails = `Execution aborted: ${error.message}`;
        auditRecord.outcome = 'FAILED';
      }
    }
    
    // Save to the persistent logs
    const finalRecord = {
      timestamp: new Date().toISOString(),
      ...auditRecord
    };
    audit.logAuditRecord(finalRecord);
    batchLogRecords.push(finalRecord);
  }
  
  logger.success('Stage 4 Complete: Pipeline execution batch cycle completed.');
  logger.divider();
  
  return batchLogRecords;
}

module.exports = { runRevivePay };
