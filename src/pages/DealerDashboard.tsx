import DealerOverallDashboard from "./DealerOverallDashboard";

/**
 * Dealer dashboard route wrapper.
 *
 * Keep route/sidebar entry at /dealer/:dealerSlug/dashboard,
 * but replace old PowerBI iframe content with the same per-slug
 * report content used by /overall-dashboard/overview.
 */
export default function DealerDashboard() {
  return <DealerOverallDashboard />;
}
