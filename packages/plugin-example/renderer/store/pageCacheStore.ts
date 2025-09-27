import { create } from "zustand";

interface PageCacheStore {
  cache: Record<string, { items: any[], nextPageUrl: string }>;
  setPageData: (pageId: string, data: any) => void;
  appendPageItems: (pageId: string, newItems: any[], nextPageUrl: string) => void;
  clearPageCache: (pageId: string) => void;
  clearAllPageCache: () => void;
}

// page 概念的数据缓存
// 不加这个 store 其实也能缓存 Page 下的 books 数据，因为路由是嵌套的，加载了 Detail 后 Page 不会被卸载，所以数据不会丢失
// 加上是为了在切换 Page 时（Tab 间切换）能够保留数据，此时是 replace，所以正常来说是会卸载 Page 的
export const usePageCacheStore = create<PageCacheStore>((set) => ({
  // 数据结构如 { 'pageId': { items: [...], nextPageUrl: '...' } }
  cache: {},
  
  // 更新或设置某个页面的缓存
  setPageData: (pageId, data) => set((state) => ({
    cache: {
      ...state.cache,
      [pageId]: data,
    },
  })),

  // 追加数据
  appendPageItems: (pageId, newItems, nextPageUrl) => set((state) => {
    const currentPageData = state.cache[pageId] || { items: [] };
    return {
      cache: {
        ...state.cache,
        [pageId]: {
          items: [...currentPageData.items, ...newItems],
          nextPageUrl: nextPageUrl,
        },
      },
    };
  }),

  // 清理缓存
  clearPageCache: (pageId) => set((state) => {
    const newCache = { ...state.cache };
    delete newCache[pageId];
    return { cache: newCache };
  }),

  clearAllPageCache: () => set(() => ({ cache: {} }))
}));