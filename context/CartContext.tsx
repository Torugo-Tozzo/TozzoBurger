import { ProductDatabase } from '@/database/useProductDatabase';
import React, { createContext, useContext, useState, ReactNode } from 'react';

type CartContextType = {
  cart: ProductDatabase[];
  addToCart: (product: ProductDatabase) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<ProductDatabase[]>([]);

  const addToCart = (product: ProductDatabase) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, quantidade: (item.quantidade || 0) + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantidade: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === productId);
      if (existingItem && (existingItem.quantidade ?? 0) > 1) {
        return prevCart.map((item) =>
          item.id === productId
            ? { ...item, quantidade: (item.quantidade ?? 0) - 1 }
            : item
        );
      }
      return prevCart.filter((item) => item.id !== productId);
    });
  };  

  const clearCart = () => {
    setCart([]);
  };

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};