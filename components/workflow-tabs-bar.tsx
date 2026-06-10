import { loadWorkflowTabCounts } from '@/lib/domain/load-workflow-tab-counts';
import { WorkflowTabs } from '@/components/workflow-tabs';

export async function WorkflowTabsBar() {
  const counts = await loadWorkflowTabCounts();
  return <WorkflowTabs counts={counts} />;
}
