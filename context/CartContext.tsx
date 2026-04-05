import { ProductDatabase } from '@/database/types/Produto';
import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from 'react';

// Context para dados do cart (muda quando cart muda)
type CartDataContextType = {
  cart: ProductDatabase[];
};

// Context para ações (referências estáveis, nunca muda)
type CartActionsContextType = {
  addToCart: (product: ProductDatabase) => void;
  removeFromCart: (productId: string) => void;
  updateCartItem: (productId: string, quantidade: number) => void;
  clearCart: () => void;
  /** Adiciona ao cart apenas se o produto ainda não existe. Retorna true se adicionou. */
  addIfNotInCart: (product: ProductDatabase) => boolean;
};

const CartDataContext = createContext<CartDataContextType | undefined>(undefined);
const CartActionsContext = createContext<CartActionsContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<ProductDatabase[]>([]);
  const cartRef = useRef<ProductDatabase[]>(cart);
  cartRef.current = cart;

  const addToCart = useCallback((product: ProductDatabase) => {
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
  }, []);

  const addIfNotInCart = useCallback((product: ProductDatabase): boolean => {
    const exists = cartRef.current.some((item) => item.id === product.id);
    if (exists) return false;
    setCart((prevCart) => [...prevCart, { ...product, quantidade: 1 }]);
    return true;
  }, []);

  const removeFromCart = useCallback((productId: string) => {
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
  }, []);

  const updateCartItem = useCallback((productId: string, quantidade: number) => {
    setCart((prevCart) => {
      if (quantidade > 0) {
        return prevCart.map((item) =>
          item.id === productId
            ? { ...item, quantidade }
            : item
        );
      }
      return prevCart.filter((item) => item.id !== productId);
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const dataValue = useMemo(() => ({ cart }), [cart]);

  const actionsValue = useMemo(
    () => ({ addToCart, removeFromCart, updateCartItem, clearCart, addIfNotInCart }),
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
