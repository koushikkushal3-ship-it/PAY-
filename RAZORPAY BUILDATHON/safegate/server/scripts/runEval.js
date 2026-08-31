import { runEval } from '../src/eval/runEval.js';

const report = await runEval({
  onProgress: ({ done, total }) => {
    process.stdout.write(`\rScoring holdout case ${done + 1}/${total}...`);
  },
});

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const line = (label, m) =>
  `  ${label.padEnd(22)} acc ${pct(m.accuracy).padStart(6)}   P ${pct(m.precision).padStart(6)}   R ${pct(m.recall).padStart(6)}   F1 ${pct(m.f1).padStart(6)}`;

console.log('\n');
console.log(`Holdout set: ${report.holdout_size} cases (${report.scored} scored, ${report.failed} failed)`);
console.log('Positive class = genuine_risk\n');
console.log(line('Gemini reasoner', report.model));
console.log(line('Naive volume rule', report.naive_volume_rule));
console.log('');
console.log('Legitimate merchants correctly cleared:');
console.log(`  reasoner    ${report.model.legit_merchants_correctly_cleared}  (wrongly kept frozen: ${report.model.legit_merchants_wrongly_kept_frozen})`);
console.log(`  naive rule  ${report.naive_volume_rule.legit_merchants_correctly_cleared}  (wrongly kept frozen: ${report.naive_volume_rule.legit_merchants_wrongly_kept_frozen})`);
console.log('');
console.log('Full report written to server/eval-results.json');
