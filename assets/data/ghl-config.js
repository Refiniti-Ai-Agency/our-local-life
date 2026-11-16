/**
 * GoHighLevel inbound webhook config for Our Local Life forms.
 *
 * Setup in GHL:
 * 1. Automations → Create Workflow → Trigger: Inbound Webhook
 * 2. Copy the webhook URL and paste below
 * 3. Send a test submission from the site, then map fields (email required)
 * 4. Add action: Create/Update Contact
 * 5. Publish the workflow
 */
window.OLL_GHL_CONFIG = {
  // Paste your GHL Inbound Webhook URL here (required for forms to send)
  webhookUrl:
    "https://services.leadconnectorhq.com/hooks/YA0613fZPTXEnW6zi3sD/webhook-trigger/ad023f5c-04ac-4afa-9c0c-496857abcfc8",

  // Optional: static tags/source applied to every submission
  source: "Our Local Life Website",
  location: "ourlocallife.com",
};
