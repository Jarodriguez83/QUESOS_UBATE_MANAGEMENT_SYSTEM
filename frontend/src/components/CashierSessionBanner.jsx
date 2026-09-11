import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar as CalendarIcon, 
  User, 
  ShieldCheck, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Sparkles,
  Sun,
  Moon,
  CalendarDays
} from 'lucide-react';

export default function CashierSessionBanner({ currentUser, role }) {
  const [time, setTime] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());

  // Sincronización del reloj en tiempo real (segundo a segundo)
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Formatear Hora en vivo (ej: 11:03:36 PM)
  const formattedTime = time.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  // Formatear Fecha (ej: Jueves, 10 de Septiembre de 2026)
  const formattedDate = time.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  // Determinar saludo según la hora (Mañana, Tarde, Noche)
  const currentHour = time.getHours();
  let greeting = 'Buenas noches';
  let GreetingIcon = Moon;

  if (currentHour >= 5 && currentHour < 12) {
    greeting = 'Buenos días';
    GreetingIcon = Sun;
  } else if (currentHour >= 12 && currentHour < 19) {
    greeting = 'Buenas tardes';
    GreetingIcon = Sun;
  }

  // --- LÓGICA DEL MINI CALENDARIO INTERACTIVO ---
  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Días del mes actual
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleDateClick = (day) => {
    const newSel = new Date(currentYear, currentMonth, day);
    setSelectedDate(newSel);
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  const isSelected = (day) => {
    return (
      day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear()
    );
  };

  return (
    <div className="cashier-banner-wrapper">
      <div className="cashier-banner-content">
        
        {/* BLOQUE IZQUIERDO: INFORMACIÓN DEL CAJERO */}
        <div className="cajera-info-block">
          <div className="cajera-avatar">
            <User size={20} />
          </div>
          <div className="cajera-text-details">
            <div className="cajera-greeting">
              <GreetingIcon size={14} className="greeting-icon" />
              <span>{greeting}, <strong>{currentUser?.cashierName || 'Cajero Activo'}</strong></span>
            </div>
            <div className="cajera-badges-row">
              <span className="code-pill">COD: {currentUser?.cashierCode || 'CJ-101'}</span>
              <span className={`role-pill ${role === 'ADMIN' ? 'admin' : 'operator'}`}>
                <ShieldCheck size={12} />
                {role === 'ADMIN' ? 'Administrador' : 'Operario de Caja'}
              </span>
            </div>
          </div>
        </div>

        {/* BLOQUE DERECHO: FECHA, RELOJ EN VIVO Y WIDGET CALENDARIO */}
        <div className="live-clock-block">
          <div className="date-time-display">
            <div className="live-date">
              <CalendarIcon size={15} />
              <span>{capitalizedDate}</span>
            </div>
            <div className="live-clock">
              <Clock size={16} className="clock-pulse-icon" />
              <span className="clock-numbers">{formattedTime}</span>
            </div>
          </div>

          {/* Botón Abrir Calendario */}
          <button 
            type="button" 
            className={`btn-open-calendar ${showCalendar ? 'active' : ''}`}
            onClick={() => setShowCalendar(!showCalendar)}
            title="Abrir Calendario Interactivo"
          >
            <CalendarDays size={18} />
            <span>Calendario</span>
          </button>
        </div>

      </div>

      {/* ================= MODAL / DROPDOWN DE CALENDARIO INTERACTIVO ================= */}
      {showCalendar && (
        <div className="calendar-dropdown-overlay" onClick={() => setShowCalendar(false)}>
          <div className="calendar-dropdown-card" onClick={(e) => e.stopPropagation()}>
            
            <div className="calendar-card-header">
              <div className="calendar-header-title">
                <Sparkles size={16} className="text-amber-400" />
                <span>Calendario de Trabajo & Turnos</span>
              </div>
              <button 
                type="button" 
                className="calendar-close-btn"
                onClick={() => setShowCalendar(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Selector de Mes */}
            <div className="calendar-month-selector">
              <button type="button" onClick={handlePrevMonth} className="cal-nav-btn">
                <ChevronLeft size={18} />
              </button>

              <span className="cal-month-name">
                {monthNames[currentMonth]} {currentYear}
              </span>

              <button type="button" onClick={handleNextMonth} className="cal-nav-btn">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Días de la Semana */}
            <div className="calendar-week-grid">
              {daysOfWeek.map((day, idx) => (
                <div key={idx} className="cal-weekday">{day}</div>
              ))}
            </div>

            {/* Cuadrícula de Días */}
            <div className="calendar-days-grid">
              {/* Espacios vacíos antes del día 1 */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="cal-day empty"></div>
              ))}

              {/* Días del Mes */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const activeToday = isToday(dayNum);
                const activeSel = isSelected(dayNum);

                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    className={`cal-day ${activeToday ? 'today' : ''} ${activeSel ? 'selected' : ''}`}
                    onClick={() => handleDateClick(dayNum)}
                  >
                    <span>{dayNum}</span>
                    {activeToday && <span className="today-dot"></span>}
                  </button>
                );
              })}
            </div>

            {/* Resumen del Día Seleccionado */}
            <div className="calendar-selected-summary">
              <div className="selected-date-badge">
                <span>Seleccionado: </span>
                <strong>
                  {selectedDate.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                </strong>
              </div>
              <span className="shift-hint">
                Turno asignado: <strong>Turno Mañana (06:00 AM - 02:00 PM)</strong>
              </span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
