import React from 'react';
import { useImagePreview } from './useImagePreview';

interface Props {
  url: string;
  children: (preview: (url?: string) => void) => React.ReactElement;
}

export const ImagePreview: React.FC<Props> = ({ url, children }) => {
  const preview = useImagePreview();
  return <>{children((u) => preview(u ?? url))}</>;
};