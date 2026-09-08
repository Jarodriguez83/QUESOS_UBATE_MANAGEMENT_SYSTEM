import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  History, 
  Settings, 
  Terminal, 
  Volume2, 
  VolumeX, 
  Play, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  Trash2, 
  Search, 
  Save, 
  RefreshCw, 
  Edit3, 
  Check, 
  X, 
  HelpCircle,
  Database,
  ShoppingCart,
  Printer,
  TrendingUp,
  DollarSign,
  Package,
  Users,
  CreditCard,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  LogOut
} from 'lucide-react';
import { speechQueue } from './SpeechSynthesisQueue';
import LoginScreen from './components/LoginScreen';

const API_BASE = 'http://localhost:5000/api';
const WS_URL = 'ws://localhost:5000';

function App() {
  // Authentication & User Session
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Navigation & Role
  const [activeTab, setActiveTab] = useState('pos'); // pos, dashboard, history, parsers, inventory, suppliers, reports, settings, logs
  const [role, setRole] = useState('OPERATOR'); // OPERATOR, ADMIN
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const handleLogin = (userSession) => {
    setCurrentUser(userSession);
    setRole(userSession.role);
    setIsAuthenticated(true);
    if (userSession.role === 'OPERATOR') {
      setActiveTab('pos');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // WebSocket & System Status
  const [wsConnected, setWsConnected] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);

  // Data States
  const [payments, setPayments] = useState([]);
  const [newPaymentIds, setNewPaymentIds] = useState(new Set());
  const [parsers, setParsers] = useState([]);
  const [selectedParser, setSelectedParser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // POS State
  const [cart, setCart] = useState([]);
  const [posCategory, setPosCategory] = useState('Todos');
  const [posSearch, setPosSearch] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    client_name: '',
    client_document: '',
    payment_method: 'Efectivo',
    payment_reference: '',
    cashReceived: ''
  });
  const [selectedPaymentLink, setSelectedPaymentLink] = useState(null);
  const [printedSale, setPrintedSale] = useState(null);

  // Inventory State
  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState({
    id: null,
    name: '',
    sku: '',
    category: 'Quesos',
    price: '',
    cost: '',
    stock: '0',
    min_stock: '2',
    unit: 'Unidad'
  });

  // Suppliers & Purchases State
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    id: null,
    name: '',
    nit: '',
    phone: '',
    email: '',
    contact_name: ''
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '',
    items: [],
    currentItem: {
      product_id: '',
      quantity: '',
      unit_price: ''
    }
  });

  // Dashboard Stats State
  const [dashboardStats, setDashboardStats] = useState(null);

  // Filters (Gmail Payments History Tab)
  const [historySearch, setHistorySearch] = useState('');
  const [historyBank, setHistoryBank] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');

  // Voice State
  const [ttsEnabled, setTtsEnabled] = useState(speechQueue.enabled);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(speechQueue.selectedVoiceName);
  const [speechRate, setSpeechRate] = useState(speechQueue.rate);

  // Gmail Payments Simulation Form State
  const [simBank, setSimBank] = useState('Nequi');
  const [simClient, setSimClient] = useState('Carlos Mario Restrepo');
  const [simAmount, setSimAmount] = useState('35.000');
  const [simRef, setSimRef] = useState('');
  const [simIsValid, setSimIsValid] = useState(true);

  // Parser Editor State (Gmail Scanner)
  const [parserForm, setParserForm] = useState({
    id: null,
    bank_name: '',
    sender_email: '',
    subject_pattern: '',
    regex_client: '',
    regex_amount: '',
    regex_reference: '',
    regex_date: '',
    is_active: 1
  });
  const [parserTestText, setParserTestText] = useState('');
  const [parserTestSubject, setParserTestSubject] = useState('¡Te enviaron plata!');
  const [parserTestResult, setParserTestResult] = useState(null);

  // Gmail OAuth Setup State
  const [gmailConfigForm, setGmailConfigForm] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:5000/api/gmail/callback'
  });

  // Correction Modal State (for unparsed payments)
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [paymentToCorrect, setPaymentToCorrect] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({
    id: '',
    client_name: '',
    amount: '',
    reference: '',
    payment_date: ''
  });

  const wsRef = useRef(null);

  // Load Voices for TTS
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechQueue.getVoices();
      setVoices(availableVoices);
      if (!selectedVoice && availableVoices.length > 0) {
        const defaultEs = availableVoices.find(v => v.lang.startsWith('es-'));
        if (defaultEs) {
          setSelectedVoice(defaultEs.name);
          speechQueue.setVoice(defaultEs.name);
        }
      }
    };
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoice]);

  // Sync data on tab change
  useEffect(() => {
    if (activeTab === 'pos' || activeTab === 'inventory') {
      fetchProducts();
    }
    if (activeTab === 'suppliers') {
      fetchSuppliers();
      fetchProducts();
    }
    if (activeTab === 'reports') {
      fetchDashboardStats();
    }
  }, [activeTab]);

  // Connect WebSockets on mount
  useEffect(() => {
    connectWebSocket();
    fetchInitialStatus();
    fetchParsers();
    fetchLogs();
    fetchProducts();
    fetchSuppliers();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const fetchInitialStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      setGmailConnected(data.gmailConnected);
      setGmailConfigured(data.gmailConfigured);
    } catch (err) {
      console.error('Error al consultar estado:', err);
    }
  };

  const fetchParsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/parsers`);
      const data = await res.json();
      setParsers(data);
      if (data.length > 0 && !selectedParser) {
        setSelectedParser(data[0]);
        setParserForm(data[0]);
      }
    } catch (err) {
      console.error('Error al consultar parsers:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Error al consultar logs:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/products`);
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch(`${API_BASE}/suppliers`);
      const data = await res.json();
      setSuppliers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`);
      const data = await res.json();
      setDashboardStats(data);
    } catch (err) {
      console.error(err);
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'STATUS_UPDATE':
          if (message.data.gmailConnected !== undefined) setGmailConnected(message.data.gmailConnected);
          if (message.data.gmailConfigured !== undefined) setGmailConfigured(message.data.gmailConfigured);
          break;

        case 'PAYMENTS_INIT':
          setPayments(message.data);
          break;

        case 'NEW_PAYMENT':
          const newPayment = message.data;
          setPayments(prev => [newPayment, ...prev]);

          setNewPaymentIds(prev => {
            const next = new Set(prev);
            next.add(newPayment.id);
            return next;
          });

          setTimeout(() => {
            setNewPaymentIds(prev => {
              const next = new Set(prev);
              next.delete(newPayment.id);
              return next;
            });
          }, 3000);

          // TTS Alert logic
          if (newPayment.status === 'PROCESADO') {
            const vocalAmount = Math.round(newPayment.amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            const speechText = `Pago confirmado, cliente ${newPayment.client_name}, valor ${vocalAmount} pesos en ${newPayment.bank_name}.`;
            speechQueue.speak(speechText);
          } else {
            const errorSpeech = `Atención: Error de lectura en pago de ${newPayment.bank_name}. Requiere revisión.`;
            speechQueue.speak(errorSpeech);
          }

          fetchLogs();
          break;

        case 'PAYMENT_UPDATED':
          const updatedPayment = message.data;
          setPayments(prev => prev.map(p => p.id === updatedPayment.id ? updatedPayment : p));
          fetchLogs();
          break;
        
        default:
          break;
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
  };

  // -------------------------------------------------------------
  // POS LOGIC (VENTAS)
  // -------------------------------------------------------------
  const addToCart = (product) => {
    if (product.stock <= 0) {
      alert('Este producto no cuenta con existencias en inventario.');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`No puedes vender más de ${product.stock} unidades de este producto.`);
          return prev;
        }
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price } : item
        );
      }
      return [...prev, { ...product, quantity: 1, subtotal: product.price }];
    });
  };

  const updateCartQty = (id, change) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (!existing) return prev;
      
      const newQty = existing.quantity + change;
      if (newQty <= 0) {
        return prev.filter(item => item.id !== id);
      }
      
      if (newQty > existing.stock) {
        alert(`No puedes vender más de ${existing.stock} unidades disponibles.`);
        return prev;
      }

      return prev.map(item => 
        item.id === id ? { ...item, quantity: newQty, subtotal: newQty * item.price } : item
      );
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const payload = {
      client_name: checkoutForm.client_name,
      client_document: checkoutForm.client_document,
      total: cartTotal,
      payment_method: checkoutForm.payment_method,
      payment_reference: checkoutForm.payment_method === 'Pago Digital' ? checkoutForm.payment_reference : null,
      items: cart.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.subtotal
      }))
    };

    try {
      const res = await fetch(`${API_BASE}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        // Cargar ticket para imprimir
        setPrintedSale({
          ...data.sale,
          items: cart.map(item => ({
            ...item,
            product_name: item.name
          }))
        });
        
        // Resetear carrito y modal de caja
        setCart([]);
        setShowCheckoutModal(false);
        setCheckoutForm({
          client_name: '',
          client_document: '',
          payment_method: 'Efectivo',
          payment_reference: '',
          cashReceived: ''
        });
        setSelectedPaymentLink(null);

        // Actualizar stock de productos
        fetchProducts();
      } else {
        alert(`Error al guardar la venta: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error en conexión con el servidor');
    }
  };

  const handleSelectPaymentLink = (pay) => {
    setSelectedPaymentLink(pay.id);
    setCheckoutForm(prev => ({
      ...prev,
      payment_reference: pay.reference,
      client_name: pay.client_name !== 'ERROR DE PARSEO' ? pay.client_name : prev.client_name
    }));
  };

  // -------------------------------------------------------------
  // INVENTORY LOGIC (PRODUCTOS)
  // -------------------------------------------------------------
  const openProductForm = (prod = null) => {
    if (prod) {
      setProductForm({
        id: prod.id,
        name: prod.name,
        sku: prod.sku || '',
        category: prod.category || 'Quesos',
        price: prod.price.toString(),
        cost: prod.cost.toString(),
        stock: prod.stock.toString(),
        min_stock: prod.min_stock.toString(),
        unit: prod.unit || 'Unidad'
      });
    } else {
      setProductForm({
        id: null,
        name: '',
        sku: '',
        category: 'Quesos',
        price: '',
        cost: '',
        stock: '0',
        min_stock: '2',
        unit: 'Unidad'
      });
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (role !== 'ADMIN') return alert('Solo administradores pueden realizar esta acción');

    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm)
      });
      if (res.ok) {
        setShowProductModal(false);
        fetchProducts();
        alert('Producto guardado exitosamente');
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (role !== 'ADMIN') return alert('Acceso denegado');
    if (!window.confirm('¿Está seguro de eliminar este producto del catálogo?')) return;

    try {
      const res = await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts();
        alert('Producto eliminado');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------
  // SUPPLIER & COMPRAS LOGIC (REABASTECIMIENTO)
  // -------------------------------------------------------------
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supplierForm)
      });
      if (res.ok) {
        setShowSupplierModal(false);
        setSupplierForm({ id: null, name: '', nit: '', phone: '', email: '', contact_name: '' });
        fetchSuppliers();
        alert('Proveedor guardado exitosamente');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addPurchaseItem = () => {
    const { product_id, quantity, unit_price } = purchaseForm.currentItem;
    if (!product_id || !quantity || !unit_price) return alert('Llene todos los datos de producto');

    const product = products.find(p => p.id === parseInt(product_id));
    if (!product) return;

    const newItem = {
      product_id: parseInt(product_id),
      name: product.name,
      quantity: parseFloat(quantity),
      unit_price: parseFloat(unit_price),
      subtotal: parseFloat(quantity) * parseFloat(unit_price)
    };

    setPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, newItem],
      currentItem: { product_id: '', quantity: '', unit_price: '' }
    }));
  };

  const removePurchaseItem = (idx) => {
    setPurchaseForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const handleSavePurchase = async () => {
    const { supplier_id, items } = purchaseForm;
    if (!supplier_id || items.length === 0) return alert('Seleccione un proveedor y añada al menos un producto.');

    const totalPurchase = items.reduce((sum, item) => sum + item.subtotal, 0);

    try {
      const res = await fetch(`${API_BASE}/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: parseInt(supplier_id),
          total: totalPurchase,
          items: items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
        })
      });

      if (res.ok) {
        alert('Compra y reabastecimiento de inventario registrados correctamente.');
        setPurchaseForm({
          supplier_id: '',
          items: [],
          currentItem: { product_id: '', quantity: '', unit_price: '' }
        });
        fetchProducts();
      } else {
        alert('Error al registrar la compra');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------
  // OTHER GENERAL HELPERS & LOGICS
  // -------------------------------------------------------------
  const handleTtsToggle = (checked) => {
    setTtsEnabled(checked);
    speechQueue.setEnabled(checked);
  };

  const handleVoiceChange = (e) => {
    const voiceName = e.target.value;
    setSelectedVoice(voiceName);
    speechQueue.setVoice(voiceName);
  };

  const handleSpeechRateChange = (e) => {
    const val = parseFloat(e.target.value);
    setSpeechRate(val);
    speechQueue.setRate(val);
  };

  const toggleRole = () => {
    if (role === 'OPERATOR') {
      setShowPinModal(true);
      setPinInput('');
      setPinError('');
    } else {
      setRole('OPERATOR');
    }
  };

  const handleVerifyPin = () => {
    if (pinInput === '1234') {
      setRole('ADMIN');
      setShowPinModal(false);
    } else {
      setPinError('PIN incorrecto. Intente con 1234.');
    }
  };

  // Simulator for Gmail Payments
  const handleSimulate = async (e) => {
    e.preventDefault();
    try {
      const cleanAmount = simAmount.replace(/\./g, '');
      const refCode = simRef || Math.floor(1000000000 + Math.random() * 9000000000).toString();
      
      const res = await fetch(`${API_BASE}/simulate-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name: simBank,
          client_name: simClient,
          amount: cleanAmount,
          reference: refCode,
          is_valid: simIsValid
        })
      });
      if (res.ok) {
        setSimRef('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Manual Correction logic for failed parse rows
  const openCorrectionModal = (payment) => {
    setPaymentToCorrect(payment);
    setCorrectionForm({
      id: payment.id,
      client_name: payment.client_name === 'ERROR DE PARSEO' ? '' : payment.client_name,
      amount: payment.amount === 0 ? '' : payment.amount.toString(),
      reference: payment.reference === 'ERROR' ? '' : payment.reference,
      payment_date: payment.payment_date || new Date().toLocaleString()
    });
    setShowCorrectionModal(true);
  };

  const handleSaveCorrection = async (e) => {
    e.preventDefault();
    if (role !== 'ADMIN') return alert('Solo administradores pueden realizar esta acción');

    try {
      const res = await fetch(`${API_BASE}/payments/manual-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctionForm)
      });
      if (res.ok) {
        setShowCorrectionModal(false);
        setPaymentToCorrect(null);
        // El socket refrescará la lista automáticamente
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Currency formater
  const formatCOP = (val) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      {/* -------------------------------------------------------------
         HEADER
         ------------------------------------------------------------- */}
      <header className="main-header">
        <div className="brand">
          <span className="brand-logo">🧀</span>
          <div className="brand-title">
            QUESOS UBATE
            <span className="brand-subtitle">POS & Caja Automatizada</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-menu">
          <button 
            className={`nav-item ${activeTab === 'pos' ? 'active' : ''}`}
            onClick={() => setActiveTab('pos')}
          >
            <ShoppingCart size={18} />
            POS Caja
          </button>
          <button 
            className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            <Package size={18} />
            Inventario
          </button>
          <button 
            className={`nav-item ${activeTab === 'suppliers' ? 'active' : ''}`}
            onClick={() => setActiveTab('suppliers')}
          >
            <Users size={18} />
            Proveedores y Entradas
          </button>
          <button 
            className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <TrendingUp size={18} />
            Reportes Ventas
          </button>
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            Escáner Gmail
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            Config Gmail
          </button>
          <button 
            className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => { setActiveTab('logs'); fetchLogs(); }}
          >
            <Terminal size={18} />
            Auditoría
          </button>
        </nav>

        <div className="header-actions">
          <div className="system-status">
            <span className={`status-dot ${gmailConnected ? 'online' : (gmailConfigured ? 'configuring' : 'offline')}`}></span>
            <span>Gmail: {gmailConnected ? 'Verificando' : (gmailConfigured ? 'Requiere Token' : 'Sin Configurar')}</span>
          </div>
          
          <div className="user-session-pill">
            <User size={14} className="text-sky-400" />
            <span className="session-code">{currentUser?.cashierCode || 'CAJERO'}</span>
            
            <button 
              className={`role-badge ${role === 'ADMIN' ? 'admin' : 'operator'}`}
              onClick={toggleRole}
              title="Cambiar rol (requiere PIN)"
            >
              <Shield size={13} />
              {role === 'ADMIN' ? 'Admin' : 'Operario'}
            </button>

            <button 
              className="btn-logout"
              onClick={handleLogout}
              title="Cerrar sesión del sistema"
            >
              <LogOut size={13} />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------
         CONTENT CONTAINER
         ------------------------------------------------------------- */}
      <main className="content-layout">
        
        {/* -------------------------------------------------------------
           TAB 1: TERMINAL POS (CAJA)
           ------------------------------------------------------------- */}
        {activeTab === 'pos' && (
          <div className="pos-layout">
            {/* Catalogo de productos */}
            <div className="pos-catalog">
              {/* Categorías */}
              <div className="pos-categories">
                {['Todos', 'Quesos', 'Lácteos', 'Dulces', 'Acompañantes', 'Otros'].map(cat => (
                  <button 
                    key={cat} 
                    className={`category-tab ${posCategory === cat ? 'active' : ''}`}
                    onClick={() => setPosCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Buscador de productos */}
              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Escriba para buscar por nombre o código..."
                    value={posSearch}
                    onChange={(e) => setPosSearch(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--color-text-muted)' }} />
                </div>
              </div>

              {/* Cuadrícula de productos */}
              <div className="products-grid">
                {products
                  .filter(p => posCategory === 'Todos' || p.category === posCategory)
                  .filter(p => p.name.toLowerCase().includes(posSearch.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(posSearch.toLowerCase())))
                  .map(p => {
                    const isLow = p.stock > 0 && p.stock <= p.min_stock;
                    const isEmpty = p.stock <= 0;
                    return (
                      <div 
                        key={p.id} 
                        className="glass-card product-pos-card"
                        onClick={() => addToCart(p)}
                      >
                        <div className="product-pos-name">{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                          U.M: {p.unit}
                        </div>
                        <div className="product-pos-meta">
                          <div className="product-pos-price">{formatCOP(p.price)}</div>
                          <span className={`product-pos-stock ${isEmpty ? 'stock-empty' : (isLow ? 'stock-low' : 'stock-ok')}`}>
                            {isEmpty ? 'Agotado' : `Stock: ${p.stock}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Carrito de Compras (Lateral) */}
            <div className="glass-card pos-sidebar">
              <h3 className="cart-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingCart size={20} className="color-primary" />
                  <span>Pedido Actual</span>
                </div>
                {cart.length > 0 && (
                  <button 
                    className="btn btn-danger" 
                    onClick={() => setCart([])}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Limpiar
                  </button>
                )}
              </h3>

              <div className="cart-items-list">
                {cart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-secondary)' }}>
                    <ShoppingCart size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>Haga clic en los productos a la izquierda para cargarlos al pedido.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="cart-item-row">
                      <div className="cart-item-info">
                        <div className="cart-item-name">{item.name}</div>
                        <div className="cart-item-price">{formatCOP(item.price)} x {item.unit}</div>
                      </div>
                      
                      <div className="cart-item-controls">
                        <button className="cart-qty-btn" onClick={() => updateCartQty(item.id, -1)}>-</button>
                        <span className="cart-qty-val">{item.quantity}</span>
                        <button className="cart-qty-btn" onClick={() => updateCartQty(item.id, 1)}>+</button>
                        <div className="cart-item-subtotal">{formatCOP(item.subtotal)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="cart-summary">
                <div className="cart-summary-line">
                  <span>Productos en carrito:</span>
                  <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="cart-summary-line total">
                  <span>Total a Pagar:</span>
                  <span>{formatCOP(cartTotal)}</span>
                </div>
              </div>

              <button 
                className="btn btn-primary" 
                disabled={cart.length === 0}
                onClick={() => {
                  setCheckoutForm({
                    client_name: '',
                    client_document: '',
                    payment_method: 'Efectivo',
                    payment_reference: '',
                    cashReceived: ''
                  });
                  setSelectedPaymentLink(null);
                  setShowCheckoutModal(true);
                }}
                style={{ marginTop: '1rem', width: '100%', padding: '1rem' }}
              >
                Cobrar y Registrar (F10)
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
           TAB 2: INVENTARIO DE PRODUCTOS
           ------------------------------------------------------------- */}
        {activeTab === 'inventory' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                <Package size={20} className="color-primary" />
                Inventario General de Quesos y Productos
              </h2>
              {role === 'ADMIN' && (
                <button className="btn btn-primary" onClick={() => openProductForm(null)}>
                  <Plus size={16} /> Agregar Nuevo Producto
                </button>
              )}
            </div>

            {role !== 'ADMIN' && (
              <div className="status-badge error" style={{ display: 'flex', width: 'fit-content', gap: '0.5rem', marginBottom: '1rem' }}>
                <AlertTriangle size={14} />
                <span>Vista de solo lectura. Solo el Administrador puede editar los precios, costos o registrar productos nuevos.</span>
              </div>
            )}

            <div className="table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>SKU / Código</th>
                    <th>Nombre del Producto</th>
                    <th>Categoría</th>
                    <th>Existencias</th>
                    <th>Mínimo Requerido</th>
                    <th>U. Medida</th>
                    <th>Costo Unitario</th>
                    <th>Precio de Venta</th>
                    {role === 'ADMIN' && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const stockVal = parseFloat(p.stock);
                    const minStockVal = parseFloat(p.min_stock);
                    let semaphore = 'green';
                    if (stockVal === 0) semaphore = 'red';
                    else if (stockVal <= minStockVal) semaphore = 'orange';

                    return (
                      <tr key={p.id}>
                        <td>
                          <span className={`stock-semaphore ${semaphore}`}></span>
                          {stockVal === 0 ? 'Sin existencias' : (stockVal <= minStockVal ? 'Stock Crítico' : 'Óptimo')}
                        </td>
                        <td><code>{p.sku || 'N/A'}</code></td>
                        <td style={{ fontWeight: 'bold' }}>{p.name}</td>
                        <td>{p.category}</td>
                        <td>{p.stock}</td>
                        <td>{p.min_stock}</td>
                        <td>{p.unit}</td>
                        <td>{formatCOP(p.cost)}</td>
                        <td style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>{formatCOP(p.price)}</td>
                        {role === 'ADMIN' && (
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button 
                                className="btn btn-secondary btn-icon-only"
                                onClick={() => openProductForm(p)}
                                title="Editar"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button 
                                className="btn btn-danger btn-icon-only"
                                onClick={() => handleDeleteProduct(p.id)}
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
           TAB 3: PROVEEDORES Y ENTRADAS (REABASTECIMIENTO)
           ------------------------------------------------------------- */}
        {activeTab === 'suppliers' && (
          <div className="parsers-layout">
            {/* Gestión de proveedores */}
            <div className="pos-catalog">
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                    <Users size={18} className="color-primary" />
                    Proveedores Registrados
                  </h3>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setShowSupplierModal(true)}>
                    <Plus size={12} /> Proveedor
                  </button>
                </div>

                <div className="parsers-list" style={{ maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                  {suppliers.map(s => (
                    <div key={s.id} className="glass-card parser-item-card" style={{ cursor: 'default' }}>
                      <div className="parser-item-info">
                        <div className="parser-item-name">{s.name}</div>
                        <div className="parser-item-email">NIT: {s.nit || 'Sin Nit'} | Tel: {s.phone}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Contacto: {s.contact_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Registrar Entrada de Compras */}
            <div className="glass-card">
              <h3 className="section-title">
                <Layers size={18} className="color-accent" />
                Registrar Compra / Ingreso de Mercancía (Stock)
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Seleccionar Proveedor</label>
                  <select 
                    className="form-select"
                    value={purchaseForm.supplier_id}
                    onChange={(e) => setPurchaseForm({...purchaseForm, supplier_id: e.target.value})}
                  >
                    <option value="">-- Elija un Proveedor --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Formulario Añadir producto a compra */}
              <div 
                style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '1rem',
                  marginBottom: '1rem'
                }}
              >
                <span className="form-label" style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>Agregar Producto al Detalle de Compra</span>
                
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Producto</label>
                    <select 
                      className="form-select"
                      value={purchaseForm.currentItem.product_id}
                      onChange={(e) => setPurchaseForm({
                        ...purchaseForm,
                        currentItem: { ...purchaseForm.currentItem, product_id: e.target.value }
                      })}
                      style={{ padding: '0.5rem' }}
                    >
                      <option value="">-- Elegir --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Cantidad</label>
                    <input 
                      type="number" 
                      className="form-input"
                      value={purchaseForm.currentItem.quantity}
                      onChange={(e) => setPurchaseForm({
                        ...purchaseForm,
                        currentItem: { ...purchaseForm.currentItem, quantity: e.target.value }
                      })}
                      placeholder="Ej. 10"
                      style={{ padding: '0.5rem' }}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Costo Compra Unitario</label>
                    <input 
                      type="number" 
                      className="form-input"
                      value={purchaseForm.currentItem.unit_price}
                      onChange={(e) => setPurchaseForm({
                        ...purchaseForm,
                        currentItem: { ...purchaseForm.currentItem, unit_price: e.target.value }
                      })}
                      placeholder="Ej. 8500"
                      style={{ padding: '0.5rem' }}
                    />
                  </div>

                  <button className="btn btn-secondary" onClick={addPurchaseItem} style={{ height: '38px', padding: '0.5rem 1rem' }}>
                    Añadir
                  </button>
                </div>
              </div>

              {/* Items agregados a la compra */}
              <div className="table-wrapper" style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '1rem' }}>
                <table className="history-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Costo Unitario</th>
                      <th>Subtotal</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseForm.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textalign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>
                          No se han añadido productos a la compra.
                        </td>
                      </tr>
                    ) : (
                      purchaseForm.items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                          <td>{item.quantity}</td>
                          <td>{formatCOP(item.unit_price)}</td>
                          <td style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>{formatCOP(item.subtotal)}</td>
                          <td>
                            <button className="btn btn-danger btn-icon-only" style={{ padding: '0.2rem' }} onClick={() => removePurchaseItem(idx)}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                  Total Compra: <span style={{ color: 'var(--color-success)' }}>{formatCOP(purchaseForm.items.reduce((sum, item) => sum + item.subtotal, 0))}</span>
                </div>
                <button 
                  className="btn btn-primary" 
                  disabled={purchaseForm.items.length === 0 || !purchaseForm.supplier_id}
                  onClick={handleSavePurchase}
                >
                  <Save size={16} /> Guardar Compra e Ingresar Stock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
           TAB 4: REPORTES DE VENTAS E INFORMACION COMERCIAL
           ------------------------------------------------------------- */}
        {activeTab === 'reports' && dashboardStats && (
          <div>
            {/* KPI Cards */}
            <div className="stats-summary-grid">
              <div className="glass-card stat-widget">
                <div className="stat-widget-icon blue">
                  <DollarSign size={24} />
                </div>
                <div className="stat-widget-details">
                  <div className="stat-widget-value">{formatCOP(dashboardStats.summary.totalSales)}</div>
                  <div className="stat-widget-label">Facturado (Total Histórico)</div>
                </div>
              </div>

              <div className="glass-card stat-widget">
                <div className="stat-widget-icon green">
                  <TrendingUp size={24} />
                </div>
                <div className="stat-widget-details">
                  <div className="stat-widget-value">{formatCOP(dashboardStats.summary.totalProfits)}</div>
                  <div className="stat-widget-label">Utilidad Bruta Estimada</div>
                </div>
              </div>

              <div className="glass-card stat-widget">
                <div className="stat-widget-icon amber">
                  <Layers size={24} />
                </div>
                <div className="stat-widget-details">
                  <div className="stat-widget-value">{dashboardStats.summary.totalTransactions}</div>
                  <div className="stat-widget-label">Transacciones (Pedidos)</div>
                </div>
              </div>

              <div className="glass-card stat-widget">
                <div className="stat-widget-icon rose">
                  <AlertTriangle size={24} />
                </div>
                <div className="stat-widget-details">
                  <div className="stat-widget-value">{dashboardStats.summary.lowStockCount}</div>
                  <div className="stat-widget-label">Alertas de Stock Bajo</div>
                </div>
              </div>
            </div>

            {/* Dashboard Graphics */}
            <div className="chart-container-grid">
              
              {/* Daily Sales trend */}
              <div className="glass-card analytics-card">
                <h3 className="analytics-card-title">Tendencia de Ventas (Últimos Días de Actividad)</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  {dashboardStats.dailySales.length === 0 ? (
                    <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>Sin historial de ventas para graficar.</div>
                  ) : (
                    dashboardStats.dailySales.map(day => {
                      const maxDaily = Math.max(...dashboardStats.dailySales.map(d => d.dayTotal), 10000);
                      const percent = (day.dayTotal / maxDaily) * 100;
                      return (
                        <div key={day.dateDay} className="bar-chart-row">
                          <div className="bar-chart-labels">
                            <span style={{ fontWeight: 'bold' }}>{day.dateDay} ({day.txCount} trans.)</span>
                            <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>{formatCOP(day.dayTotal)}</span>
                          </div>
                          <div className="bar-chart-track">
                            <div className="bar-chart-fill" style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Payment Methods and Top Products */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Payment method representation */}
                <div className="glass-card analytics-card">
                  <h3 className="analytics-card-title">Ventas por Método de Pago</h3>
                  {dashboardStats.paymentMethods.length === 0 ? (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Aún no hay métodos de pago registrados.</div>
                  ) : (
                    dashboardStats.paymentMethods.map(m => {
                      const maxAmt = Math.max(...dashboardStats.paymentMethods.map(p => p.amount), 1);
                      const percent = (m.amount / maxAmt) * 100;
                      return (
                        <div key={m.payment_method} className="bar-chart-row">
                          <div className="bar-chart-labels">
                            <span>{m.payment_method} ({m.count} tx)</span>
                            <span style={{ fontWeight: 'bold' }}>{formatCOP(m.amount)}</span>
                          </div>
                          <div className="bar-chart-track">
                            <div className="bar-chart-fill success" style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Best selling products */}
                <div className="glass-card analytics-card">
                  <h3 className="analytics-card-title">Productos Más Vendidos (Top 5)</h3>
                  {dashboardStats.topProducts.length === 0 ? (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No hay ventas registradas.</div>
                  ) : (
                    dashboardStats.topProducts.map(p => {
                      const maxQty = Math.max(...dashboardStats.topProducts.map(tp => tp.totalQty), 1);
                      const percent = (p.totalQty / maxQty) * 100;
                      return (
                        <div key={p.name} className="bar-chart-row">
                          <div className="bar-chart-labels">
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }}>{p.name}</span>
                            <span style={{ fontWeight: 'bold' }}>{p.totalQty} unidades ({formatCOP(p.totalAmount)})</span>
                          </div>
                          <div className="bar-chart-track">
                            <div className="bar-chart-fill accent" style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            </div>
            
            {/* Inventory Valuation Details */}
            <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', textAlign: 'center' }}>
              <div>
                <h4 style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>VALOR TOTAL DEL INVENTARIO (COSTO)</h4>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--color-accent)' }}>
                  {formatCOP(dashboardStats.summary.inventoryCostValue)}
                </div>
                <small style={{ color: 'var(--color-text-muted)' }}>Lo invertido en mercancia actualmente en bodega.</small>
              </div>
              
              <div>
                <h4 style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>VALOR TOTAL DE INVENTARIO (VENTA)</h4>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--color-success)' }}>
                  {formatCOP(dashboardStats.summary.inventorySaleValue)}
                </div>
                <small style={{ color: 'var(--color-text-muted)' }}>Ganancia estimada al liquidar todas las existencias actuales.</small>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
           TAB 5: GMAIL SCANNER (NOTIFICACIONES DE CORREO EN TIEMPO REAL)
           ------------------------------------------------------------- */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-grid">
            
            {/* List of digital payments scanned */}
            <div>
              <h2 className="section-title">
                <Activity size={20} className="color-primary" />
                Monitoreo de Notificaciones Gmail (Tiempo Real)
              </h2>

              <div className="payments-list">
                {payments.length === 0 ? (
                  <div className="glass-card no-payments">
                    <span className="no-payments-icon">📥</span>
                    <h3>Esperando transacciones...</h3>
                    <p>No se han recibido notificaciones de pago aún. Puedes inyectar pagos ficticios usando el Simulador a la derecha.</p>
                  </div>
                ) : (
                  payments.map((payment) => {
                    const isNew = newPaymentIds.has(payment.id);
                    const isError = payment.status === 'ERROR_PARSING';
                    const bankClass = payment.bank_name.toLowerCase();
                    
                    return (
                      <div 
                        key={payment.id} 
                        className={`glass-card payment-card ${isNew ? 'new-pulse' : ''} ${isError ? 'error-parsing' : ''}`}
                      >
                        <div className="payment-card-left">
                          <div className={`bank-badge-container bank-${bankClass}`}>
                            {payment.bank_name.substring(0, 2).toUpperCase()}
                          </div>
                        </div>

                        <div className="payment-details">
                          <div className="payment-client">
                            {payment.client_name}
                          </div>
                          <div className="payment-meta">
                            <span className="payment-bank">{payment.bank_name}</span>
                            <span className="payment-ref">
                              Ref: {payment.reference}
                            </span>
                            <span className="payment-time">
                              {payment.payment_date}
                            </span>
                          </div>
                          {isError && (
                            <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.4rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <AlertTriangle size={12} />
                              Los datos no pudieron extraerse del correo original.
                            </div>
                          )}
                        </div>

                        <div className="payment-card-right">
                          <div className="payment-amount">
                            {isError ? 'Pendiente' : formatCOP(payment.amount)}
                          </div>
                          
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className={`status-badge ${isError ? 'error' : 'procesado'}`}>
                              {isError ? 'Error Parseo' : 'Verificado'}
                            </span>
                            {isError && role === 'ADMIN' && (
                              <button 
                                className="btn btn-secondary btn-icon-only"
                                onClick={() => openCorrectionModal(payment)}
                                title="Corregir datos manualmente"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#334155' }}
                              >
                                <Edit3 size={12} /> Corregir
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Voice controls and simulator */}
            <div className="simulator-panel">
              {/* Voz config */}
              <div className="glass-card">
                <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                  <Volume2 size={18} className="color-accent" />
                  Configuración de Voz (TTS)
                </h3>
                
                <div className="voice-controls">
                  <span className="voice-toggle-label">
                    {ttsEnabled ? <Volume2 size={16} style={{ color: 'var(--color-success)' }} /> : <VolumeX size={16} style={{ color: 'var(--color-error)' }} />}
                    Habilitar Alertador Auditivo
                  </span>
                  
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={ttsEnabled}
                      onChange={(e) => handleTtsToggle(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {ttsEnabled && (
                  <div className="voice-select-group">
                    <div style={{ marginTop: '0.75rem' }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Idioma y Voz</label>
                      <select 
                        className="form-select" 
                        value={selectedVoice} 
                        onChange={handleVoiceChange}
                        style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                      >
                        {voices.map((voice) => (
                          <option key={voice.name} value={voice.name}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ display: 'flex', justifycontent: 'space-between', marginBottom: '0.25rem' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', margin: 0 }}>Velocidad: {speechRate}x</label>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="1.5" 
                        step="0.05"
                        value={speechRate} 
                        onChange={handleSpeechRateChange}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <button 
                      className="btn btn-secondary" 
                      onClick={() => speechQueue.speak('Prueba de sistema de alertas de voz de Quesos Ubaté.')}
                      style={{ marginTop: '1rem', width: '100%', padding: '0.5rem', fontSize: '0.8rem' }}
                    >
                      <Play size={14} /> Probar Alerta de Voz
                    </button>
                  </div>
                )}
              </div>

              {/* Simulador */}
              <div className="glass-card">
                <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  <Play size={18} style={{ color: 'var(--color-primary)' }} />
                  Simulador de Correos de Pago
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
                  Inyecte correos simulados en la base de datos para probar la detección y vinculación del POS.
                </p>

                <form onSubmit={handleSimulate}>
                  <div className="form-group">
                    <label className="form-label">Entidad Bancaria</label>
                    <select 
                      className="form-select"
                      value={simBank}
                      onChange={(e) => setSimBank(e.target.value)}
                    >
                      <option value="Nequi">Nequi</option>
                      <option value="Daviplata">Daviplata</option>
                      <option value="Bancolombia">Bancolombia</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nombre del Cliente</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={simClient}
                      onChange={(e) => setSimClient(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Monto (COP)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={simAmount}
                        onChange={(e) => setSimAmount(e.target.value)}
                        placeholder="Ej. 50.000"
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Ref / Comprobante</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={simRef}
                        onChange={(e) => setSimRef(e.target.value)}
                        placeholder="Aleatorio si está vacío"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tipo de Notificación</label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="sim_valid" 
                          checked={simIsValid} 
                          onChange={() => setSimIsValid(true)} 
                        />
                        Pago Válido
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="sim_valid" 
                          checked={!simIsValid} 
                          onChange={() => setSimIsValid(false)} 
                        />
                        Fallo de Formato
                      </label>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    <Plus size={16} /> Enviar Pago Simulado
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
           TAB 6: CONFIGURACION DE GMAIL
           ------------------------------------------------------------- */}
        {activeTab === 'settings' && (
          <div className="glass-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 className="section-title">
              <Settings size={20} className="color-primary" />
              Integración con Gmail (OAuth 2.0)
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Configuración de credenciales de Google para la sincronización automática de correos.
            </p>

            {role !== 'ADMIN' ? (
              <div className="status-badge error" style={{ display: 'flex', width: 'fit-content', gap: '0.5rem', marginBottom: '1rem' }}>
                <AlertTriangle size={14} />
                <span>Acceso denegado. Cambie al rol de Administrador para editar la configuración de Gmail.</span>
              </div>
            ) : (
              <div>
                <div 
                  className="glass-card" 
                  style={{ 
                    background: gmailConnected ? 'rgba(16, 185, 129, 0.05)' : 'rgba(244, 63, 94, 0.05)', 
                    borderColor: gmailConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                    marginBottom: '2rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '1.1rem', color: gmailConnected ? 'var(--color-success)' : 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {gmailConnected ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                      Estado: {gmailConnected ? 'Conexión Activa con Gmail' : (gmailConfigured ? 'Requiere Autorización' : 'Sin Configurar')}
                    </h3>
                  </div>

                  <div>
                    {gmailConnected ? (
                      <button className="btn btn-danger" onClick={handleDisconnectGmail}>
                        Desconectar Cuenta
                      </button>
                    ) : (
                      gmailConfigured && (
                        <button className="btn btn-primary" onClick={handleConnectGmail}>
                          Autorizar y Conectar Cuenta
                        </button>
                      )
                    )}
                  </div>
                </div>

                <form onSubmit={handleSaveGmailConfig}>
                  <div className="form-group">
                    <label className="form-label">Client ID de Google Cloud</label>
                    <input 
                      type="text"
                      className="form-input"
                      value={gmailConfigForm.clientId}
                      onChange={(e) => setGmailConfigForm({...gmailConfigForm, clientId: e.target.value})}
                      placeholder="Ej. 1234567890-abcdef.apps.googleusercontent.com"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Client Secret</label>
                    <input 
                      type="password"
                      className="form-input"
                      value={gmailConfigForm.clientSecret}
                      onChange={(e) => setGmailConfigForm({...gmailConfigForm, clientSecret: e.target.value})}
                      placeholder="••••••••••••••••••••••••••••••••"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">URI de Redirección Autorizado</label>
                    <input 
                      type="text"
                      className="form-input"
                      value={gmailConfigForm.redirectUri}
                      onChange={(e) => setGmailConfigForm({...gmailConfigForm, redirectUri: e.target.value})}
                      required
                      readOnly
                    />
                  </div>

                  <button type="submit" className="btn btn-accent" style={{ marginTop: '0.5rem' }}>
                    <Save size={16} /> Guardar Credenciales
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------
           TAB 7: AUDIT LOGS
           ------------------------------------------------------------- */}
        {activeTab === 'logs' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                <Terminal size={20} className="color-primary" />
                Historial de Logs y Auditoría
              </h2>
              <button className="btn btn-secondary" onClick={fetchLogs}>
                <RefreshCw size={16} /> Actualizar Logs
              </button>
            </div>
            
            <div className="logs-console">
              {logs.map((log) => {
                const levelClass = log.level.toLowerCase();
                return (
                  <div key={log.id} className="log-line">
                    <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`log-level ${levelClass}`}>{log.level}</span>
                    <span className="log-msg">
                      {log.message}
                      {log.details && (
                        <span style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                          Detalle: {log.details}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* -------------------------------------------------------------
         MODALS SECTIONS
         ------------------------------------------------------------- */}

      {/* 1. Modal PIN Roles */}
      {showPinModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              <Shield size={20} className="color-accent" />
              Verificación de Administrador
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Ingrese el PIN de seguridad (1234) para cambiar al modo Administrador.
            </p>
            
            <div className="form-group">
              <label className="form-label">PIN de Seguridad</label>
              <input 
                type="password" 
                className="form-input" 
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                maxLength={6}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyPin(); }}
                autoFocus
              />
              {pinError && <small style={{ color: 'var(--color-error)', display: 'block', marginTop: '0.4rem', fontWeight: 'bold' }}>{pinError}</small>}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowPinModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleVerifyPin}>Verificar</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Checkout Caja POS */}
      {showCheckoutModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <h3 className="modal-title">
              <CreditCard size={20} className="color-primary" />
              Procesar Cobro e Facturar
            </h3>
            
            <form onSubmit={handleCheckoutSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Nombre del Cliente</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={checkoutForm.client_name}
                    onChange={(e) => setCheckoutForm({...checkoutForm, client_name: e.target.value})}
                    placeholder="Cliente General"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Cédula / NIT</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={checkoutForm.client_document}
                    onChange={(e) => setCheckoutForm({...checkoutForm, client_document: e.target.value})}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Método de Pago</label>
                <select 
                  className="form-select"
                  value={checkoutForm.payment_method}
                  onChange={(e) => setCheckoutForm({...checkoutForm, payment_method: e.target.value})}
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                  <option value="Pago Digital">Pago Digital (Nequi / DaviPlata)</option>
                </select>
              </div>

              {/* Panel de Efectivo (Vueltas) */}
              {checkoutForm.payment_method === 'Efectivo' && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span>Total Compra:</span>
                    <strong style={{ color: 'var(--color-success)' }}>{formatCOP(cartTotal)}</strong>
                  </div>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Monto Recibido</label>
                    <input 
                      type="number"
                      className="form-input"
                      value={checkoutForm.cashReceived}
                      onChange={(e) => setCheckoutForm({...checkoutForm, cashReceived: e.target.value})}
                      placeholder="Ej. 50000"
                    />
                  </div>

                  {checkoutForm.cashReceived && parseFloat(checkoutForm.cashReceived) >= cartTotal && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                      <span>Cambio a devolver:</span>
                      <span style={{ color: 'var(--color-primary)' }}>{formatCOP(parseFloat(checkoutForm.cashReceived) - cartTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Panel de Pago Digital (Vincular Gmail Scan) */}
              {checkoutForm.payment_method === 'Pago Digital' && (
                <div className="payment-matcher-container">
                  <div className="payment-matcher-title">
                    <Layers size={12} /> Vincular Transferencia Entrante (Scanner Gmail)
                  </div>
                  
                  <div className="payment-matcher-list">
                    {payments
                      .filter(p => p.status === 'PROCESADO')
                      .slice(0, 10)
                      .map(p => {
                        const isSelected = selectedPaymentLink === p.id;
                        return (
                          <div 
                            key={p.id} 
                            className={`payment-matcher-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelectPaymentLink(p)}
                          >
                            <div>
                              <strong>{p.client_name}</strong> ({p.bank_name})
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                              <span>Ref: {p.reference}</span>
                              <strong style={{ color: 'var(--color-success)' }}>{formatCOP(p.amount)}</strong>
                            </div>
                          </div>
                        );
                      })}
                    {payments.filter(p => p.status === 'PROCESADO').length === 0 && (
                      <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem', padding: '1rem' }}>
                        No se han escaneado pagos válidos recientemente.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCheckoutModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar Venta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Imprimir Factura (Ticket Térmico) */}
      {printedSale && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '380px', padding: '1rem', background: '#e2e8f0' }}>
            <div className="invoice-print-container">
              <div className="invoice-header">
                <h2>QUESOS UBATE</h2>
                <div style={{ fontSize: '0.75rem' }}>Especialidad en Lácteos y Dulces</div>
                <div style={{ fontSize: '0.7rem' }}>Ubaté, Cundinamarca - Colombia</div>
                <div style={{ fontSize: '0.7rem' }}>Tel: 312 4567890</div>
              </div>

              <div className="invoice-divider"></div>

              <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                <div><strong>Factura Nro:</strong> {printedSale.invoice_number}</div>
                <div><strong>Fecha:</strong> {new Date(printedSale.created_at).toLocaleString()}</div>
                <div><strong>Cliente:</strong> {printedSale.client_name}</div>
                {printedSale.client_document && <div><strong>Doc:</strong> {printedSale.client_document}</div>}
                <div><strong>Pago:</strong> {printedSale.payment_method}</div>
                {printedSale.payment_reference && <div><strong>Ref. Pago:</strong> {printedSale.payment_reference}</div>}
              </div>

              <div className="invoice-divider"></div>

              <table className="invoice-details-table">
                <thead>
                  <tr>
                    <th>Prod</th>
                    <th style={{ textAlign: 'center' }}>Cant</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printedSale.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.product_name}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatCOP(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="invoice-divider"></div>

              <div className="invoice-totals">
                <div className="invoice-total-line grand">
                  <span>TOTAL A PAGAR:</span>
                  <span>{formatCOP(printedSale.total)}</span>
                </div>
              </div>

              <div className="invoice-footer">
                <p>¡Gracias por su compra!</p>
                <p>Quesos Ubaté - Calidad de Campo</p>
                <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: '#666' }}>
                  Verificado Electrónicamente
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '1rem', justifyContent: 'center' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => window.print()}
                style={{ background: '#0284c7', color: 'white' }}
              >
                <Printer size={16} /> Imprimir Recibo
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setPrintedSale(null)}
                style={{ background: '#64748b', color: 'white' }}
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal Formularios Producto (Inventario) */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h3 className="modal-title">
              <Package size={20} className="color-primary" />
              {productForm.id ? 'Editar Producto' : 'Registrar Nuevo Producto'}
            </h3>

            <form onSubmit={handleSaveProduct}>
              <div className="form-group">
                <label className="form-label">Nombre del Producto</label>
                <input 
                  type="text"
                  className="form-input"
                  value={productForm.name}
                  onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">SKU / Código</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({...productForm, sku: e.target.value})}
                    placeholder="Ej. Q001"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select 
                    className="form-select"
                    value={productForm.category}
                    onChange={(e) => setProductForm({...productForm, category: e.target.value})}
                  >
                    <option value="Quesos">Quesos</option>
                    <option value="Lácteos">Lácteos</option>
                    <option value="Dulces">Dulces</option>
                    <option value="Acompañantes">Acompañantes</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Precio de Venta</label>
                  <input 
                    type="number"
                    className="form-input"
                    value={productForm.price}
                    onChange={(e) => setProductForm({...productForm, price: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Costo Adquisición</label>
                  <input 
                    type="number"
                    className="form-input"
                    value={productForm.cost}
                    onChange={(e) => setProductForm({...productForm, cost: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Stock Actual</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={productForm.stock}
                    onChange={(e) => setProductForm({...productForm, stock: e.target.value})}
                    disabled={productForm.id !== null} // Bloquear para editar en compras
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mínimo Stock</label>
                  <input 
                    type="number"
                    className="form-input"
                    value={productForm.min_stock}
                    onChange={(e) => setProductForm({...productForm, min_stock: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Unidad de Medida</label>
                  <select 
                    className="form-select"
                    value={productForm.unit}
                    onChange={(e) => setProductForm({...productForm, unit: e.target.value})}
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Bloque">Bloque</option>
                    <option value="Kg">Kg</option>
                    <option value="Botella">Botella</option>
                    <option value="Vaso">Vaso</option>
                    <option value="Caja">Caja</option>
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowProductModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Producto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Formularios Proveedor */}
      {showSupplierModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              <Users size={20} className="color-primary" />
              Registrar Proveedor
            </h3>

            <form onSubmit={handleSaveSupplier}>
              <div className="form-group">
                <label className="form-label">Nombre del Proveedor</label>
                <input 
                  type="text"
                  className="form-input"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({...supplierForm, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">NIT</label>
                <input 
                  type="text"
                  className="form-input"
                  value={supplierForm.nit}
                  onChange={(e) => setSupplierForm({...supplierForm, nit: e.target.value})}
                  placeholder="Ej. 800.123.456-7"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({...supplierForm, phone: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre Contacto</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={supplierForm.contact_name}
                    onChange={(e) => setSupplierForm({...supplierForm, contact_name: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input 
                  type="email"
                  className="form-input"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSupplierModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal Corrección de Errores Gmail (Scanner) */}
      {showCorrectionModal && paymentToCorrect && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h3 className="modal-title">
              <AlertTriangle size={20} className="color-error" />
              Corregir Datos del Pago Pendiente
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Este correo de <strong>{paymentToCorrect.bank_name}</strong> no pudo ser parseado automáticamente. 
              Consulte el correo original y digite los datos correctos para confirmarlo en caja.
            </p>

            <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--border-color)', maxHeight: '120px', overflowY: 'auto', marginBottom: '1.25rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              <strong>Texto original del correo:</strong><br />
              {paymentToCorrect.raw_body}
            </div>

            <form onSubmit={handleSaveCorrection}>
              <div className="form-group">
                <label className="form-label">Nombre del Cliente</label>
                <input 
                  type="text"
                  className="form-input"
                  value={correctionForm.client_name}
                  onChange={(e) => setCorrectionForm({...correctionForm, client_name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Monto (Pesos COP)</label>
                  <input 
                    type="number"
                    className="form-input"
                    value={correctionForm.amount}
                    onChange={(e) => setCorrectionForm({...correctionForm, amount: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia / Comprobante</label>
                  <input 
                    type="text"
                    className="form-input"
                    value={correctionForm.reference}
                    onChange={(e) => setCorrectionForm({...correctionForm, reference: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Fecha / Hora del Pago</label>
                <input 
                  type="text"
                  className="form-input"
                  value={correctionForm.payment_date}
                  onChange={(e) => setCorrectionForm({...correctionForm, payment_date: e.target.value})}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowCorrectionModal(false); setPaymentToCorrect(null); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--color-success)', color: '#fff' }}>
                  <Check size={16} /> Confirmar y Guardar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
