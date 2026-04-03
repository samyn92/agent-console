package handlers

import (
	"context"
	"fmt"
	"strings"
)

// resolveContextToMarkdown takes a ChatContext and resolves each item into
// rich metadata by querying Kubernetes, GitHub, and GitLab APIs.
// Returns a Markdown block suitable for prepending to the user's message
// so the agent has awareness of the selected resources.
func (h *Handlers) resolveContextToMarkdown(ctx context.Context, chatCtx *ChatContext) string {
	if chatCtx == nil {
		return ""
	}

	var sections []string

	// ---- Kubernetes Resources ----
	if len(chatCtx.Kubernetes) > 0 {
		lines := []string{"### Kubernetes Resources"}
		for _, item := range chatCtx.Kubernetes {
			resolved := h.resolveK8sResource(ctx, item)
			lines = append(lines, resolved)
		}
		sections = append(sections, strings.Join(lines, "\n"))
	}

	// ---- GitHub Paths ----
	if len(chatCtx.GitHub) > 0 {
		lines := []string{"### GitHub"}
		for _, item := range chatCtx.GitHub {
			resolved := h.resolveGitHubPath(ctx, item)
			lines = append(lines, resolved)
		}
		sections = append(sections, strings.Join(lines, "\n"))
	}

	// ---- GitLab Paths ----
	if len(chatCtx.GitLab) > 0 {
		lines := []string{"### GitLab"}
		for _, item := range chatCtx.GitLab {
			resolved := h.resolveGitLabPath(ctx, item)
			lines = append(lines, resolved)
		}
		sections = append(sections, strings.Join(lines, "\n"))
	}

	if len(sections) == 0 {
		return ""
	}

	return "## Resource Context\n\n" + strings.Join(sections, "\n\n") + "\n\n"
}

