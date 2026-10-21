/**
 * LateTracker.js
 * Módulo de Regra de Negócio desacoplado da interface
 * Utiliza o EventTarget nativo para arquitetura orientada a eventos (Pub/Sub)
 */

export class LateTracker extends EventTarget {
  #toleranceMinutes;
  #records;

  /**
   * @param {number} toleranceMinutes - Minutos de tolerância antes de disparar alerta crítico
   */
  constructor(toleranceMinutes = 10) {
    super();
    this.#toleranceMinutes = toleranceMinutes;
    this.#records = [];
  }

  get toleranceMinutes() {
    return this.#toleranceMinutes;
  }

  setTolerance(minutes) {
    this.#toleranceMinutes = Math.max(0, Number(minutes) || 0);
    this.#emit('toleranceChanged', { toleranceMinutes: this.#toleranceMinutes });
  }

  /**
   * Registra a entrada do aluno e calcula o status exato
   * @param {string} studentId - Identificador único da matrícula
   * @param {string} studentName - Nome completo do aluno
   * @param {Date|string|number} classStartTime - Horário previsto de início da aula
   * @param {Date|string|number} [entryTime] - Horário de entrada (padrão: agora)
   * @returns {Object} registro da entrada
   */
  registerEntry(studentId, studentName, classStartTime, entryTime = new Date()) {
    const now = new Date(entryTime);
    const startTime = new Date(classStartTime);

    // Diferença em minutos entre a entrada e o início previsto da aula
    const diffMs = now - startTime;
    const delayMinutes = Math.floor(diffMs / (1000 * 60));

    const isLate = delayMinutes > 0;
    const exceededTolerance = delayMinutes > this.#toleranceMinutes;

    const record = {
      id: `REC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      studentId: studentId.trim(),
      studentName: studentName.trim(),
      timestamp: now,
      classStartTime: startTime,
      delayMinutes: Math.max(0, delayMinutes),
      isLate,
      exceededTolerance,
      status: !isLate
        ? 'on_time'
        : (exceededTolerance ? 'tolerance_exceeded' : 'late_tolerated')
    };

    this.#records.push(record);

    // Emite evento genérico de registro (para atualizar listas, contadores e tabelas)
    this.#emit('entryRegistered', record);

    if (record.exceededTolerance) {
      // Dispara alerta crítico específico (coordenação / pais / push)
      this.#emit('toleranceExceeded', record);
    } else if (record.isLate) {
      // Atraso dentro da margem de tolerância
      this.#emit('toleranceWithin', record);
    } else {
      // Chegada pontual
      this.#emit('onTimeRegistered', record);
    }

    return record;
  }

  /**
   * Retorna estatísticas consolidadas da sessão
   */
  getStats() {
    const total = this.#records.length;
    const onTime = this.#records.filter(r => !r.isLate).length;
    const lateTolerated = this.#records.filter(r => r.isLate && !r.exceededTolerance).length;
    const toleranceExceeded = this.#records.filter(r => r.exceededTolerance).length;

    const totalDelayMinutes = this.#records.reduce((acc, r) => acc + r.delayMinutes, 0);
    const averageDelay = total > 0 ? (totalDelayMinutes / total).toFixed(1) : 0;

    return {
      total,
      onTime,
      lateTolerated,
      toleranceExceeded,
      averageDelay
    };
  }

  /**
   * Retorna cópia imutável dos registros atuais
   */
  getRecords() {
    return [...this.#records];
  }

  /**
   * Carrega histórico prévio (ex: do IndexedDB)
   */
  loadRecords(records) {
    if (Array.isArray(records)) {
      this.#records = [...records];
      this.#emit('recordsLoaded', { count: this.#records.length });
    }
  }

  /**
   * Limpa os registros locais
   */
  clear() {
    this.#records = [];
    this.#emit('recordsCleared', {});
  }

  #emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}
