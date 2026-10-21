# LateTracker Pro - Sistema de Gestão Inteligente de Atrasos

Sistema desenvolvido seguindo os **Pilares do JavaScript Moderno (ES6+)**, desacoplamento por **EventTarget Nativo (Pub/Sub)**, integração com **Web APIs de Hardware**, **Resiliência Offline-First (IndexedDB + Service Worker)** e **Inteligência Preditiva Client-Side**.

---

## 🧱 Arquitetura em Etapas

| Etapa | Foco | Módulo / Arquivo |
| :--- | :--- | :--- |
| **Etapa 1** | Motor Central de Regras & EventTarget Nativo | [`js/LateTracker.js`](js/LateTracker.js) |
| **Etapa 2** | Design System & Dashboard Reativo | [`index.html`](index.html), [`css/style.css`](css/style.css) |
| **Etapa 3** | Leitura de Hardware & QR Code Dinâmico | [`js/QrManager.js`](js/QrManager.js) |
| **Etapa 4** | Alertas em Tempo Real & Pub/Sub | [`js/NotificationManager.js`](js/NotificationManager.js) |
| **Etapa 5** | Resiliência Offline-First | [`js/StorageManager.js`](js/StorageManager.js), [`sw.js`](sw.js) |
| **Etapa 6** | Inteligência Preditiva de Recorrência | [`js/PredictiveEngine.js`](js/PredictiveEngine.js) |

---

## 🚀 Como Executar

### Opção 1: Servidor Local
```bash
python -m http.server 8080
# ou
npx serve .
```
Acesse no seu navegador: **[http://localhost:8080](http://localhost:8080)**

### Opção 2: Testes Automatizados no Node.js
```bash
node test.js
```

---

## 💡 Recursos Implementados

1. **LateTracker Core**:
   - Herança de `EventTarget`.
   - Emissão de `entryRegistered`, `toleranceExceeded`, `toleranceWithin` e `onTimeRegistered`.
   - Cálculo temporal nativo em minutos com `Date` e `Intl.DateTimeFormat`.

2. **QR Code Dinâmico do Professor**:
   - Rotação de token antifraude a cada 10 segundos na tela da sala.
   - Barra de progresso de expiração visual.

3. **Leitor de Câmera**:
   - Acesso nativo a `navigator.mediaDevices.getUserMedia`.
   - Retorno visual de mira e opção de simulação rápida de crachás.

4. **Offline First (IndexedDB)**:
   - Armazenamento local autônomo sem internet.
   - Sincronização automática ao detectar status `online`.

5. **Motor Preditivo**:
   - Detecção de dias da semana com maior reincidência.
   - Cálculo de índice de risco institucional e recomendações pedagógicas.
