// src/routes/Root.jsx
import NavDrawer from '@/components/NavDrawer';
import { useEffect } from 'react';
import { Outlet, useNavigation } from 'react-router';
import { toast, Toaster } from 'sonner';

export default function Root() {
  const navigation = useNavigation();

  useEffect(() => {
    const state = navigation.state;
    if (state === 'idle') {
      toast.dismiss('router-loading');
    } else {
      // loading or submitting
      toast.loading(state === 'loading' ? '页面加载中...' : '提交中...', {
        toasterId: 'loading',
        id: 'router-loading',
        duration: Infinity,
      });
    }
  }, [navigation.state])

  return (
    <div className="h-full flex border-t border-gray-200">
      <header className="shrink-0 flex select-none">
        <NavDrawer />
      </header>
      <main className="grow h-full overflow-hidden">
        <Outlet />
      </main>
      <Toaster id='global' position="top-right" richColors />
      <Toaster id="loading" position="top-center" richColors />
    </div>
  );
}