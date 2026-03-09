import { NavLink, useLocation } from "react-router-dom";

const links = [
  { to: "/overall-dashboard/overview", label: "Overview" },
  { to: "/overall-dashboard?tab=admin", label: "Target Setup" },
  { to: "/overall-dashboard?tab=target", label: "Target and Highlight" },
  { to: "/overall-dashboard?tab=state", label: "Dealer State" },
];

export default function OverallDashboardSidebar() {
  const location = useLocation();

  return (
    <aside className="w-72 bg-slate-950 text-slate-100 p-5 min-h-screen">
      <h2 className="text-lg font-semibold">Overall Dashboard</h2>
      <p className="mt-1 text-xs text-slate-400">Quick navigation</p>
      <div className="mt-5 space-y-2">
        {links.map((link) => {
          const isActive = location.pathname + location.search === link.to;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={() =>
                `block rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              {link.label}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}
