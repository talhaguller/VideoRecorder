export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

export interface AnalyzeScores {
  is_stub: boolean;
  note: string;
  sync_lag_ms: number | null;
  sync_strength: number | null;
  kinematic_irregularity: number | null;
  motor_dysfunction_score: number | null;
}

export interface AnalyzeResult {
  job_id: string;
  scores: AnalyzeScores;
  summary: {
    visual: Record<string, unknown>;
    acoustic: Record<string, unknown>;
    fusion_stub: AnalyzeScores;
    meta: Record<string, unknown>;
  };
  files: {
    overlay_video: string; 
    sync_plot: string;
    result_json: string;
  };
}

export async function analyzeRecording(
  blob: Blob,
  opts: { embedding?: boolean; filename?: string } = {},
): Promise<AnalyzeResult> {
  const { embedding = true, filename = 'recording.webm' } = opts;

  const form = new FormData();
  form.append('video', blob, filename);

  const url = `${API_BASE}/analyze?embedding=${embedding}`;
  const res = await fetch(url, { method: 'POST', body: form });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = j.detail;
    } catch {
    }
    throw new Error(`Analiz başarısız: ${detail}`);
  }
  return res.json();
}

export function fileUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}
