/**
 * NotificationManager.js
 * Gerenciador de Alertas em Tempo Real (Toasts, Sons Nativos via Web Audio e Desktop Notifications)
 */

export class NotificationManager {
  #audioCtx = null;
  #toastContainer = null;

  constructor() {
    this.#initToastContainer();
  }

  #initToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    this.#toastContainer = container;
  }

  /**
   * Solicita permissão para notificações nativas do navegador
   */
  async requestDesktopPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn('Permissão de notificação rejeitada:', err);
      }
    }
  }

  /**
   * Emite som sintetizado nativamente usando Web Audio API
   * @param {'alert'|'success'|'warning'} type 
   */
  playFeedbackTone(type = 'alert') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!this.#audioCtx) {
        this.#audioCtx = new AudioContext();
      }

      if (this.#audioCtx.state === 'suspended') {
        this.#audioCtx.resume();
      }

      const now = this.#audioCtx.currentTime;
      const osc = this.#audioCtx.createOscillator();
      const gain = this.#audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.#audioCtx.destination);

      if (type === 'alert') {
        // Alerta agudo duplo de emergência/tolerância
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now); // A5
        osc.frequency.setValueAtTime(440, now + 0.12); // A4
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'warning') {
        // Alerta moderado
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        // Sucesso: acorde suave
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      // Falha silenciosa em navegadores com restrição de autoplay
    }
  }

  /**
   * Exibe notificação flutuante na tela
   */
  showToast({ title, message, type = 'info', duration = 4000 }) {
    if (!this.#toastContainer) this.#initToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide-in`;

    const iconMap = {
      danger: '⚠️',
      warning: '⏱️',
      success: '✅',
      info: 'ℹ️'
    };

    toast.innerHTML = `
      <div class="toast-icon">${iconMap[type] || '🔔'}</div>
      <div class="toast-content">
        <strong class="toast-title">${title}</strong>
        <p class="toast-desc">${message}</p>
      </div>
      <button class="toast-close" aria-label="Fechar">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('animate-fade-out');
      setTimeout(() => toast.remove(), 250);
    });

    this.#toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.isConnected) {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 250);
      }
    }, duration);
  }

  /**
   * Dispara notificação nativa do sistema operacional (Desktop Web Notification)
   */
  showDesktopNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ef4444"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
        });
      } catch (err) {
        console.warn('Erro ao emitir Web Notification:', err);
      }
    }
  }
}
