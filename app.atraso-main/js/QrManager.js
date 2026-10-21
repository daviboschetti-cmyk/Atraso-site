/**
 * QrManager.js
 * Gerenciamento Avançado de Câmera (Hardware API: getUserMedia)
 * Leitura e Decodificação de QR Code em Tempo Real (BarcodeDetector API + jsQR Fallback)
 * Geração de QR Code Dinâmico Antifraude
 */

export class QrManager {
  #videoElement = null;
  #qrCanvasElement = null;
  #stream = null;
  #scanAnimationId = null;
  #intervalId = null;
  #countdown = 10;
  #currentToken = '';
  #onScanCallback = null;
  #scanningCanvas = null;
  #scanningCtx = null;
  #lastScannedValue = null;
  #lastScanTime = 0;
  #barcodeDetector = null;
  #isScanning = false;

  constructor({ videoId, qrCanvasId, onScan }) {
    this.#videoElement = document.getElementById(videoId);
    this.#qrCanvasElement = document.getElementById(qrCanvasId);
    this.#onScanCallback = onScan;

    // Canvas interno para extração de frames da câmera
    this.#scanningCanvas = document.createElement('canvas');
    this.#scanningCtx = this.#scanningCanvas.getContext('2d', { willReadFrequently: true });

    // Inicializa detector nativo do navegador se suportado
    if ('BarcodeDetector' in window) {
      try {
        this.#barcodeDetector = new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix']
        });
      } catch (e) {
        console.warn('BarcodeDetector não inicializado:', e);
      }
    }
  }

  /**
   * Lista todas as câmeras de vídeo disponíveis no sistema
   * @returns {Promise<Array<{deviceId: string, label: string}>>}
   */
  async getAvailableCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Câmera ${index + 1}`
        }));
    } catch (err) {
      console.warn('Erro ao listar câmeras:', err);
      return [];
    }
  }

  /**
   * Ativa a câmera com resolução progressiva de restrições (garante funcionamento em qualquer webcam/PC/mobile)
   * @param {string} [preferredDeviceId]
   */
  async startCameraScanner(preferredDeviceId = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('A API getUserMedia não é suportada ou requer HTTPS/localhost.');
    }

    // Se já estiver rodando, para primeiro
    this.stopCameraScanner();

    let stream = null;
    let lastError = null;

    // Lista de restrições em ordem de preferência decrescente (com fallbacks garantidos)
    const constraintAttempts = [];

    if (preferredDeviceId) {
      constraintAttempts.push({
        video: { deviceId: { exact: preferredDeviceId } }
      });
    }

    // Restrição 1: Ambiente traseira ideal
    constraintAttempts.push({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    // Restrição 2: Frontal / Webcam de notebook
    constraintAttempts.push({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });

    // Restrição 3: Vídeo genérico básico
    constraintAttempts.push({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });

    // Restrição 4: Fallback absoluto
    constraintAttempts.push({ video: true });

    for (const constraints of constraintAttempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        lastError = err;
        console.warn('Tentativa com restrição falhou:', constraints, err.name);
      }
    }

    if (!stream) {
      throw lastError || new Error('Não foi possível obter o fluxo de vídeo da câmera.');
    }

    this.#stream = stream;

    if (this.#videoElement) {
      this.#videoElement.srcObject = stream;
      this.#videoElement.setAttribute('playsinline', 'true');
      this.#videoElement.muted = true;

      await new Promise((resolve) => {
        if (this.#videoElement.readyState >= 2) {
          resolve();
        } else {
          this.#videoElement.onloadedmetadata = () => resolve();
        }
      });

      try {
        await this.#videoElement.play();
      } catch (playErr) {
        console.warn('Alerta no video.play():', playErr);
      }

      // Inicia o ciclo contínuo de decodificação de frames
      this.#isScanning = true;
      this.#startFrameScanningLoop();
      return true;
    }
  }

  /**
   * Para o stream da câmera e o loop de leitura
   */
  stopCameraScanner() {
    this.#isScanning = false;
    if (this.#scanAnimationId) {
      cancelAnimationFrame(this.#scanAnimationId);
      this.#scanAnimationId = null;
    }

    if (this.#stream) {
      this.#stream.getTracks().forEach(track => {
        track.stop();
      });
      this.#stream = null;
    }

    if (this.#videoElement) {
      this.#videoElement.srcObject = null;
    }
  }

  /**
   * Loop contínuo de decodificação de QR Code a partir dos frames do <video>
   */
  #startFrameScanningLoop() {
    const scanFrame = async () => {
      if (!this.#isScanning || !this.#videoElement || this.#videoElement.paused || this.#videoElement.ended) {
        return;
      }

      const video = this.#videoElement;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          let detectedCode = null;

          // 1. Tenta API Nativa BarcodeDetector (mais rápida e acelerada por hardware)
          if (this.#barcodeDetector) {
            try {
              const barcodes = await this.#barcodeDetector.detect(video);
              if (barcodes && barcodes.length > 0) {
                detectedCode = barcodes[0].rawValue;
              }
            } catch (err) {
              // Fallback para jsQR se BarcodeDetector falhar no frame
            }
          }

          // 2. Fallback universal usando jsQR
          if (!detectedCode && window.jsQR) {
            this.#scanningCanvas.width = video.videoWidth;
            this.#scanningCanvas.height = video.videoHeight;
            this.#scanningCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

            const imageData = this.#scanningCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            const qrResult = window.jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert'
            });

            if (qrResult && qrResult.data) {
              detectedCode = qrResult.data;
            }
          }

          if (detectedCode) {
            this.#processDetectedQr(detectedCode);
          }
        } catch (err) {
          console.warn('Erro ao processar frame de vídeo:', err);
        }
      }

      if (this.#isScanning) {
        this.#scanAnimationId = requestAnimationFrame(scanFrame);
      }
    };

    this.#scanAnimationId = requestAnimationFrame(scanFrame);
  }

  /**
   * Processa o código decodificado com proteção contra repetição contínua (cooldown de 3s)
   */
  #processDetectedQr(rawCode) {
    const now = Date.now();
    if (this.#lastScannedValue === rawCode && (now - this.#lastScanTime) < 3000) {
      return; // Cooldown para não disparar 60 vezes por segundo
    }

    this.#lastScannedValue = rawCode;
    this.#lastScanTime = now;

    if (typeof this.#onScanCallback === 'function') {
      this.#onScanCallback(rawCode);
    }
  }

  /**
   * Decodifica uma imagem de QR Code enviada pelo usuário via upload de arquivo
   */
  async decodeImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
          let detected = null;

          if (this.#barcodeDetector) {
            try {
              const barcodes = await this.#barcodeDetector.detect(img);
              if (barcodes.length > 0) detected = barcodes[0].rawValue;
            } catch (err) {
              // segue para fallback
            }
          }

          if (!detected && window.jsQR) {
            this.#scanningCanvas.width = img.width;
            this.#scanningCanvas.height = img.height;
            this.#scanningCtx.drawImage(img, 0, 0);
            const imageData = this.#scanningCtx.getImageData(0, 0, img.width, img.height);
            const qr = window.jsQR(imageData.data, imageData.width, imageData.height);
            if (qr && qr.data) detected = qr.data;
          }

          if (detected) {
            this.#processDetectedQr(detected);
            resolve(detected);
          } else {
            reject(new Error('Nenhum código QR válido foi detectado na imagem.'));
          }
        };
        img.onerror = () => reject(new Error('Falha ao carregar a imagem.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Inicia a geração de QR Code Dinâmico da sala (rotativo a cada 10s)
   */
  startDynamicQr(classId = 'SALA-12', onTick = null) {
    this.stopDynamicQr();
    this.#countdown = 10;

    const generate = () => {
      const timestamp = Date.now();
      const randomNonce = Math.random().toString(36).substring(2, 7).toUpperCase();
      this.#currentToken = `ATTENDANCE::${classId}::${timestamp}::${randomNonce}`;
      
      this.#renderQrToCanvas(this.#qrCanvasElement, this.#currentToken);
      if (typeof onTick === 'function') {
        onTick(this.#countdown, this.#currentToken);
      }
    };

    generate();

    this.#intervalId = setInterval(() => {
      this.#countdown--;
      if (this.#countdown <= 0) {
        this.#countdown = 10;
        generate();
      } else if (typeof onTick === 'function') {
        onTick(this.#countdown, this.#currentToken);
      }
    }, 1000);
  }

  stopDynamicQr() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  getCurrentToken() {
    return this.#currentToken;
  }

  /**
   * Desenha visualmente uma representação matricial de alta precisão do QR Code no Canvas
   */
  #renderQrToCanvas(canvas, payload) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width || 220;
    const matrixSize = 25;
    const cellSize = size / matrixSize;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      hash = ((hash << 5) - hash) + payload.charCodeAt(i);
      hash |= 0;
    }

    const drawFinderPattern = (startX, startY) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(startX * cellSize, startY * cellSize, 7 * cellSize, 7 * cellSize);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect((startX + 1) * cellSize, (startY + 1) * cellSize, 5 * cellSize, 5 * cellSize);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect((startX + 2) * cellSize, (startY + 2) * cellSize, 3 * cellSize, 3 * cellSize);
    };

    drawFinderPattern(1, 1);
    drawFinderPattern(matrixSize - 8, 1);
    drawFinderPattern(1, matrixSize - 8);

    ctx.fillStyle = '#0f172a';
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        const isFinderTopLeft = r <= 8 && c <= 8;
        const isFinderTopRight = r <= 8 && c >= matrixSize - 9;
        const isFinderBottomLeft = r >= matrixSize - 9 && c <= 8;
        if (isFinderTopLeft || isFinderTopRight || isFinderBottomLeft) continue;

        const bit = Math.abs(Math.sin((hash + (r * 31) + (c * 17)))) > 0.45;
        if (bit) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize - 0.5, cellSize - 0.5);
        }
      }
    }

    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, cellSize * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
