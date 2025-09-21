import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Tab {
  label: string;
  key: string;
}

interface TabsProps {
  items: Tab[];
  onChange?: (key: string) => void;
}

const Tabs: React.FC<TabsProps> = ({ items, onChange }) => {
  const [activeKey, setActiveKey] = useState(items[0]?.key);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const handleTabClick = useCallback((key: string) => {
    setActiveKey(key);
    if (onChange) {
      onChange(key);
    }
  }, [onChange]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      tabsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }, [])
  
  const checkForOverflow = useCallback(() => {
    if (tabsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth -1);
    }
  }, []);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (container) {
      const handleWheel = (event: WheelEvent) => {
        if (event.deltaY !== 0) {
          event.preventDefault();
          container.scrollLeft += event.deltaY;
        }
      };
      
      container.addEventListener('wheel', handleWheel);
      container.addEventListener('scroll', checkForOverflow);
      window.addEventListener('resize', checkForOverflow);

      checkForOverflow();

      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('scroll', checkForOverflow);
        window.removeEventListener('resize', checkForOverflow);
      };
    }
  }, [items]);

  return (
    <div className="relative flex items-center">
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 z-10 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div
        ref={tabsContainerRef}
        className="flex overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => handleTabClick(item.key)}
            className={`py-2 px-4 text-sm font-medium text-center border-b-2 whitespace-nowrap ${
              activeKey === item.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 z-10 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default Tabs;
