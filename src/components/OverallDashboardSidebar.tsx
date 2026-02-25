import { NavLink } from "react-router-dom";

const links = [
  { to: "/overall-dashboard", label: "Overview" },
  { to: "/overall-dashboard/admin", label: "Target Setup" },
  { to: "/overall-dashboard/target-and-highlight", label: "Target and Highlight" },
  { to: "/overall-dashboard/state", label: "Dealer State" },
];

export default function OverallDashboardSidebar() {
  return (
    <aside className="w-72 bg-slate-950 text-slate-100 p-5 min-h-screen">
      <h2 className="text-lg font-semibold">Overall Dashboard</h2>
      <p className="mt-1 text-xs text-slate-400">Quick navigation</p>
      <div className="mt-5 space-y-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm transition ${
                isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
            end={link.to === "/overall-dashboard"}
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
