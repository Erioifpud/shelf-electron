import { createContext } from "react";

type PreviewFn = (url: string) => void;

export const ImagePreviewContext = createContext<PreviewFn>(() => {});