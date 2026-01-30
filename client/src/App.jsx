import React, { useState, useEffect, useRef } from 'react';
import ProductCard from './components/ProductCard';
import ConfirmDialog from './components/ConfirmDialog';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const [urls, setUrls] = useState('');

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setProducts([]);
  };

  // Shadow global fetch to transparently add auth token
  const fetch = async (url, options = {}) => {
    if (!token) return window.fetch(url, options); // fallback
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      Authorization: token
    };
    const res = await window.fetch(url, { ...options, headers });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    return res;
  };

  useEffect(() => {
    if (token && !user) {
      window.fetch('/api/me', { headers: { Authorization: token } })
        .then(res => { if (res.ok) return res.json(); throw new Error(); })
        .then(setUser)
        .catch(logout);
    }
  }, [token]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'swipe'
  const [cardScale, setCardScale] = useState(1); // 0.7 to 1.5
  const [currentIndex, setCurrentIndex] = useState(0); // Current card index for swipe mode
  const [sidebarOpen, setSidebarOpen] = useState(false); // Sidebar toggle for mobile
  const [category, setCategory] = useState('all'); // 'all', 'clothes', 'shoes'
  const [confirmDelete, setConfirmDelete] = useState(null); // Product to confirm deletion for

  // Initial load and reload on auth change
  useEffect(() => {
    if (token) {
      fetchWorkspaces();
    }
  }, [token]);

  useEffect(() => {
    if (currentWorkspaceId) {
      fetchProducts();
    }
  }, [currentWorkspaceId, showFavorites]);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      setWorkspaces(data);
      if (data.length > 0 && !currentWorkspaceId) {
        setCurrentWorkspaceId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load workspaces');
    }
  };

  const fetchProducts = async () => {
    try {
      let url = `/api/products?workspace_id=${currentWorkspaceId}`;
      if (showFavorites) {
        url += '&favorites=true';
      }

      const res = await fetch(url);
      const data = await res.json();
      setProducts(data);
      setCurrentIndex(0); // Reset swipe index
    } catch (e) {
      console.error('Failed to load products');
    }
  };

  const createWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName })
      });
      const data = await res.json();
      setWorkspaces([...workspaces, data]);
      setCurrentWorkspaceId(data.id);
      setNewWorkspaceName('');
      setIsCreatingWorkspace(false);
    } catch (e) {
      alert('Failed to create workspace');
    }
  };

  const deleteWorkspace = async (id) => {
    if (workspaces.length <= 1) {
      alert('Cannot delete the last workspace');
      return;
    }
    if (!window.confirm('Are you sure? All items in this list will be deleted.')) return;

    try {
      await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      const newWorkspaces = workspaces.filter(w => w.id !== id);
      setWorkspaces(newWorkspaces);
      if (currentWorkspaceId === id) {
        setCurrentWorkspaceId(newWorkspaces[0].id);
      }
    } catch (e) {
      alert('Failed to delete workspace');
    }
  };

  const handleScrape = async () => {
    if (!urls.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls: urls, workspace_id: currentWorkspaceId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch product data');
      }

      const newProducts = await response.json();

      setProducts(prev => {
        const combined = [...newProducts, ...prev];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique;
      });

      setUrls('');

    } catch (err) {
      console.error(err);
      setError('Something went wrong while fetching products.');
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
      await fetch(`/api/products/${confirmDelete.id}?workspace_id=${currentWorkspaceId}`, { method: 'DELETE' });
      setProducts(products.filter(p => p.id !== confirmDelete.id));
      // Adjust current index if needed
      if (currentIndex >= products.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch (e) {
      alert('Failed to delete');
    } finally {
      setConfirmDelete(null);
    }
  };

  const toggleFavorite = async (id, isFavorite) => {
    try {
      const product = products.find(p => p.id === id);
      // Optimistic update
      const updatedProducts = products.map(p =>
        p.id === id ? { ...p, is_favorite: isFavorite ? 1 : 0 } : p
      );

      // If we are showing only favorites and we unfavorite, remove it from view instantly
      if (showFavorites && !isFavorite) {
        setProducts(updatedProducts.filter(p => p.id !== id));
      } else {
        setProducts(updatedProducts);
      }

      await fetch(`/api/products/${id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: currentWorkspaceId, is_favorite: isFavorite })
      });
    } catch (e) {
      console.error('Failed to toggle favorite');
      // Revert on error could be implemented here
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

  // Category detection helper
  const detectCategory = (product) => {
    const text = `${product.title} ${product.url}`.toLowerCase();

    // Shoe keywords
    const shoeKeywords = ['shoe', 'sneaker', 'sandal', 'boot', 'heel', 'footwear', 'slipper', 'loafer'];
    if (shoeKeywords.some(keyword => text.includes(keyword))) {
      return 'shoes';
    }

    // Clothing keywords
    const clothingKeywords = ['dress', 'shirt', 'pant', 'jean', 'jacket', 'coat', 'sweater', 'hoodie', 'tshirt', 't-shirt', 'blouse', 'skirt', 'short', 'trouser'];
    if (clothingKeywords.some(keyword => text.includes(keyword))) {
      return 'clothes';
    }

    return 'other';
  };

  // Filter products by category
  const filteredProducts = products.filter(product => {
    if (category === 'all') return true;
    return detectCategory(product) === category;
  });

  // Navigation handlers (after filteredProducts is defined)
  const handleSwipe = (direction) => {
    if (direction === 'left' || direction === 'right') {
      // Move to next card
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

  // Get visible cards (current + 2 ahead) from filtered products
  const visibleCards = filteredProducts.slice(currentIndex, currentIndex + 3);

  if (!token) {
    return <LoginPage onLogin={(t, u) => {
      localStorage.setItem('token', t);
      setToken(t);
      setUser(u);
    }} />;
  }

  // Optional: Loading state could go here, but we render optimistic UI or basic layout

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: 'none', // Controlled by CSS
          position: 'fixed',
          top: 'max(1rem, env(safe-area-inset-top))',
          left: sidebarOpen ? 'auto' : '1rem',
          right: sidebarOpen ? '1rem' : 'auto',
          background: 'var(--accent-color)',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          zIndex: 1001,
          fontSize: '1.25rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer'
        }}
        className="mobile-toggle"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside data-open={sidebarOpen ? 'true' : 'false'} style={{
        width: sidebarOpen ? '100%' : '350px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        position: sidebarOpen ? 'fixed' : 'relative',
        zIndex: 1000,
        height: '100%',
        overflowY: 'auto'
      }}>

        <div style={{ padding: '2rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))', paddingTop: 'max(2rem, calc(1rem + env(safe-area-inset-top)))' }}>
          <header style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{
                  fontSize: '2rem',
                  fontWeight: '800',
                  background: 'linear-gradient(to right, #fff, #a1a1aa)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: '0.5rem'
                }}>
                  GS-OmniShop
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  {user ? `Welcome, ${user.username}` : 'Singapore product shortlist'}
                </p>
              </div>
              <button
                onClick={logout}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Logout
              </button>
            </div>
          </header>

          {/* Input Section */}
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Lists
                  </h3>
                  <button
                    onClick={() => setIsCreatingWorkspace(!isCreatingWorkspace)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '1.25rem' }}
                  >
                    +
                  </button>
                </div>

                {isCreatingWorkspace && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="List name..."
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
                    />
                    <button onClick={createWorkspace} style={{ padding: '0.5rem', background: 'var(--accent-color)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>
                      Add
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {workspaces.map(ws => (
                    <div
                      key={ws.id}
                      onClick={() => { setCurrentWorkspaceId(ws.id); setSidebarOpen(false); }}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        background: currentWorkspaceId === ws.id ? 'var(--accent-color)' : 'transparent',
                        color: currentWorkspaceId === ws.id ? 'white' : 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontWeight: currentWorkspaceId === ws.id ? '600' : '400' }}>{ws.name}</span>
                      {workspaces.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id); }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: currentWorkspaceId === ws.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                enter urls or paste text with links
              </label>
              <textarea
                rows={4}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="Paste WhatsApp messages or links here..."
                style={{ marginBottom: '1rem', fontFamily: 'monospace', fontSize: '0.9rem', minHeight: '100px' }}
              />

              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                <button onClick={handleScrape} disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Processing...' : 'Visualize'}
                </button>

                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  <button style={{ width: '100%', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    Upload File
                  </button>
                  <input
                    type="file"
                    accept=".txt,.csv,.json"
                    onChange={handleFileUpload}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      opacity: 0,
                      cursor: 'pointer',
                      height: '100%',
                      width: '100%'
                    }}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div style={{ padding: '1rem', background: 'rgba(255, 100, 100, 0.1)', color: '#f87171', borderRadius: '8px', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}
          </div>

          {/* View Controls */}
          {products.length > 0 && (
            <>
              <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  View Mode
                </label>

                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    background: showFavorites ? '#ef4444' : 'var(--bg-secondary)',
                    color: showFavorites ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontWeight: '500'
                  }}
                >
                  {showFavorites ? '♥ Showing Favorites' : '♡ Show Favorites Only'}
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setViewMode('grid')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: viewMode === 'grid' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                      fontSize: '0.875rem'
                    }}
                  >
                    Grid
                  </button>
                  <button
                    onClick={() => setViewMode('swipe')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: viewMode === 'swipe' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                      fontSize: '0.875rem'
                    }}
                  >
                    Swipe
                  </button>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Category Filter
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => { setCategory('all'); setCurrentIndex(0); }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: category === 'all' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                      fontSize: '0.875rem'
                    }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => { setCategory('clothes'); setCurrentIndex(0); }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: category === 'clothes' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                      fontSize: '0.875rem'
                    }}
                  >
                    Clothes
                  </button>
                  <button
                    onClick={() => { setCategory('shoes'); setCurrentIndex(0); }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: category === 'shoes' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                      fontSize: '0.875rem'
                    }}
                  >
                    Shoes
                  </button>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Card Size
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => setCardScale(Math.max(0.7, cardScale - 0.1))}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: 'var(--bg-secondary)',
                      fontSize: '1rem',
                      flex: 1
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: '0.875rem', minWidth: '3rem', textAlign: 'center', fontWeight: '500' }}>
                    {Math.round(cardScale * 100)}%
                  </span>
                  <button
                    onClick={() => setCardScale(Math.min(1.5, cardScale + 0.1))}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: 'var(--bg-secondary)',
                      fontSize: '1rem',
                      flex: 1
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {viewMode === 'swipe' && (
                <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Card {currentIndex + 1} of {filteredProducts.length}
                  </div>
                  <div style={{
                    height: '4px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${((currentIndex + 1) / filteredProducts.length) * 100}%`,
                      background: 'var(--accent-color)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            <section className="product-grid" style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${200 * cardScale}px, 1fr))`,
              gap: `${1.5 * cardScale}rem`,
            }}>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id || product.url}
                  product={product}
                  onDelete={handleDelete}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </section>

            {!loading && products.length === 0 && !error && (
              <div style={{ marginTop: '4rem', color: 'var(--text-secondary)', opacity: 0.5, textAlign: 'center' }}>
                <p>Your collection is empty.</p>
              </div>
            )}
          </div>
        )}

        {/* Swipe View */}
        {viewMode === 'swipe' && (
          <SwipeableCards
            cards={visibleCards}
            currentIndex={currentIndex}
            totalCards={products.length}
            onSwipe={handleSwipe}
            onDelete={handleDelete}
            onToggleFavorite={toggleFavorite}
            scale={cardScale}
          />
        )}

        {/* Navigation Buttons for Swipe Mode */}
        {viewMode === 'swipe' && products.length > 0 && (
          <div className="swipe-nav-buttons" style={{
            position: 'absolute',
            bottom: 'calc(2rem + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '1rem',
            zIndex: 10,
            marginLeft: sidebarOpen ? '0' : '0', // Controlled by CSS mostly, but logic here needs simplification. CSS will handle the media query override.
            // We'll rely on CSS class 'swipe-nav-buttons' to handle the responsive margin.
            // On desktop, we want to center relative to the main content area (which is already offset by sidebar).
            // Actually, main is flex:1. So left:50% of main is correct.
            // But if sidebar is fixed (mobile), main covers whole screen.
            // If sidebar is relative (desktop), main starts after 350px.
            // So left: 50% is 50% of the MAIN area. That is correct in both cases.
            // NO offset needed if we are inside MAIN. 
            // PREVIOUS CODE had marginLeft: 175px ?? 
            // Ah, previous code had these buttons OUTSIDE main? No, inside main.
            // Line 660 was closing main. Yes, buttons were inside main.
            // So left: 50% relative to Main is correct. We don't need marginLeft: 175px at all.
            // Wait, previous code had marginLeft: '175px'. Why?
            // Maybe because sidebar was fixed overlay on desktop too? No, relative.
            // Let's remove the margin offset.
          }}>
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'var(--bg-secondary)',
                border: '2px solid var(--border-color)',
                fontSize: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                opacity: currentIndex === 0 ? 0.3 : 1,
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)'
              }}
            >
              ←
            </button>
            <button
              onClick={() => handleSwipe('right')}
              disabled={currentIndex >= filteredProducts.length - 1}
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'var(--accent-color)',
                fontSize: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: currentIndex >= filteredProducts.length - 1 ? 'not-allowed' : 'pointer',
                opacity: currentIndex >= filteredProducts.length - 1 ? 0.3 : 1,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
              }}
            >
              →
            </button>
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

