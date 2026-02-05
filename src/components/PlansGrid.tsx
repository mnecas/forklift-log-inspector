import { useMemo } from 'react';
import { usePlans, useSearchQuery, useStatusFilter } from '../store/useStore';
import { PlanCard } from './PlanCard';
import { EmptyState } from './common';

export function PlansGrid() {
  const plans = usePlans();
  const searchQuery = useSearchQuery();
  const statusFilter = useStatusFilter();

  const filteredPlans = useMemo(() => {
    let result = plans;

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((plan) => plan.status === statusFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((plan) => {
        // Search in plan name
        if (plan.name.toLowerCase().includes(query)) return true;
        // Search in namespace
        if (plan.namespace.toLowerCase().includes(query)) return true;
        // Search in VM names
        for (const vm of Object.values(plan.vms)) {
          if (vm.name.toLowerCase().includes(query)) return true;
        }
        return false;
      });
    }

    return result;
  }, [plans, searchQuery, statusFilter]);

  if (plans.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6">
        <EmptyState
          icon="document"
          title="No logs loaded"
          description="Upload a log file to get started"
        />
      </div>
    );
  }

  if (filteredPlans.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6">
        <EmptyState
          icon="search"
          title="No matching plans"
          description="Try adjusting your search or filters"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      <div className="space-y-4">
        {filteredPlans.map((plan) => (
          <PlanCard key={`${plan.namespace}/${plan.name}`} plan={plan} />
        ))}
      </div>
    </div>
  );
}
