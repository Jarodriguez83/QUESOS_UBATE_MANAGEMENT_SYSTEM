import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  Search, 
  Edit, 
  Trash2, 
  Shield, 
  UserCheck, 
  UserX, 
  Clock, 
  Check, 
  X, 
  Save, 
  AlertCircle,
  Sparkles,
  Phone,
  FileText,
  KeyRound,
  Filter,
  CalendarDays,
  Sun,
  Moon,
  Info,
  Building2
} from 'lucide-react';

// DETALLES Y HORARIOS EXACTOS DE CADA TURNO
export const SHIFT_DETAILS = {
  TC: {
    name: 'Turno Completo',
    code: 'TC',
    badgeClass: 'tc',
    weekdayHours: '09:00 AM - 09:00 PM',
    sundayHours: '09:00 AM - 08:00 PM',
    desc: 'Jornada completa de apertura a cierre'
  },
  TM: {
    name: 'Turno Mañana',
    code: 'TM',
    badgeClass: 'tm',
    weekdayHours: '09:00 AM - 06:00 PM',
    sundayHours: '09:00 AM - 06:00 PM',
    desc: 'Apertura y primera jornada del día'
  },
  TT: {
    name: 'Turno Tarde',
    code: 'TT',
    badgeClass: 'tt',
    weekdayHours: '01:00 PM - 09:00 PM',
    sundayHours: '12:00 PM - 08:00 PM',
    desc: 'Jornada de tarde y cierre del negocio'
  },
  LIB: {
    name: 'Día Libre / Descanso',
    code: 'LIB',
    badgeClass: 'lib',
    weekdayHours: 'Descanso Programado',
    sundayHours: 'Descanso Programado',
    desc: 'Descanso semanal obligatorio'
  }
};

