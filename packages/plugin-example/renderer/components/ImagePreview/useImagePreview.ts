import { useContext } from 'react';
import { ImagePreviewContext } from './ImagePreviewProvider';

export const useImagePreview = () => useContext(ImagePreviewContext);