import { Separator } from "@/components/ui/separator";
import { EyeIcon, HeartIcon, StarIcon } from "lucide-react";
import { memo } from "react";
import { useLoaderData } from "react-router";

const BookDetail = memo(() => {
  const info = useLoaderData<any>()

  return (
    <div className="flex flex-col gap-4 overflow-auto h-full p-6 bg-[#F3FAFF]">
      {/* 信息模块 */}
      <div className="flex gap-8">
        <div
          className="aspect-3/4 w-1/4 h-fit shrink-0 bg-gray-200 rounded-md shadow-md flex items-center justify-center transition"
          style={{
            backgroundImage: `url(${info.fields?.cover})`,
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
    </div>
  )
})

export default BookDetail;