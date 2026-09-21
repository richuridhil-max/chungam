/**
 * LUMIÈRE - HAUTE JOAILLERIE 3D SCROLL ENGINE
 * High-performance canvas sequence scrubber & synchronized text animation
 */

(function () {
  'use strict';

  // --- CONFIGURATION ---
  const TOTAL_FRAMES = 300;
  const FRAME_DIR = 'frames';
  const FRAME_PREFIX = 'ezgif-frame-';
  const FRAME_EXT = '.jpg';
  const MIN_FRAMES_TO_START = 5;

  // --- DOM ELEMENTS ---
  const preloader = document.getElementById('preloader');
  const progressBar = document.getElementById('progress-bar');
  const loaderPercent = document.getElementById('loader-percent');
  const loaderFrames = document.getElementById('loader-frames');
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const heroContainer = document.getElementById('hero-container');
  const pageProgressBar = document.getElementById('page-progress');

  // --- STATE ---
  const frames = [];
  let loadedCount = 0;
  let isLoaded = false;
  let targetFrame = 0;
  let currentFrame = 0;
  let lastDrawnFrame = -1;

  // --- 1. IMAGE PRELOADING SYSTEM ---
  function getFramePath(index) {
    const padded = String(index + 1).padStart(3, '0');
    return `${FRAME_DIR}/${FRAME_PREFIX}${padded}${FRAME_EXT}`;
  }

  function preloadImages() {
    // 1. Immediately load Frame 1
    const firstImg = new Image();
    firstImg.src = getFramePath(0);
    frames[0] = firstImg;

    firstImg.onload = () => {
      loadedCount++;
      renderFrame(0);
      updateLoader();

      // Launch smart priority download queue
      startSmartLoadingQueue();
    };

    firstImg.onerror = () => {
      // Fallback
      startSmartLoadingQueue();
    };

    // Safety timeout: Never let preloader block user for more than 1.5 seconds
    setTimeout(() => {
      if (!isLoaded) {
        onAllLoaded();
      }
    }, 1500);
  }

  function startSmartLoadingQueue() {
    // Priority order:
    // 1. First 10 frames (for immediate smooth scroll)
    // 2. Keyframes across the full sequence (every 5th frame: 15, 20, 25... 295)
    // 3. All remaining in-between frames
    const loadOrder = [];
    const added = new Set();
    added.add(0);

    for (let i = 1; i <= 10 && i < TOTAL_FRAMES; i++) {
      loadOrder.push(i);
      added.add(i);
    }

    for (let i = 15; i < TOTAL_FRAMES; i += 5) {
      if (!added.has(i)) {
        loadOrder.push(i);
        added.add(i);
      }
    }

    for (let i = 1; i < TOTAL_FRAMES; i++) {
      if (!added.has(i)) {
        loadOrder.push(i);
        added.add(i);
      }
    }

    const CONCURRENCY = 6;
    let nextQueueIdx = 0;

    function loadNext() {
      if (nextQueueIdx >= loadOrder.length) return;
      const frameIdx = loadOrder[nextQueueIdx++];
      const img = new Image();
      img.src = getFramePath(frameIdx);
      frames[frameIdx] = img;

      img.onload = () => {
        loadedCount++;
        updateLoader();
        // Repaint if the user is currently viewing this frame or adjacent frame
        if (Math.abs(Math.round(currentFrame) - frameIdx) <= 2) {
          renderFrame(Math.round(currentFrame), true);
        }
        loadNext();
      };

      img.onerror = () => {
        loadedCount++;
        loadNext();
      };
    }

    for (let c = 0; c < CONCURRENCY; c++) {
      loadNext();
    }
  }

  function updateLoader() {
    const pct = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (loaderPercent) loaderPercent.textContent = `${pct}%`;
    if (loaderFrames) loaderFrames.textContent = `${loadedCount} / ${TOTAL_FRAMES} Frames`;

    // Dismiss preloader as soon as the first few frames are ready
    if (loadedCount >= MIN_FRAMES_TO_START && !isLoaded) {
      onAllLoaded();
    }
  }

  function onAllLoaded() {
    if (isLoaded) return;
    isLoaded = true;
    setTimeout(() => {
      preloader.classList.add('fade-out');
      initCanvasSize();
      renderFrame(0);
    }, 200);
  }

  // --- 2. CANVAS RENDERING ENGINE (ASPECT-RATIO COVER) ---
  function initCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for smooth 60fps
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    lastDrawnFrame = -1; // Force repaint
    renderFrame(Math.round(currentFrame));
  }

  function renderFrame(index, force) {
    const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, index));
    if (clampedIndex === lastDrawnFrame && !force) return;

    // Find nearest loaded frame if current frame is not yet complete
    let img = frames[clampedIndex];
    if (!img || !img.complete || img.naturalWidth === 0) {
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const prev = clampedIndex - offset;
        const next = clampedIndex + offset;
        if (prev >= 0 && frames[prev] && frames[prev].complete && frames[prev].naturalWidth > 0) {
          img = frames[prev];
          break;
        }
        if (next < TOTAL_FRAMES && frames[next] && frames[next].complete && frames[next].naturalWidth > 0) {
          img = frames[next];
          break;
        }
      }
    }

    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Aspect-ratio "cover" logic: fills the screen while keeping proportional 16:9
    const scale = Math.max(cw / iw, ch / ih);
    const renderW = iw * scale;
    const renderH = ih * scale;
    const offsetX = (cw - renderW) / 2;
    const offsetY = (ch - renderH) / 2;

    ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
    lastDrawnFrame = clampedIndex;
  }

  // --- 3. SCROLL CALCULATION & INTERPOLATION (LERP) ---
  function getScrollProgress() {
    const rect = heroContainer.getBoundingClientRect();
    const scrollableDistance = heroContainer.offsetHeight - window.innerHeight;
    if (scrollableDistance <= 0) return 0;
    
    // rect.top goes from 0 to -scrollableDistance
    const progress = -rect.top / scrollableDistance;
    return Math.max(0, Math.min(1, progress));
  }

  function updateScrollState() {
    const progress = getScrollProgress();
    targetFrame = progress * (TOTAL_FRAMES - 1);

    // Update page progress bar
    if (pageProgressBar) {
      pageProgressBar.style.width = `${progress * 100}%`;
    }
  }

  // --- 5. MAIN 60FPS RAF LOOP ---
  function animationLoop() {
    // Smooth LERP interpolation: currentFrame slides toward targetFrame
    const diff = targetFrame - currentFrame;
    if (Math.abs(diff) > 0.01) {
      currentFrame += diff * 0.14; // Smooth spring dampening
    } else {
      currentFrame = targetFrame;
    }

    const roundedFrame = Math.round(currentFrame);
    renderFrame(roundedFrame);

    requestAnimationFrame(animationLoop);
  }



  // --- 8. EVENT LISTENERS ---
  window.addEventListener('scroll', updateScrollState, { passive: true });
  window.addEventListener('resize', initCanvasSize);

  // Keyboard navigation (Arrow keys scrub through sequence)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      const nextProgress = Math.min(1, getScrollProgress() + 0.05);
      const scrollableDistance = heroContainer.offsetHeight - window.innerHeight;
      window.scrollTo({ top: heroContainer.offsetTop + nextProgress * scrollableDistance, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      const prevProgress = Math.max(0, getScrollProgress() - 0.05);
      const scrollableDistance = heroContainer.offsetHeight - window.innerHeight;
      window.scrollTo({ top: heroContainer.offsetTop + prevProgress * scrollableDistance, behavior: 'smooth' });
    }
  });

  // --- INITIALIZE HERO ---
  preloadImages();
  initCanvasSize();
  updateScrollState();
  animationLoop();

  // ==========================================================
  // LUMIÈRE ATELIER - JEWELLERY COLLECTION & LUXURY FEATURES
  // ==========================================================

  // --- 1. DATASET: CURATED HIGH JEWELLERY ARCHIVE ---
  // --- 1. DATASET: CURATED HIGH JEWELLERY ARCHIVE ---
  const JEWELLERY_CATALOG = [
    {
      id: 'royal-bridal-choker',
      title: 'The Royal 22K Heritage Bridal Choker',
      category: 'necklaces',
      categoryLabel: '22K Royal Bridal Suite',
      tag: 'Heritage Masterpiece',
      priceUSD: 165000,
      carats: 28.50,
      totalCarats: '38.50 TCW',
      primaryGem: 'Natural Polki & Burmese Rubies',
      accents: 'South Sea Pearl Drop Fringes',
      metal: '22K Solid Yellow Gold',
      clarity: 'Pristine Royal Grade',
      cut: 'Traditional Polki & Cabochon',
      colorGrade: 'Rich Imperial Gold & Pigeon Red',
      certId: 'BIS 916 Hallmarked & IGI',
      hours: '340 Hours Master Goldsmithing',
      description: 'Hand-forged 22K gold bridal masterpiece adorned with uncut polki diamonds, natural rubies, and cascading pearl droplets for regal weddings and celebrations.',
      image: 'images/gold-bridal-necklace.jpg',
      fallbackGrad: 'linear-gradient(135deg, #382c13, #151006)'
    },
    {
      id: 'vendome-emerald-ring',
      title: 'The Vendôme Colombian Emerald Ring',
      category: 'rings',
      categoryLabel: 'High Joaillerie Solitaire',
      tag: 'Pièce Unique',
      priceUSD: 110000,
      carats: 8.40,
      totalCarats: '11.60 TCW',
      primaryGem: '8.40 ct Muzo Colombian Emerald',
      accents: 'Tapered Baguette & Pavé Diamonds',
      metal: '18K Yellow Gold & Platinum',
      clarity: 'Jardin Pristine / High Optic Life',
      cut: 'Royal Octagon Step Cut',
      colorGrade: 'Vivid Muzo Green / D-E Colorless',
      certId: 'SSEF #94012 & GIA',
      hours: '220 Hours Master Handcraft',
      description: 'Sourced from the legendary Muzo mines in Colombia. Boasts the coveted deep green velvety fire, mounted in a hand-sculpted two-tone gold cathedral.',
      image: 'images/emerald-cocktail-ring.jpg',
      fallbackGrad: 'linear-gradient(135deg, #0f2b18, #06140b)'
    },
    {
      id: 'celestial-star-solitaire',
      title: 'The Celestial Star Solitaire Ring',
      category: 'rings',
      categoryLabel: 'Solitaire Archives',
      tag: 'Solitaire Archive',
      priceUSD: 68500,
      carats: 4.15,
      totalCarats: '5.10 TCW',
      primaryGem: '4.15 ct Type IIa Colorless Diamond',
      accents: 'Platinum Knife-Edge Cathedral',
      metal: '950 Platinum',
      clarity: 'Internally Flawless (IF)',
      cut: 'Triple Excellent Round Brilliant',
      colorGrade: 'D Colorless (Zero Nitrogen)',
      certId: 'GIA #519302198',
      hours: '140 Hours Hand Finishing',
      description: 'An extraordinary Type IIa diamond of singular crystalline purity, suspended within our signature knife-edge cathedral setting with mirror-polished claw prongs.',
      image: 'images/diamond-solitaire-ring.jpg',
      fallbackGrad: 'linear-gradient(135deg, #212024, #0e0e11)'
    },
    {
      id: 'aura-rose-morganite',
      title: 'The Aura Rose Morganite Ring',
      category: 'rings',
      categoryLabel: 'Haute Cocktail Ring',
      tag: 'Limited Edition',
      priceUSD: 38500,
      carats: 7.80,
      totalCarats: '9.45 TCW',
      primaryGem: '7.80 ct Madagascar Peach Morganite',
      accents: 'Micro-Pavé Double Diamond Halo',
      metal: '18K Rose Gold',
      clarity: 'Eye Clean / Loupe Pristine',
      cut: 'Royal Cushion Brilliant Cut',
      colorGrade: 'Warm Sunset Peach',
      certId: 'GIA #731298412',
      hours: '160 Hours Master Handcraft',
      description: 'A luminous cushion morganite embraced by an intricate tiered double halo of micro-pavé diamonds on a hand-sculpted rose-gold openwork undergallery.',
      image: 'images/morganite-cocktail-ring.jpg',
      fallbackGrad: 'linear-gradient(135deg, #2a1a17, #120907)'
    },
    {
      id: 'royal-ceylon-sapphire-drops',
      title: 'The Royal Ceylon Cascade Earrings',
      category: 'earrings',
      categoryLabel: 'Haute Joaillerie Drops',
      tag: 'Pièce Unique',
      priceUSD: 58000,
      carats: 9.40,
      totalCarats: '13.20 TCW',
      primaryGem: '9.40 ct Unheated Ceylon Sapphires',
      accents: 'Articulated Marquise Diamonds',
      metal: '18K White Gold',
      clarity: 'VVS1 / Loupe Clean',
      cut: 'Pear Modified Brilliant Pair',
      colorGrade: 'Royal Velvet Cornflower Blue',
      certId: 'Gübelin #180402',
      hours: '190 Hours Master Handcraft',
      description: 'A peerless matched pair of unheated royal blue Ceylon sapphires cascading from architectural diamond clusters, engineered for kinetic shimmer with every movement.',
      image: 'images/sapphire-drop-earrings.jpg',
      fallbackGrad: 'linear-gradient(135deg, #101c2e, #070d16)'
    },
    {
      id: 'lumina-chandelier-earrings',
      title: 'The Lumina Diamond Chandelier Drops',
      category: 'earrings',
      categoryLabel: 'Red Carpet High Joaillerie',
      tag: 'Masterwork',
      priceUSD: 74000,
      carats: 11.20,
      totalCarats: '11.20 TCW',
      primaryGem: '11.20 TCW D-F Colorless Diamonds',
      accents: 'Cascading Pear & Marquise Tiers',
      metal: '950 Platinum',
      clarity: 'VVS1 - Flawless',
      cut: 'Pear & Marquise Brilliant Cuts',
      colorGrade: 'D - E Colorless',
      certId: 'GIA Laser Inscribed Line',
      hours: '210 Hours Precision Setting',
      description: 'Cascading articulated chandelier drops engineered for red carpet galas, featuring 48 hand-selected pear and marquise diamonds reflecting light at every angle.',
      image: 'images/diamond-chandelier-earrings.jpg',
      fallbackGrad: 'linear-gradient(135deg, #222226, #0d0d10)'
    },
    {
      id: 'constellation-tennis-bracelet',
      title: 'The Constellation Diamond Tennis Bracelet',
      category: 'bracelets',
      categoryLabel: 'Classic Haute Joaillerie Line',
      tag: 'Signature Classic',
      priceUSD: 46000,
      carats: 10.50,
      totalCarats: '10.50 TCW',
      primaryGem: '10.50 TCW Hearts & Arrows Diamonds',
      accents: 'Low-Profile Platinum Baskets',
      metal: '950 Platinum',
      clarity: 'VVS2 - D/E Color',
      cut: 'Hearts & Arrows Round Brilliant',
      colorGrade: 'Colorless D - E',
      certId: 'GIA Laser Inscribed Line',
      hours: '110 Hours Precision Assembly',
      description: 'Every single diamond is individually calibrated for identical diameter, crown angle, and optical dispersion, set into ultra-low profile four-prong platinum baskets.',
      image: 'images/diamond-tennis-bracelet.jpg',
      fallbackGrad: 'linear-gradient(135deg, #1f1f22, #0d0d0f)'
    },
    {
      id: 'imperial-heritage-gold-kada',
      title: 'The Imperial 22K Heritage Gold Kada',
      category: 'bracelets',
      categoryLabel: 'Artisan Repoussé Bangle',
      tag: 'Heritage Masterpiece',
      priceUSD: 39500,
      carats: 0.00,
      totalCarats: '92.4g Pure 22K Gold',
      primaryGem: 'Solid 22K (916) Hand-Forged Gold',
      accents: 'Hand-Carved Floral Repoussé',
      metal: '22K Solid Yellow Gold',
      clarity: 'Hallmarked 916 Pure',
      cut: 'Sculpted Artisan Relief',
      colorGrade: 'Deep Royal Gold Lustre',
      certId: 'BIS 916 Government Hallmarked',
      hours: '180 Hours Master Carving',
      description: 'An opulent royal heirloom cuff crafted from solid 22K gold, decorated with intricate antique repoussé flower motifs and polished beveled rims.',
      image: 'images/gold-artisan-bangle.jpg',
      fallbackGrad: 'linear-gradient(135deg, #362912, #161005)'
    },
    {
      id: 'south-sea-pearl-collier',
      title: 'The South Sea Pearl & Emerald Collier',
      category: 'necklaces',
      categoryLabel: 'Royal Archive Strand',
      tag: 'Pièce Unique',
      priceUSD: 88000,
      carats: 16.00,
      totalCarats: '12-14mm South Sea Pearls',
      primaryGem: 'Lustrous South Sea Cultured Pearls',
      accents: 'Art Deco Diamond & Emerald Clasp',
      metal: '18K White Gold',
      clarity: 'Mirror Lustre Grade AAA',
      cut: 'Perfect Spherical Graduation',
      colorGrade: 'Silky Silver-White Iridescent',
      certId: 'GIA Pearl Dossier',
      hours: '130 Hours Sorting & Hand-Knotting',
      description: 'Lustrous South Sea pearls of unblemished spherical perfection, individually silk-knotted and finished with a geometric diamond and Colombian emerald clasp.',
      image: 'images/pearl-diamond-necklace.jpg',
      fallbackGrad: 'linear-gradient(135deg, #252220, #0f0d0c)'
    },
    {
      id: 'burmese-ruby-nocturne',
      title: 'The Burmese Ruby Nocturne Collier',
      category: 'necklaces',
      categoryLabel: 'Haute Joaillerie Collier',
      tag: 'Museum Grade',
      priceUSD: 142000,
      carats: 8.50,
      totalCarats: '14.80 TCW',
      primaryGem: '8.50 ct Pigeon Blood Burmese Ruby',
      accents: 'Double Halo & Diamond Tennis Chain',
      metal: '18K White Gold & Platinum',
      clarity: 'Vivid Red Pristine',
      cut: 'Oval Mixed Cut Faceting',
      colorGrade: 'Unheated Pigeon Blood Red',
      certId: 'SSEF #78103 & Gübelin',
      hours: '240 Hours Master Handcraft',
      description: 'A museum-grade unheated Burmese ruby possessing fiery ultraviolet fluorescence, crowned by a double brilliant halo and suspended from a diamond riviere chain.',
      image: 'images/ruby-diamond-necklace.jpg',
      fallbackGrad: 'linear-gradient(135deg, #331119, #170408)'
    }
  ];

  // --- 2. MULTI-CURRENCY CONVERSION SYSTEM ---
  const WHATSAPP_NUMBER = '971501234567'; // Atelier Lumière Private Salon Line

  function openWhatsApp(message) {
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const CURRENCIES = {
    USD: { symbol: '$', rate: 1.0, position: 'before' },
    EUR: { symbol: '€', rate: 0.92, position: 'after' },
    GBP: { symbol: '£', rate: 0.78, position: 'before' },
    INR: { symbol: '₹', rate: 83.5, position: 'before' },
    AED: { symbol: 'AED ', rate: 3.67, position: 'before' }
  };

  let activeCurrency = 'USD';

  function formatPrice(usdAmount) {
    const config = CURRENCIES[activeCurrency] || CURRENCIES.USD;
    const converted = Math.round(usdAmount * config.rate);
    const formatted = converted.toLocaleString();
    return config.position === 'before' ? `${config.symbol}${formatted}` : `${formatted} ${config.symbol}`;
  }

  // Currency Selector Listener
  const currencySelect = document.getElementById('currency-select');
  if (currencySelect) {
    currencySelect.addEventListener('change', (e) => {
      activeCurrency = e.target.value;
      renderCollection();
      renderVault();
      updateBespokeValuation();
    });
  }

  // --- 3. PRIVATE CLIENT VAULT (WISHLIST) SYSTEM ---
  let vaultItems = [];
  try {
    const saved = localStorage.getItem('lumiere_vault');
    if (saved) vaultItems = JSON.parse(saved);
  } catch (err) {
    vaultItems = [];
  }

  function saveVault() {
    try {
      localStorage.setItem('lumiere_vault', JSON.stringify(vaultItems));
    } catch (err) {}
    updateVaultBadge();
  }

  function updateVaultBadge() {
    const badge = document.getElementById('vault-count-badge');
    const itemsCount = document.getElementById('vault-items-count');
    const count = vaultItems.length;

    if (badge) {
      badge.textContent = count;
      badge.classList.remove('bump');
      void badge.offsetWidth; // Trigger reflow
      badge.classList.add('bump');
    }
    if (itemsCount) {
      itemsCount.textContent = count;
    }
  }

  function isInVault(itemId) {
    return vaultItems.some((item) => item.id === itemId);
  }

  function toggleVaultItem(item) {
    const idx = vaultItems.findIndex((v) => v.id === item.id);
    if (idx >= 0) {
      vaultItems.splice(idx, 1);
      saveVault();
      renderVault();
      renderCollection();
      return false;
    } else {
      vaultItems.push({
        id: item.id,
        title: item.title,
        priceUSD: item.priceUSD,
        specs: item.primaryGem || item.totalCarats || item.metal,
        image: item.image
      });
      saveVault();
      renderVault();
      renderCollection();
      return true;
    }
  }

  // Vault Drawer Controls
  const navVaultBtn = document.getElementById('nav-vault-btn');
  const vaultDrawer = document.getElementById('vault-drawer');
  const vaultOverlay = document.getElementById('vault-overlay');
  const vaultCloseBtn = document.getElementById('vault-close-btn');
  const footerVaultLink = document.getElementById('footer-vault-link');
  const btnClearVault = document.getElementById('btn-clear-vault');
  const btnRequestVaultViewing = document.getElementById('btn-request-vault-viewing');

  function openVault() {
    renderVault();
    if (vaultDrawer) {
      vaultDrawer.classList.add('active');
      vaultDrawer.setAttribute('aria-hidden', 'false');
    }
    if (vaultOverlay) {
      vaultOverlay.classList.add('active');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeVault() {
    if (vaultDrawer) {
      vaultDrawer.classList.remove('active');
      vaultDrawer.setAttribute('aria-hidden', 'true');
    }
    if (vaultOverlay) {
      vaultOverlay.classList.remove('active');
    }
    document.body.style.overflow = '';
  }

  if (navVaultBtn) navVaultBtn.addEventListener('click', openVault);
  if (vaultCloseBtn) vaultCloseBtn.addEventListener('click', closeVault);
  if (vaultOverlay) vaultOverlay.addEventListener('click', closeVault);
  if (footerVaultLink) {
    footerVaultLink.addEventListener('click', (e) => {
      e.preventDefault();
      openVault();
    });
  }

  if (btnClearVault) {
    btnClearVault.addEventListener('click', () => {
      if (vaultItems.length === 0) return;
      vaultItems = [];
      saveVault();
      renderVault();
      renderCollection();
    });
  }

  if (btnRequestVaultViewing) {
    btnRequestVaultViewing.addEventListener('click', () => {
      if (vaultItems.length === 0) return;
      closeVault();
      const itemTitles = vaultItems.map(i => i.title).join(', ');
      setConciergeInquiry(`Private Vault Portfolio (${vaultItems.length} pieces): ${itemTitles}`);
      scrollToSection('concierge');
    });
  }

  function renderVault() {
    const container = document.getElementById('vault-items-container');
    const emptyState = document.getElementById('vault-empty-state');
    const footer = document.getElementById('vault-footer');
    const totalPriceEl = document.getElementById('vault-total-price');

    if (!container) return;

    container.innerHTML = '';
    let totalUSD = 0;

    if (vaultItems.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (footer) footer.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (footer) footer.style.display = 'block';

    vaultItems.forEach((item) => {
      totalUSD += item.priceUSD || 0;
      const card = document.createElement('div');
      card.className = 'vault-item-card';
      card.innerHTML = `
        <img src="${item.image}" alt="${item.title}" class="vault-item-thumb" onerror="this.src='ezgif-frame-001.png'">
        <div class="vault-item-info">
          <h4 class="vault-item-title">${item.title}</h4>
          <p class="vault-item-specs">${item.specs || ''}</p>
          <div class="vault-item-price">${formatPrice(item.priceUSD || 0)}</div>
        </div>
        <button type="button" class="vault-item-remove" title="Remove piece" data-remove-id="${item.id}">&times;</button>
      `;

      const removeBtn = card.querySelector('.vault-item-remove');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idToRemove = removeBtn.getAttribute('data-remove-id');
        const idx = vaultItems.findIndex(v => v.id === idToRemove);
        if (idx >= 0) {
          vaultItems.splice(idx, 1);
          saveVault();
          renderVault();
          renderCollection();
        }
      });

      container.appendChild(card);
    });

    if (totalPriceEl) {
      totalPriceEl.textContent = formatPrice(totalUSD);
    }
  }

  // --- 4. COLLECTION FILTERING & RENDERING ---
  let activeCategory = 'all';
  let searchQuery = '';
  let activeSort = 'featured';

  const collectionGrid = document.getElementById('collection-grid');
  const collectionEmpty = document.getElementById('collection-empty');
  const categoryTabs = document.querySelectorAll('.cat-pill');
  const searchInput = document.getElementById('collection-search');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const sortSelect = document.getElementById('collection-sort');
  const btnResetFilters = document.getElementById('btn-reset-filters');

  function renderCollection() {
    if (!collectionGrid) return;

    let filtered = JEWELLERY_CATALOG.filter((item) => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchQuery = !query ||
        item.title.toLowerCase().includes(query) ||
        item.primaryGem.toLowerCase().includes(query) ||
        item.metal.toLowerCase().includes(query) ||
        item.cut.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });

    // Sorting
    if (activeSort === 'price-desc') {
      filtered.sort((a, b) => b.priceUSD - a.priceUSD);
    } else if (activeSort === 'price-asc') {
      filtered.sort((a, b) => a.priceUSD - b.priceUSD);
    } else if (activeSort === 'carats') {
      filtered.sort((a, b) => b.carats - a.carats);
    }

    collectionGrid.innerHTML = '';

    if (filtered.length === 0) {
      if (collectionEmpty) collectionEmpty.classList.remove('hidden');
      return;
    } else {
      if (collectionEmpty) collectionEmpty.classList.add('hidden');
    }

    filtered.forEach((piece) => {
      const isSaved = isInVault(piece.id);
      const card = document.createElement('article');
      card.className = 'jewellery-card';
      card.setAttribute('data-id', piece.id);

      card.innerHTML = `
        <div class="card-visual-wrapper">
          <img src="${piece.image}" alt="${piece.title}" class="card-img" onerror="this.src='images/diamond-solitaire-ring.jpg'">
          <div class="card-shimmer-sweep"></div>
          <span class="card-tag-badge">${piece.tag}</span>
          <button type="button" class="card-vault-toggle ${isSaved ? 'saved' : ''}" title="${isSaved ? 'In Vault' : 'Save to Vault'}" data-action="vault" aria-label="Toggle Vault">
            ⚜
          </button>
        </div>

        <div class="card-content-wrap">
          <span class="card-category-sub">${piece.categoryLabel}</span>
          <h3 class="card-piece-title">${piece.title}</h3>
          
          <div class="card-specs-row">
            <span class="spec-chip">${piece.primaryGem}</span>
            <span class="spec-chip">${piece.metal}</span>
            <span class="spec-chip">${piece.cut}</span>
          </div>

          <div class="card-pricing-footer">
            <div class="card-price-display">
              <span class="price-num">${formatPrice(piece.priceUSD)}</span>
              <span class="price-tax-label">Atelier Inclusive</span>
            </div>
            
            <div class="card-buttons-row">
              <button type="button" class="btn-card-acquire" data-action="reserve">
                Acquire / Reserve
              </button>
              <button type="button" class="btn-card-whatsapp" data-action="whatsapp" title="Inquire on WhatsApp">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12.031 2c-5.513 0-9.99 4.477-9.99 9.99 0 1.76.459 3.477 1.332 4.996L2.05 22l5.176-1.358a9.96 9.96 0 0 0 4.805 1.233h.004c5.513 0 9.99-4.477 9.99-9.99A9.997 9.997 0 0 0 12.031 2zm0 18.283a8.28 8.28 0 0 1-4.22-1.151l-.303-.18-3.136.822.837-3.057-.197-.314a8.27 8.27 0 0 1-1.272-4.413c0-4.57 3.719-8.289 8.291-8.289 2.215 0 4.297.863 5.862 2.43a8.243 8.243 0 0 1 2.427 5.86c-.001 4.572-3.72 8.292-8.288 8.292zm4.542-6.205c-.249-.125-1.474-.727-1.703-.81-.228-.083-.395-.125-.561.125-.166.249-.644.81-.789.976-.145.166-.291.187-.54.062-.249-.125-1.052-.388-2.003-1.237-.74-.66-1.24-1.476-1.385-1.725-.145-.249-.015-.384.11-.508.112-.112.249-.291.374-.436.125-.145.166-.249.249-.415.083-.166.042-.312-.021-.436-.062-.125-.561-1.35-.769-1.85-.202-.488-.408-.422-.561-.43-.145-.008-.312-.01-.478-.01s-.436.062-.664.312c-.228.249-.873.852-.873 2.078s.893 2.41 1.018 2.577c.125.166 1.758 2.685 4.26 3.766.595.257 1.06.411 1.423.526.598.19 1.142.163 1.572.099.479-.072 1.474-.602 1.682-1.184.208-.582.208-1.08.145-1.184-.063-.104-.229-.166-.478-.291z"/></svg>
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      `;

      // Event Listeners for Card
      const visualWrap = card.querySelector('.card-visual-wrapper');
      const btnAcquire = card.querySelector('.btn-card-acquire');
      const btnWhatsapp = card.querySelector('.btn-card-whatsapp');
      const vaultToggle = card.querySelector('.card-vault-toggle');

      visualWrap.addEventListener('click', (e) => {
        if (e.target.closest('.card-vault-toggle')) return;
        setConciergeInquiry(`${piece.title} (${formatPrice(piece.priceUSD)})`);
        scrollToSection('concierge');
      });

      btnAcquire.addEventListener('click', () => {
        setConciergeInquiry(`${piece.title} (${formatPrice(piece.priceUSD)})`);
        scrollToSection('concierge');
      });

      if (btnWhatsapp) {
        btnWhatsapp.addEventListener('click', (e) => {
          e.stopPropagation();
          const msg = `Hello Atelier Lumière, I would like to inquire about ${piece.title} (${formatPrice(piece.priceUSD)}). Please share current availability and private salon viewing options.`;
          openWhatsApp(msg);
        });
      }

      vaultToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVaultItem(piece);
      });

      collectionGrid.appendChild(card);
    });
  }

  // Filter Buttons
  categoryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      categoryTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCategory = tab.getAttribute('data-category');
      renderCollection();
    });
  });

  // Search Input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (searchClearBtn) {
        searchClearBtn.classList.toggle('hidden', !searchQuery);
      }
      renderCollection();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      searchClearBtn.classList.add('hidden');
      renderCollection();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      activeSort = e.target.value;
      renderCollection();
    });
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      activeCategory = 'all';
      searchQuery = '';
      activeSort = 'featured';
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'featured';
      categoryTabs.forEach((t, i) => t.classList.toggle('active', i === 0));
      if (searchClearBtn) searchClearBtn.classList.add('hidden');
      renderCollection();
    });
  }

  // --- 5. INTERACTIVE BESPOKE ATELIER CONFIGURATOR ---
  const bespokeState = {
    metal: { id: 'white-gold', name: '18K White Gold', rate: 2800, color: '#e8e8e8' },
    gem: { id: 'morganite', name: 'Madagascar Morganite', caratPrice: 3200, color: '#f7b7a3', halo: 'rgba(247, 183, 163, 0.4)' },
    cut: { id: 'emerald', name: 'Emerald Step Cut', multiplier: 1.0 },
    carat: 3.50,
    setting: { id: 'halo', name: 'Micro-Pavé Double Halo', price: 4200 },
    engraving: ''
  };

  // Bespoke Canvas
  const bespokeCanvas = document.getElementById('bespoke-canvas');
  let bespokeCtx = bespokeCanvas ? bespokeCanvas.getContext('2d') : null;
  let bespokeLightAngle = { x: 0.3, y: -0.4 };

  function initBespokeCanvas() {
    if (!bespokeCanvas || !bespokeCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = bespokeCanvas.getBoundingClientRect();
    bespokeCanvas.width = (rect.width || 460) * dpr;
    bespokeCanvas.height = (rect.height || 380) * dpr;
    bespokeCtx.scale(dpr, dpr);
    renderBespokeJewel();
  }

  function renderBespokeJewel() {
    if (!bespokeCanvas || !bespokeCtx) return;
    const rect = bespokeCanvas.getBoundingClientRect();
    const w = rect.width || 460;
    const h = rect.height || 380;
    const cx = w / 2;
    const cy = h / 2 - 10;

    bespokeCtx.clearRect(0, 0, w, h);

    // Dynamic scale based on carat
    const baseRadius = 45 + (bespokeState.carat - 1.5) * 4.5;

    // 1. Draw Ring Shank (Precious Metal Band)
    const bandRadiusX = 110;
    const bandRadiusY = 130;
    bespokeCtx.save();
    bespokeCtx.beginPath();
    bespokeCtx.ellipse(cx, cy + 85, bandRadiusX, bandRadiusY, 0, Math.PI * 0.1, Math.PI * 0.9);
    bespokeCtx.lineWidth = 14;
    
    // Metal Gradient
    const metalGrad = bespokeCtx.createLinearGradient(cx - bandRadiusX, cy, cx + bandRadiusX, cy + 180);
    if (bespokeState.metal.id === 'white-gold' || bespokeState.metal.id === 'platinum') {
      metalGrad.addColorStop(0, '#f5f5f7');
      metalGrad.addColorStop(0.3, '#c2c2c8');
      metalGrad.addColorStop(0.6, '#ffffff');
      metalGrad.addColorStop(1, '#8c8c94');
    } else if (bespokeState.metal.id === 'yellow-gold') {
      metalGrad.addColorStop(0, '#ffec9e');
      metalGrad.addColorStop(0.3, '#d4a23b');
      metalGrad.addColorStop(0.6, '#fff4cc');
      metalGrad.addColorStop(1, '#8f671c');
    } else { // rose-gold
      metalGrad.addColorStop(0, '#ffd1c2');
      metalGrad.addColorStop(0.3, '#c97863');
      metalGrad.addColorStop(0.6, '#ffede6');
      metalGrad.addColorStop(1, '#823f30');
    }
    bespokeCtx.strokeStyle = metalGrad;
    bespokeCtx.lineCap = 'round';
    bespokeCtx.stroke();
    bespokeCtx.restore();

    // 2. Setting Accents (Halo or Baguettes)
    if (bespokeState.setting.id === 'halo') {
      bespokeCtx.save();
      const haloDots = 28;
      const haloRadius = baseRadius + 16;
      for (let i = 0; i < haloDots; i++) {
        const angle = (i / haloDots) * Math.PI * 2;
        const hx = cx + Math.cos(angle) * (bespokeState.cut.id === 'emerald' ? haloRadius * 1.05 : haloRadius);
        const hy = cy + Math.sin(angle) * (bespokeState.cut.id === 'emerald' ? haloRadius * 0.85 : haloRadius);
        
        bespokeCtx.beginPath();
        bespokeCtx.arc(hx, hy, 2.5, 0, Math.PI * 2);
        bespokeCtx.fillStyle = '#ffffff';
        bespokeCtx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        bespokeCtx.shadowBlur = 6;
        bespokeCtx.fill();
      }
      bespokeCtx.restore();
    } else if (bespokeState.setting.id === 'trilogy') {
      // Flanking side baguettes
      bespokeCtx.save();
      bespokeCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      bespokeCtx.strokeStyle = bespokeState.metal.color;
      bespokeCtx.lineWidth = 1.5;
      
      // Left Baguette
      bespokeCtx.beginPath();
      bespokeCtx.rect(cx - baseRadius - 28, cy - 14, 22, 28);
      bespokeCtx.fill();
      bespokeCtx.stroke();

      // Right Baguette
      bespokeCtx.beginPath();
      bespokeCtx.rect(cx + baseRadius + 6, cy - 14, 22, 28);
      bespokeCtx.fill();
      bespokeCtx.stroke();
      bespokeCtx.restore();
    }

    // 3. Centerpiece Gemstone Facets
    bespokeCtx.save();
    const gemColor = bespokeState.gem.color;
    
    // Gem Glow
    bespokeCtx.shadowColor = bespokeState.gem.halo;
    bespokeCtx.shadowBlur = 35;

    if (bespokeState.cut.id === 'emerald') {
      // Octagonal step cut
      const gw = baseRadius * 1.35;
      const gh = baseRadius * 1.05;
      const chamfer = 16;

      bespokeCtx.beginPath();
      bespokeCtx.moveTo(cx - gw + chamfer, cy - gh);
      bespokeCtx.lineTo(cx + gw - chamfer, cy - gh);
      bespokeCtx.lineTo(cx + gw, cy - gh + chamfer);
      bespokeCtx.lineTo(cx + gw, cy + gh - chamfer);
      bespokeCtx.lineTo(cx + gw - chamfer, cy + gh);
      bespokeCtx.lineTo(cx - gw + chamfer, cy + gh);
      bespokeCtx.lineTo(cx - gw, cy + gh - chamfer);
      bespokeCtx.lineTo(cx - gw, cy - gh + chamfer);
      bespokeCtx.closePath();

      const gemGrad = bespokeCtx.createRadialGradient(
        cx + bespokeLightAngle.x * 40, cy + bespokeLightAngle.y * 40, 5,
        cx, cy, gw
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.35, gemColor);
      gemGrad.addColorStop(1, '#0b0808');
      bespokeCtx.fillStyle = gemGrad;
      bespokeCtx.fill();

      // Step facets
      bespokeCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      bespokeCtx.lineWidth = 1.2;
      bespokeCtx.stroke();

      // Inner Table Octagon
      const iw = gw * 0.6;
      const ih = gh * 0.6;
      const ichamfer = 10;
      bespokeCtx.beginPath();
      bespokeCtx.moveTo(cx - iw + ichamfer, cy - ih);
      bespokeCtx.lineTo(cx + iw - ichamfer, cy - ih);
      bespokeCtx.lineTo(cx + iw, cy - ih + ichamfer);
      bespokeCtx.lineTo(cx + iw, cy + ih - ichamfer);
      bespokeCtx.lineTo(cx + iw - ichamfer, cy + ih);
      bespokeCtx.lineTo(cx - iw + ichamfer, cy + ih);
      bespokeCtx.lineTo(cx - iw, cy + ih - ichamfer);
      bespokeCtx.lineTo(cx - iw, cy - ih + ichamfer);
      bespokeCtx.closePath();
      bespokeCtx.stroke();

    } else if (bespokeState.cut.id === 'round') {
      // Round Brilliant
      bespokeCtx.beginPath();
      bespokeCtx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      const gemGrad = bespokeCtx.createRadialGradient(
        cx + bespokeLightAngle.x * 30, cy + bespokeLightAngle.y * 30, 4,
        cx, cy, baseRadius
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.4, gemColor);
      gemGrad.addColorStop(1, '#0c0a0a');
      bespokeCtx.fillStyle = gemGrad;
      bespokeCtx.fill();

      // Facet Star Lines
      bespokeCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      bespokeCtx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        bespokeCtx.beginPath();
        bespokeCtx.moveTo(cx, cy);
        bespokeCtx.lineTo(cx + Math.cos(angle) * baseRadius, cy + Math.sin(angle) * baseRadius);
        bespokeCtx.stroke();
      }
      bespokeCtx.beginPath();
      bespokeCtx.arc(cx, cy, baseRadius * 0.5, 0, Math.PI * 2);
      bespokeCtx.stroke();

    } else if (bespokeState.cut.id === 'cushion') {
      // Royal Cushion
      const cw = baseRadius * 1.15;
      bespokeCtx.beginPath();
      bespokeCtx.roundRect(cx - cw, cy - cw, cw * 2, cw * 2, 28);
      const gemGrad = bespokeCtx.createRadialGradient(
        cx + bespokeLightAngle.x * 35, cy + bespokeLightAngle.y * 35, 5,
        cx, cy, cw * 1.2
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.35, gemColor);
      gemGrad.addColorStop(1, '#0e0b0b');
      bespokeCtx.fillStyle = gemGrad;
      bespokeCtx.fill();
      bespokeCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      bespokeCtx.lineWidth = 1.2;
      bespokeCtx.stroke();

    } else if (bespokeState.cut.id === 'pear') {
      // Pear Drop
      const pw = baseRadius;
      const ph = baseRadius * 1.4;
      bespokeCtx.beginPath();
      bespokeCtx.moveTo(cx, cy - ph);
      bespokeCtx.bezierCurveTo(cx + pw * 1.3, cy - ph * 0.2, cx + pw * 1.1, cy + ph * 0.8, cx, cy + ph * 0.8);
      bespokeCtx.bezierCurveTo(cx - pw * 1.1, cy + ph * 0.8, cx - pw * 1.3, cy - ph * 0.2, cx, cy - ph);
      bespokeCtx.closePath();

      const gemGrad = bespokeCtx.createRadialGradient(
        cx + bespokeLightAngle.x * 25, cy + bespokeLightAngle.y * 25, 4,
        cx, cy, ph
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.4, gemColor);
      gemGrad.addColorStop(1, '#0d0909');
      bespokeCtx.fillStyle = gemGrad;
      bespokeCtx.fill();
      bespokeCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      bespokeCtx.lineWidth = 1.2;
      bespokeCtx.stroke();

    } else { // oval
      // Oval Majestic
      const ow = baseRadius * 1.3;
      const oh = baseRadius * 0.95;
      bespokeCtx.beginPath();
      bespokeCtx.ellipse(cx, cy, ow, oh, 0, 0, Math.PI * 2);
      const gemGrad = bespokeCtx.createRadialGradient(
        cx + bespokeLightAngle.x * 30, cy + bespokeLightAngle.y * 30, 4,
        cx, cy, ow
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.35, gemColor);
      gemGrad.addColorStop(1, '#0e0b0b');
      bespokeCtx.fillStyle = gemGrad;
      bespokeCtx.fill();
      bespokeCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      bespokeCtx.lineWidth = 1.2;
      bespokeCtx.stroke();
    }

    // 4. Specular Sparkle Highlight
    bespokeCtx.beginPath();
    bespokeCtx.arc(cx - baseRadius * 0.35 + bespokeLightAngle.x * 15, cy - baseRadius * 0.35 + bespokeLightAngle.y * 15, 3.5, 0, Math.PI * 2);
    bespokeCtx.fillStyle = '#ffffff';
    bespokeCtx.shadowColor = '#ffffff';
    bespokeCtx.shadowBlur = 10;
    bespokeCtx.fill();
    bespokeCtx.restore();

    // 5. Engraving simulation below band if present
    if (bespokeState.engraving && bespokeState.engraving.trim()) {
      bespokeCtx.save();
      bespokeCtx.font = 'italic 11px Georgia';
      bespokeCtx.fillStyle = 'rgba(230, 185, 166, 0.7)';
      bespokeCtx.textAlign = 'center';
      bespokeCtx.fillText(`« ${bespokeState.engraving.trim()} »`, cx, cy + 185);
      bespokeCtx.restore();
    }
  }

  // Mouse / Touch interaction for dynamic facet reflection
  if (bespokeCanvas) {
    bespokeCanvas.addEventListener('mousemove', (e) => {
      const rect = bespokeCanvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width - 0.5;
      const my = (e.clientY - rect.top) / rect.height - 0.5;
      bespokeLightAngle.x = mx * 1.5;
      bespokeLightAngle.y = my * 1.5;
      renderBespokeJewel();
    });

    bespokeCanvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const rect = bespokeCanvas.getBoundingClientRect();
        const mx = (e.touches[0].clientX - rect.left) / rect.width - 0.5;
        const my = (e.touches[0].clientY - rect.top) / rect.height - 0.5;
        bespokeLightAngle.x = mx * 1.5;
        bespokeLightAngle.y = my * 1.5;
        renderBespokeJewel();
      }
    }, { passive: true });
  }

  function updateBespokeValuation() {
    // Mathematical Valuation Formula
    const metalCost = Math.round(bespokeState.metal.rate * (1 + bespokeState.carat * 0.08));
    const gemCost = Math.round(bespokeState.gem.caratPrice * bespokeState.carat * bespokeState.cut.multiplier);
    const settingCost = bespokeState.setting.price;
    const totalUSD = metalCost + gemCost + settingCost;

    // Update DOM
    const titleEl = document.getElementById('bespoke-summary-title');
    const cutEl = document.getElementById('bespoke-summary-cut');
    const priceEl = document.getElementById('bespoke-total-price');
    const bMetalEl = document.getElementById('breakdown-metal');
    const bGemEl = document.getElementById('breakdown-gem');
    const bSettingEl = document.getElementById('breakdown-setting');

    if (titleEl) {
      titleEl.textContent = `${bespokeState.gem.name} in ${bespokeState.metal.name}`;
    }
    if (cutEl) {
      cutEl.textContent = `${bespokeState.cut.name} • ${bespokeState.carat.toFixed(2)} Carats • ${bespokeState.setting.name}`;
    }
    if (priceEl) priceEl.textContent = formatPrice(totalUSD);
    if (bMetalEl) bMetalEl.textContent = formatPrice(metalCost);
    if (bGemEl) bGemEl.textContent = formatPrice(gemCost);
    if (bSettingEl) bSettingEl.textContent = formatPrice(settingCost);

    renderBespokeJewel();
  }

  // Bespoke Option Button Listeners
  // 1. Metal
  const metalBtns = document.querySelectorAll('#metal-options .swatch-btn');
  metalBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      metalBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bespokeState.metal = {
        id: btn.getAttribute('data-metal'),
        name: btn.getAttribute('data-name'),
        rate: parseFloat(btn.getAttribute('data-rate')),
        color: btn.getAttribute('data-color')
      };
      const label = document.getElementById('selected-metal-name');
      if (label) label.textContent = bespokeState.metal.name;
      updateBespokeValuation();
    });
  });

  // 2. Gem
  const gemBtns = document.querySelectorAll('#gem-options .gem-choice-btn');
  gemBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      gemBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bespokeState.gem = {
        id: btn.getAttribute('data-gem'),
        name: btn.getAttribute('data-name'),
        caratPrice: parseFloat(btn.getAttribute('data-carat-price')),
        color: btn.getAttribute('data-color'),
        halo: btn.getAttribute('data-halo')
      };
      const label = document.getElementById('selected-gem-name');
      if (label) label.textContent = bespokeState.gem.name;
      updateBespokeValuation();
    });
  });

  // 3. Cut
  const cutBtns = document.querySelectorAll('#cut-options .cut-pill');
  cutBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      cutBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bespokeState.cut = {
        id: btn.getAttribute('data-cut'),
        name: btn.getAttribute('data-name'),
        multiplier: parseFloat(btn.getAttribute('data-multiplier'))
      };
      const label = document.getElementById('selected-cut-name');
      if (label) label.textContent = bespokeState.cut.name;
      updateBespokeValuation();
    });
  });

  // 4. Carat Slider
  const caratSlider = document.getElementById('carat-slider');
  const caratDisplay = document.getElementById('carat-display');
  if (caratSlider) {
    caratSlider.addEventListener('input', (e) => {
      bespokeState.carat = parseFloat(e.target.value);
      if (caratDisplay) {
        caratDisplay.textContent = `${bespokeState.carat.toFixed(2)} Carats`;
      }
      updateBespokeValuation();
    });
  }

  // 5. Setting
  const settingBtns = document.querySelectorAll('#setting-options .setting-btn');
  settingBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      settingBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bespokeState.setting = {
        id: btn.getAttribute('data-setting'),
        name: btn.getAttribute('data-name'),
        price: parseFloat(btn.getAttribute('data-price'))
      };
      const label = document.getElementById('selected-setting-name');
      if (label) label.textContent = bespokeState.setting.name;
      updateBespokeValuation();
    });
  });

  // 6. Engraving
  const engravingInput = document.getElementById('bespoke-engraving');
  if (engravingInput) {
    engravingInput.addEventListener('input', (e) => {
      bespokeState.engraving = e.target.value;
      renderBespokeJewel();
    });
  }

  // Bespoke Actions
  const btnOrderBespoke = document.getElementById('btn-order-bespoke');
  const btnWhatsappBespoke = document.getElementById('btn-whatsapp-bespoke');
  const btnSaveBespoke = document.getElementById('btn-save-bespoke');

  if (btnOrderBespoke) {
    btnOrderBespoke.addEventListener('click', () => {
      const metalCost = Math.round(bespokeState.metal.rate * (1 + bespokeState.carat * 0.08));
      const gemCost = Math.round(bespokeState.gem.caratPrice * bespokeState.carat * bespokeState.cut.multiplier);
      const totalUSD = metalCost + gemCost + bespokeState.setting.price;
      const ref = `Bespoke Commission: ${bespokeState.gem.name} (${bespokeState.carat.toFixed(2)}ct, ${bespokeState.cut.name}) in ${bespokeState.metal.name} with ${bespokeState.setting.name}${bespokeState.engraving ? ' [Engraving: ' + bespokeState.engraving + ']' : ''} - Estimated: ${formatPrice(totalUSD)}`;
      
      setConciergeInquiry(ref);
      scrollToSection('concierge');
    });
  }

  if (btnWhatsappBespoke) {
    btnWhatsappBespoke.addEventListener('click', () => {
      const metalCost = Math.round(bespokeState.metal.rate * (1 + bespokeState.carat * 0.08));
      const gemCost = Math.round(bespokeState.gem.caratPrice * bespokeState.carat * bespokeState.cut.multiplier);
      const totalUSD = metalCost + gemCost + bespokeState.setting.price;
      const msg = `Hello Atelier Lumière, I would like to consult on this Bespoke Ring Creation:\n• Center Gem: ${bespokeState.carat.toFixed(2)}ct ${bespokeState.gem.name} (${bespokeState.cut.name})\n• Precious Alloy: ${bespokeState.metal.name}\n• Setting: ${bespokeState.setting.name}${bespokeState.engraving ? '\n• Custom Inscription: "' + bespokeState.engraving + '"' : ''}\n• Valuation Estimate: ${formatPrice(totalUSD)}\nPlease share bespoke commission availability and atelier timeline.`;
      openWhatsApp(msg);
    });
  }

  if (btnSaveBespoke) {
    btnSaveBespoke.addEventListener('click', () => {
      const metalCost = Math.round(bespokeState.metal.rate * (1 + bespokeState.carat * 0.08));
      const gemCost = Math.round(bespokeState.gem.caratPrice * bespokeState.carat * bespokeState.cut.multiplier);
      const totalUSD = metalCost + gemCost + bespokeState.setting.price;
      
      const customItem = {
        id: 'bespoke-' + Date.now(),
        title: `Custom ${bespokeState.gem.name} Creation`,
        priceUSD: totalUSD,
        primaryGem: `${bespokeState.carat.toFixed(2)} ct ${bespokeState.gem.name}`,
        metal: bespokeState.metal.name,
        image: 'ezgif-frame-001.png'
      };

      toggleVaultItem(customItem);
    });
  }

  // --- 6. GEMOLOGICAL 4Cs GUIDE TABS ---
  const gemTabs = document.querySelectorAll('.gem-tab-btn');
  const gemPanels = document.querySelectorAll('.gem-panel');

  gemTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      gemTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      gemPanels.forEach((panel) => {
        if (panel.id === `tab-${target}`) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });

  // --- 7. CONCIERGE & SELECTION INTEGRATION ---
  const conciergeSelectionBanner = document.getElementById('concierge-selection-banner');
  const conciergeSelectedTitle = document.getElementById('concierge-selected-title');
  const conciergeItemRef = document.getElementById('concierge-item-ref');
  const btnClearSelection = document.getElementById('btn-clear-selection');
  const viewingForm = document.getElementById('viewing-form');
  const conciergeStatusMsg = document.getElementById('concierge-status-msg');

  function setConciergeInquiry(title) {
    if (conciergeSelectionBanner && conciergeSelectedTitle) {
      conciergeSelectedTitle.textContent = title;
      conciergeSelectionBanner.classList.remove('hidden');
    }
    if (conciergeItemRef) {
      conciergeItemRef.value = title;
    }
  }

  function clearConciergeInquiry() {
    if (conciergeSelectionBanner) {
      conciergeSelectionBanner.classList.add('hidden');
    }
    if (conciergeItemRef) {
      conciergeItemRef.value = '';
    }
  }

  if (btnClearSelection) {
    btnClearSelection.addEventListener('click', clearConciergeInquiry);
  }

  if (viewingForm) {
    viewingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('concierge-name')?.value || 'Guest';
      const salon = document.getElementById('concierge-salon')?.value || 'Paris';
      const ref = conciergeItemRef?.value || 'The Morganite Imperialis';

      if (conciergeStatusMsg) {
        conciergeStatusMsg.innerHTML = `
          <div class="status-msg-inner">
            <span class="status-msg-icon">❖</span>
            <div class="status-msg-text">
              <h4>Consultation Request Transmitted</h4>
              <p>Thank you, <strong>${name}</strong>. Your confidential inquiry regarding <em>${ref}</em> has been dispatched to our ${salon.toUpperCase()} Salon Director. A personal concierge will contact you within two business hours.</p>
            </div>
          </div>
        `;
        conciergeStatusMsg.classList.remove('hidden');
      }

      viewingForm.reset();
      clearConciergeInquiry();
    });
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      const navH = 80;
      const top = el.getBoundingClientRect().top + window.pageYOffset - navH;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  // --- 8. MOBILE NAVIGATION TOGGLE ---
  const mobileMenuBtn = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('nav-menu');

  if (mobileMenuBtn && navMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenuBtn.classList.toggle('active');
      navMenu.classList.toggle('open');
    });

    // Close when clicking any nav link
    navMenu.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenuBtn.classList.remove('active');
        navMenu.classList.remove('open');
      });
    });
  }

  // Global ESC key to close drawer
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeVault();
    }
  });

  // Initialize Modules
  renderCollection();
  updateVaultBadge();
  initBespokeCanvas();
  updateBespokeValuation();
  window.addEventListener('resize', initBespokeCanvas);

})();

