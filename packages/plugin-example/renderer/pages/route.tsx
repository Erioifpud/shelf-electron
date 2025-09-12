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
import SelectSourceHint from "./SourceList/components/SelectSourceHint";
import { pageCreateAction, pageEditAction, pageEditLoader, pageListLoader, pageRemoveAction, pageSortAction, sourceCreateAction, sourceEditAction, sourceEditLoader, sourceRemoveAction } from "./SourceEdit/loader";
import SourceEdit from "./SourceEdit";
import PageList from "./SourceEdit/PageList";
import SiteEdit from "./SourceEdit/SiteEdit";
import PageEdit from "./SourceEdit/PageEdit";

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
        index: true,
        element: <Navigate to="/sources" replace />,
      },
      {
        id: 'source-list',
        path: 'sources',
        element: <SourceList />,
        loader: sourcesLoader,
        handle: {
          crumb: () => <span>Sources</span>,
        },
        children: [
          {
            index: true, 
            element: <SelectSourceHint /> 
          },
          {
            path: ":sourceId",
            element: <SourceEdit />,
            children: [
              // 站点编辑相关
              {
                id: 'source-edit',
                path: "edit",
                action: sourceEditAction,
                loader: sourceEditLoader,
                element: <SiteEdit />,
                children: [
                  {
                    id: 'source-remove',
                    path: "destroy",
                    action: sourceRemoveAction,
                  },
                ]
              },
              // 页面编辑相关
              {
                id: 'page-list',
                path: "pages",
                loader: pageListLoader,
                element: <PageList />,
                children: [
                  {
                    id: 'page-create',
                    path: 'create',
                    action: pageCreateAction,
                  },
                  {
                    id: 'page-sort',
                    path: 'sort',
                    action: pageSortAction,
                  },
                  {
                    id: 'page-edit',
                    path: ':pageId/edit',
                    loader: pageEditLoader,
                    action: pageEditAction,
                    element: <PageEdit />,
                    children: [
                      {
                        id: 'page-remove',
                        path: 'destroy',
                        action: pageRemoveAction,
                      },
                    ]
                  }
                ]
              },
            ]
          },
          {
            id: 'source-create',
            path: "create",
            action: sourceCreateAction,
          },
        ]
      },
      {
        id: 'book-list',
        path: 'sources/:sourceId',
        element: <BookList />,
        loader: booksLoader,
        handle: {
          crumb: () => <span>Books</span>,
        },
        children: [
          {
            id: 'book-detail',
            path: 'detail/:bookId',
            element: <BookDetail />,
            loader: bookDetailLoader,
            handle: {
              crumb: () => <span>BookDetail</span>,
            },
            children: [
              {
                id: 'reader',
                path: 'chapter/:chapterId',
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
