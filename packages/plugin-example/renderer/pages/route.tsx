import { createBrowserRouter, Navigate } from "react-router";
import Source from "./Source";

const wrap = (children: React.ReactNode) => {
  return children;
};

const router = createBrowserRouter([
  {
    path: "/source",
    element: wrap(<Source />),
  },
  {
    path: '/',
    element: <Navigate to="/source" replace />
  }
], {
  basename: "/renderer/index.html"
});

export default router;