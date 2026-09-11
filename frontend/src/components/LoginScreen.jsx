import React, { useState } from 'react';
import { 
  Shield, 
  UserCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  LogIn, 
  CheckCircle2, 
  Sparkles,
  Layers,
  Activity,
  AlertCircle
} from 'lucide-react';

export default function LoginScreen({ onLogin }) {
  const [selectedMode, setSelectedMode] = useState('OPERATOR'); // OPERATOR | ADMIN
  const [cashierCode, setCashierCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formato y validación de contraseña XXX - 123
  const handlePasswordChange = (e) => {
    let raw = e.target.value.toUpperCase();
    
    // Auto-formateador intuitivo para XXX - 123
    let cleanLetters = raw.replace(/[^A-Z0-9]/g, '');
    let formatted = raw;

    if (/^[A-Z]{3}\d{1,3}$/.test(cleanLetters)) {
      const letters = cleanLetters.slice(0, 3);
      const numbers = cleanLetters.slice(3);
      formatted = `${letters} - ${numbers}`;
    }

    setPassword(formatted);
    setErrorMsg('');
  };

  // Validar si la contraseña cumple el patrón XXX - 123
  const validatePasswordStructure = (pwd) => {
    // Acepta formatos como "ABC - 123", "ABC-123", "ABC  -  123"
    const regex = /^[A-Z]{3}\s*-\s*\d{3}$/;
    return regex.test(pwd.trim());
  };

  const isPasswordValid = validatePasswordStructure(password);

  const handleFillDemo = (mode) => {
    if (mode === 'OPERATOR') {
      setSelectedMode('OPERATOR');
      setCashierCode('CJ-101');
      setPassword('OPE - 123');
    } else {
      setSelectedMode('ADMIN');
      setCashierCode('ADM-001');
      setPassword('ADM - 999');
    }
    setErrorMsg('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!cashierCode.trim()) {
      setErrorMsg('Por favor ingresa el Código de Cajero (COD).');
      return;
    }

    if (!password.trim()) {
      setErrorMsg('Por favor ingresa la contraseña.');
      return;
    }

    if (!isPasswordValid) {
      setErrorMsg('La contraseña no cumple con la estructura requerida: XXX - 123 (ejemplo: OPE - 123)');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);

      const codeUpper = cashierCode.trim().toUpperCase();
      let cashierName = `Cajero ${codeUpper}`;

      if (codeUpper === 'CJ-101' || codeUpper === 'OPE-101') cashierName = 'Juan Rodríguez';
      else if (codeUpper === 'CJ-102') cashierName = 'María Pérez';
      else if (codeUpper === 'ADM-001') cashierName = 'Carlos Gómez';

      onLogin({
        cashierCode: codeUpper,
        cashierName: cashierName,
        role: selectedMode,
        loginTime: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        shiftDate: new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
      });
    }, 400);
  };

  return (
    <div className="login-screen-wrapper">
      <div className="login-card-container">
        
        {/* ================= MITAD IZQUIERDA: BRANDING ================= */}
        <div className="login-left-brand">
          <div className="brand-glow-backdrop"></div>
          
          <div className="brand-header-content">
            <div className="brand-logo-badge">
              <div className="logo-icon-glow">🧀</div>
            </div>

            <h1 className="brand-title">Quesos Ubaté</h1>
            <p className="brand-slogan">Calidad de Campo & Sabor Tradicional</p>
            <div className="brand-divider"></div>
          </div>

          <div className="brand-features-list">
            <div className="feature-item">
              <div className="feature-icon"><Activity size={20} /></div>
              <div className="feature-text">
                <strong>Verificación en Tiempo Real</strong>
                <span>Integración automática de comprobantes de pago por Nequi, Daviplata y Bancolombia.</span>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon"><Shield size={20} /></div>
              <div className="feature-text">
                <strong>Seguridad y Control por Roles</strong>
                <span>Accesos diferenciados para Operarios y Administradores.</span>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon"><Layers size={20} /></div>
              <div className="feature-text">
                <strong>Punto de Venta Integrado</strong>
                <span>Gestión de inventarios, proveedores, facturación y reportes de caja.</span>
              </div>
            </div>
          </div>

          <div className="brand-footer-info">
            <Sparkles size={16} className="sparkle-icon" />
            <span>Sistema Web de Verificación v1.0 • Ubaté, Cundinamarca</span>
          </div>
        </div>

        {/* ================= MITAD DERECHA: FORMULARIO DE INGRESO ================= */}
        <div className="login-right-form">
          <div className="form-header">
            <h2>Acceso al Sistema</h2>
            <p>Selecciona tu rol e ingresa tus credenciales de cajero</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            
            {/* 1. SELECCIÓN DE MODO DE INGRESO */}
            <div className="form-group">
              <label className="input-label">Seleccionar Modo de Ingreso</label>
              <div className="mode-selector-grid">
                <button
                  type="button"
                  className={`mode-card ${selectedMode === 'OPERATOR' ? 'active' : ''}`}
                  onClick={() => { setSelectedMode('OPERATOR'); setErrorMsg(''); }}
                >
                  <div className="mode-card-header">
                    <UserCheck size={22} />
                    {selectedMode === 'OPERATOR' && <CheckCircle2 size={18} className="mode-check" />}
                  </div>
                  <span className="mode-title">MODO OPERARIO</span>
                  <span className="mode-desc">Caja y Punto de Venta</span>
                </button>

                <button
                  type="button"
                  className={`mode-card ${selectedMode === 'ADMIN' ? 'active admin' : ''}`}
                  onClick={() => { setSelectedMode('ADMIN'); setErrorMsg(''); }}
                >
                  <div className="mode-card-header">
                    <Shield size={22} />
                    {selectedMode === 'ADMIN' && <CheckCircle2 size={18} className="mode-check" />}
                  </div>
                  <span className="mode-title">MODO ADMINISTRADOR</span>
                  <span className="mode-desc">Control Total y Configuración</span>
                </button>
              </div>
            </div>

            {/* 2. CÓDIGO DE CAJERO */}
            <div className="form-group">
              <label htmlFor="cashierCode" className="input-label">
                Ingresar COD de Cajero
              </label>
              <div className="input-with-icon">
                <User className="field-icon" size={18} />
                <input
                  id="cashierCode"
                  type="text"
                  className="custom-input"
                  placeholder="Ej. CJ-101 u OPE-01"
                  value={cashierCode}
                  onChange={(e) => { setCashierCode(e.target.value); setErrorMsg(''); }}
                  required
                />
              </div>
            </div>

            {/* 3. CONTRASEÑA CON ESTRUCTURA XXX - 123 */}
            <div className="form-group">
              <div className="label-row">
                <label htmlFor="password" className="input-label">
                  Ingresar Contraseña
                </label>
                <span className="structure-tag">
                  Estructura: <strong>XXX - 123</strong>
                </span>
              </div>
              
              <div className="input-with-icon">
                <Lock className="field-icon" size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`custom-input ${password ? (isPasswordValid ? 'valid-border' : 'invalid-border') : ''}`}
                  placeholder="Ej. OPE - 123"
                  value={password}
                  onChange={handlePasswordChange}
                  maxLength={11}
                  required
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Indicador visual de formato */}
              <div className="password-format-hint">
                {password.length > 0 ? (
                  isPasswordValid ? (
                    <span className="hint-success">
                      <CheckCircle2 size={14} /> Formato válido (3 Letras - 3 Números)
                    </span>
                  ) : (
                    <span className="hint-error">
                      <AlertCircle size={14} /> Requiere 3 letras y 3 números (Ej: XXX - 123)
                    </span>
                  )
                ) : (
                  <span className="hint-info">
                    Formato alfanumérico: 3 primeras letras y 3 números finales.
                  </span>
                )}
              </div>
            </div>

            {/* ERROR ALERT */}
            {errorMsg && (
              <div className="login-error-alert">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 4. BOTÓN DE INGRESO */}
            <button
              type="submit"
              className={`login-submit-btn ${selectedMode === 'ADMIN' ? 'admin-theme' : ''}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="spinner-text">Iniciando sesión...</span>
              ) : (
                <>
                  <span>Ingresar al Sistema</span>
                  <LogIn size={20} />
                </>
              )}
            </button>

          </form>

          {/* BOTONES DEMO RÁPIDOS */}
          <div className="demo-credentials-box">
            <span className="demo-title">Prueba rápida con credenciales de ejemplo:</span>
            <div className="demo-btns-row">
              <button 
                type="button" 
                className="demo-pill" 
                onClick={() => handleFillDemo('OPERATOR')}
              >
                Cargar Operario (OPE - 123)
              </button>
              <button 
                type="button" 
                className="demo-pill admin" 
                onClick={() => handleFillDemo('ADMIN')}
              >
                Cargar Admin (ADM - 999)
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
