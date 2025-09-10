// src/routes/Root.jsx
import React from 'react';
import { Outlet, Link, useMatches, useNavigation, Route, NavLink } from 'react-router';

// 面包屑组件
function Breadcrumbs() {
  const matches = useMatches();
  // 过滤掉没有 crumb 函数的路由
  const crumbs = matches
    .filter((match) => Boolean(match.handle?.crumb))
    .map((match) => {
      // 调用 handle.crumb 函数，并传入 loader 数据
      const crumb = match.handle.crumb(match.data);
      return (
        <li key={match.id} className="breadcrumb-item">
          <Link to={match.pathname}>{crumb}</Link>
        </li>
      );
    });

  return (
    <nav aria-label="breadcrumb">
      <ol className="breadcrumb">{crumbs}</ol>
    </nav>
  );
}


export default function Root() {
  // const navigation = useNavigation();

  return (
    <div className="h-full flex flex-col">
      <header className="p-4 border-b border-gray-300 bg-gray-100 shrink-0 flex items-center select-none">
        <h1 className="text-xl font-bold">My Awesome App</h1>
        {/* <Breadcrumbs /> 动态面包屑组件 */}
      </header>
      <main className="grow h-full overflow-hidden">
        {/* 子路由将在这里全屏渲染 */}
        <Outlet />
      </main>
    </div>
  );
}