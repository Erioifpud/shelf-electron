import { ImagePreview } from "@/components/ImagePreview";
import { Separator } from "@/components/ui/separator";
import { EyeIcon, HeartIcon, StarIcon } from "lucide-react";
import { memo, useMemo } from "react";
import { useLoaderData } from "react-router";

interface Resp {
  tags: Array<{
    name: string
    url: string
  }> | null
  chapters: Array<{
    idCode: string
    title: string
    url: string
    updateDate: string
  }> | null
  comments: Array<{
    avatar: string
    username: string
    content: string
    date: string
    likes: number
  }> | null
  pictures: Array<{
    thumbnail: string
    url: string
    pageUrl: string
  }> | null
  videos: Array<{
    title: string
    cover: string
    url: string
  }> | null
  fields: {
    title: string;
    description: string;
    cover: string;
    category: string;
    rating: string;
    totalPictures: string;
    author: string;
    uploader: string;
    publishDate: string;
    updateDate: string;
    likes: string;
    views: string;
  }
  pager: {
    nextPage: string | null
  }
}

const BookDetail = memo(() => {
  const info = useLoaderData<Resp>()
  
  const { hasChapters, hasComments, hasPictures, hasTags, hasVideos } = useMemo(() => {
    return {
      hasTags: Array.isArray(info.tags) && info.tags.length > 0,
      hasChapters: Array.isArray(info.chapters) && info.chapters.length > 0,
      hasComments: Array.isArray(info.comments) && info.comments.length > 0,
      hasPictures: Array.isArray(info.pictures) && info.pictures.length > 0,
      hasVideos: Array.isArray(info.videos) && info.videos.length > 0,
    }
  }, [info.tags, info.chapters, info.comments, info.pictures, info.videos])

  return (
    <div className="flex flex-col gap-4 overflow-auto h-full p-6 bg-[#F3FAFF]">
      {/* 信息模块 */}
      <div className="flex gap-8">
        <div
          className="aspect-3/4 w-1/4 h-fit shrink-0 bg-white rounded-md shadow-md flex items-center justify-center transition"
          style={{
            backgroundImage: `url(${info.fields?.cover || 'https://placehold.co/320'})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className="flex flex-col grow gap-4">
          <div className="text-2xl font-bold text-gray-800">{info.fields?.title}</div>
          <div className="flex gap-4">
            <div>
              <span className="text-gray-500">作者：</span>
              <span className="font-bold text-gray-800">{info.fields?.author || '-'}</span>
            </div>
            <div>
              <span className="text-gray-500">上传者：</span>
              <span className="font-bold text-gray-800">{info.fields?.uploader || '-'}</span>
            </div>
          </div>
          {/* 评分 */}
          <div className="flex gap-4 items-center my-2">
            <div className="flex gap-1 items-center">
              <StarIcon className="size-5 text-yellow-500"></StarIcon>
              <span className="text-gray-800 font-bold">{info.fields?.rating || '-'}</span>
              <span className="text-gray-500 text-sm">(Rating)</span>
            </div>
            <div className="flex gap-1 items-center">
              <HeartIcon className="size-5 text-red-400"></HeartIcon>
              <span className="text-gray-800 font-bold">{info.fields?.likes || '-'}</span>
              <span className="text-gray-500 text-sm">(Likes)</span>
            </div>
            <div className="flex gap-1 items-center">
              <EyeIcon className="size-5 text-blue-400"></EyeIcon>
              <span className="text-gray-800 font-bold">{info.fields?.views || '-'}</span>
              <span className="text-gray-500 text-sm">(Views)</span>
            </div>
          </div>
          {/* 分隔 */}
          <Separator orientation="horizontal" />
          {/* 分类等信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-sm flex gap-2">
              <span className="font-bold text-gray-500 shrink-0">分类:</span>
              <span className="text-gray-800">{info.fields?.category || '-'}</span>
            </div>
            <div className="text-sm flex gap-2">
              <span className="font-bold text-gray-500 shrink-0">图片总数:</span>
              <span className="text-gray-800">{info.fields?.totalPictures || '-'}</span>
            </div>
            <div className="text-sm flex gap-2">
              <span className="font-bold text-gray-500 shrink-0">发布日期:</span>
              <span className="text-gray-800">{info.fields?.publishDate || '-'}</span>
            </div>
            <div className="text-sm flex gap-2">
              <span className="font-bold text-gray-500 shrink-0">上传日期:</span>
              <span className="text-gray-800">{info.fields?.updateDate || '-'}</span>
            </div>
          </div>
          {/* 描述 */}
          <div className="text-sm flex gap-2">
            <span className="font-bold text-gray-500 shrink-0">描述:</span>
            <span className="text-gray-800">{info.fields?.description || '-'}</span>
          </div>
        </div>
      </div>

      {/* 标签 */}
      {hasTags && (
        <div className="select-none mb-4">
          <div className="text-gray-800 text-lg font-bold">Tags</div>
          <Separator orientation="horizontal" className="my-3" />
          <div className="flex gap-2 flex-wrap">
            {(info.tags || []).map(tag => (
              <div key={tag.url} className="text-sm text-gray-600 cursor-pointer flex justify-center items-center py-1 px-4 bg-blue-100 rounded-full">
                {tag.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 章节 */}
      {hasChapters && (
        <div className="select-none mb-4">
          <div className="text-gray-800 text-lg font-bold">Chapters</div>
          <Separator orientation="horizontal" className="my-3" />
          <div className="flex gap-3 flex-wrap">
            {(info.chapters || []).map((chapter, index) => (
              <div
                key={chapter.idCode || index}
                className="cursor-pointer flex justify-center items-center py-2 px-4 bg-white rounded-sm border border-gray-300 flex-col gap-1 transition hover:bg-gray-100"
              >
                <div className="text-sm font-bold">
                  {chapter.title}
                </div>
                {chapter.updateDate && (
                  <div className="text-xs text-gray-500">
                    {chapter.updateDate}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图片 */}
      {hasPictures && (
        <div className="select-none mb-4">
          <div className="text-gray-800 text-lg font-bold">Pictures</div>
          <Separator orientation="horizontal" className="my-3" />
          <div className="flex gap-3 overflow-x-auto overflow-y-hidden py-1">
            {(info.pictures || []).map((picture, index) => (
              <ImagePreview key={picture.url || index} url={picture.url || ''}>
                {(preview) => (
                  <div
                    className="cursor-pointer aspect-video w-48 rounded-sm border border-gray-200 overflow-hidden hover:shadow-sm hover:translate-y-[-1px] transition"
                    style={{
                      backgroundImage: `url(${picture.thumbnail || picture.url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    onClick={() => preview()}
                  ></div>
                )}
              </ImagePreview>
            ))}
          </div>
        </div>
      )}

      {/* 视频 */}
      {hasVideos && (
        <div className="select-none mb-4">
          <div className="text-gray-800 text-lg font-bold">Pictures</div>
          <Separator orientation="horizontal" className="my-3" />
          <div className="flex gap-3 overflow-x-auto overflow-y-hidden py-1">
            {(info.videos || []).map((video, index) => (
              <video
                key={video.url || index}
                className="aspect-video w-48 rounded-sm border border-gray-200 overflow-hidden"
                poster={video.cover || undefined}
                controls
              >
                <source src={video.url || ''} type="video/mp4" />
              </video>
            ))}
          </div>
        </div>
      )}

      {/* 评论 */}
      {hasComments && (
        <div className="select-none mb-4">
          <div className="text-gray-800 text-lg font-bold">Comments</div>
          <Separator orientation="horizontal" className="my-3" />
          <div className="flex gap-3 overflow-y-auto overflow-x-hidden py-1 flex-col">
            {(info.comments || []).map((comment, index) => (
              <div className="flex gap-4">
                {/* 头像 */}
                <div key={index} className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-100">
                  <object data={comment.avatar}>
                    <img src={`https://placehold.co/48`} alt="" />
                  </object>
                </div>
                {/* 评论 */}
                <div className="flex-1 border border-gray-200 bg-white p-4 flex flex-col gap-1 rounded-sm ">
                  <div className="text-sm text-gray-800 font-bold">
                    {comment.username}
                  </div>
                  <div className="text-sm text-gray-500">
                    {comment.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

export default BookDetail;