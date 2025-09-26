import { memo, useEffect, useMemo } from "react";
import { useLoaderData } from "react-router";
import { getService } from "@eleplug/elep/renderer";
import type { CrawlerApi } from "../../../src/crawler/api";
import { genScrapingConfig } from "@/store/rule/utils";
import { booksLoader } from "./loader";

interface Item {
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

const BookList = memo(() => {
  const { item: items } = useLoaderData<{ item: Item[] }>()
  
  return (
    <div className="flex flex-col gap-4 overflow-auto h-full">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 p-6">
        {items.map(item => {
          return (
            <div key={item.idCode} className="flex flex-col gap-2 group select-none cursor-pointer">
              <div
                className="aspect-3/4 bg-gray-200 rounded-md shadow-sm flex items-center justify-center transition group-hover:shadow-md"
                style={{
                  backgroundImage: `url(${item.cover})`,
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
          )
        })}
      </div>
    </div>
  )
})

export default BookList;