// resolveK8sResource fetches metadata for a Kubernetes resource.
func (h *Handlers) resolveK8sResource(ctx context.Context, item K8sContextItem) string {
	kind := strings.ToLower(item.Kind)

	switch kind {
	case "namespace":
		// For a namespace, list summary of workloads within it
		deps, _ := h.k8s.ListDeployments(ctx, item.Name)
		pods, _ := h.k8s.ListPods(ctx, item.Name, nil)
		svcs, _ := h.k8s.ListServices(ctx, item.Name)
		sts, _ := h.k8s.ListStatefulSets(ctx, item.Name)

		lines := []string{fmt.Sprintf("**Namespace: `%s`**", item.Name)}
		if len(deps) > 0 {
			names := make([]string, 0, len(deps))
			for _, d := range deps {
				ready := fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, *d.Spec.Replicas)
				names = append(names, fmt.Sprintf("`%s` (%s ready)", d.Name, ready))
			}
			lines = append(lines, fmt.Sprintf("- Deployments (%d): %s", len(deps), strings.Join(names, ", ")))
		}
		if len(sts) > 0 {
			names := make([]string, 0, len(sts))
			for _, s := range sts {
				names = append(names, fmt.Sprintf("`%s`", s.Name))
			}
			lines = append(lines, fmt.Sprintf("- StatefulSets (%d): %s", len(sts), strings.Join(names, ", ")))
		}
		if len(svcs) > 0 {
			names := make([]string, 0, len(svcs))
			for _, s := range svcs {
				names = append(names, fmt.Sprintf("`%s` (%s)", s.Name, string(s.Spec.Type)))
			}
			lines = append(lines, fmt.Sprintf("- Services (%d): %s", len(svcs), strings.Join(names, ", ")))
		}
		lines = append(lines, fmt.Sprintf("- Pods: %d total", len(pods)))
		return strings.Join(lines, "\n")

	case "deployment":
		dep, err := h.k8s.GetDeployment(ctx, item.Namespace, item.Name)
		if err != nil {
			return fmt.Sprintf("- Deployment `%s/%s`: (failed to resolve: %v)", item.Namespace, item.Name, err)
		}
		replicas := int32(0)
		if dep.Spec.Replicas != nil {
			replicas = *dep.Spec.Replicas
		}
		containers := make([]string, 0, len(dep.Spec.Template.Spec.Containers))
		for _, c := range dep.Spec.Template.Spec.Containers {
			containers = append(containers, fmt.Sprintf("`%s` (image: `%s`)", c.Name, c.Image))
		}
		return fmt.Sprintf("**Deployment: `%s/%s`**\n- Replicas: %d desired, %d ready, %d available\n- Containers: %s\n- Strategy: %s",
			item.Namespace, item.Name, replicas, dep.Status.ReadyReplicas, dep.Status.AvailableReplicas,
			strings.Join(containers, ", "), string(dep.Spec.Strategy.Type))

	case "pod":
		pod, err := h.k8s.GetPod(ctx, item.Namespace, item.Name)
		if err != nil {
			return fmt.Sprintf("- Pod `%s/%s`: (failed to resolve: %v)", item.Namespace, item.Name, err)
		}
		phase := string(pod.Status.Phase)
		containers := make([]string, 0, len(pod.Status.ContainerStatuses))
		for _, cs := range pod.Status.ContainerStatuses {
			state := "unknown"
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = fmt.Sprintf("waiting (%s)", cs.State.Waiting.Reason)
			} else if cs.State.Terminated != nil {
				state = fmt.Sprintf("terminated (%s)", cs.State.Terminated.Reason)
			}
			containers = append(containers, fmt.Sprintf("`%s` (%s, restarts: %d)", cs.Name, state, cs.RestartCount))
		}
		nodeName := pod.Spec.NodeName
		if nodeName == "" {
			nodeName = "unscheduled"
		}
		return fmt.Sprintf("**Pod: `%s/%s`**\n- Phase: %s\n- Node: %s\n- Containers: %s",
			item.Namespace, item.Name, phase, nodeName, strings.Join(containers, ", "))

	case "service":
		svcs, err := h.k8s.ListServices(ctx, item.Namespace)
		if err != nil {
			return fmt.Sprintf("- Service `%s/%s`: (failed to resolve: %v)", item.Namespace, item.Name, err)
		}
		for _, svc := range svcs {
			if svc.Name == item.Name {
				ports := make([]string, 0, len(svc.Spec.Ports))
				for _, p := range svc.Spec.Ports {
					ports = append(ports, fmt.Sprintf("%s:%d->%d", p.Protocol, p.Port, p.TargetPort.IntValue()))
				}
				return fmt.Sprintf("**Service: `%s/%s`**\n- Type: %s\n- ClusterIP: %s\n- Ports: %s",
					item.Namespace, item.Name, string(svc.Spec.Type), svc.Spec.ClusterIP, strings.Join(ports, ", "))
			}
		}
		return fmt.Sprintf("- Service `%s/%s`: not found", item.Namespace, item.Name)

	case "statefulset":
		sts, err := h.k8s.GetStatefulSet(ctx, item.Namespace, item.Name)
		if err != nil {
			return fmt.Sprintf("- StatefulSet `%s/%s`: (failed to resolve: %v)", item.Namespace, item.Name, err)
		}
		replicas := int32(0)
		if sts.Spec.Replicas != nil {
			replicas = *sts.Spec.Replicas
		}
		return fmt.Sprintf("**StatefulSet: `%s/%s`**\n- Replicas: %d desired, %d ready",
			item.Namespace, item.Name, replicas, sts.Status.ReadyReplicas)

	default:
		return fmt.Sprintf("- %s: `%s/%s`", item.Kind, item.Namespace, item.Name)
	}
}

