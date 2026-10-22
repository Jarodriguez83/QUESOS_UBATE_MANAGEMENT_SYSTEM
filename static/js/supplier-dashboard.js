(() => {
  const dataNode = document.querySelector('#supplier-chart-data');
  const trendRoot = document.querySelector('#supplier-trend-chart');
  const rankingRoot = document.querySelector('#supplier-ranking-chart');
  if (!dataNode || !trendRoot || !rankingRoot) return;

  const data = JSON.parse(dataNode.textContent);
  const money = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });
  const monthLabel = (key, options = { month: 'short' }) => new Intl.DateTimeFormat('es-CO', options)
    .format(new Date(`${key}-01T12:00:00Z`)).replace('.', '');
  const svgEl = (name, attrs = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  function drawTrend(count = 12) {
    const points = data.trend.slice(-count);
    const width = Math.max(320, trendRoot.clientWidth || 600);
    const height = 220;
    const pad = { top: 18, right: 16, bottom: 34, left: 58 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const max = Math.max(1, ...points.map(point => Number(point.total)));
    const niceMax = Math.ceil(max / (max >= 1000000 ? 1000000 : max >= 100000 ? 100000 : 10000))
      * (max >= 1000000 ? 1000000 : max >= 100000 ? 100000 : 10000);
    const x = index => pad.left + (points.length === 1 ? chartW / 2 : index * chartW / (points.length - 1));
    const y = value => pad.top + chartH - Number(value) / niceMax * chartH;
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'presentation', preserveAspectRatio: 'none' });

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = niceMax * tick / 4;
      const yy = y(value);
      svg.appendChild(svgEl('line', { x1: pad.left, x2: width - pad.right, y1: yy, y2: yy, class: 'chart-gridline' }));
      const label = svgEl('text', { x: pad.left - 8, y: yy + 4, 'text-anchor': 'end', class: 'chart-axis-label' });
      label.textContent = value === 0 ? '$0' : `$${new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
      svg.appendChild(label);
    }

    const coords = points.map((point, index) => [x(index), y(point.total)]);
    const areaPath = `M ${coords[0][0]} ${pad.top + chartH} `
      + coords.map(([xx, yy]) => `L ${xx} ${yy}`).join(' ')
      + ` L ${coords[coords.length - 1][0]} ${pad.top + chartH} Z`;
    svg.appendChild(svgEl('path', { d: areaPath, class: 'chart-area' }));
    svg.appendChild(svgEl('polyline', { points: coords.map(([xx, yy]) => `${xx},${yy}`).join(' '), class: 'chart-line' }));

    points.forEach((point, index) => {
      const [cx, cy] = coords[index];
      const group = svgEl('g', { class: 'chart-point', tabindex: '0', role: 'img',
        'aria-label': `${monthLabel(point.month, { month: 'long', year: 'numeric' })}: ${money.format(point.total)}` });
      const title = svgEl('title');
      title.textContent = `${monthLabel(point.month, { month: 'long', year: 'numeric' })}: ${money.format(point.total)}`;
      group.appendChild(title);
      group.appendChild(svgEl('circle', { cx, cy, r: 11, class: 'chart-point-hit' }));
      group.appendChild(svgEl('circle', { cx, cy, r: 4, class: 'chart-point-dot' }));
      svg.appendChild(group);
      const label = svgEl('text', { x: cx, y: height - 10, 'text-anchor': 'middle', class: 'chart-axis-label' });
      label.textContent = monthLabel(point.month);
      svg.appendChild(label);
    });
    trendRoot.replaceChildren(svg);
  }

  function selectSupplier(id) {
    document.querySelectorAll('.supplier-investment-row').forEach(row => {
      row.classList.toggle('is-selected', row.dataset.supplierId === String(id));
    });
    const row = document.querySelector(`.supplier-investment-row[data-supplier-id="${CSS.escape(String(id))}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function drawRanking() {
    const suppliers = data.suppliers.slice(0, 6);
    if (!suppliers.length) {
      const empty = document.createElement('p');
      empty.className = 'chart-empty';
      empty.textContent = 'Sin compras registradas este mes';
      rankingRoot.replaceChildren(empty);
      return;
    }
    const highest = Math.max(...suppliers.map(supplier => Number(supplier.total)));
    rankingRoot.replaceChildren(...suppliers.map((supplier, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ranking-item';
      button.setAttribute('aria-label', `Ver ${supplier.supplier_name}: ${money.format(supplier.total)}`);
      button.addEventListener('click', () => selectSupplier(supplier.supplier_id));
      const heading = document.createElement('span');
      heading.className = 'ranking-item-heading';
      const name = document.createElement('strong');
      name.textContent = supplier.supplier_name;
      const amount = document.createElement('span');
      amount.textContent = money.format(supplier.total);
      heading.append(name, amount);
      const track = document.createElement('span');
      track.className = 'ranking-track';
      const fill = document.createElement('span');
      fill.className = 'ranking-fill';
      fill.style.width = `${Number(supplier.total) / highest * 100}%`;
      fill.style.animationDelay = `${index * 70}ms`;
      track.appendChild(fill);
      button.append(heading, track);
      return button;
    }));
  }

  document.querySelectorAll('.chart-range button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.chart-range button').forEach(item => item.classList.toggle('active', item === button));
      drawTrend(Number(button.dataset.range));
    });
  });
  drawTrend();
  drawRanking();
  window.addEventListener('resize', () => drawTrend(document.querySelector('.chart-range button.active')?.dataset.range || 12));
})();
