class SpeechSynthesisQueue {
  constructor() {
    this.queue = [];
    this.speaking = false;
    
    // Configuración inicial de LocalStorage
    this.enabled = localStorage.getItem('tts_enabled') !== 'false';
    this.selectedVoiceName = localStorage.getItem('tts_voice') || '';
    this.rate = parseFloat(localStorage.getItem('tts_rate')) || 0.95;
    this.pitch = parseFloat(localStorage.getItem('tts_pitch')) || 1.0;
  }

  speak(text) {
    if (!this.enabled) return;
    
    // Evitar duplicados exactos en la cola inmediata
    if (this.queue.includes(text)) return;
    
    this.queue.push(text);
    if (!this.speaking) {
      this._speakNext();
    }
  }

  _speakNext() {
    if (this.queue.length === 0) {
      this.speaking = false;
      return;
    }

    if (!window.speechSynthesis) {
      console.warn('SpeechSynthesis no está soportado en este navegador.');
      this.speaking = false;
      return;
    }

    this.speaking = true;
    const text = this.queue.shift();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    // Buscar y asignar la voz configurada
    const voices = window.speechSynthesis.getVoices();
    if (this.selectedVoiceName) {
      const voice = voices.find(v => v.name === this.selectedVoiceName);
      if (voice) utterance.voice = voice;
    } else {
      // Intentar elegir una voz en español por defecto si no hay seleccionada
      const spanishVoice = voices.find(v => v.lang.startsWith('es-'));
      if (spanishVoice) utterance.voice = spanishVoice;
    }

    utterance.onend = () => {
      // Pausa corta de 800ms antes del siguiente audio para mejorar la claridad
      setTimeout(() => {
        this._speakNext();
      }, 800);
    };

    utterance.onerror = (e) => {
      console.error('Error de reproducción en SpeechSynthesis:', e);
      this.speaking = false;
      this._speakNext();
    };

    window.speechSynthesis.speak(utterance);
  }

  cancel() {
    this.queue = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speaking = false;
  }

  setEnabled(val) {
    this.enabled = val;
    localStorage.setItem('tts_enabled', val.toString());
    if (!val) {
      this.cancel();
    }
  }

  setVoice(voiceName) {
    this.selectedVoiceName = voiceName;
    localStorage.setItem('tts_voice', voiceName);
  }

  setRate(rate) {
    this.rate = rate;
    localStorage.setItem('tts_rate', rate.toString());
  }

  getVoices() {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  }
}

export const speechQueue = new SpeechSynthesisQueue();
