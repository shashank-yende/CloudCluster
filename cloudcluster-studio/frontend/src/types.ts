export type User = { id: string; name: string; email: string; created_at: string }
export type AuthPayload = { access_token: string; token_type: string; expires_in: number; user: User }
export type TaskSpec = { id: string; title: string; category: 'Quick' | 'Standard' | 'Advanced'; complexity: number; description: string; input: 'url' | 'file'; accept: string; icon: string; color: string }
export type Workload = {
  id: string; task_type: string; title: string; status: 'queued' | 'running' | 'completed' | 'failed'; input_name: string;
  result: Record<string, unknown>; error_message: string; worker_id: string; algorithm: string; progress: number;
  duration_ms: number; created_at: string; started_at: string | null; finished_at: string | null; artifact_name: string
}
export type Worker = { id: string; name: string; region: string; cpu: number; memory: number; accent: string; status: string; active_jobs: number; utilization: number; queue_depth: number }
export type Dashboard = {
  metrics: { total: number; completed: number; failed: number; running: number; queued: number; success_rate: number | null; avg_duration_ms: number };
  activity: { day: string; workloads: number }[]; recent: Workload[]; workers: Worker[]
}
