// src/routes/Root.jsx
import { Outlet } from 'react-router';

export default function Root() {
  // const navigation = useNavigation();

  return (
    <div className="h-full flex flex-col">
      <header className="p-4 border-b border-gray-300 bg-gray-100 shrink-0 flex items-center select-none">
        <h1 className="text-xl font-bold">Shelf</h1>
        {/* <Breadcrumbs /> 动态面包屑组件 */}
      </header>
      <main className="grow h-full overflow-hidden">
        {/* 子路由将在这里全屏渲染 */}
        <Outlet />
      </main>
    </div>
  );
}