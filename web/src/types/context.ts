// Context types for the sidebar in the 2-pane layout

// Selected context items for the agent (lightweight coordinates)
export type SelectedContext = K8sResourceContext | GitHubPathContext | GitLabPathContext | HelmReleaseContext;

// Kubernetes resource context
export interface K8sResourceContext {
  type: "k8s-resource";
  source: string; // Source name from agent spec
  kind: string; // pod, deployment, service, etc.
  name: string;
  namespace: string;
}

// GitHub path context (folder or file selected for agent context)
export interface GitHubPathContext {
  type: "github-path";
  source: string;
  owner: string;
  repo: string;
  path: string; // e.g., "/src/controllers" or "/" for root
  isFile?: boolean;
}

// GitLab path context (folder or file selected for agent context)
export interface GitLabPathContext {
  type: "gitlab-path";
  source: string;
  project: string; // "group/project" format
  path: string; // e.g., "/src/controllers" or "/" for root
  isFile?: boolean;
}

// Helm release context
export interface HelmReleaseContext {
  type: "helm-release";
  source: string; // "helm" source name
  name: string; // Release name
  namespace: string;
  chart: string; // Chart name
  chartVersion: string;
  status: string;
}
