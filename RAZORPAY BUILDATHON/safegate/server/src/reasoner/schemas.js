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
    'verdict',
    'confidence',
    'recommended_action',
    'key_signals',
    'reasoning',
    'merchant_message',
  ],
};
