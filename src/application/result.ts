import type { Project, Projection } from '../domain/types';
import { projectModel } from './model';
export const MODEL_VERSION = '1.0.0';
/** Derived artifacts can always be discarded. Hash excludes credentials by Project construction. */
export async function auditedCalculation(
  project: Project,
): Promise<{ modelVersion: string; calculatedAt: string; inputHash: string; result: Projection }> {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    modelVersion: MODEL_VERSION,
    calculatedAt: new Date().toISOString(),
    inputHash: Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(''),
    result: projectModel(project),
  };
}
