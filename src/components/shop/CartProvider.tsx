"use client";

// Client-side cart with localStorage persistence. The order API re-validates
// every item and price server-side before accepting an order — this context
// is convenience, not a source of truth.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Garment } from "@/types";
export { formatPrice } from "@/lib/price";

export interface CartItem {
  garmentId: string;
  size: string;
  qty: number;
  // Snapshot for display (price truth lives in the catalog / order API)
  name: string;
  price: number;
  thumbnailPath: string;
  colorHex: string;
  category: string;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  addItem: (garment: Garment, size: string, qty?: number) => void;
  updateQty: (garmentId: string, size: string, qty: number) => void;
  removeItem: (garmentId: string, size: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "vf_cart_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* corrupt cart — start fresh */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage full/blocked — cart stays in memory */
    }
  }, [items]);

  const addItem = useCallback((garment: Garment, size: string, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.garmentId === garment.id && i.size === size);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(10, next[idx].qty + qty) };
        return next;
      }
      return [
        ...prev,
        {
          garmentId: garment.id,
          size,
          qty,
          name: garment.name,
          price: garment.price ?? 0,
          thumbnailPath: garment.thumbnailPath,
          colorHex: garment.colorHex,
          category: garment.category,
        },
      ];
    });
  }, []);

  const updateQty = useCallback((garmentId: string, size: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => !(i.garmentId === garmentId && i.size === size))
        : prev.map((i) =>
            i.garmentId === garmentId && i.size === size ? { ...i, qty: Math.min(10, qty) } : i
          )
    );
  }, []);

  const removeItem = useCallback((garmentId: string, size: string) => {
    setItems((prev) => prev.filter((i) => !(i.garmentId === garmentId && i.size === size)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);
    return {
      items,
      count,
      subtotal,
      isOpen,
      setOpen,
      addItem,
      updateQty,
      removeItem,
      clear,
    };
  }, [items, isOpen, addItem, updateQty, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
