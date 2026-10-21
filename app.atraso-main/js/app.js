/**
 * app.js
 * Controlador Principal e Integração Orientada a Eventos (Pub/Sub)
 */

import { LateTracker } from './LateTracker.js';
import { StorageManager } from './StorageManager.js';
import { NotificationManager } from './NotificationManager.js';
import { PredictiveEngine } from './PredictiveEngine.js';
import { QrManager } from './QrManager.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicialização dos Módulos
  const tracker = new LateTracker(10);
  const storage = new StorageManager();
  const notifier = new NotificationManager();

  // Estado Local
  let currentFilter = 'all';
  let simulatedMinutesAdded = 0;

  // Horário previsto da aula: Hoje às 08:00
  const classStartTime = new Date();
  classStartTime.setHours(8, 0, 0, 0);

  /**
   * Processador de QR Codes escaneados pela câmera ou decodificados de imagens
   */
  function handleStudentScan(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'string') return;
    const cleanPayload = rawPayload.trim();

    // Feedback visual imediato na mira do scanner
    const overlay = document.getElementById('scanner-overlay');
    if (overlay) {
      overlay.classList.add('scanned-success');
      setTimeout(() => overlay.classList.remove('scanned-success'), 1200);
    }

    let studentId = '';
    let studentName = '';

    // Caso 1: Token dinâmico emitido pelo projetor da sala (ATTENDANCE::SALA-12::timestamp::nonce)
    if (cleanPayload.startsWith('ATTENDANCE::')) {
      const parts = cleanPayload.split('::');
      const tokenTimestamp = Number(parts[2]);
      const ageSeconds = Math.floor((Date.now() - tokenTimestamp) / 1000);

      // Validação temporal antifraude (token válido por até 30 segundos)
      if (isNaN(tokenTimestamp) || ageSeconds > 30) {
        notifier.playFeedbackTone('alert');
        notifier.showToast({
          title: 'QR Code Expirado',
          message: 'O código dinâmico apresentado já expirou. Aponte para o código atual da tela.',
          type: 'danger'
        });
        return;
      }

      // Se havia aluno digitado no formulário, usa-o; caso contrário, atribui check-in dinâmico
      const formId = document.getElementById('student-id-input').value.trim();
      const formName = document.getElementById('student-name-input').value.trim();

      studentId = formId || `STD-${Math.floor(100 + Math.random() * 900)}`;
      studentName = formName || 'Aluno via QR Dinâmico';
    }
    // Caso 2: Objeto JSON estruturado {"id": "STD-101", "name": "Ana Clara"}
    else if (cleanPayload.startsWith('{') && cleanPayload.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanPayload);
        studentId = parsed.studentId || parsed.id || `STD-${Date.now().toString().slice(-4)}`;
        studentName = parsed.studentName || parsed.name || 'Aluno Identificado';
      } catch (e) {
        studentId = `STD-${Date.now().toString().slice(-4)}`;
        studentName = cleanPayload;
      }
    }
    // Caso 3: Formato Delimitado (Ex: STD-105 - Marcos Vinicius)
    else if (cleanPayload.includes(' - ') || cleanPayload.includes(':')) {
      const sep = cleanPayload.includes(' - ') ? ' - ' : ':';
      const [id, ...rest] = cleanPayload.split(sep);
      studentId = id.trim();
      studentName = rest.join(sep).trim() || 'Aluno';
    }
    // Caso 4: Texto direto
    else {
      studentId = cleanPayload.length <= 10 ? cleanPayload : `STD-${cleanPayload.slice(0, 6)}`;
      studentName = cleanPayload.length > 10 ? cleanPayload : `Aluno ${cleanPayload}`;
    }

    // Calcula horário de entrada com o slider de simulação se ativo
    const entryTime = new Date(classStartTime.getTime() + (simulatedMinutesAdded * 60 * 1000));

    // Registra entrada através do motor EventTarget
    tracker.registerEntry(studentId, studentName, classStartTime, entryTime);

    notifier.showToast({
      title: 'Crachá Lido com Sucesso',
      message: `${studentName} (${studentId}) registrado na chamada!`,
      type: 'success'
    });
  }

  // Instância do Gerenciador de QR Code e Hardware
  const qrManager = new QrManager({
    videoId: 'camera-video-preview',
    qrCanvasId: 'qr-code-canvas',
    onScan: (scannedData) => handleStudentScan(scannedData)
  });

  // Inicializa IndexedDB e carrega histórico prévio
  try {
    await storage.init();
    const storedEntries = await storage.getAllEntries();
    if (storedEntries.length > 0) {
      tracker.loadRecords(storedEntries);
    }
  } catch (err) {
    console.warn('Erro ao inicializar IndexedDB:', err);
  }

  // Registro do Service Worker para suporte Offline-First
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('Registro de Service Worker falhou:', err);
      });
    });
  }

  // =========================================================================
  // 2. Arquitetura Orientada a Eventos: Assinatura dos Eventos do LateTracker
  // =========================================================================

  // Evento 1: Qualquer entrada registrada (atualiza interface, métricas e IndexedDB)
  tracker.addEventListener('entryRegistered', async (event) => {
    const record = event.detail;

    // Persistência Offline-First via IndexedDB
    try {
      await storage.saveEntry(record, navigator.onLine);
    } catch (e) {
      console.warn('Erro ao persistir no IndexedDB:', e);
    }

    // Atualiza Feed e Métricas
    renderFeed();
    updateMetrics();
    runPredictiveAnalysis();
  });

  // Evento 2: Alerta de Estouro de Tolerância (Ação Crítica de Coordenação)
  tracker.addEventListener('toleranceExceeded', (event) => {
    const { studentName, delayMinutes } = event.detail;

    // Som de alerta e Toast visual
    notifier.playFeedbackTone('alert');
    notifier.showToast({
      title: 'Alerta da Coordenação',
      message: `O aluno ${studentName} atrasou ${delayMinutes} min e ultrapassou a tolerância permitida!`,
      type: 'danger',
      duration: 5000
    });

    // Notificação desktop nativa
    notifier.showDesktopNotification(
      '🚨 Tolerância de Atraso Excedida',
      `${studentName} atrasou ${delayMinutes} min. Notificação enviada para coordenação pedagógica.`
    );
  });

  // Evento 3: Atraso tolerado
  tracker.addEventListener('toleranceWithin', (event) => {
    const { studentName, delayMinutes } = event.detail;
    notifier.playFeedbackTone('warning');
    notifier.showToast({
      title: 'Atraso Tolerado',
      message: `${studentName} chegou com ${delayMinutes} min de atraso (dentro do limite).`,
      type: 'warning',
      duration: 3500
    });
  });

  // Evento 4: Chegada no horário
  tracker.addEventListener('onTimeRegistered', (event) => {
    const { studentName } = event.detail;
    notifier.playFeedbackTone('success');
    notifier.showToast({
      title: 'Presença Pontual',
      message: `${studentName} registrou entrada no horário previsto.`,
      type: 'success',
      duration: 2500
    });
  });

  // Evento 5: Limpeza ou carregamento de registros
  tracker.addEventListener('recordsLoaded', () => {
    renderFeed();
    updateMetrics();
    runPredictiveAnalysis();
  });

  tracker.addEventListener('recordsCleared', () => {
    renderFeed();
    updateMetrics();
    runPredictiveAnalysis();
  });

  // =========================================================================
  // 3. Atualizações e Renderizações de UI
  // =========================================================================

  function updateMetrics() {
    const stats = tracker.getStats();
    document.getElementById('metric-total-count').textContent = stats.total;
    document.getElementById('metric-ontime-count').textContent = stats.onTime;
    document.getElementById('metric-tolerated-count').textContent = stats.lateTolerated;
    document.getElementById('metric-exceeded-count').textContent = stats.toleranceExceeded;

    document.getElementById('filter-count-all').textContent = stats.total;
    document.getElementById('filter-count-ontime').textContent = stats.onTime;
    document.getElementById('filter-count-tolerated').textContent = stats.lateTolerated;
    document.getElementById('filter-count-exceeded').textContent = stats.toleranceExceeded;
  }

  function renderFeed() {
    const container = document.getElementById('entries-feed-container');
    const records = tracker.getRecords();

    const filtered = records.filter(r => {
      if (currentFilter === 'all') return true;
      return r.status === currentFilter;
    }).reverse(); // Mais recentes primeiro

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p>Nenhum registro para este filtro.</p>
        </div>
      `;
      return;
    }

    const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    container.innerHTML = filtered.map(r => {
      const initials = r.studentName
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      let badgeHtml = '';
      if (!r.isLate) {
        badgeHtml = `<span class="entry-status-badge badge-ontime">No Horário</span>`;
      } else if (r.exceededTolerance) {
        badgeHtml = `<span class="entry-status-badge badge-exceeded">+${r.delayMinutes} min (Excedido)</span>`;
      } else {
        badgeHtml = `<span class="entry-status-badge badge-tolerated">+${r.delayMinutes} min (Tolerado)</span>`;
      }

      return `
        <div class="entry-card">
          <div class="entry-main">
            <div class="entry-avatar">${initials}</div>
            <div class="entry-details">
              <h4>${escapeHtml(r.studentName)}</h4>
              <div class="entry-meta">
                <span>ID: ${escapeHtml(r.studentId)}</span>
                <span>•</span>
                <span>Entrada: ${timeFormatter.format(new Date(r.timestamp))}</span>
              </div>
            </div>
          </div>
          <div>${badgeHtml}</div>
        </div>
      `;
    }).join('');
  }

  function runPredictiveAnalysis() {
    const records = tracker.getRecords();
    const result = PredictiveEngine.analyze(records);

    document.getElementById('predictive-total-label').textContent = `${result.totalAnalyzed} registros`;

    const badge = document.getElementById('predictive-risk-badge');
    badge.textContent = `${result.riskLevel} (${result.riskScore}%)`;
    badge.className = `risk-badge risk-${result.riskLevel.toLowerCase()}`;

    const list = document.getElementById('predictive-insights-list');
    list.innerHTML = result.insights.map(i => `<li>${escapeHtml(i)}</li>`).join('');
  }

  // =========================================================================
  // 4. Relógio Institucional & Manipulação de Datas Nativas
  // =========================================================================

  const clockFormatter = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });

  const clockEl = document.getElementById('live-clock-time');
  function tickClock() {
    const now = new Date();
    clockEl.textContent = clockFormatter.format(now);
  }
  tickClock();
  setInterval(tickClock, 1000);

  // Status de Rede Online / Offline
  const netBadge = document.getElementById('network-badge');
  const netText = document.getElementById('network-status-text');

  function updateNetworkStatus() {
    if (navigator.onLine) {
      netBadge.classList.remove('is-offline');
      netText.textContent = 'Online (Sincronizado)';
    } else {
      netBadge.classList.add('is-offline');
      netText.textContent = 'Offline (Modo Local)';
    }
  }
  window.addEventListener('online', () => {
    updateNetworkStatus();
    notifier.showToast({ title: 'Rede Reconectada', message: 'Sincronizando registros offline...', type: 'info' });
  });
  window.addEventListener('offline', () => {
    updateNetworkStatus();
    notifier.showToast({ title: 'Conexão Perdida', message: 'Registros serão mantidos no IndexedDB.', type: 'warning' });
  });
  updateNetworkStatus();

  // =========================================================================
  // 5. Interações do Formulário & Simulação de Atraso
  // =========================================================================

  const form = document.getElementById('entry-form');
  const studentIdInput = document.getElementById('student-id-input');
  const studentNameInput = document.getElementById('student-name-input');
  const delaySlider = document.getElementById('simulated-delay-slider');
  const delayLabel = document.getElementById('simulated-delay-label');
  const resetTimeBtn = document.getElementById('btn-reset-time');

  delaySlider.addEventListener('input', (e) => {
    simulatedMinutesAdded = Number(e.target.value);
    if (simulatedMinutesAdded === 0) {
      delayLabel.textContent = 'No Horário (+0 min)';
      delayLabel.style.color = '#34d399';
    } else {
      delayLabel.textContent = `Atraso Simulado: +${simulatedMinutesAdded} min`;
      delayLabel.style.color = simulatedMinutesAdded > tracker.toleranceMinutes ? '#f87171' : '#fbbf24';
    }
  });

  resetTimeBtn.addEventListener('click', () => {
    delaySlider.value = 0;
    simulatedMinutesAdded = 0;
    delayLabel.textContent = 'No Horário (+0 min)';
    delayLabel.style.color = '#34d399';
  });

  // Atalhos de alunos demo
  document.querySelectorAll('.demo-student-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      studentIdInput.value = btn.dataset.id;
      studentNameInput.value = btn.dataset.name;
      studentIdInput.focus();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = studentIdInput.value.trim();
    const name = studentNameInput.value.trim();

    if (!id || !name) return;

    // Calcula horário com o acréscimo do simulador
    const entryTime = new Date(classStartTime.getTime() + (simulatedMinutesAdded * 60 * 1000));

    // Chama o motor de negócios desacoplado
    tracker.registerEntry(id, name, classStartTime, entryTime);

    // Reseta inputs
    studentIdInput.value = '';
    studentNameInput.value = '';
    studentIdInput.focus();
  });

  // Alteração dinâmica de tolerância
  const toleranceInput = document.getElementById('tolerance-input');
  toleranceInput.addEventListener('change', (e) => {
    const val = Number(e.target.value);
    tracker.setTolerance(val);
    notifier.showToast({
      title: 'Tolerância Atualizada',
      message: `Novo limite de tolerância: ${val} minutos.`,
      type: 'info'
    });
    renderFeed();
    updateMetrics();
  });

  // =========================================================================
  // 6. Abas Operacionais, Hardware (Câmera) e QR Code Dinâmico
  // =========================================================================

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tab-projector') {
        // Inicia emissão de QR Dinâmico com rotação a cada 10s
        qrManager.startDynamicQr('SALA-12', (countdown, token) => {
          const bar = document.getElementById('qr-countdown-bar');
          const tokenLabel = document.getElementById('qr-token-display');
          if (bar) bar.style.width = `${(countdown / 10) * 100}%`;
          if (tokenLabel) tokenLabel.textContent = `TOKEN DINÂMICO: ${token.slice(0, 28)}...`;
        });
      } else {
        qrManager.stopDynamicQr();
      }

      if (targetId !== 'tab-camera') {
        qrManager.stopCameraScanner();
      }
    });
  });

  // =========================================================================
  // Controles de Câmera, Hardware & Leitor de QR Code
  // =========================================================================

  const startCameraBtn = document.getElementById('btn-start-camera');
  const stopCameraBtn = document.getElementById('btn-stop-camera');
  const uploadQrBtn = document.getElementById('btn-upload-qr');
  const qrFileInput = document.getElementById('qr-file-input');
  const simulateScanBtn = document.getElementById('btn-simulate-scan');
  const cameraPlaceholder = document.getElementById('camera-placeholder');
  const cameraSelect = document.getElementById('camera-select');
  const cameraStatusPill = document.getElementById('camera-status-pill');
  const cameraStatusText = document.getElementById('camera-status-text');

  // Atualiza lista de câmeras conectadas no dispositivo
  async function refreshCameraList() {
    try {
      const cameras = await qrManager.getAvailableCameras();
      if (cameras.length > 0) {
        cameraSelect.innerHTML = cameras.map((c, idx) => 
          `<option value="${c.deviceId}">${c.label || 'Câmera ' + (idx + 1)}</option>`
        ).join('');
      } else {
        cameraSelect.innerHTML = '<option value="">Câmera padrão integrada</option>';
      }
    } catch (e) {
      cameraSelect.innerHTML = '<option value="">Câmera padrão</option>';
    }
  }

  // Troca dinâmica de câmera quando o usuário seleciona outra no dropdown
  cameraSelect.addEventListener('change', async () => {
    const deviceId = cameraSelect.value;
    if (cameraStatusPill.classList.contains('is-active')) {
      try {
        await qrManager.startCameraScanner(deviceId);
      } catch (err) {
        console.warn('Erro ao trocar dispositivo de vídeo:', err);
      }
    }
  });

  // Ativa a Câmera
  startCameraBtn.addEventListener('click', async () => {
    try {
      cameraStatusText.textContent = 'Iniciando câmera...';
      const selectedDeviceId = cameraSelect.value || null;

      await qrManager.startCameraScanner(selectedDeviceId);
      await refreshCameraList();

      cameraPlaceholder.classList.add('hidden');
      cameraStatusPill.classList.add('is-active');
      cameraStatusText.textContent = '🟢 Câmera Ativa - Escaneando...';

      notifier.showToast({
        title: 'Câmera Ativada',
        message: 'Aponte o crachá ou QR Code do aluno para a mira.',
        type: 'info'
      });
    } catch (err) {
      console.error('Falha ao abrir câmera:', err);
      cameraStatusPill.classList.remove('is-active');
      cameraStatusText.textContent = 'Erro ao Acessar Câmera';

      let userMsg = 'Não foi possível acessar a câmera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userMsg = 'Permissão de câmera negada. Clique no ícone de câmera/cadeado na barra de endereços do seu navegador e selecione "Permitir".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userMsg = 'Nenhuma câmera de vídeo foi encontrada no seu dispositivo.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        userMsg = 'A câmera está sendo utilizada por outro aplicativo (ex: Teams, Zoom, Meet). Feche-o e tente novamente.';
      }

      notifier.showToast({
        title: 'Acesso à Câmera',
        message: userMsg,
        type: 'danger',
        duration: 7000
      });
    }
  });

  // Desliga a Câmera
  stopCameraBtn.addEventListener('click', () => {
    qrManager.stopCameraScanner();
    cameraPlaceholder.classList.remove('hidden');
    cameraStatusPill.classList.remove('is-active');
    cameraStatusText.textContent = 'Câmera em Espera';
    notifier.showToast({ title: 'Câmera Desligada', message: 'Scanner em pausa.', type: 'info' });
  });

  // Leitura de Imagem de QR Code via Upload de Arquivo
  if (uploadQrBtn && qrFileInput) {
    uploadQrBtn.addEventListener('click', () => qrFileInput.click());

    qrFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        notifier.showToast({ title: 'Analisando Imagem', message: 'Decodificando crachá...', type: 'info' });
        await qrManager.decodeImageFile(file);
      } catch (err) {
        notifier.showToast({
          title: 'Decodificação de Imagem',
          message: err.message || 'Nenhum QR Code detectado na imagem.',
          type: 'warning'
        });
      } finally {
        qrFileInput.value = '';
      }
    });
  }

  // Simulação de Escaneamento Rápido de Crachá
  simulateScanBtn.addEventListener('click', () => {
    const mockStudents = [
      { id: 'STD-201', name: 'Rodrigo Medeiros' },
      { id: 'STD-202', name: 'Mariana Fontes' },
      { id: 'STD-203', name: 'Matheus Albuquerque' },
      { id: 'STD-204', name: 'Juliana Paes' },
      { id: 'STD-205', name: 'Fernanda Montenegro' }
    ];
    const picked = mockStudents[Math.floor(Math.random() * mockStudents.length)];
    const mockPayload = `${picked.id} - ${picked.name}`;
    handleStudentScan(mockPayload);
  });

  // Detecta câmeras disponíveis ao carregar a página
  refreshCameraList();

  // =========================================================================
  // 7. Filtros do Feed, Exportação e Limpeza
  // =========================================================================

  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderFeed();
    });
  });

  // Limpeza
  document.getElementById('btn-clear-feed').addEventListener('click', async () => {
    if (confirm('Deseja realmente limpar os registros atuais da chamada?')) {
      tracker.clear();
      await storage.clearAll();
      notifier.showToast({ title: 'Registros Limpos', message: 'Sessão reiniciada.', type: 'info' });
    }
  });

  // Exportar CSV
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const records = tracker.getRecords();
    if (records.length === 0) {
      notifier.showToast({ title: 'Sem Dados', message: 'Nenhum registro para exportar.', type: 'warning' });
      return;
    }

    const headers = ['ID Registro', 'Matricula', 'Nome do Aluno', 'Horario Entrada', 'Atraso (min)', 'Excedeu Tolerancia', 'Status'];
    const rows = records.map(r => [
      `"${r.id}"`,
      `"${r.studentId}"`,
      `"${r.studentName}"`,
      `"${new Date(r.timestamp).toISOString()}"`,
      r.delayMinutes,
      r.exceededTolerance ? 'SIM' : 'NAO',
      `"${r.status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `atrasos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notifier.showToast({ title: 'Download Concluído', message: 'Arquivo CSV gerado com sucesso.', type: 'success' });
  });

  // Helper para escapar strings HTML
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Popula 2 registros iniciais para demonstração imediata do dashboard
  const sampleTime1 = new Date(classStartTime.getTime() + (2 * 60 * 1000));
  const sampleTime2 = new Date(classStartTime.getTime() + (18 * 60 * 1000));
  tracker.registerEntry('STD-101', 'Ana Clara', classStartTime, sampleTime1);
  tracker.registerEntry('STD-102', 'Carlos Eduardo', classStartTime, sampleTime2);
});
