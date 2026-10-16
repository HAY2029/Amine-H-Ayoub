import { Link, useLocation } from "react-router-dom";
import { Settings, BookMarked, Zap } from "lucide-react";

export function Navigation() {
  const location = useLocation();

  const links = [
    { href: "/", label: "الرئيسية", icon: BookMarked },
    { href: "/calibrate", label: "معايرة", icon: Settings },
  ];

  return (
    <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-2 overflow-x-auto py-3">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = location.pathname === href;
            return (
              <Link
                key={href}
                to={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
