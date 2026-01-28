import React from 'react';

const ProductCard = ({ product, onDelete, onToggleFavorite }) => {
    const { id, url, title, image, price, size, error, is_favorite } = product;

    const handleClick = (e) => {
        // Don't trigger if delete btn clicked or favorite btn clicked
        if (e.target.closest('.delete-btn') || e.target.closest('.favorite-btn')) return;
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
            return 'Link';
        }
    };

    return (
        <div
            className="glass-panel"
            onClick={handleClick}
            style={{
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'transform 0.2s',
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{
                width: '100%',
                paddingTop: '100%', /* Square Aspect Ratio */
                position: 'relative',
                backgroundColor: '#000'
            }}>
                {image ? (
                    <img
                        src={image}
                        alt={title}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                ) : (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#555'
                    }}>
                        No Image
                    </div>
                )}
                {error && (
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(255,0,0,0.8)',
                        color: 'white',
                        padding: '4px',
                        fontSize: '0.8rem',
                        textAlign: 'center'
                    }}>
                        !
                    </div>
                )}
                <button
                    className="delete-btn"
                    onClick={handleDelete}
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(0,0,0,0.6)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: 0,
                        zIndex: 2
                    }}
                >
                    ×
                </button>
                <button
                    className="favorite-btn"
                    onClick={handleFavoriteClick}
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '36px',
                        background: 'rgba(0,0,0,0.6)',
                        color: is_favorite ? '#ef4444' : 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: 0,
                        zIndex: 2,
                        transition: 'color 0.2s ease'
                    }}
                >
                    ♥
                </button>
            </div>

            <div style={{ padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                    <span style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem',
                        display: 'block'
                    }}>
                        {getDomain(url)}
                    </span>
                    <h3 style={{
                        fontSize: '1rem',
                        lineHeight: '1.4',
                        marginBottom: '0.5rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                    }}>
                        {title}
                    </h3>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                        fontSize: '1.125rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)'
                    }}>
                        {price}
                    </span>
                    {size && size !== 'Visit Site' && (
                        <span style={{
                            fontSize: '0.875rem',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'var(--text-secondary)'
                        }}>
                            {size}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
