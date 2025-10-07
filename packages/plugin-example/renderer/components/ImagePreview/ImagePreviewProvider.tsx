import React, { createContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Overlay } from './Overlay';

type PreviewFn = (url: string) => void;

export const ImagePreviewContext = createContext<PreviewFn>(() => {});

export const ImagePreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [url, setUrl] = useState<string | null>(null);
  const preview = useCallback((next: string) => setUrl(next), []);
  const close = useCallback(() => setUrl(null), []);

  return (
    <ImagePreviewContext.Provider value={preview}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(<Overlay url={url} onClose={close} />, document.body)}
    </ImagePreviewContext.Provider>
  );
};