export default function EmployeeManagement({ currentUser, role = 'ADMIN' }) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'schedule' | 'assigned'
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Día seleccionado para consulta en "Turnos Asignados" (por defecto el día actual)
  const currentDayNameIndex = new Date().getDay(); // 0: Domingo, 1: Lunes...
  const dayNamesMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const [selectedConsultDay, setSelectedConsultDay] = useState(dayNamesMap[currentDayNameIndex] || 'Lunes');

  // ESTADO DE EMPLEADOS (PRECARGADO CON DATOS DEMO)
  const [employees, setEmployees] = useState([
    {
      id: 1,
      name: 'Juan Rodríguez',
      document: '1.069.452.880',
      phone: '314 589 2244',
      role: 'Cajero',
      cashierCode: 'CJ-101',
      password: 'OPE - 123',
      status: 'Activo',
      createdDate: '2026-01-15'
    },
    {
      id: 2,
      name: 'María Pérez',
      document: '1.020.334.112',
      phone: '310 887 4455',
      role: 'Operario',
      cashierCode: 'CJ-102',
      password: 'OPE - 456',
      status: 'Activo',
      createdDate: '2026-02-10'
    },
    {
      id: 3,
      name: 'Carlos Gómez',
      document: '80.123.456',
      phone: '320 998 7766',
      role: 'Administrador',
      cashierCode: 'ADM-001',
      password: 'ADM - 999',
      status: 'Activo',
      createdDate: '2026-01-01'
    },
    {
      id: 4,
      name: 'Laura Castañeda',
      document: '1.075.221.890',
      phone: '311 445 6677',
      role: 'Cajero',
      cashierCode: 'CJ-103',
      password: 'OPE - 789',
      status: 'Inactivo',
      createdDate: '2026-03-05'
    }
  ]);

  // ESTADO DE PROGRAMACIÓN DE TURNOS POR DÍA DE LA SEMANA
  const [schedule, setSchedule] = useState({
    1: { Lunes: 'TM', Martes: 'TM', Miércoles: 'TM', Jueves: 'TM', Viernes: 'TM', Sábado: 'TC', Domingo: 'LIB' },
    2: { Lunes: 'TT', Martes: 'TT', Miércoles: 'TT', Jueves: 'TT', Viernes: 'TT', Sábado: 'TM', Domingo: 'LIB' },
    3: { Lunes: 'TC', Martes: 'TC', Miércoles: 'TC', Jueves: 'TC', Viernes: 'TC', Sábado: 'LIB', Domingo: 'TC' },
    4: { Lunes: 'LIB', Martes: 'LIB', Miércoles: 'LIB', Jueves: 'LIB', Viernes: 'LIB', Sábado: 'LIB', Domingo: 'LIB' }
  });

  // ESTADOS PARA MODALES DE CREAR / EDITAR EMPLEADO
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formError, setFormError] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    document: '',
    phone: '',
    role: 'Cajero',
    cashierCode: '',
    password: '',
    status: 'Activo'
  });

  // ABRIR MODAL CREAR
  const handleOpenCreateModal = () => {
    setEditingEmployee(null);
    setFormData({
      name: '',
      document: '',
      phone: '',
      role: 'Cajero',
      cashierCode: `CJ-10${employees.length + 1}`,
      password: 'OPE - 123',
      status: 'Activo'
    });
    setFormError('');
    setShowEmployeeModal(true);
  };

  // ABRIR MODAL EDITAR
  const handleOpenEditModal = (emp) => {
    setEditingEmployee(emp);
    setFormData({
      name: emp.name,
      document: emp.document,
      phone: emp.phone,
      role: emp.role,
      cashierCode: emp.cashierCode,
      password: emp.password,
      status: emp.status
    });
    setFormError('');
    setShowEmployeeModal(true);
  };

  // FORMATO DE CONTRASEÑA EN FORMULARIO
  const handlePasswordChange = (e) => {
    let raw = e.target.value.toUpperCase();
    let cleanLetters = raw.replace(/[^A-Z0-9]/g, '');
    let formatted = raw;

    if (/^[A-Z]{3}\d{1,3}$/.test(cleanLetters)) {
      const letters = cleanLetters.slice(0, 3);
      const numbers = cleanLetters.slice(3);
      formatted = `${letters} - ${numbers}`;
    }

    setFormData({ ...formData, password: formatted });
  };

  // GUARDAR EMPLEADO (CREAR O ACTUALIZAR)
  const handleSaveEmployee = (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) return setFormError('El nombre completo es obligatorio.');
    if (!formData.document.trim()) return setFormError('El número de documento es obligatorio.');
    if (!formData.cashierCode.trim()) return setFormError('El código de cajero es obligatorio.');

    const pwdRegex = /^[A-Z]{3}\s*-\s*\d{3}$/;
    if (!pwdRegex.test(formData.password.trim())) {
      return setFormError('La contraseña debe cumplir el formato XXX - 123 (ej: OPE - 123)');
    }

    if (editingEmployee) {
      setEmployees(employees.map(emp => emp.id === editingEmployee.id ? { ...emp, ...formData } : emp));
      triggerSuccessToast('Empleado actualizado correctamente.');
    } else {
      const newEmp = {
        id: Date.now(),
        ...formData,
        createdDate: new Date().toISOString().split('T')[0]
      };
      setEmployees([...employees, newEmp]);
      setSchedule({
        ...schedule,
        [newEmp.id]: { Lunes: 'TM', Martes: 'TM', Miércoles: 'TM', Jueves: 'TM', Viernes: 'TM', Sábado: 'LIB', Domingo: 'LIB' }
      });
      triggerSuccessToast('Nuevo empleado creado exitosamente.');
    }

    setShowEmployeeModal(false);
  };

  // CAMBIAR ESTADO DE EMPLEADO
  const handleToggleStatus = (id) => {
    setEmployees(employees.map(emp => {
      if (emp.id === id) {
        const newStatus = emp.status === 'Activo' ? 'Inactivo' : 'Activo';
        return { ...emp, status: newStatus };
      }
      return emp;
    }));
    triggerSuccessToast('Estado del empleado actualizado.');
  };

  // ELIMINAR EMPLEADO
  const handleDeleteEmployee = (id) => {
    if (window.confirm('¿Estás seguro de eliminar este empleado del registro?')) {
      setEmployees(employees.filter(emp => emp.id !== id));
      triggerSuccessToast('Empleado eliminado del sistema.');
    }
  };

  // CAMBIAR TURNO EN MATRIZ DE PROGRAMACIÓN
  const handleScheduleChange = (employeeId, day, newShift) => {
    setSchedule({
      ...schedule,
      [employeeId]: {
        ...schedule[employeeId],
        [day]: newShift
      }
    });
  };

  const handleSaveSchedule = () => {
    triggerSuccessToast('Programación de turnos guardada con éxito.');
  };

  const triggerSuccessToast = (msg) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // FILTRADO DE EMPLEADOS
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.document.includes(searchTerm) ||
      emp.cashierCode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || emp.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // OBTENER EL EMPLEADO ACTUAL LOGUEADO
  const activeEmployee = employees.find(e => e.cashierCode === currentUser?.cashierCode) || employees[0];

  return (
    <div className="employee-mgmt-container">
      
      {/* NOTIFICACIÓN TOAST */}
      {saveSuccessMsg && (
        <div className="toast-success-banner">
          <Check size={18} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* HEADER DEL MÓDULO */}
      <div className="employee-mgmt-header">
        <div className="title-block">
          <div className="icon-badge">
            <Users size={24} />
          </div>
          <div>
            <h2>Gestión de Personal, Horarios & Turnos Asignados</h2>
            <p>Atención al público: Lunes a Sábado (09:00 AM - 09:00 PM) | Domingos y Festivos (09:00 AM - 08:00 PM)</p>
          </div>
        </div>

        {/* NAVEGACIÓN ENTRE SECCIONES DEL MÓDULO */}
        <div className="module-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            <UserCheck size={16} />
            <span>Directorio ({employees.length})</span>
          </button>
          
          <button
            type="button"
            className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            <Calendar size={16} />
            <span>Programador de Turnos</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'assigned' ? 'active' : ''}`}
            onClick={() => setActiveTab('assigned')}
          >
            <CalendarDays size={16} />
            <span>Turnos Asignados</span>
          </button>
        </div>
      </div>

      {/* ================= SECCIÓN 1: DIRECTORIO & CRUD EMPLEADOS ================= */}
      {activeTab === 'list' && (
        <div className="employee-crud-section">
          
          {/* BARRA DE BÚSQUEDA Y ACCIONES */}
          <div className="crud-toolbar">
            <div className="search-filter-group">
              <div className="search-input-box">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, cédula o COD de cajero..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="crud-search-input"
                />
              </div>

              <div className="filter-box">
                <Filter size={16} className="filter-icon" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="crud-select"
                >
                  <option value="ALL">Todos los Roles</option>
                  <option value="Cajero">Cajero</option>
                  <option value="Operario">Operario</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn-create-employee"
              onClick={handleOpenCreateModal}
            >
              <UserPlus size={18} />
              <span>Nuevo Empleado</span>
            </button>
          </div>

          {/* TABLA DE EMPLEADOS */}
          <div className="employee-table-wrapper">
            <table className="employee-table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>COD Cajero</th>
                  <th>Documento (CC)</th>
                  <th>Teléfono</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Contraseña COD</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className={emp.status === 'Inactivo' ? 'row-inactive' : ''}>
                      <td>
                        <div className="employee-cell-info">
                          <div className="avatar-circle">
                            {emp.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="emp-name">{emp.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="code-badge">{emp.cashierCode}</span>
                      </td>
                      <td>{emp.document}</td>
                      <td>{emp.phone}</td>
                      <td>
                        <span className={`role-tag ${emp.role === 'Administrador' ? 'admin' : 'operator'}`}>
                          {emp.role}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`status-pill ${emp.status === 'Activo' ? 'active' : 'inactive'}`}
                          onClick={() => handleToggleStatus(emp.id)}
                          title="Haz clic para cambiar estado"
                        >
                          {emp.status === 'Activo' ? <UserCheck size={12} /> : <UserX size={12} />}
                          <span>{emp.status}</span>
                        </button>
                      </td>
                      <td>
                        <code className="password-code">{emp.password}</code>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="action-buttons-cell">
                          <button
                            type="button"
                            className="action-btn edit"
                            onClick={() => handleOpenEditModal(emp)}
                            title="Editar Empleado"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => handleDeleteEmployee(emp.id)}
                            title="Eliminar Empleado"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-table-cell">
                      No se encontraron empleados que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ================= SECCIÓN 2: PROGRAMACIÓN DE TURNOS POR DÍA ================= */}
      {activeTab === 'schedule' && (
        <div className="shift-schedule-section">
          
          <div className="schedule-header-bar">
            <div>
              <h3>Programación Semanal de Horarios y Turnos</h3>
              <p>Planifica y asigna los turnos diarios con 1 día de descanso libre a la semana.</p>
            </div>

            <button
              type="button"
              className="btn-save-schedule"
              onClick={handleSaveSchedule}
            >
              <Save size={18} />
              <span>Guardar Programación</span>
            </button>
          </div>

          {/* LEYENDA DE CONVENCIONES DE TURNOS REQUISITADAS */}
          <div className="schedule-legend">
            <div className="legend-item">
              <span className="legend-badge tc">TC</span>
              <span><strong>Turno Completo</strong> (09:00 AM - 09:00 PM / Dom: 09:00 AM - 08:00 PM)</span>
            </div>
            <div className="legend-item">
              <span className="legend-badge tm">TM</span>
              <span><strong>Turno Mañana</strong> (09:00 AM - 06:00 PM)</span>
            </div>
            <div className="legend-item">
              <span className="legend-badge tt">TT</span>
              <span><strong>Turno Tarde</strong> (01:00 PM - 09:00 PM / Dom: 12:00 PM - 08:00 PM)</span>
            </div>
            <div className="legend-item">
              <span className="legend-badge lib">LIB</span>
              <span><strong>Día Libre / Descanso</strong> (1 día a la semana)</span>
            </div>
          </div>

          {/* MATRIZ DE HORARIOS SEMANALES */}
          <div className="schedule-grid-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Empleado</th>
                  {weekDays.map((day, idx) => (
                    <th key={idx}>
                      <div>{day}</div>
                      <span className="day-sub-label">{day === 'Domingo' ? '09:00 AM - 08:00 PM' : '09:00 AM - 09:00 PM'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.filter(e => e.status === 'Activo').map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <div className="schedule-emp-cell">
                        <strong>{emp.name}</strong>
                        <span className="emp-subcode">{emp.cashierCode} • {emp.role}</span>
                      </div>
                    </td>

                    {weekDays.map((day) => {
                      const currentShift = schedule[emp.id]?.[day] || 'TM';
                      return (
                        <td key={day}>
                          <select
                            value={currentShift}
                            onChange={(e) => handleScheduleChange(emp.id, day, e.target.value)}
                            className={`shift-select-badge ${currentShift.toLowerCase()}`}
                          >
                            <option value="TC">TC - Completo</option>
                            <option value="TM">TM - Mañana</option>
                            <option value="TT">TT - Tarde</option>
                            <option value="LIB">LIB - Descanso</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ================= SECCIÓN 3: TURNOS ASIGNADOS (VISTA OPERARIO Y ADMIN) ================= */}
      {activeTab === 'assigned' && (
        <div className="assigned-shifts-section">
          
          <div className="assigned-header-box">
            <div className="day-selector-bar">
              <span className="selector-title">
                <CalendarDays size={18} className="text-sky-400" />
                Seleccionar Día de Consulta:
              </span>
              
              <div className="days-pill-row">
                {weekDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`day-pill-btn ${selectedConsultDay === day ? 'active' : ''}`}
                    onClick={() => setSelectedConsultDay(day)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="store-hours-info-badge">
              <Building2 size={16} />
              <span>
                Atención al público en <strong>{selectedConsultDay}</strong>: {' '}
                <strong>{selectedConsultDay === 'Domingo' ? '09:00 AM - 08:00 PM (Domingos y Festivos)' : '09:00 AM - 09:00 PM (Lunes a Sábado)'}</strong>
              </span>
            </div>
          </div>

          {/* VISTA OPERARIO: TARJETA DE TURNO PERSONAL DE CAJERO */}
          {role !== 'ADMIN' ? (
            <div className="operario-shift-view">
              {(() => {
                const shiftCode = schedule[activeEmployee.id]?.[selectedConsultDay] || 'TM';
                const detail = SHIFT_DETAILS[shiftCode];
                const isSunday = selectedConsultDay === 'Domingo';
                const exactHours = isSunday ? detail.sundayHours : detail.weekdayHours;
                const isRest = shiftCode === 'LIB';

                return (
                  <div className={`operario-shift-card ${isRest ? 'is-rest' : ''}`}>
                    <div className="shift-card-top">
                      <div className="emp-profile-pill">
                        <div className="avatar-circle">{activeEmployee.name.substring(0, 2).toUpperCase()}</div>
                        <div>
                          <h3>{activeEmployee.name}</h3>
                          <span>Código: <strong>{activeEmployee.cashierCode}</strong> • {activeEmployee.role}</span>
                        </div>
                      </div>

                      <span className={`status-badge-large ${detail.badgeClass}`}>
                        {isRest ? 'DÍA LIBRE DE DESCANSO' : 'TURNO PROGRAMADO'}
                      </span>
                    </div>

                    <div className="shift-card-body">
                      <div className="shift-detail-column">
                        <span className="detail-label">Día de la semana:</span>
                        <strong className="detail-value-highlight">{selectedConsultDay}</strong>
                      </div>

                      <div className="shift-detail-column">
                        <span className="detail-label">Nombre del Turno:</span>
                        <strong className="detail-value">{detail.name}</strong>
                      </div>

                      <div className="shift-detail-column">
                        <span className="detail-label">Horario de Trabajo Asignado:</span>
                        <div className="time-badge-box">
                          <Clock size={16} />
                          <span>{exactHours}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shift-card-footer">
                      <Info size={16} className="text-amber-400" />
                      <span>{detail.desc}. En caso de requerir un cambio de turno, contactar con el Administrador.</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            
            /* VISTA ADMINISTRADOR: RESUMEN DE PERSONAL PROGRAMADO POR DÍA */
            <div className="admin-shift-summary">
              <div className="summary-title-row">
                <h3>Reporte Consolidado de Personal - {selectedConsultDay}</h3>
                <span className="summary-count">
                  Total Personal Programado: <strong>{employees.filter(e => e.status === 'Activo').length} empleados</strong>
                </span>
              </div>

              <div className="shifts-groups-grid">
                
                {/* TURNO COMPLETO */}
                <div className="shift-group-card tc">
                  <div className="group-card-header">
                    <span className="badge-title tc">TURNO COMPLETO</span>
                    <span className="group-hours">{selectedConsultDay === 'Domingo' ? '09:00 AM - 08:00 PM' : '09:00 AM - 09:00 PM'}</span>
                  </div>
                  <div className="group-members-list">
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'TC').map(emp => (
                      <div key={emp.id} className="member-row">
                        <span className="member-name">{emp.name}</span>
                        <span className="member-code">{emp.cashierCode}</span>
                      </div>
                    ))}
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'TC').length === 0 && (
                      <div className="no-members">Sin empleados asignados a este turno</div>
                    )}
                  </div>
                </div>

                {/* TURNO MAÑANA */}
                <div className="shift-group-card tm">
                  <div className="group-card-header">
                    <span className="badge-title tm">TURNO MAÑANA</span>
                    <span className="group-hours">09:00 AM - 06:00 PM</span>
                  </div>
                  <div className="group-members-list">
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'TM').map(emp => (
                      <div key={emp.id} className="member-row">
                        <span className="member-name">{emp.name}</span>
                        <span className="member-code">{emp.cashierCode}</span>
                      </div>
                    ))}
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'TM').length === 0 && (
                      <div className="no-members">Sin empleados asignados a este turno</div>
                    )}
                  </div>
                </div>

                {/* TURNO TARDE */}
                <div className="shift-group-card tt">
                  <div className="group-card-header">
                    <span className="badge-title tt">TURNO TARDE</span>
                    <span className="group-hours">{selectedConsultDay === 'Domingo' ? '12:00 PM - 08:00 PM' : '01:00 PM - 09:00 PM'}</span>
                  </div>
                  <div className="group-members-list">
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'TT').map(emp => (
                      <div key={emp.id} className="member-row">
                        <span className="member-name">{emp.name}</span>
                        <span className="member-code">{emp.cashierCode}</span>
                      </div>
                    ))}
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'TT').length === 0 && (
                      <div className="no-members">Sin empleados asignados a este turno</div>
                    )}
                  </div>
                </div>

                {/* DÍA LIBRE / DESCANSO */}
                <div className="shift-group-card lib">
                  <div className="group-card-header">
                    <span className="badge-title lib">DESCANSO / DÍA LIBRE</span>
                    <span className="group-hours">Descanso Semanal</span>
                  </div>
                  <div className="group-members-list">
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'LIB').map(emp => (
                      <div key={emp.id} className="member-row">
                        <span className="member-name">{emp.name}</span>
                        <span className="member-code">{emp.cashierCode}</span>
                      </div>
                    ))}
                    {employees.filter(e => e.status === 'Activo' && (schedule[e.id]?.[selectedConsultDay] || 'TM') === 'LIB').length === 0 && (
                      <div className="no-members">Sin descansos programados para este día</div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* ================= MODAL CREAR / EDITAR EMPLEADO (RESPONSIVO MEJORADO) ================= */}
      {showEmployeeModal && (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal-content employee-modal" onClick={(e) => e.stopPropagation()}>
            
            <div className="modal-header">
              <h3>{editingEmployee ? 'Editar Empleado' : 'Registrar Nuevo Empleado'}</h3>
              <button 
                type="button"
                className="modal-close"
                onClick={() => setShowEmployeeModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="employee-form">
              
              {formError && (
                <div className="form-alert-error">
                  <AlertCircle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-grid-responsive">
                
                {/* Nombre */}
                <div className="form-group">
                  <label>Nombre Completo *</label>
                  <div className="input-with-icon">
                    <UserCheck size={16} className="field-icon" />
                    <input
                      type="text"
                      className="custom-input"
                      placeholder="Ej. Carlos Mendoza"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Documento */}
                <div className="form-group">
                  <label>Documento de Identidad (CC) *</label>
                  <div className="input-with-icon">
                    <FileText size={16} className="field-icon" />
                    <input
                      type="text"
                      className="custom-input"
                      placeholder="Ej. 1.069.444.555"
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Teléfono */}
                <div className="form-group">
                  <label>Número de Teléfono</label>
                  <div className="input-with-icon">
                    <Phone size={16} className="field-icon" />
                    <input
                      type="text"
                      className="custom-input"
                      placeholder="Ej. 314 555 6677"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Rol */}
                <div className="form-group">
                  <label>Rol del Sistema *</label>
                  <select
                    className="custom-input select"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="Cajero">Cajero</option>
                    <option value="Operario">Operario</option>
                    <option value="Administrador">Administrador</option>
                  </select>
                </div>

                {/* COD de Cajero */}
                <div className="form-group">
                  <label>COD de Cajero *</label>
                  <div className="input-with-icon">
                    <Shield size={16} className="field-icon" />
                    <input
                      type="text"
                      className="custom-input"
                      placeholder="Ej. CJ-104"
                      value={formData.cashierCode}
                      onChange={(e) => setFormData({ ...formData, cashierCode: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                </div>

                {/* Contraseña XXX - 123 */}
                <div className="form-group">
                  <label>Contraseña Acceso (XXX - 123) *</label>
                  <div className="input-with-icon">
                    <KeyRound size={16} className="field-icon" />
                    <input
                      type="text"
                      className="custom-input"
                      placeholder="Ej. OPE - 123"
                      value={formData.password}
                      onChange={handlePasswordChange}
                      maxLength={11}
                      required
                    />
                  </div>
                </div>

                {/* Estado */}
                <div className="form-group">
                  <label>Estado del Empleado *</label>
                  <select
                    className="custom-input select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

              </div>

              <div className="modal-actions-responsive">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEmployeeModal(false)}
                >
                  Cancelar
                </button>
                
                <button type="submit" className="btn btn-primary">
                  <Save size={16} />
                  <span>{editingEmployee ? 'Guardar Cambios' : 'Registrar Empleado'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
