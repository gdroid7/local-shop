import React, { useState } from 'react';

const ProductCard = ({ product, onDelete, onToggleFavorite, isSwipeMode = false }) => {
    const { id, url, title, image, price, size, error, is_favorite } = product;
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleClick = (e) => {
        if (e.target.closest('.card-action-btn')) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onDelete(id);
    };

    const handleFavoriteClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleFavorite(id, !is_favorite);
    };

    const getDomain = (link) => {
        try {
            const urlObj = new URL(link);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return 'Store';
        }
    };

    const displayPrice = price && price.trim() && price !== 'Check Site' ? price : 'Check Price';

    return (
        <div
            className="glass-panel"
            onClick={handleClick}
            style={{
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                boxShadow: 'var(--card-shadow)',
                position: 'relative'
            }}
            onMouseEnter={(e) => {
                if (!isSwipeMode) {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'var(--border-color-hover)';
                    e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)';
                }
            }}
            onMouseLeave={(e) => {
                if (!isSwipeMode) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.boxShadow = 'var(--card-shadow)';
                }
            }}
        >
            {/* Image Container */}
            <div style={{
                width: '100%',
                position: 'relative',
                backgroundColor: '#121216',
                overflow: 'hidden',
                ...(isSwipeMode ? { flex: '1 1 55%', minHeight: '200px' } : { aspectRatio: '1 / 1' })
            }}>
                {/* Shimmer Placeholder while Image is Downloading */}
                {image && !imageError && !imageLoaded && (
                    <div
                        className="shimmer-effect"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1
                        }}
                    >
                        <span className="compact-spinner compact-spinner-accent" style={{ width: '20px', height: '20px' }} />
                    </div>
                )}

                {image && !imageError ? (
                    <img
                        src={image}
                        alt={title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageError(true)}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: isSwipeMode ? 'contain' : 'cover',
                            backgroundColor: '#121216',
                            transition: 'opacity 0.35s ease',
                            opacity: imageLoaded ? 1 : 0
                        }}
                    />
                ) : (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.65rem',
                        color: 'var(--text-muted)',
                        background: 'linear-gradient(145deg, #181820 0%, #0f0f14 100%)',
                        padding: '1.25rem',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--border-color)',
                            overflow: 'hidden'
                        }}>
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${getDomain(url)}&sz=64`}
                                alt=""
                                onError={(e) => { e.target.style.display = 'none'; }}
                                style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                            />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                            {getDomain(url)}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', opacity: 0.8 }}>
                            Click to view item ↗
                        </span>
                    </div>
                )}

                {/* Scrape Warning Badge if applicable */}
                {error && (
                    <div style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '8px',
                        background: 'rgba(239, 68, 68, 0.85)',
                        backdropFilter: 'blur(4px)',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                    }}>
                        Check store page
                    </div>
                )}

                {/* Top Action Buttons */}
                <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    display: 'flex',
                    gap: '6px',
                    zIndex: 2
                }}>
                    <button
                        className="card-action-btn favorite-btn"
                        onClick={handleFavoriteClick}
                        title={is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                        style={{
                            background: is_favorite ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 0, 0, 0.55)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '15px',
                            padding: 0,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        ♥
                    </button>
                    <button
                        className="card-action-btn delete-btn"
                        onClick={handleDelete}
                        title="Remove product"
                        style={{
                            background: 'rgba(0, 0, 0, 0.55)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            color: 'rgba(255, 255, 255, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '16px',
                            padding: 0,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Content Info */}
            <div style={{
                padding: isSwipeMode ? '1.25rem' : '1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                flex: isSwipeMode ? '0 0 auto' : '1',
                gap: '0.75rem'
            }}>
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        marginBottom: '0.35rem'
                    }}>
                        <span style={{
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            color: 'var(--accent-color)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            background: 'var(--accent-light)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                        }}>
                            {getDomain(url)}
                        </span>
                        {size && size !== 'Visit Site' && (
                            <span style={{
                                fontSize: '0.75rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--text-secondary)',
                                fontWeight: '500'
                            }}>
                                {size}
                            </span>
                        )}
                    </div>

                    <h3 style={{
                        fontSize: isSwipeMode ? '1.1rem' : '0.925rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        lineHeight: '1.35',
                        display: '-webkit-box',
                        WebkitLineClamp: isSwipeMode ? 3 : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        wordBreak: 'break-word',
                        minHeight: isSwipeMode ? 'auto' : '2.7em'
                    }}>
                        {title || 'Untitled Product'}
                    </h3>
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <span style={{
                        fontSize: isSwipeMode ? '1.25rem' : '1.05rem',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.01em'
                    }}>
                        {displayPrice}
                    </span>

                    <span style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        View ↗
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
