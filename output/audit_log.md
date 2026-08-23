# RevivePay — Merchant Revenue Recovery Audit Trail

This document records every money-touching decision and automated action taken by the RevivePay agent.

| Timestamp | Customer | Signal | Status | Reason | Outcome | Detail |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-08-23T07:50:49.434Z | Sarah D'Souza (cust_004_sarah) | subscriptions nearing renewal | ⚠️ **GATED** | GATED: Halted by user safety confirmation checkpoint. | ⬜ GATED | None (Gated) |
| 2026-08-23T07:50:49.428Z | Vikram Malhotra (cust_003_vikram) | failed subscription | ⚠️ **GATED** | GATED: Halted by user safety confirmation checkpoint. | ⬜ GATED | None (Gated) |
| 2026-08-23T07:50:49.419Z | Deepika Roy (cust_002_deepika) | abandoned checkout | ⚠️ **GATED** | GATED: Customer was already contacted within the last 7 days cool-down period. | ⬜ GATED | None (Gated) |
| 2026-08-23T07:50:49.407Z | Aravind Sharma (cust_001_aravind) | one-time buyer | ⚠️ **GATED** | GATED: Customer was already contacted within the last 7 days cool-down period. | ⬜ GATED | None (Gated) |
| 2026-08-23T07:49:01.274Z | Sarah D'Souza (cust_004_sarah) | subscriptions nearing renewal | ✅ **APPROVED** | APPROVED: Offered Upcoming Renewal Notice (0% discount) to Sarah D'Souza. Total LTV: INR 3000.00. Inactive days: 0. Current Batch Spend: INR 270.00/300 INR. | 🟥 FAILED | Execution aborted: SMTP Protocol Error (554): Connection reset by peer while sending to sarah.dsouza@example.com. |
| 2026-08-23T07:49:01.268Z | Vikram Malhotra (cust_003_vikram) | failed subscription | ⚠️ **GATED** | GATED: Discount value (INR 200.00) would push batch spend (INR 470.00) over the maximum cap (INR 300). | ⬜ GATED | None (Gated) |
| 2026-08-23T07:49:01.262Z | Deepika Roy (cust_002_deepika) | abandoned checkout | ✅ **APPROVED** | APPROVED: Offered Checkout Recovery Nudge (10% discount) to Deepika Roy. Total LTV: INR 0.00. Inactive days: 0. Current Batch Spend: INR 270.00/300 INR. | 🟩 SUCCESS | Razorpay Payment Link generated (https://rzp.io/i/recovery_zhqqxg). Outreach email delivered successfully. |
| 2026-08-23T07:49:00.963Z | Aravind Sharma (cust_001_aravind) | one-time buyer | ✅ **APPROVED** | APPROVED: Offered Win-back Discount (10% discount) to Aravind Sharma. Total LTV: INR 1200.00. Inactive days: 45. Current Batch Spend: INR 120.00/300 INR. | 🟩 SUCCESS | Win-back discount coupon code generated. Outreach email delivered successfully. |
