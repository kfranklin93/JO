'use client';

import * as React from 'react';
import type { ModalState } from '@/types';

export function useModal(initialState: ModalState = { isOpen: false, modalId: null }) {
  const [modal, setModal] = React.useState<ModalState>(initialState);

  const openModal = React.useCallback((modalId: string, data?: Record<string, unknown>) => {
    setModal({
      isOpen: true,
      modalId,
      ...(data ? { data } : {}),
    });
  }, []);

  const closeModal = React.useCallback(() => {
    setModal({
      isOpen: false,
      modalId: null,
    });
  }, []);

  return {
    modal,
    openModal,
    closeModal,
    isOpen: modal.isOpen,
    modalId: modal.modalId,
  };
}

// Made with Bob
