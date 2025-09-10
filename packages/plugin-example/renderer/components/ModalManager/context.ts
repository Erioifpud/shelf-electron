import { createContext, ReactNode } from "react";

export interface ConfirmModalProps {
  title: ReactNode;
  children: ReactNode;
  labels?: { confirm?: string; cancel?: string };
  confirmProps?: any;
  onCancel?: () => void;
  onConfirm?: () => void;
}

export interface ModalContextType {
  openModal: (content: ReactNode) => void;
  openConfirmModal: (props: ConfirmModalProps) => void;
  closeModal: (id: string) => void;
}


export const ModalContext = createContext<ModalContextType | undefined>(undefined);