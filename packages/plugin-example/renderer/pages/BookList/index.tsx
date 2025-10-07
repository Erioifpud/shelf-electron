import { memo, useCallback, useEffect, useMemo } from "react";
import { Link, Outlet, useFetcher, useLoaderData, useMatches } from "react-router";
import { Button } from "@/components/ui/button";
import { usePageCacheStore } from "@/store/pageCacheStore";
import { useParams } from "react-router";
import { useShallow } from 'zustand/react/shallow'
import { toast } from "sonner";

interface BookItem {
  author: string;
  category: string;
  cover: string;
  coverHeight: number;
  coverWidth: number;
  description: string;
  detailUrl: string;
  duration: string;
  idCode: string;
  largeImage: string;
  likes: string;
  publishDate: string;
  rating: string;
  title: string;
  totalPictures: string;
  updateDate: string;
  uploader: string;
  video: string;
  views: string;
}

interface Resp {
  items: BookItem[];
  pager: {
    nextPage: string;
  }
}

const BookList = memo(() => {
  const res = useLoaderData<Resp>()
  const { pageId } = useParams()
  const fetcher = useFetcher()
  const matches = useMatches()

  const latestMatch = useMemo(() => {
    return matches[matches.length - 1]
  }, [matches])

  const { cachedData, setPageData, appendPageItems } = usePageCacheStore(
    useShallow((state) => ({
      cachedData: state.cache[pageId!],
      setPageData: state.setPageData,
      appendPageItems: state.appendPageItems,
    }))
  );

  // 初始化页面数据
  useEffect(() => {
    // 只有当 store 中没有此页面的缓存数据时，
    // 才使用 loader 的初始数据来填充 store。
    if (!cachedData) {
      setPageData(pageId!, res);
    }
  }, [pageId, res, cachedData, setPageData]);

  // 使用 load 后加载新数据，并更新 store
  useEffect(() => {
    const fetchedData = fetcher.data
    if (fetchedData && fetcher.state === 'idle') {
      if (!fetchedData) {
        return
      }
      appendPageItems(pageId!,  fetchedData.items, fetchedData.pager?.nextPage || '');
    }
  }, [fetcher.data, fetcher.state, pageId, appendPageItems]);

  const nextPageUrl = useMemo(() => {
    return cachedData?.pager?.nextPage || ''
  }, [cachedData])

    const handleNextPageLoad = useCallback(() => {
    fetcher.load(`./next?page=${nextPageUrl}`, {})
  }, [nextPageUrl])

  useEffect(() => {
    const state = fetcher.state
    if (state === 'loading') {
      toast.loading('下一页加载中...', {
        toasterId: 'loading',
        id: 'next-page-loading',
        duration: Infinity,
        dismissible: true,
      })
    } else {
      toast.dismiss('next-page-loading')
    }
  }, [fetcher.state])

  if (latestMatch?.id !== 'read-list') {
    return <Outlet />
  }
  
  return (
    <div className="flex flex-col gap-4 overflow-auto h-full p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
        {(cachedData?.items || []).map(item => {
          return (
            <Link to={`./detail/${encodeURIComponent(item.idCode)}`} key={item.idCode}>
              <div className="flex flex-col gap-2 group select-none cursor-pointer">
                <div
                  className="aspect-3/4 bg-white rounded-md shadow-sm flex items-center justify-center transition group-hover:shadow-md"
                  style={{
                    backgroundImage: `url(${item.cover || 'https://placehold.co/320'})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                >
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold">{item.title}</span>
                  <span className="text-sm text-gray-500">{item.author}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      
      <div className="w-full flex justify-center items-center">
        <Button
          variant="outline"
          onClick={handleNextPageLoad}
          disabled={!nextPageUrl || fetcher.state === 'loading'}
        >
          {nextPageUrl ? '加载下一页' : '没有更多了'}
        </Button>
      </div>
      
    </div>
  )
})

export default BookList;