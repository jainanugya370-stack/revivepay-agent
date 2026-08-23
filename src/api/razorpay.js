const axios = require('axios');
const logger = require('../utils/logger');

// Retrieve credentials
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Determine if we should default to mock based on keys
const hasCredentials = !!(KEY_ID && KEY_SECRET);

/**
 * Helper to get Axios client configured with Razorpay Basic Auth
 */
function getClient() {
  if (!hasCredentials) {
    throw new Error('Razorpay API keys (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured in your .env file.');
  }
  const token = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  return axios.create({
    baseURL: 'https://api.razorpay.com/v1',
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 5000 // 5 seconds timeout
  });
}

/**
 * Returns mock customers data representing different user profiles
 */
function getMockCustomers() {
  return [
    {
      id: 'cust_001_aravind',
      entity: 'customer',
      name: 'Aravind Sharma',
      email: 'aravind.sharma@example.com',
      contact: '+919876543210',
      created_at: Math.floor(Date.now() / 1000) - (60 * 86400) // created 60 days ago
    },
    {
      id: 'cust_002_deepika',
      entity: 'customer',
      name: 'Deepika Roy',
      email: 'deepika.roy@example.com',
      contact: '+919876543211',
      created_at: Math.floor(Date.now() / 1000) - (5 * 86400) // created 5 days ago
    },
    {
      id: 'cust_003_vikram',
      entity: 'customer',
      name: 'Vikram Malhotra',
      email: 'vikram.malhotra@example.com',
      contact: '+919876543212',
      created_at: Math.floor(Date.now() / 1000) - (120 * 86400) // created 120 days ago
    },
    {
      id: 'cust_004_sarah',
      entity: 'customer',
      name: "Sarah D'Souza",
      email: 'sarah.dsouza@example.com',
      contact: '+919876543213',
      created_at: Math.floor(Date.now() / 1000) - (90 * 86400) // created 90 days ago
    }
  ];
}

/**
 * Returns mock orders corresponding to customers
 */
function getMockOrders() {
  const now = Math.floor(Date.now() / 1000);
  return [
    // Aravind: bought once 45 days ago, completed
    {
      id: 'order_aravind_01',
      entity: 'order',
      customer_id: 'cust_001_aravind',
      amount: 120000, // 1200 INR (in paise)
      amount_paid: 120000,
      amount_due: 0,
      currency: 'INR',
      status: 'paid',
      created_at: now - (45 * 86400)
    },
    // Deepika: abandoned checkout 2 days ago
    {
      id: 'order_deepika_01',
      entity: 'order',
      customer_id: 'cust_002_deepika',
      amount: 150000, // 1500 INR (in paise)
      amount_paid: 0,
      amount_due: 150000,
      currency: 'INR',
      status: 'created',
      created_at: now - (2 * 86400)
    },
    // Vikram: subscription payments (3 successful renewals, then failed)
    {
      id: 'order_vikram_01',
      entity: 'order',
      customer_id: 'cust_003_vikram',
      amount: 200000, // 2000 INR
      amount_paid: 200000,
      status: 'paid',
      created_at: now - (90 * 86400)
    },
    {
      id: 'order_vikram_02',
      entity: 'order',
      customer_id: 'cust_003_vikram',
      amount: 200000,
      amount_paid: 200000,
      status: 'paid',
      created_at: now - (60 * 86400)
    },
    {
      id: 'order_vikram_03',
      entity: 'order',
      customer_id: 'cust_003_vikram',
      amount: 200000,
      amount_paid: 200000,
      status: 'paid',
      created_at: now - (30 * 86400)
    },
    // Sarah: Active subscriber, renewing soon
    {
      id: 'order_sarah_01',
      entity: 'order',
      customer_id: 'cust_004_sarah',
      amount: 300000, // 3000 INR
      amount_paid: 300000,
      status: 'paid',
      created_at: now - (28 * 86400)
    }
  ];
}

/**
 * Returns mock subscriptions
 */
function getMockSubscriptions() {
  const now = Math.floor(Date.now() / 1000);
  return [
    // Vikram's subscription failed
    {
      id: 'sub_vikram_renew',
      entity: 'subscription',
      customer_id: 'cust_003_vikram',
      plan_id: 'plan_premium_2k',
      status: 'halted', // Failed subscription
      current_start: now - (30 * 86400),
      current_end: now,
      charge_at: now,
      short_url: 'https://rzp.io/i/sub_failed_vikram'
    },
    // Sarah's subscription is nearing renewal
    {
      id: 'sub_sarah_renew',
      entity: 'subscription',
      customer_id: 'cust_004_sarah',
      plan_id: 'plan_enterprise_3k',
      status: 'active', // Renewing in 2 days
      current_start: now - (28 * 86400),
      current_end: now + (2 * 86400),
      charge_at: now + (2 * 86400),
      short_url: 'https://rzp.io/i/sub_sarah'
    }
  ];
}

/**
 * Sourced API/Simulation Call wrapper
 */
async function fetchCustomers(useMock = false) {
  if (useMock || !hasCredentials) {
    return getMockCustomers();
  }
  try {
    const client = getClient();
    const response = await client.get('/customers');
    return response.data.items || [];
  } catch (error) {
    logger.error(`Razorpay API Error fetching customers: ${error.message}`);
    throw error;
  }
}

async function fetchOrders(useMock = false) {
  if (useMock || !hasCredentials) {
    return getMockOrders();
  }
  try {
    const client = getClient();
    const response = await client.get('/orders');
    return response.data.items || [];
  } catch (error) {
    logger.error(`Razorpay API Error fetching orders: ${error.message}`);
    throw error;
  }
}

async function fetchSubscriptions(useMock = false) {
  if (useMock || !hasCredentials) {
    return getMockSubscriptions();
  }
  try {
    const client = getClient();
    const response = await client.get('/subscriptions');
    return response.data.items || [];
  } catch (error) {
    logger.error(`Razorpay API Error fetching subscriptions: ${error.message}`);
    throw error;
  }
}

/**
 * Creates a Razorpay Payment Link
 * @param {object} params - link configuration
 * @param {boolean} useMock - whether to run mock/simulation
 * @param {string} [simulateErrorFor] - customer name to simulate failure for
 */
async function createPaymentLink(params, useMock = false, simulateErrorFor = '') {
  // Graceful failure demonstration:
  // If the target customer matches the simulated error target, deliberately throw a simulated timeout error.
  if (simulateErrorFor && params.customer?.name === simulateErrorFor) {
    throw new Error('Gateway Timeout (504): Razorpay transaction processing timed out after 5000ms.');
  }

  if (useMock || !hasCredentials) {
    const randomId = Math.random().toString(36).substring(2, 8);
    return {
      id: `plink_${randomId}`,
      entity: 'payment_link',
      amount: params.amount,
      currency: params.currency || 'INR',
      short_url: `https://rzp.io/i/recovery_${randomId}`,
      status: 'issued'
    };
  }

  try {
    const client = getClient();
    const response = await client.post('/payment_links', params);
    return response.data;
  } catch (error) {
    const apiError = error.response?.data?.error?.description || error.message;
    throw new Error(`Razorpay API Error creating Payment Link: ${apiError}`);
  }
}

module.exports = {
  fetchCustomers,
  fetchOrders,
  fetchSubscriptions,
  createPaymentLink,
  hasCredentials
};
