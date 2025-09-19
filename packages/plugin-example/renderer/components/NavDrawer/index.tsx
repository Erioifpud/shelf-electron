import { memo, useState } from "react";
import { NavLink } from "react-router";
import { Library, Settings, BookOpen } from 'lucide-react';
import clsx from 'clsx';

const NavDrawer = memo(() => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="relative w-16"
      onMouseEnter={() => setIsExpanded(true)}
    >
      <aside
        className={clsx(
          "fixed top-0 left-0 h-full flex flex-col bg-gray-100 border-r border-neutral-200 transition-all duration-300 ease-in-out z-20 overflow-hidden",
          isExpanded ? "w-64" : "w-16"
        )}
      >
        <div className="flex items-center gap-2 mb-4 px-4 h-16 flex-shrink-0">
          <BookOpen className="w-6 h-6 text-gray-500 flex-shrink-0" />
          <span className={clsx("text-xl font-bold transition-opacity duration-200 whitespace-nowrap", isExpanded ? "opacity-100" : "opacity-0")}>
            Shelf
          </span>
        </div>
        <nav className="flex flex-col gap-2 px-2">
          <NavLink
            to="/sources"
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-3 rounded-md",
                isActive ? "bg-gray-50 text-gray-700" : "text-neutral-500 hover:bg-gray-50 hover:text-neutral-900"
              )
            }
          >
            <Library className="w-5 h-5 flex-shrink-0" />
            <span className={clsx("transition-opacity whitespace-nowrap text-sm", isExpanded ? "opacity-100" : "opacity-0")}>Library</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-3 rounded-md",
                isActive ? "bg-gray-50 text-gray-700" : "text-neutral-500 hover:bg-gray-50 hover:text-neutral-900"
              )
            }
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className={clsx("transition-opacity whitespace-nowrap text-sm", isExpanded ? "opacity-100" : "opacity-0")}>Settings</span>
          </NavLink>
        </nav>
      </aside>
      {/* {isExpanded && (
        
      )} */}
      <div
        className={clsx(
          'fixed inset-0 bg-black/30 transition-opacity duration-300 ease-in-out z-10',
          isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden="true"
        onMouseEnter={() => setIsExpanded(false)}
      />
    </div>
  );
});

export default NavDrawer;
