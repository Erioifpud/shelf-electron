// src/routes/Root.jsx
import NavDrawer from '@/components/NavDrawer';
import { Outlet } from 'react-router';

export default function Root() {
  // const navigation = useNavigation();

  return (
    <div className="h-full flex border-t border-gray-200">
      <header className="shrink-0 flex select-none">
        <NavDrawer />
      </header>
      <main className="grow h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}