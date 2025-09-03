import { createHashRouter, Navigate } from "react-router";
import SourceList from "./SourceList";
import Root from "./Root";
import BookList from "./BookList";
import BookDetail from "./BookDetail";
import ChapterDetail from "./ChapterDetail";
import { sourcesLoader } from "./SourceList/loader";
import { booksLoader } from "./BookList/loader";
import { bookDetailLoader } from "./BookDetail/loader";
import { chapterDetailLoader } from "./ChapterDetail/loader";

const ErrorPage = () => {
  return (
    <div>
      <h2>Oops! Something went wrong.</h2>
      <p>We're sorry, but we couldn't find the page you were looking for.</p>
    </div>
  );
};

export const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorPage />,
    handle: {
      crumb: () => <span>Home</span>,
    },
    children: [
      {
        // 当 URL 路径与父路径完全相同时，此路由会匹配
        index: true,
        // element 将会渲染一个执行重定向的组件
        element: <Navigate to="/sources" replace />,
      },
      {
        // 第一层: SourceList 列表
        path: 'sources',
        element: <SourceList />,
        loader: sourcesLoader, // 关联 loader
        handle: {
          crumb: () => <span>Sources</span>,
        },
      },
      {
        // 第一层: SourceList 列表
        path: 'sources/:id',
        element: <BookList />,
        loader: booksLoader, // 关联 loader
        handle: {
          crumb: () => <span>Books</span>,
        },
        children: [
          {
            path: 'detail/:bid',
            element: <BookDetail />,
            loader: bookDetailLoader, // 关联 loader
            handle: {
              crumb: () => <span>BookDetail</span>,
            },
            children: [
              {
                path: 'chapter/:cid',
                element: <ChapterDetail />,
                loader: chapterDetailLoader,
                handle: {
                  crumb: () => <span>ChapterDetail</span>,
                },
              }
            ]
          }
        ]
      },
    ]
  }
]);
