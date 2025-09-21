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
import { pageCreateAction, pageEditAction, pageEditLoader, pageListLoader, pageRemoveAction, pageSortAction, ruleCreateAction, ruleEditAction, ruleEditLoader, ruleListLoader, ruleRemoveAction, sourceCreateAction, sourceEditAction, sourceEditLoader, sourceRemoveAction } from "./SourceEdit/loader";
import SourceEdit from "./SourceEdit";
import PageList from "./SourceEdit/PageList";
import SiteEdit from "./SourceEdit/SiteEdit";
import PageEdit from "./SourceEdit/PageEdit";
import RuleList from "./SourceEdit/RuleList";
import RuleEdit from "./SourceEdit/RuleEdit";
import ReadRoot from "./ReadRoot";
import { readRootLoader } from "./ReadRoot/loader";

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
              // 规则编辑相关
              {
                id: 'rule-list',
                path: "rules",
                loader: ruleListLoader,
                element: <RuleList />,
                children: [
                  {
                    id: 'rule-create',
                    path: 'create',
                    action: ruleCreateAction,
                  },
                  {
                    id: 'rule-edit',
                    path: ':ruleId/edit',
                    loader: ruleEditLoader,
                    action: ruleEditAction,
                    element: <RuleEdit />,
                    children: [
                      {
                        id: 'rule-remove',
                        path: 'destroy',
                        action: ruleRemoveAction,
                      },
                    ]
                  }
                ]
              }
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
        id: 'read',
        path: 'read/:sourceId',
        loader: readRootLoader,
        element: <ReadRoot />,
        children: [
          {
            id: 'read-list',
            path: 'pages/:pageId',
            element: <BookList />,
            loader: booksLoader,
            children: [
              {
                id: 'read-detail',
                path: 'detail/:detailId',
                element: <BookDetail />,
                loader: bookDetailLoader,
                children: [
                  {
                    id: 'read-content',
                    path: 'chapter/:chapterId',
                    element: <ChapterDetail />,
                    loader: chapterDetailLoader,
                  }
                ]
              }
            ]
          }
        ]
      },
    ]
  }
]);
