import React from 'react';

const ConfirmDialog = ({ isOpen, onConfirm, onCancel, product }) => {
    if (!isOpen) return null;

    return (
        <div
            className="confirm-overlay"
            onClick={onCancel}
        >
            <div
                className="confirm-dialog"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="confirm-header">
                    <h3>Remove Product?</h3>
                </div>

                {product && (
                    <div className="confirm-content">
                        <p>Are you sure you want to remove this product?</p>
                        <div className="product-preview">
                            <img src={product.image} alt={product.title} />
                            <div className="product-info">
                                <div className="product-title">{product.title}</div>
                                <div className="product-price">{product.price}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="confirm-actions">
                    <button
                        className="btn-cancel"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-confirm"
                        onClick={onConfirm}
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