// resolveGitHubPath fetches metadata for a GitHub repo/path.
func (h *Handlers) resolveGitHubPath(ctx context.Context, item GitHubContextItem) string {
	token := getGitHubToken()
	if token == "" {
		return fmt.Sprintf("- `%s/%s%s` (no GitHub token configured)", item.Owner, item.Repo, item.Path)
	}

	// Get repo info
	repoInfo, err := h.github.GetRepository(ctx, token, item.Owner, item.Repo)
	if err != nil {
		return fmt.Sprintf("- `%s/%s%s` (failed to resolve: %v)", item.Owner, item.Repo, item.Path, err)
	}

	lines := []string{fmt.Sprintf("**GitHub: `%s/%s`**", item.Owner, item.Repo)}
	lines = append(lines, fmt.Sprintf("- Default branch: `%s`", repoInfo.DefaultBranch))
	if repoInfo.Private {
		lines = append(lines, "- Visibility: private")
	}

	if item.IsFile {
		// Fetch file content for context
		content, err := h.github.GetRawFileContent(ctx, token, item.Owner, item.Repo, strings.TrimPrefix(item.Path, "/"))
		if err == nil {
			// Truncate if too long (keep first 200 lines)
			contentLines := strings.Split(content, "\n")
			if len(contentLines) > 200 {
				content = strings.Join(contentLines[:200], "\n") + "\n... (truncated)"
			}
			lines = append(lines, fmt.Sprintf("- File: `%s`\n```\n%s\n```", item.Path, content))
		} else {
			lines = append(lines, fmt.Sprintf("- File: `%s` (could not read)", item.Path))
		}
	} else if item.Path != "/" && item.Path != "" {
		// List directory contents
		contents, err := h.github.GetContents(ctx, token, item.Owner, item.Repo, strings.TrimPrefix(item.Path, "/"))
		if err == nil {
			names := make([]string, 0, len(contents))
			for _, entry := range contents {
				prefix := ""
				if entry.Type == "dir" {
					prefix = "/"
				}
				names = append(names, fmt.Sprintf("`%s%s`", entry.Name, prefix))
			}
			lines = append(lines, fmt.Sprintf("- Path: `%s` -> %s", item.Path, strings.Join(names, ", ")))
		}
	}

	return strings.Join(lines, "\n")
}

// resolveGitLabPath fetches metadata for a GitLab project/path.
func (h *Handlers) resolveGitLabPath(ctx context.Context, item GitLabContextItem) string {
	token := getGitLabToken()
	if token == "" {
		return fmt.Sprintf("- `%s%s` (no GitLab token configured)", item.Project, item.Path)
	}

	domain := item.Domain
	if domain == "" {
		domain = "gitlab.com"
	}

	// Get project info
	project, err := h.gitlab.GetProject(ctx, token, domain, item.Project)
	if err != nil {
		return fmt.Sprintf("- `%s%s` (failed to resolve: %v)", item.Project, item.Path, err)
	}

	lines := []string{fmt.Sprintf("**GitLab: `%s`**", item.Project)}
	if project.Description != "" {
		lines = append(lines, fmt.Sprintf("- Description: %s", project.Description))
	}
	lines = append(lines, fmt.Sprintf("- Default branch: `%s`", project.DefaultBranch))

	if item.IsFile {
		// Fetch file content
		content, err := h.gitlab.GetFileContent(ctx, token, domain, item.Project, strings.TrimPrefix(item.Path, "/"), project.DefaultBranch)
		if err == nil {
			contentLines := strings.Split(content, "\n")
			if len(contentLines) > 200 {
				content = strings.Join(contentLines[:200], "\n") + "\n... (truncated)"
			}
			lines = append(lines, fmt.Sprintf("- File: `%s`\n```\n%s\n```", item.Path, content))
		} else {
			lines = append(lines, fmt.Sprintf("- File: `%s` (could not read)", item.Path))
		}
	} else if item.Path != "/" && item.Path != "" {
		// List directory tree
		tree, err := h.gitlab.GetTree(ctx, token, domain, item.Project, strings.TrimPrefix(item.Path, "/"))
		if err == nil {
			names := make([]string, 0, len(tree))
			for _, entry := range tree {
				prefix := ""
				if entry.Type == "tree" {
					prefix = "/"
				}
				names = append(names, fmt.Sprintf("`%s%s`", entry.Name, prefix))
			}
			lines = append(lines, fmt.Sprintf("- Path: `%s` -> %s", item.Path, strings.Join(names, ", ")))
		}
	}

	return strings.Join(lines, "\n")
}
