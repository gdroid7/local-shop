import React, { useState, useEffect, useRef } from 'react';
import ProductCard from './components/ProductCard';
import ConfirmDialog from './components/ConfirmDialog';

function App() {
  const [urls, setUrls] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'swipe'
  const [cardScale, setCardScale] = useState(1); // 0.7 to 1.5
  const [currentIndex, setCurrentIndex] = useState(0); // Current card index for swipe mode
  const [sidebarOpen, setSidebarOpen] = useState(false); // Sidebar toggle for mobile
  const [category, setCategory] = useState('all'); // 'all', 'clothes', 'shoes'
  const [confirmDelete, setConfirmDelete] = useState(null); // Product to confirm deletion for

  // Initial load
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error('Failed to load products');
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
        body: JSON.stringify({ urls: urls }),
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
      await fetch(`/api/products/${confirmDelete.id}`, { method: 'DELETE' });
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? '100%' : '350px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        position: sidebarOpen ? 'fixed' : 'relative',
        zIndex: 1000,
        height: '100vh',
        overflowY: 'auto'
      }}>

        {/* Mobile toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            display: 'none',
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'var(--accent-color)',
            padding: '0.5rem',
            borderRadius: '8px',
            zIndex: 1001
          }}
          className="mobile-toggle"
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>

        <div style={{ padding: '2rem' }}>
          <header style={{ marginBottom: '2rem' }}>
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
              Singapore product shortlist
            </p>
          </header>

          {/* Input Section */}
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
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
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            <section className="product-grid" style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(${200 * cardScale}px, 1fr))`,
              gap: `${1.5 * cardScale}rem`,
            }}>
              {filteredProducts.map((product) => (
                <ProductCard key={product.id || product.url} product={product} onDelete={handleDelete} />
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
            scale={cardScale}
          />
        )}

        {/* Navigation Buttons for Swipe Mode */}
        {viewMode === 'swipe' && products.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '1rem',
            zIndex: 10,
            marginLeft: '175px' // Offset for sidebar
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
                opacity: currentIndex === 0 ? 0.3 : 1
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
                opacity: currentIndex >= filteredProducts.length - 1 ? 0.3 : 1
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
function SwipeableCards({ cards, currentIndex, totalCards, onSwipe, onDelete, scale }) {
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
    // Don't start drag if clicking on delete button
    if (e.target.closest('.delete-btn')) {
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
    // Don't start drag if touching delete button
    if (e.target.closest('.delete-btn')) {
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
        height: `${600 * scale}px`,
        perspective: '1000px'
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
              <ProductCard product={product} onDelete={onDelete} />
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
