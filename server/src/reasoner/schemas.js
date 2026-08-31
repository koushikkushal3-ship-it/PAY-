// Gemini responseSchema definitions (OpenAPI subset). Keeping these separate
// from the prompts makes it obvious what shape each module is contracted to
// return, and lets the eval harness rely on the fields existing.

export const riskVerdictSchema = {
  type: 'OBJECT',
  properties: {
    verdict: {
      type: 'STRING',
      enum: ['genuine_risk', 'false_positive'],
      description: 'Whether the flag reflects real risk or is a false positive.',
    },
    confidence: {
      type: 'NUMBER',
      description: 'Confidence in the verdict, 0.0 to 1.0.',
    },
    recommended_action: {
      type: 'STRING',
      enum: ['release', 'hold', 'request_documents', 'escalate'],
      description:
        'release = lift the freeze/reserve now. request_documents = likely fine, one gap to close. hold = keep restricted. escalate = needs a senior human decision.',
    },
    key_signals: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        'The 2-4 specific signals that drove the verdict, each citing the actual number from the case.',
    },
    reasoning: {
      type: 'STRING',
      description:
        'Two to four sentences an ops analyst could paste into a merchant-facing response.',
    },
    merchant_message: {
      type: 'STRING',
      description:
        'One short plain-English sentence explaining the outcome to the merchant, no jargon.',
    },
  },
  required: [
    'verdict', 'confidence', 'recommended_action', 'key_signals', 'reasoning', 'merchant_message',
  ],
};

export const recoveryVerdictSchema = {
  type: 'OBJECT',
  properties: {
    verdict: {
      type: 'STRING',
      enum: ['recoverable', 'not_recoverable'],
      description: 'Whether this leaked payment is worth attempting to recover.',
    },
    confidence: { type: 'NUMBER', description: 'Confidence, 0.0 to 1.0.' },
    likely_cause: {
      type: 'STRING',
      description: 'The most probable reason the payment failed or the invoice went unpaid.',
    },
    recommended_action: {
      type: 'STRING',
      enum: ['retry_payment', 'step_up_verification', 'alternate_method', 'contact_buyer', 'write_off'],
      description: 'The single next action to take. write_off = stop spending effort on this one.',
    },
    stop_after_attempts: {
      type: 'INTEGER',
      description:
        'Hard cap on total attempts for this case before giving up, so a customer is never chased indefinitely.',
    },
    expected_recovery_inr: {
      type: 'NUMBER',
      description: 'Realistic recoverable amount, which may be less than the full value.',
    },
    reasoning: { type: 'STRING', description: 'Two to three sentences citing the case numbers.' },
  },
  required: [
    'verdict', 'confidence', 'likely_cause', 'recommended_action',
    'stop_after_attempts', 'expected_recovery_inr', 'reasoning',
  ],
};

export const pricingVerdictSchema = {
  type: 'OBJECT',
  properties: {
    verdict: {
      type: 'STRING',
      enum: ['unfair_pricing', 'justified_variation'],
      description:
        'unfair_pricing = the spread looks like price discrimination. justified_variation = a documented rule explains it.',
    },
    confidence: { type: 'NUMBER', description: 'Confidence, 0.0 to 1.0.' },
    recommended_action: {
      type: 'STRING',
      enum: ['block_agent_pricing', 'require_disclosed_rule', 'monitor', 'no_action'],
      description: 'What the compliance team should do about this SKU.',
    },
    affected_buyers: {
      type: 'INTEGER',
      description: 'How many distinct buyer sessions were quoted an unexplained price.',
    },
    key_signals: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '2-4 observations citing the actual spread numbers.',
    },
    reasoning: { type: 'STRING', description: 'Two to three sentences.' },
  },
  required: [
    'verdict', 'confidence', 'recommended_action', 'affected_buyers', 'key_signals', 'reasoning',
  ],
};

export const financeVerdictSchema = {
  type: 'OBJECT',
  properties: {
    verdict: {
      type: 'STRING',
      enum: ['exception_confirmed', 'no_exception'],
      description: 'Whether this really is a finance exception needing action.',
    },
    confidence: { type: 'NUMBER', description: 'Confidence, 0.0 to 1.0.' },
    exception_type: {
      type: 'STRING',
      enum: ['gst_rate_mismatch', 'reserve_exposure', 'settlement_mismatch', 'none'],
      description: 'Which kind of exception this is.',
    },
    recommended_action: {
      type: 'STRING',
      enum: ['correct_filing', 'notify_merchant', 'schedule_release', 'escalate_to_finance', 'no_action'],
      description: 'The single next step.',
    },
    financial_impact_inr: {
      type: 'NUMBER',
      description: 'Money at stake: tax under/over-charged, or settlement value held.',
    },
    reasoning: { type: 'STRING', description: 'Two to three sentences citing the case numbers.' },
    // Deliberately allowed: an unresolved case must be flagged as unresolved
    // rather than guessed at, so a human picks it up.
    needs_human_review: {
      type: 'BOOLEAN',
      description: 'True when the data is insufficient to decide confidently.',
    },
  },
  required: [
    'verdict', 'confidence', 'exception_type', 'recommended_action',
    'financial_impact_inr', 'reasoning', 'needs_human_review',
  ],
};
