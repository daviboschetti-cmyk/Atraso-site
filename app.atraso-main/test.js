import { LateTracker } from './js/LateTracker.js';
import { PredictiveEngine } from './js/PredictiveEngine.js';

console.log('🧪 Iniciando testes de validação do LateTracker...');

const tracker = new LateTracker(10);
let alerted = false;
let registeredCount = 0;

tracker.addEventListener('entryRegistered', (e) => {
  registeredCount++;
  console.log(`[EVENTO] entryRegistered: ${e.detail.studentName} | Status: ${e.detail.status} | Atraso: ${e.detail.delayMinutes}m`);
});

tracker.addEventListener('toleranceExceeded', (e) => {
  alerted = true;
  console.log(`[ALERTA COORDENAÇÃO] toleranceExceeded: ${e.detail.studentName} excedeu a tolerância com ${e.detail.delayMinutes}m de atraso!`);
});

const classStart = new Date('2026-10-21T08:00:00');
const onTimeEntry = new Date('2026-10-21T07:58:00');
const toleratedEntry = new Date('2026-10-21T08:06:00');
const exceededEntry = new Date('2026-10-21T08:24:00');

tracker.registerEntry('STD-101', 'Ana Clara', classStart, onTimeEntry);
tracker.registerEntry('STD-102', 'Beatriz Lima', classStart, toleratedEntry);
tracker.registerEntry('STD-103', 'Carlos Eduardo', classStart, exceededEntry);

const stats = tracker.getStats();
console.log('\n📊 Estatísticas:', stats);

// Teste do Motor Preditivo
const records = tracker.getRecords();
const analysis = PredictiveEngine.analyze(records);
console.log('\n🧠 Diagnóstico Preditivo:', {
  total: analysis.totalAnalyzed,
  riskLevel: analysis.riskLevel,
  riskScore: analysis.riskScore,
  insights: analysis.insights
});

if (alerted && registeredCount === 3 && stats.toleranceExceeded === 1 && stats.onTime === 1 && stats.lateTolerated === 1) {
  console.log('\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
  process.exit(0);
} else {
  console.error('\n❌ Falha nas asserções de teste.');
  process.exit(1);
}