// Swipeable Cards Component
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

    const offset = {
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    };
    setDragOffset(offset);
  };

  const handleDragEnd = () => {
    if (!dragStart) return;

    const threshold = 100;

    if (Math.abs(dragOffset.x) > threshold) {
      // Swipe detected
      const direction = dragOffset.x > 0 ? 'right' : 'left';
      onSwipe(direction);
    }

    setDragStart(null);
    setDragOffset({ x: 0, y: 0 });
    setDragging(false);
  };

  // Mouse events
  const handleMouseDown = (e) => {
    // Don't start drag if clicking on delete button or favorite button
    if (e.target.closest('.delete-btn') || e.target.closest('.favorite-btn')) {
      return;
    }
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

  // Touch events
  const handleTouchStart = (e) => {
    // Don't start drag if touching delete button or favorite button
    if (e.target.closest('.delete-btn') || e.target.closest('.favorite-btn')) {
      return;
    }
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
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)'
      }}>
        <p>No more cards to show</p>
      </div>
    );
  }

  const rotation = dragOffset.x / 20;
  const opacity = Math.max(0, 1 - Math.abs(dragOffset.x) / 200);

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'relative',
        width: `${Math.min(450, 90)}%`,
        maxWidth: `${450 * scale}px`,
        // Responsive height: Use predefined scale but cap at 75vh for mobile
        height: `min(${600 * scale}px, 70dvh)`,
        perspective: '1000px',
        touchAction: 'none' // Prevent browser scrolling while swiping
      }}>
        {cards.map((product, index) => {
          const isTop = index === 0;
          const offset = index * 10;
          const cardScale = 1 - index * 0.05;
          const cardOpacity = Math.max(0.5, 1 - index * 0.2);

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
              <ProductCard product={product} onDelete={onDelete} onToggleFavorite={onToggleFavorite} />
            </div>
          );
        })}

        {/* Swipe indicators */}
        {dragging && Math.abs(dragOffset.x) > 50 && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: dragOffset.x > 0 ? 'auto' : '2rem',
            right: dragOffset.x > 0 ? '2rem' : 'auto',
            transform: 'translateY(-50%)',
            fontSize: '3rem',
            opacity: Math.min(1, Math.abs(dragOffset.x) / 100),
            pointerEvents: 'none',
            zIndex: 1000
          }}>
            {dragOffset.x > 0 ? '→' : '←'}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

function LoginPage({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const endpoint = isRegister ? '/api/register' : '/api/login';

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
      height: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)'
    }}>
      <div className="glass-panel" style={{ padding: '2rem', width: '100%', maxWidth: '400px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
          {isRegister ? 'Create Account' : 'Welcome to OmniShop'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.875rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            padding: '0.75rem',
            borderRadius: '8px',
            background: 'var(--accent-color)',
            color: 'white',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            opacity: loading ? 0.7 : 1,
            marginTop: '0.5rem'
          }}>
            {loading ? 'Please wait...' : (isRegister ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
          <button
            onClick={() => setIsRegister(!isRegister)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            {isRegister ? 'Already have an account? Log In' : 'New here? Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
