import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react'; // shadcn 自带图标，也可自己换

interface Props {
  url: string | null;
  onClose: () => void;
}

export const Overlay: React.FC<Props> = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!url) return reset();
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [url, onClose]);

  useEffect(() => {
    if (!url) return;
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();          // 现在不会报错了
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      setScale((s) => Math.min(Math.max(0.2, s * delta), 10));
    };

    // 关键：{ passive: false }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [url]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (move: MouseEvent) => {
      setPos({ x: move.clientX - startX, y: move.clientY - startY });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!url) return null;

  return (
    <div
      ref={wrapRef}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
    >
      <div
        ref={imgRef}
        onMouseDown={onMouseDown}
        className="cursor-grab active:cursor-grabbing"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
      >
        <img src={url} alt="preview" className="max-w-none select-none" draggable={false} />
      </div>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white transition"
        aria-label="Close"
      >
        <X size={24} />
      </button>
    </div>
  );
};