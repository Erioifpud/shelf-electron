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
  const navigation = useNavigation();

  return (
    <div>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ccc', background: '#f8f9fa' }}>
        <h1>My Awesome App</h1>
        <Breadcrumbs /> {/* 动态面包屑组件 */}
      </header>
      <main style={{ padding: '1rem', position: 'relative' }}>
        {/* 加载指示器 */}
        {navigation.state === 'loading' && (
          <div style={{ position: 'absolute', top: 5, right: 5 }}>Loading...</div>
        )}
        {/* 子路由将在这里全屏渲染 */}
        <Outlet />
        <NavLink to="/sources/1123">Go to Home</NavLink>
      </main>
    </div>
  );
}