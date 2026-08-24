import { Product } from '@/database/types/Product';
import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from 'react';

// Context para dados do cart (muda quando cart muda)
type CartDataContextType = {
  cart: Product[];
  customerName: string;
};

// Context para ações (referências estáveis, nunca muda)
type CartActionsContextType = {
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartItem: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** Adiciona ao cart apenas se o produto ainda não existe. Retorna true se adicionou. */
  addIfNotInCart: (product: Product) => boolean;
  setCliente: (name: string) => void;
};

const CartDataContext = createContext<CartDataContextType | undefined>(undefined);
const CartActionsContext = createContext<CartActionsContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<Product[]>([]);
  const [customerName, setCliente] = useState('');
  const cartRef = useRef<Product[]>(cart);
  cartRef.current = cart;

  const addToCart = useCallback((product: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: (item.quantity || 0) + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  }, []);

  const addIfNotInCart = useCallback((product: Product): boolean => {
    const exists = cartRef.current.some((item) => item.id === product.id);
    if (exists) return false;
    setCart((prevCart) => [...prevCart, { ...product, quantity: 1 }]);
    return true;
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === productId);
      if (existingItem && (existingItem.quantity ?? 0) > 1) {
        return prevCart.map((item) =>
          item.id === productId
            ? { ...item, quantity: (item.quantity ?? 0) - 1 }
            : item
        );
      }
      return prevCart.filter((item) => item.id !== productId);
    });
  }, []);

  const updateCartItem = useCallback((productId: string, quantity: number) => {
    setCart((prevCart) => {
      if (quantity > 0) {
        return prevCart.map((item) =>
          item.id === productId
            ? { ...item, quantity }
            : item
        );
      }
      return prevCart.filter((item) => item.id !== productId);
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCliente('');
  }, []);

  const dataValue = useMemo(() => ({ cart, customerName }), [cart, customerName]);

  const actionsValue = useMemo(
    () => ({ addToCart, removeFromCart, updateCartItem, clearCart, addIfNotInCart, setCliente }),
    [addToCart, removeFromCart, updateCartItem, clearCart, addIfNotInCart]
  );

  return (
    <CartActionsContext.Provider value={actionsValue}>
      <CartDataContext.Provider value={dataValue}>
        {children}
      </CartDataContext.Provider>
    </CartActionsContext.Provider>
  );
};

/** Hook que lê o cart — re-renderiza quando cart muda */
export const useCart = () => {
  const data = useContext(CartDataContext);
  const actions = useContext(CartActionsContext);
  if (!data || !actions) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return { ...data, ...actions };
};

/** Hook que retorna apenas ações — NUNCA re-renderiza por mudança de cart */
export const useCartActions = () => {
  const actions = useContext(CartActionsContext);
  if (!actions) {
    throw new Error('useCartActions must be used within a CartProvider');
  }
  return actions;
};
