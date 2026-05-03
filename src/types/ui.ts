/**
 * UI State Types
 * 
 * Types for global UI state management including modals, toasts, and loading states.
 * Used for consistent user feedback and interaction patterns.
 */

/**
 * Modal state
 */
export interface ModalState {
  isOpen: boolean;
  modalId: string | null;
  data?: Record<string, unknown>;
}

/**
 * Toast notification
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Global loading state
 */
export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number; // 0-100
}

/**
 * Global UI state
 */
export interface UIState {
  modals: ModalState;
  toasts: Toast[];
  loading: LoadingState;
  isMobileMenuOpen: boolean;
}

// Made with Bob
