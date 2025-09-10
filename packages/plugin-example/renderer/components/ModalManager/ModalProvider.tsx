import React, { useState, createContext, useContext, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';
import { ConfirmModalProps, ModalContext } from './context';

interface ModalState {
  id: string;
  content: ReactNode;
  isOpen: boolean;
}

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modals, setModals] = useState<ModalState[]>([]);

  const openModal = (content: ReactNode) => {
    const id = nanoid();
    setModals((prev) => [...prev, { id, content, isOpen: true }]);
  };

  const closeModal = (id: string) => {
    setModals((prev) =>
      prev.map((modal) => (modal.id === id ? { ...modal, isOpen: false } : modal))
    );
    setTimeout(() => {
      setModals((prev) => prev.filter((modal) => modal.id !== id));
    }, 200);
  };

  const openConfirmModal = ({
    title,
    children: modalChildren,
    labels,
    confirmProps,
    onCancel,
    onConfirm,
  }: ConfirmModalProps) => {
    const id = nanoid();
    const handleConfirm = () => {
      onConfirm?.();
      closeModal(id);
    };

    const handleCancel = () => {
      onCancel?.();
      closeModal(id);
    };

    const content = (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>{modalChildren}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {labels?.cancel || 'Cancel'}
          </Button>
          <Button {...confirmProps} onClick={handleConfirm}>
            {labels?.confirm || 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    );

    setModals((prev) => [...prev, { id, content, isOpen: true }]);
  };

  return (
    <ModalContext.Provider value={{ openModal, openConfirmModal, closeModal }}>
      {children}
      {modals.map((modal) => (
        <Dialog key={modal.id} open={modal.isOpen} onOpenChange={(isOpen) => !isOpen && closeModal(modal.id)}>
          {modal.content}
        </Dialog>
      ))}
    </ModalContext.Provider>
  );
};
