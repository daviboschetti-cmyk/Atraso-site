/**
 * PredictiveEngine.js
 * Algoritmo Client-Side de Inteligência Preditiva e Análise de Recorrência
 * Identifica padrões de atraso por aluno e por turma sem sobrecarregar o servidor
 */

export class PredictiveEngine {
  /**
   * Analisa o histórico de um estudante específico ou do grupo geral
   * @param {Array} records - Lista de registros
   * @param {string} [targetStudentId] - Opcional para filtrar um aluno
   */
  static analyze(records, targetStudentId = null) {
    const list = targetStudentId
      ? records.filter(r => r.studentId === targetStudentId)
      : records;

    if (!list || list.length === 0) {
      return {
        totalAnalyzed: 0,
        riskScore: 0,
        riskLevel: 'Baixo',
        delayRate: 0,
        weekdayPatterns: {},
        topDay: null,
        insights: ['Aguardando mais registros para análise preditiva.']
      };
    }

    const total = list.length;
    const lateRecords = list.filter(r => r.isLate);
    const lateCount = lateRecords.length;
    const delayRate = Math.round((lateCount / total) * 100);

    // Contagem por dia da semana (0: Domingo, 1: Segunda, ... 6: Sábado)
    const weekdaysNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const weekdayCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    lateRecords.forEach(r => {
      const day = new Date(r.timestamp).getDay();
      if (weekdayCounts[day] !== undefined) {
        weekdayCounts[day]++;
      }
    });

    let topDayIndex = null;
    let topDayCount = 0;
    for (const [day, count] of Object.entries(weekdayCounts)) {
      if (count > topDayCount) {
        topDayCount = count;
        topDayIndex = Number(day);
      }
    }

    // Cálculo do Índice de Risco (0 - 100)
    // Fatores: taxa de atraso (40%), atrasos graves acima da tolerância (40%), recorrência recente (20%)
    const exceededCount = list.filter(r => r.exceededTolerance).length;
    const severeRate = Math.round((exceededCount / total) * 100);

    let riskScore = Math.min(100, Math.round((delayRate * 0.45) + (severeRate * 0.45) + (lateCount >= 3 ? 10 : 0)));

    let riskLevel = 'Baixo';
    if (riskScore >= 70) riskLevel = 'Crítico';
    else if (riskScore >= 40) riskLevel = 'Moderado';

    const insights = [];

    if (topDayIndex !== null && topDayCount > 1) {
      const dayName = weekdaysNames[topDayIndex];
      const pct = Math.round((topDayCount / lateCount) * 100);
      insights.push(`Concentração de atrasos: ${pct}% das ocorrências acontecem na ${dayName}.`);
    }

    if (severeRate > 30) {
      insights.push(`Alerta pedagógico: Mais de 30% dos atrasos excedem o tempo de tolerância.`);
    }

    if (riskLevel === 'Crítico') {
      insights.push(`Recomendação: Acionar coordenação para entrevista preventiva com responsáveis.`);
    } else if (riskLevel === 'Moderado') {
      insights.push(`Recomendação: Notificação de conscientização no aplicativo do responsável.`);
    } else {
      insights.push(`Frequência regular. Padrão de pontualidade satisfatório.`);
    }

    return {
      totalAnalyzed: total,
      lateCount,
      delayRate,
      riskScore,
      riskLevel,
      topDay: topDayIndex !== null ? weekdaysNames[topDayIndex] : 'Sem padrão',
      topDayCount,
      weekdayCounts,
      insights
    };
  }
}
