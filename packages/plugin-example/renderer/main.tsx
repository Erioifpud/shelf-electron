import { createRoot } from 'react-dom/client'
import './style.css'
import { RouterProvider } from "react-router"
import { router } from './pages/route'
import { ModalProvider } from './components/ModalManager'
import { ImagePreviewProvider } from '@/components/ImagePreview';

createRoot(document.getElementById('root')!).render(
  <ImagePreviewProvider>
    <ModalProvider>
      <RouterProvider router={router} />
    </ModalProvider>,
  </ImagePreviewProvider>
)
