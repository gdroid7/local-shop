import React, { useState, useEffect, useRef } from 'react';
import ProductCard from './components/ProductCard';
import ConfirmDialog from './components/ConfirmDialog';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const apiUrl = (path) => (path.startsWith('/') ? `${API_BASE}${path}` : path);

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('all');
  const [showFavorites, setShowFavorites] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const [urls, setUrls] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'swipe'
  const [cardScale, setCardScale] = useState(1); // 0.8 to 1.4
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [category, setCategory] = useState('all'); // 'all', 'clothes', 'shoes', 'jewellery'
  const [confirmDelete, setConfirmDelete] = useState(null);

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setProducts([]);
  };

  const fetchWithAuth = async (url, options = {}) => {
    const targetUrl = apiUrl(url);
    if (!token) return window.fetch(targetUrl, options);
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      Authorization: token
    };
    const res = await window.fetch(targetUrl, { ...options, headers });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res;
  };

  useEffect(() => {
    // Detect social login redirect token from URL (?token=...&username=...)
    try {
      const params = new URLSearchParams(window.location.search);
      const oauthToken = params.get('token');
      if (oauthToken) {
        localStorage.setItem('token', oauthToken);
        setToken(oauthToken);
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (token && !user) {
      window.fetch(apiUrl('/api/me'), { headers: { Authorization: token } })
        .then(res => { if (res.ok) return res.json(); throw new Error(); })
        .then(setUser)
        .catch(logout);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchWorkspaces();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchProducts();
    }
  }, [token, currentWorkspaceId, showFavorites]);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetchWithAuth('/api/workspaces');
      const data = await res.json();
      setWorkspaces(data);
      if (data.length > 0 && !currentWorkspaceId) {
        setCurrentWorkspaceId('all');
      }
    } catch {
      console.error('Failed to load lists');
    }
  };

  const fetchProducts = async () => {
    try {
      const params = new URLSearchParams();
      if (currentWorkspaceId !== 'all') {
        params.append('workspace_id', currentWorkspaceId);
      }
      if (showFavorites) {
        params.append('favorites', 'true');
      }

      const queryString = params.toString();
      const url = `/api/products${queryString ? `?${queryString}` : ''}`;

      const res = await fetchWithAuth(url);
      const data = await res.json();
      setProducts(data);
      setCurrentIndex(0);
    } catch {
      console.error('Failed to load products');
    }
  };

  const createWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    try {
      const res = await fetchWithAuth('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName })
      });
      const data = await res.json();
      setWorkspaces([...workspaces, data]);
      setCurrentWorkspaceId(data.id);
      setNewWorkspaceName('');
      setIsCreatingWorkspace(false);
    } catch {
      alert('Failed to create list');
    }
  };

  const deleteWorkspace = async (id) => {
    if (workspaces.length <= 1) {
      alert('Cannot delete the last list');
      return;
    }
    if (!window.confirm('Delete this list and its saved products?')) return;

    try {
      await fetchWithAuth(`/api/workspaces/${id}`, { method: 'DELETE' });
      const newWorkspaces = workspaces.filter(w => w.id !== id);
      setWorkspaces(newWorkspaces);
      if (currentWorkspaceId === id) {
        setCurrentWorkspaceId('all');
      }
    } catch {
      alert('Failed to delete list');
    }
  };

  const handleScrape = async () => {
    if (!urls.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetchWithAuth('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: urls,
          workspace_id: currentWorkspaceId === 'all' ? null : currentWorkspaceId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to scrape product data');
      }

      const newProducts = await response.json();

      setProducts(prev => {
        const combined = [...newProducts, ...prev];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique;
      });

      setUrls('');
      if (window.innerWidth <= 860) {
        setSidebarOpen(false);
      }
    } catch (err) {
      console.error(err);
      setError('Could not extract product links. Make sure URLs are valid.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id) => {
    const product = products.find(p => p.id === id);
    if (product) {
      setConfirmDelete(product);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!confirmDelete) return;

    try {
      await fetchWithAuth(`/api/products/${confirmDelete.id}?workspace_id=${currentWorkspaceId}`, { method: 'DELETE' });
      setProducts(products.filter(p => p.id !== confirmDelete.id));
      if (currentIndex >= products.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch {
      alert('Failed to remove product');
    } finally {
      setConfirmDelete(null);
    }
  };

  const toggleFavorite = async (id, isFavorite) => {
    try {
      const updatedProducts = products.map(p =>
        p.id === id ? { ...p, is_favorite: isFavorite ? 1 : 0 } : p
      );

      if (showFavorites && !isFavorite) {
        setProducts(updatedProducts.filter(p => p.id !== id));
      } else {
        setProducts(updatedProducts);
      }

      await fetchWithAuth(`/api/products/${id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: currentWorkspaceId, is_favorite: isFavorite })
      });
    } catch {
      console.error('Failed to toggle favorite');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setUrls(text);
    };
    reader.readAsText(file);
  };

  const detectCategory = (product) => {
    const text = `${product.title || ''} ${product.url || ''}`.toLowerCase();

    const shoeKeywords = ['shoe', 'sneaker', 'sandal', 'boot', 'heel', 'footwear', 'slipper', 'loafer'];
    if (shoeKeywords.some(keyword => text.includes(keyword))) {
      return 'shoes';
    }

    const apparelKeywords = ['dress', 'shirt', 'pant', 'jean', 'jacket', 'coat', 'sweater', 'hoodie', 'tshirt', 't-shirt', 'blouse', 'skirt', 'short', 'trouser'];
    if (apparelKeywords.some(keyword => text.includes(keyword))) {
      return 'clothes';
    }

    const jewelleryKeywords = ['earring', 'necklace', 'ring', 'bracelet', 'jewel', 'pendant', 'chain', 'bangle', 'gold', 'silver', 'diamond', 'hoop', 'stud'];
    if (jewelleryKeywords.some(keyword => text.includes(keyword))) {
      return 'jewellery';
    }

    return 'other';
  };

  const filteredProducts = products.filter(product => {
    if (category === 'all') return true;
    return detectCategory(product) === category;
  });

  const handleSwipe = (direction) => {
    if (direction === 'right' || direction === 'left') {
      if (currentIndex < filteredProducts.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Keyboard navigation for swipe mode
  useEffect(() => {
    if (viewMode !== 'swipe') return;
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSwipe('right');
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        const currentCard = filteredProducts[currentIndex];
        if (currentCard?.url) {
          window.open(currentCard.url, '_blank', 'noopener,noreferrer');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, currentIndex, filteredProducts]);

  const visibleCards = filteredProducts.slice(currentIndex, currentIndex + 3);
  const currentProduct = filteredProducts[currentIndex];
  const activeWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
  const currentListName = currentWorkspaceId === 'all' ? 'All Products' : (activeWorkspace?.name || 'My List');

  if (!token) {
    return <LoginPage onLogin={(t, u) => {
      localStorage.setItem('token', t);
      setToken(t);
      setUser(u);
    }} />;
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* Backdrop overlay for mobile drawer */}
      <div
        className="sidebar-overlay"
        data-open={sidebarOpen ? "true" : "false"}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar Drawer */}
      <aside
        className="sidebar-drawer"
        data-open={sidebarOpen ? "true" : "false"}
      >
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{
              fontSize: '1.4rem',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #ffffff 0%, #a1a1aa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em'
            }}>
              ShopDeck
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
              {user?.username ? `@${user.username}` : 'Shopping Shortlist'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={logout}
              title="Sign Out"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                borderRadius: '6px'
              }}
            >
              Logout
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="mobile-close-btn"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '1.25rem',
                padding: '0.25rem 0.5rem',
                display: 'none',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Lists / Workspaces */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Your Collections
              </span>
              <button
                onClick={() => setIsCreatingWorkspace(!isCreatingWorkspace)}
                style={{
                  background: 'var(--accent-light)',
                  border: 'none',
                  color: 'var(--accent-color)',
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: '600'
                }}
              >
                +
              </button>
            </div>

            {isCreatingWorkspace && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="New collection name..."
                  autoFocus
                  style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
                />
                <button
                  onClick={createWorkspace}
                  style={{
                    padding: '0.5rem 0.875rem',
                    background: 'var(--accent-color)',
                    fontSize: '0.85rem',
                    color: 'white',
                    fontWeight: '600'
                  }}
                >
                  Save
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div
                onClick={() => { setCurrentWorkspaceId('all'); setSidebarOpen(false); }}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: currentWorkspaceId === 'all' ? 'var(--accent-color)' : 'transparent',
                  color: currentWorkspaceId === 'all' ? 'white' : 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ fontSize: '0.9rem', fontWeight: currentWorkspaceId === 'all' ? '600' : '400' }}>
                  All Products
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  background: currentWorkspaceId === 'all' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                  padding: '1px 7px',
                  borderRadius: '10px'
                }}>
                  {products.length}
                </span>
              </div>

              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  onClick={() => { setCurrentWorkspaceId(ws.id); setSidebarOpen(false); }}
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    background: currentWorkspaceId === ws.id ? 'var(--accent-color)' : 'transparent',
                    color: currentWorkspaceId === ws.id ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: currentWorkspaceId === ws.id ? '600' : '400' }}>
                    {ws.name}
                  </span>
                  {workspaces.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id); }}
                      title="Delete list"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: currentWorkspaceId === ws.id ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: '1rem',
                        lineHeight: '1'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Import / Paste Links Section */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Add Product Links
            </label>
            <textarea
              rows={4}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="Paste URLs, shopping links, or WhatsApp messages..."
              style={{ marginBottom: '0.75rem', fontSize: '0.85rem', resize: 'vertical', minHeight: '80px' }}
            />

            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button
                onClick={handleScrape}
                disabled={loading || !urls.trim()}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'var(--accent-color)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '0.9rem'
                }}
              >
                {loading ? 'Scraping Links...' : 'Scrape & Add'}
              </button>

              <div style={{ position: 'relative', width: '100%' }}>
                <button style={{
                  width: '100%',
                  padding: '0.6rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  fontWeight: '500'
                }}>
                  Upload CSV / TXT
                </button>
                <input
                  type="file"
                  accept=".txt,.csv,.json"
                  onChange={handleFileUpload}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%'
                  }}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: 'var(--danger-light)', color: '#f87171', borderRadius: '8px', fontSize: '0.8rem' }}>
                {error}
              </div>
            )}
          </div>

          {/* Grid View Size Slider */}
          {viewMode === 'grid' && (
            <div className="glass-panel" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Card Scale
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                  {Math.round(cardScale * 100)}%
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => setCardScale(Math.max(0.75, cardScale - 0.1))}
                  style={{ flex: 1, padding: '0.4rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem' }}
                >
                  −
                </button>
                <button
                  onClick={() => setCardScale(Math.min(1.4, cardScale + 0.1))}
                  style={{ flex: 1, padding: '0.4rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '1rem' }}
                >
                  +
                </button>
              </div>
            </div>
          )}

        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
        
        {/* Top Navigation Bar */}
        <header style={{
          height: '64px',
          minHeight: '64px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(18, 18, 22, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          gap: '0.75rem',
          zIndex: 10
        }}>
          {/* Left: Mobile hamburger & Active List title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-btn"
              title="Open Navigation"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem'
              }}
            >
              ☰
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <h2 style={{
                fontSize: '1.1rem',
                fontWeight: '700',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {currentListName}
              </h2>
              <span style={{
                fontSize: '0.75rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '2px 8px',
                borderRadius: '999px',
                whiteSpace: 'nowrap'
              }}>
                {filteredProducts.length}
              </span>
            </div>
          </div>

          {/* Center: Category Filter Pills */}
          <div style={{
            display: 'flex',
            gap: '0.35rem',
            overflowX: 'auto',
            padding: '2px 0',
            scrollbarWidth: 'none'
          }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'clothes', label: 'Clothes' },
              { id: 'shoes', label: 'Shoes' },
              { id: 'jewellery', label: 'Jewellery' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCategory(cat.id); setCurrentIndex(0); }}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: category === cat.id ? '600' : '500',
                  background: category === cat.id ? 'var(--accent-color)' : 'var(--bg-card)',
                  color: category === cat.id ? 'white' : 'var(--text-secondary)',
                  border: '1px solid ' + (category === cat.id ? 'var(--accent-color)' : 'var(--border-color)'),
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Right: Mode Toggle (Grid/Swipe) & Favorites */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              title={showFavorites ? 'Show all products' : 'Show favorites only'}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '600',
                background: showFavorites ? 'var(--danger-color)' : 'var(--bg-card)',
                color: showFavorites ? 'white' : 'var(--text-secondary)',
                border: '1px solid ' + (showFavorites ? 'var(--danger-color)' : 'var(--border-color)'),
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ♥ <span className="hide-on-mobile">{showFavorites ? 'Favorites' : 'Favs'}</span>
            </button>

            {/* View Switcher Segments */}
            <div style={{
              display: 'flex',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '2px'
            }}>
              <button
                onClick={() => setViewMode('grid')}
                title="Grid View"
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  background: viewMode === 'grid' ? 'var(--accent-color)' : 'transparent',
                  color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                  border: 'none'
                }}
              >
                ⊞ <span className="hide-on-mobile">Grid</span>
              </button>
              <button
                onClick={() => setViewMode('swipe')}
                title="Swipe View"
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  background: viewMode === 'swipe' ? 'var(--accent-color)' : 'transparent',
                  color: viewMode === 'swipe' ? 'white' : 'var(--text-secondary)',
                  border: 'none'
                }}
              >
                🎴 <span className="hide-on-mobile">Swipe</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content Body */}
        {viewMode === 'grid' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', width: '100%' }}>
            {filteredProducts.length > 0 ? (
              <section
                className="product-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(200 * cardScale)}px, 1fr))`
                }}
              >
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id || product.url}
                    product={product}
                    onDelete={handleDelete}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </section>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '70%',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '2rem'
              }}>
                <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛍️</span>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {products.length === 0 ? 'No products in this collection' : 'No items match this filter'}
                </h3>
                <p style={{ maxWidth: '360px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {products.length === 0
                    ? 'Paste shopping links from Amazon, Flipkart, Myntra, Ajio, or any store into the sidebar.'
                    : 'Try selecting "All" categories or disabling the favorites filter.'}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Swipe Deck Mode */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {/* Card Stack Area */}
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
              <SwipeableCards
                cards={visibleCards}
                currentIndex={currentIndex}
                totalCards={filteredProducts.length}
                onSwipe={handleSwipe}
                onDelete={handleDelete}
                onToggleFavorite={toggleFavorite}
                scale={cardScale}
              />
            </div>

            {/* Progress and Tactile Control Dock */}
            {filteredProducts.length > 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                maxWidth: '420px',
                paddingBottom: '0.5rem',
                zIndex: 10
              }}>
                {/* Progress bar */}
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '85px', textAlign: 'left' }}>
                    {currentIndex + 1} of {filteredProducts.length}
                  </span>
                  <div style={{ flex: 1, height: '4px', background: 'var(--bg-card)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${((currentIndex + 1) / filteredProducts.length) * 100}%`,
                      background: 'var(--accent-color)',
                      transition: 'width 0.25s ease'
                    }} />
                  </div>
                </div>

                {/* Tactile Control Buttons Dock */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1rem',
                  background: 'rgba(24, 24, 30, 0.85)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '999px',
                  border: '1px solid var(--glass-border)',
                  boxShadow: 'var(--card-shadow)'
                }}>
                  {/* Previous / Rewind */}
                  <button
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                    title="Previous (Left Arrow)"
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontSize: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: currentIndex === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ←
                  </button>

                  {/* Delete / Pass */}
                  <button
                    onClick={() => currentProduct && handleDelete(currentProduct.id)}
                    title="Remove from list"
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--danger-color)',
                      fontSize: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>

                  {/* Favorite Toggle */}
                  <button
                    onClick={() => currentProduct && toggleFavorite(currentProduct.id, !currentProduct.is_favorite)}
                    title={currentProduct?.is_favorite ? "Unfavorite" : "Favorite"}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: currentProduct?.is_favorite ? 'var(--danger-color)' : 'var(--accent-color)',
                      color: 'white',
                      fontSize: '1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: currentProduct?.is_favorite ? '0 0 16px rgba(239, 68, 68, 0.5)' : '0 0 16px rgba(99, 102, 241, 0.4)'
                    }}
                  >
                    ♥
                  </button>

                  {/* Direct Store Link */}
                  <button
                    onClick={() => currentProduct?.url && window.open(currentProduct.url, '_blank')}
                    title="Visit Store (Space)"
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontSize: '1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    ↗
                  </button>

                  {/* Next / Advance */}
                  <button
                    onClick={() => handleSwipe('right')}
                    disabled={currentIndex >= filteredProducts.length - 1}
                    title="Next (Right Arrow)"
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontSize: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: currentIndex >= filteredProducts.length - 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        product={confirmDelete}
        onConfirm={confirmDeleteProduct}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function SwipeableCards({ cards, currentIndex, totalCards, onSwipe, onDelete, onToggleFavorite, scale }) {
  const [dragStart, setDragStart] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef(null);

  const handleDragStart = (clientX, clientY) => {
    setDragStart({ x: clientX, y: clientY });
    setDragging(true);
  };

  const handleDragMove = (clientX, clientY) => {
    if (!dragStart) return;
    setDragOffset({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handleDragEnd = () => {
    if (!dragStart) return;

    const threshold = 80;
    if (Math.abs(dragOffset.x) > threshold) {
      const direction = dragOffset.x > 0 ? 'right' : 'left';
      onSwipe(direction);
    }

    setDragStart(null);
    setDragOffset({ x: 0, y: 0 });
    setDragging(false);
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('.card-action-btn')) return;
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      handleDragMove(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.card-action-btn')) return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e) => {
    if (dragging && e.touches[0]) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, dragStart]);

  if (cards.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</span>
        <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          You've reviewed all cards!
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Switch back to Grid view or check your favorites shortlist.
        </p>
      </div>
    );
  }

  const rotation = dragOffset.x / 18;
  const opacity = Math.max(0.2, 1 - Math.abs(dragOffset.x) / 280);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'relative',
        width: 'min(420px, calc(100% - 2rem))',
        maxWidth: `${420 * scale}px`,
        height: `min(${560 * scale}px, calc(100% - 1.5rem))`,
        maxHeight: '560px',
        perspective: '1000px',
        touchAction: 'none'
      }}>
        {cards.map((product, index) => {
          const isTop = index === 0;
          const offset = index * 10;
          const cardScale = 1 - index * 0.04;
          const cardOpacity = Math.max(0.4, 1 - index * 0.22);

          return (
            <div
              key={product.id || product.url}
              ref={isTop ? cardRef : null}
              onMouseDown={isTop ? handleMouseDown : undefined}
              onTouchStart={isTop ? handleTouchStart : undefined}
              onTouchMove={isTop ? handleTouchMove : undefined}
              onTouchEnd={isTop ? handleTouchEnd : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: isTop && dragging
                  ? `translateX(calc(-50% + ${dragOffset.x}px)) translateY(${dragOffset.y}px) rotateZ(${rotation}deg)`
                  : `translateX(-50%) translateY(${offset}px) scale(${cardScale})`,
                width: '100%',
                height: '100%',
                opacity: isTop && dragging ? opacity : cardOpacity,
                transition: dragging && isTop ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: cards.length - index,
                cursor: isTop ? (dragging ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none'
              }}
            >
              <ProductCard
                product={product}
                onDelete={onDelete}
                onToggleFavorite={onToggleFavorite}
                isSwipeMode={true}
              />
            </div>
          );
        })}

        {/* Swipe Feedback Overlay Icons */}
        {dragging && Math.abs(dragOffset.x) > 40 && (
          <div style={{
            position: 'absolute',
            top: '40%',
            left: dragOffset.x > 0 ? 'auto' : '1.5rem',
            right: dragOffset.x > 0 ? '1.5rem' : 'auto',
            transform: 'translateY(-50%)',
            fontSize: '2.5rem',
            background: dragOffset.x > 0 ? 'rgba(99, 102, 241, 0.85)' : 'rgba(239, 68, 68, 0.85)',
            color: 'white',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            pointerEvents: 'none',
            zIndex: 1000
          }}>
            {dragOffset.x > 0 ? '♥' : '✕'}
          </div>
        )}
      </div>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialModal, setSocialModal] = useState(null);

  const handleGoogleLogin = async () => {
    try {
      const res = await window.fetch(apiUrl('/api/auth/providers'));
      const data = await res.json();
      if (!data.google?.enabled) {
        setSocialModal({
          provider: 'Google',
          instruction: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your Render / Netlify environment variables.'
        });
        return;
      }
      const redirectUri = window.location.origin;
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${data.google.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile`;
    } catch (e) {
      setError('Failed to initiate Google login: ' + e.message);
    }
  };

  const handleGithubLogin = async () => {
    try {
      const res = await window.fetch(apiUrl('/api/auth/providers'));
      const data = await res.json();
      if (!data.github?.enabled) {
        setSocialModal({
          provider: 'GitHub',
          instruction: 'Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your Render / Netlify environment variables.'
        });
        return;
      }
      window.location.href = apiUrl('/api/auth/github');
    } catch (e) {
      setError('Failed to initiate GitHub login: ' + e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const endpoint = apiUrl(isRegister ? '/api/register' : '/api/login');

    try {
      const res = await window.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      onLogin(data.token, { id: data.userId, username: data.username });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 20%, #1f1f2e 0%, #0a0a0c 70%)',
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      <div
        className="glass-panel"
        style={{
          padding: '2.25rem 2rem',
          width: '100%',
          maxWidth: '400px',
          boxSizing: 'border-box',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: '1.85rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #ffffff 0%, #a1a1aa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.35rem',
            letterSpacing: '-0.02em'
          }}>
            ShopDeck
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {isRegister ? 'Create an account to start your shortlist' : 'Sign in to access your saved lists'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. gaurav"
              style={{ fontSize: '0.95rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', textAlign: 'left' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ fontSize: '0.95rem' }}
            />
          </div>

          {error && (
            <div style={{ color: '#f87171', fontSize: '0.825rem', padding: '0.6rem', background: 'var(--danger-light)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.8rem',
              borderRadius: '10px',
              background: 'var(--accent-color)',
              color: 'white',
              fontWeight: '600',
              fontSize: '0.95rem',
              border: 'none',
              marginTop: '0.5rem',
              cursor: 'pointer'
            }}
          >
            {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {/* Social Login Divider */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '1.25rem 0', gap: '0.75rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or continue with
          </span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
        </div>

        {/* Social Login Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              fontSize: '0.825rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Google
          </button>

          <button
            type="button"
            onClick={handleGithubLogin}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.65rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              fontSize: '0.825rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background 0.2s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </button>
        </div>

        {/* Informational Modal if social auth is not yet set up */}
        {socialModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}>
            <div className="glass-panel" style={{ maxWidth: '400px', padding: '1.5rem', textAlign: 'left' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                {socialModal.provider} Login Ready
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Social login infrastructure is completely installed! To enable it in production:
              </p>
              <div style={{ background: '#121216', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontFamily: 'monospace', color: '#a5b4fc', margin: '0.75rem 0' }}>
                {socialModal.instruction}
              </div>
              <button
                type="button"
                onClick={() => setSocialModal(null)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent-color)',
                  color: 'white',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Understood
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              padding: '0.25rem',
              cursor: 'pointer'
            }}
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
