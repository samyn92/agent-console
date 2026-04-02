package handlers

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/samyn92/agent-console/internal/github"
)

// ============================================================================
// REPOSITORIES - Aggregated from Agent git sources
// ============================================================================

// ListRepos aggregates all repositories from agents with git capabilities
func (h *Handlers) ListRepos(w http.ResponseWriter, r *http.Request) {
	// Map to deduplicate repos by fullName
	repoMap := make(map[string]*RepoResponse)

	// Get all agents and check their capabilities for git repos
	agents, err := h.k8s.ListAgents(r.Context(), "")
	if err != nil {
		h.log.Errorw("Failed to list agents for repos", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list agents")
		return
	}

	// Get all capabilities to resolve capabilityRefs
	capabilities, err := h.k8s.ListCapabilities(r.Context(), "")
	if err != nil {
		h.log.Errorw("Failed to list capabilities for repos", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list capabilities")
		return
	}
	// For each capability with git/github config, find agents that reference it
	for _, capability := range capabilities {
		if capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		// Collect repo URLs from both Git and GitHub config
		type repoURL struct {
			url string
		}
		var repoURLs []repoURL

		if config.Git != nil {
			for _, repo := range config.Git.Repositories {
				repoURLs = append(repoURLs, repoURL{url: repo.URL})
			}
		}

		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				// GitHub repos are in "owner/repo" format, normalize to a URL
				repoURLs = append(repoURLs, repoURL{url: "github.com/" + ghRepo})
			}
		}

		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, glProject := range config.GitLab.Projects {
				// GitLab projects are in "group/project" format, normalize to a URL
				repoURLs = append(repoURLs, repoURL{url: domain + "/" + glProject})
			}
		}

		if len(repoURLs) == 0 {
			continue
		}

		for _, repo := range repoURLs {
			parsed := parseRepoURL(repo.url)
			if parsed == nil {
				continue
			}
			fullName := parsed.Owner + "/" + parsed.Name

			for _, agent := range agents {
				for _, ref := range agent.Spec.CapabilityRefs {
					if ref.Name == capability.Name {
						toolName := ref.Name
						if ref.Alias != "" {
							toolName = ref.Alias
						}

						if existing, ok := repoMap[fullName]; ok {
							existing.Agents = append(existing.Agents, RepoAgentRef{
								Namespace: agent.Namespace,
								Name:      agent.Name,
								Source:    toolName,
							})
						} else {
							repoMap[fullName] = &RepoResponse{
								Owner:    parsed.Owner,
								Name:     parsed.Name,
								FullName: fullName,
								URL:      repo.url,
								Provider: parsed.Provider,
								Agents: []RepoAgentRef{{
									Namespace: agent.Namespace,
									Name:      agent.Name,
									Source:    toolName,
								}},
							}
						}
					}
				}
			}
		}
	}

	// Optionally fetch GitHub data for each repo
	token := getGitHubToken()
	if token != "" {
		for fullName, repo := range repoMap {
			if repo.Provider == "github" {
				activity, err := h.fetchGitHubActivity(r.Context(), token, repo.Owner, repo.Name)
				if err != nil {
					h.log.Warnw("Failed to fetch GitHub activity", "repo", fullName, "error", err)
					// Continue without activity data
				} else {
					repo.Activity = activity
				}
			}
		}
	}

	// Optionally fetch GitLab data for each repo
	glToken := getGitLabToken()
	if glToken != "" {
		for fullName, repo := range repoMap {
			if repo.Provider == "gitlab" {
				// Determine the GitLab domain from the repo URL
				domain := getGitLabDomainFromURL(repo.URL)
				activity, err := h.fetchGitLabActivity(r.Context(), glToken, domain, fullName)
				if err != nil {
					h.log.Warnw("Failed to fetch GitLab activity", "repo", fullName, "error", err)
				} else {
					repo.Activity = activity
				}
			}
		}
	}

	// Convert map to slice
	repos := make([]RepoResponse, 0, len(repoMap))
	for _, repo := range repoMap {
		repos = append(repos, *repo)
	}

	jsonOK(w, repos)
}

// GetRepo returns details for a specific repository
func (h *Handlers) GetRepo(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	name := chi.URLParam(r, "name")
	fullName := owner + "/" + name

	// Get all agents and capabilities to find this repo
	agents, err := h.k8s.ListAgents(r.Context(), "")
	if err != nil {
		h.log.Errorw("Failed to list agents for repo", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list agents")
		return
	}

	capabilities, err := h.k8s.ListCapabilities(r.Context(), "")
	if err != nil {
		h.log.Errorw("Failed to list capabilities for repo", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list capabilities")
		return
	}

	var repo *RepoResponse

	for _, capability := range capabilities {
		if capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		// Collect repo URLs from both Git and GitHub config
		type repoURLEntry struct {
			url string
		}
		var repoURLs []repoURLEntry

		if config.Git != nil {
			for _, gitRepo := range config.Git.Repositories {
				repoURLs = append(repoURLs, repoURLEntry{url: gitRepo.URL})
			}
		}

		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				repoURLs = append(repoURLs, repoURLEntry{url: "github.com/" + ghRepo})
			}
		}

		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, glProject := range config.GitLab.Projects {
				repoURLs = append(repoURLs, repoURLEntry{url: domain + "/" + glProject})
			}
		}

		for _, repoEntry := range repoURLs {
			parsed := parseRepoURL(repoEntry.url)
			if parsed == nil {
				continue
			}

			if parsed.Owner+"/"+parsed.Name == fullName {
				if repo == nil {
					repo = &RepoResponse{
						Owner:    parsed.Owner,
						Name:     parsed.Name,
						FullName: fullName,
						URL:      repoEntry.url,
						Provider: parsed.Provider,
						Agents:   []RepoAgentRef{},
					}
				}

				// Find agents that reference this capability
				for _, agent := range agents {
					for _, ref := range agent.Spec.CapabilityRefs {
						if ref.Name == capability.Name {
							toolName := ref.Name
							if ref.Alias != "" {
								toolName = ref.Alias
							}
							repo.Agents = append(repo.Agents, RepoAgentRef{
								Namespace: agent.Namespace,
								Name:      agent.Name,
								Source:    toolName,
							})
						}
					}
				}
			}
		}
	}

	if repo == nil {
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	// Fetch GitHub activity
	token := getGitHubToken()
	if token != "" && repo.Provider == "github" {
		activity, err := h.fetchGitHubActivity(r.Context(), token, owner, name)
		if err != nil {
			h.log.Warnw("Failed to fetch GitHub activity", "repo", fullName, "error", err)
			// Return repo without activity
		} else {
			repo.Activity = activity
		}
	}

	// Fetch GitLab activity
	glToken := getGitLabToken()
	if glToken != "" && repo.Provider == "gitlab" {
		domain := getGitLabDomainFromURL(repo.URL)
		activity, err := h.fetchGitLabActivity(r.Context(), glToken, domain, fullName)
		if err != nil {
			h.log.Warnw("Failed to fetch GitLab activity", "repo", fullName, "error", err)
		} else {
			repo.Activity = activity
		}
	}

	jsonOK(w, repo)
}

// fetchGitHubActivity fetches branches, PRs, and commits from GitHub API
func (h *Handlers) fetchGitHubActivity(ctx context.Context, token, owner, repo string) (*RepoActivity, error) {
	activity := &RepoActivity{
		Branches:      []BranchInfo{},
		PullRequests:  []PullRequestInfo{},
		RecentCommits: []CommitInfo{},
	}

	// Fetch repository info
	repoInfo, err := h.github.GetRepository(ctx, token, owner, repo)
	if err != nil {
		return nil, err
	}
	activity.DefaultBranch = repoInfo.DefaultBranch

	// Fetch branches
	branches, err := h.github.ListBranches(ctx, token, owner, repo)
	if err != nil {
		h.log.Warnw("Failed to fetch branches", "repo", owner+"/"+repo, "error", err)
	} else {
		for _, b := range branches {
			activity.Branches = append(activity.Branches, BranchInfo{
				Name:       b.Name,
				LastCommit: b.Commit.SHA,
			})
		}
	}

	// Fetch open pull requests
	prs, err := h.github.ListPullRequests(ctx, token, owner, repo, "all")
	if err != nil {
		h.log.Warnw("Failed to fetch PRs", "repo", owner+"/"+repo, "error", err)
	} else {
		openCount := 0
		for _, pr := range prs {
			state := pr.State
			if pr.Merged {
				state = "merged"
			}
			if pr.State == "open" {
				openCount++
			}

			mergeable := false
			if pr.Mergeable != nil {
				mergeable = *pr.Mergeable
			}

			createdAt := pr.CreatedAt
			updatedAt := pr.UpdatedAt

			activity.PullRequests = append(activity.PullRequests, PullRequestInfo{
				Number:       pr.Number,
				Title:        pr.Title,
				State:        state,
				Branch:       pr.Head.Ref,
				BaseBranch:   pr.Base.Ref,
				Author:       pr.User.Login,
				CreatedAt:    &createdAt,
				UpdatedAt:    &updatedAt,
				Additions:    pr.Additions,
				Deletions:    pr.Deletions,
				ChangedFiles: pr.ChangedFiles,
				Mergeable:    mergeable,
				URL:          pr.HTMLURL,
			})
		}
		activity.OpenPRs = openCount
	}

	// Fetch recent commits
	commits, err := h.github.ListCommits(ctx, token, owner, repo)
	if err != nil {
		h.log.Warnw("Failed to fetch commits", "repo", owner+"/"+repo, "error", err)
	} else {
		for _, c := range commits {
			timestamp := c.Commit.Author.Date
			author := c.Commit.Author.Name
			if c.Author.Login != "" {
				author = c.Author.Login
			}

			activity.RecentCommits = append(activity.RecentCommits, CommitInfo{
				SHA:       c.SHA,
				Message:   c.Commit.Message,
				Author:    author,
				Timestamp: &timestamp,
			})
		}
	}

	return activity, nil
}

// fetchGitLabActivity fetches branches, MRs, and commits from GitLab API
func (h *Handlers) fetchGitLabActivity(ctx context.Context, token, domain, pathWithNamespace string) (*RepoActivity, error) {
	activity := &RepoActivity{
		Branches:      []BranchInfo{},
		PullRequests:  []PullRequestInfo{},
		RecentCommits: []CommitInfo{},
	}

	// Fetch project info
	project, err := h.gitlab.GetProject(ctx, token, domain, pathWithNamespace)
	if err != nil {
		return nil, err
	}
	activity.DefaultBranch = project.DefaultBranch

	// Fetch branches
	branches, err := h.gitlab.ListBranches(ctx, token, domain, pathWithNamespace)
	if err != nil {
		h.log.Warnw("Failed to fetch GitLab branches", "project", pathWithNamespace, "error", err)
	} else {
		for _, b := range branches {
			activity.Branches = append(activity.Branches, BranchInfo{
				Name:       b.Name,
				LastCommit: b.Commit.ID,
			})
		}
	}

	// Fetch merge requests (all states)
	mrs, err := h.gitlab.ListMergeRequests(ctx, token, domain, pathWithNamespace, "all")
	if err != nil {
		h.log.Warnw("Failed to fetch GitLab MRs", "project", pathWithNamespace, "error", err)
	} else {
		openCount := 0
		for _, mr := range mrs {
			state := mr.State
			// GitLab uses "opened" instead of "open"
			if state == "opened" {
				state = "open"
				openCount++
			}

			mergeable := mr.MergeStatus == "can_be_merged"
			createdAt := mr.CreatedAt
			updatedAt := mr.UpdatedAt

			activity.PullRequests = append(activity.PullRequests, PullRequestInfo{
				Number:     mr.IID,
				Title:      mr.Title,
				State:      state,
				Branch:     mr.SourceBranch,
				BaseBranch: mr.TargetBranch,
				Author:     mr.Author.Username,
				CreatedAt:  &createdAt,
				UpdatedAt:  &updatedAt,
				Mergeable:  mergeable,
				URL:        mr.WebURL,
			})
		}
		activity.OpenPRs = openCount
	}

	// Fetch recent commits
	commits, err := h.gitlab.ListCommits(ctx, token, domain, pathWithNamespace)
	if err != nil {
		h.log.Warnw("Failed to fetch GitLab commits", "project", pathWithNamespace, "error", err)
	} else {
		for _, c := range commits {
			timestamp := c.CreatedAt
			activity.RecentCommits = append(activity.RecentCommits, CommitInfo{
				SHA:       c.ID,
				Message:   c.Title,
				Author:    c.AuthorName,
				Timestamp: &timestamp,
			})
		}
	}

	return activity, nil
}

// getGitHubToken returns the GitHub token from environment or config
func getGitHubToken() string {
	// First check environment variable
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		return token
	}
	// Also check GH_TOKEN (used by gh CLI)
	if token := os.Getenv("GH_TOKEN"); token != "" {
		return token
	}
	return ""
}

// getGitLabToken returns the GitLab token from environment
func getGitLabToken() string {
	if token := os.Getenv("GITLAB_TOKEN"); token != "" {
		return token
	}
	return ""
}

// getGitLabDomainFromURL extracts the GitLab domain from a repo URL.
// Falls back to "gitlab.com" if the URL doesn't contain a recognizable host.
func getGitLabDomainFromURL(repoURL string) string {
	u := repoURL
	u = strings.TrimPrefix(u, "https://")
	u = strings.TrimPrefix(u, "http://")
	u = strings.TrimPrefix(u, "git@")

	// For SSH format git@host:path, the first segment before : or / is the host
	if idx := strings.IndexAny(u, ":/"); idx > 0 {
		host := u[:idx]
		if strings.Contains(host, ".") {
			return host
		}
	}
	return "gitlab.com"
}

// parsedRepo holds parsed repo URL components
type parsedRepo struct {
	Provider string
	Owner    string
	Name     string
}

// parseRepoURL parses a git repository URL into owner/name
// Supports formats:
//   - github.com/owner/repo
//   - https://github.com/owner/repo
//   - https://github.com/owner/repo.git
//   - git@github.com:owner/repo.git
func parseRepoURL(url string) *parsedRepo {
	// Remove common prefixes
	url = strings.TrimPrefix(url, "https://")
	url = strings.TrimPrefix(url, "http://")
	url = strings.TrimPrefix(url, "git@")
	url = strings.TrimSuffix(url, ".git")

	// Handle SSH format (git@github.com:owner/repo)
	url = strings.Replace(url, ":", "/", 1)

	// Parse provider and path
	parts := strings.SplitN(url, "/", 3)
	if len(parts) < 3 {
		return nil
	}

	host := strings.ToLower(parts[0])
	owner := parts[1]
	name := parts[2]

	// Handle nested paths (remove any extra path components)
	if idx := strings.Index(name, "/"); idx > 0 {
		name = name[:idx]
	}

	// Determine provider from host
	var provider string
	switch {
	case strings.Contains(host, "github"):
		provider = "github"
	case strings.Contains(host, "gitlab"):
		provider = "gitlab"
	case strings.Contains(host, "bitbucket"):
		provider = "bitbucket"
	default:
		provider = "git"
	}

	// Validate owner and name
	validName := regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)
	if !validName.MatchString(owner) || !validName.MatchString(name) {
		return nil
	}

	return &parsedRepo{
		Provider: provider,
		Owner:    owner,
		Name:     name,
	}
}

// Helper to convert GitHub types to our response types
func convertGitHubPRs(prs []github.PullRequest) []PullRequestInfo {
	result := make([]PullRequestInfo, 0, len(prs))
	for _, pr := range prs {
		state := pr.State
		if pr.Merged {
			state = "merged"
		}

		mergeable := false
		if pr.Mergeable != nil {
			mergeable = *pr.Mergeable
		}

		createdAt := pr.CreatedAt
		updatedAt := pr.UpdatedAt

		result = append(result, PullRequestInfo{
			Number:       pr.Number,
			Title:        pr.Title,
			State:        state,
			Branch:       pr.Head.Ref,
			BaseBranch:   pr.Base.Ref,
			Author:       pr.User.Login,
			CreatedAt:    &createdAt,
			UpdatedAt:    &updatedAt,
			Additions:    pr.Additions,
			Deletions:    pr.Deletions,
			ChangedFiles: pr.ChangedFiles,
			Mergeable:    mergeable,
			URL:          pr.HTMLURL,
		})
	}
	return result
}

// repoProviderInfo holds provider detection results for a repo
type repoProviderInfo struct {
	Provider    string // "github", "gitlab", "bitbucket", "git"
	Domain      string // e.g., "gitlab.example.com" (for GitLab)
	ProjectPath string // Full GitLab project path, e.g., "myorg/myproject"
}

// detectRepoProvider looks up the provider, domain, and full project path for a repo
// identified by owner/name from the capabilities configuration.
func (h *Handlers) detectRepoProvider(ctx context.Context, owner, name string) *repoProviderInfo {
	capabilities, err := h.k8s.ListCapabilities(ctx, "")
	if err != nil {
		return nil
	}

	for _, capability := range capabilities {
		if capability.Spec.Container == nil || capability.Spec.Container.Config == nil {
			continue
		}

		config := capability.Spec.Container.Config

		// Check GitHub config
		if config.GitHub != nil {
			for _, ghRepo := range config.GitHub.Repositories {
				parsed := parseRepoURL("github.com/" + ghRepo)
				if parsed != nil && parsed.Owner == owner && parsed.Name == name {
					return &repoProviderInfo{Provider: "github"}
				}
			}
		}

		// Check GitLab config - match on owner prefix
		if config.GitLab != nil {
			domain := config.GitLab.Domain
			if domain == "" {
				domain = "gitlab.com"
			}
			for _, glProject := range config.GitLab.Projects {
				// Parse just like ListRepos does — it will truncate to owner/name
				parsed := parseRepoURL(domain + "/" + glProject)
				if parsed != nil && parsed.Owner == owner && parsed.Name == name {
					return &repoProviderInfo{
						Provider:    "gitlab",
						Domain:      domain,
						ProjectPath: glProject,
					}
				}
			}
		}

		// Check Git config
		if config.Git != nil {
			for _, gitRepo := range config.Git.Repositories {
				parsed := parseRepoURL(gitRepo.URL)
				if parsed != nil && parsed.Owner == owner && parsed.Name == name {
					return &repoProviderInfo{Provider: parsed.Provider}
				}
			}
		}
	}

	// Default to GitHub for backward compatibility
	return &repoProviderInfo{Provider: "github"}
}

// GetRepoContents returns the files and directories at a path in a repository
func (h *Handlers) GetRepoContents(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	name := chi.URLParam(r, "name")

	// Get path from the wildcard - chi uses "*" for catch-all
	path := chi.URLParam(r, "*")
	if path == "" {
		path = ""
	}
	// Clean up leading slashes
	path = strings.TrimPrefix(path, "/")

	info := h.detectRepoProvider(r.Context(), owner, name)
	h.log.Infow("detectRepoProvider result", "owner", owner, "name", name, "provider", info.Provider, "domain", info.Domain, "projectPath", info.ProjectPath)

	if info != nil && info.Provider == "gitlab" {
		glToken := getGitLabToken()
		if glToken == "" {
			jsonError(w, http.StatusUnauthorized, "GitLab token not configured")
			return
		}

		tree, err := h.gitlab.GetTree(r.Context(), glToken, info.Domain, info.ProjectPath, path)
		if err != nil {
			h.log.Warnw("Failed to get GitLab tree", "project", info.ProjectPath, "domain", info.Domain, "path", path, "error", err)
			jsonError(w, http.StatusInternalServerError, "Failed to get repository contents")
			return
		}

		entries := make([]RepoContentEntry, 0, len(tree))
		for _, t := range tree {
			entryType := "file"
			if t.Type == "tree" {
				entryType = "dir"
			}
			entries = append(entries, RepoContentEntry{
				Name: t.Name,
				Path: t.Path,
				Type: entryType,
				SHA:  t.ID,
			})
		}

		jsonOK(w, entries)
		return
	}

	// Default: GitHub
	token := getGitHubToken()
	if token == "" {
		jsonError(w, http.StatusUnauthorized, "GitHub token not configured")
		return
	}

	contents, err := h.github.GetContents(r.Context(), token, owner, name, path)
	if err != nil {
		h.log.Warnw("Failed to get repo contents", "repo", owner+"/"+name, "path", path, "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to get repository contents")
		return
	}

	// Convert to our response type
	entries := make([]RepoContentEntry, 0, len(contents))
	for _, c := range contents {
		entries = append(entries, RepoContentEntry{
			Name: c.Name,
			Path: c.Path,
			Type: c.Type,
			Size: c.Size,
			SHA:  c.SHA,
			URL:  c.HTMLURL,
		})
	}

	jsonOK(w, entries)
}

// GetFileContent returns the content of a file for the detail panel
func (h *Handlers) GetFileContent(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	name := chi.URLParam(r, "name")
	path := chi.URLParam(r, "*")
	path = strings.TrimPrefix(path, "/")

	if path == "" {
		jsonError(w, http.StatusBadRequest, "File path is required")
		return
	}

	info := h.detectRepoProvider(r.Context(), owner, name)

	if info != nil && info.Provider == "gitlab" {
		glToken := getGitLabToken()
		if glToken == "" {
			jsonError(w, http.StatusUnauthorized, "GitLab token not configured")
			return
		}

		content, err := h.gitlab.GetFileContent(r.Context(), glToken, info.Domain, info.ProjectPath, path, "")
		if err != nil {
			h.log.Warnw("Failed to get GitLab file content", "project", info.ProjectPath, "path", path, "error", err)
			jsonError(w, http.StatusNotFound, "File not found")
			return
		}

		language := detectLanguage(path)

		resp := FileContentResponse{
			Name:     getFileName(path),
			Path:     path,
			Content:  content,
			Language: language,
		}

		jsonOK(w, resp)
		return
	}

	// Default: GitHub
	token := getGitHubToken()
	if token == "" {
		jsonError(w, http.StatusUnauthorized, "GitHub token not configured")
		return
	}

	// Get raw file content
	content, err := h.github.GetRawFileContent(r.Context(), token, owner, name, path)
	if err != nil {
		h.log.Warnw("Failed to get file content", "repo", owner+"/"+name, "path", path, "error", err)
		jsonError(w, http.StatusNotFound, "File not found")
		return
	}

	// Get file metadata
	fileMeta, err := h.github.GetFileContent(r.Context(), token, owner, name, path)
	if err != nil {
		h.log.Warnw("Failed to get file metadata", "repo", owner+"/"+name, "path", path, "error", err)
	}

	// Detect language from file extension
	language := detectLanguage(path)

	resp := FileContentResponse{
		Name:     getFileName(path),
		Path:     path,
		Content:  content,
		Language: language,
	}

	if fileMeta != nil {
		resp.Size = fileMeta.Size
		resp.SHA = fileMeta.SHA
		resp.URL = fileMeta.HTMLURL
	}

	jsonOK(w, resp)
}

// GetRepoDetail returns full repository details for the context panel
func (h *Handlers) GetRepoDetail(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	name := chi.URLParam(r, "name")

	info := h.detectRepoProvider(r.Context(), owner, name)
	h.log.Infow("GetRepoDetail provider detection", "owner", owner, "name", name, "provider", info.Provider, "domain", info.Domain, "projectPath", info.ProjectPath)

	if info != nil && info.Provider == "gitlab" {
		h.getGitLabRepoDetail(w, r, info)
		return
	}

	// Default: GitHub
	h.getGitHubRepoDetail(w, r, owner, name)
}

// getGitLabRepoDetail fetches full repository details from GitLab
func (h *Handlers) getGitLabRepoDetail(w http.ResponseWriter, r *http.Request, info *repoProviderInfo) {
	glToken := getGitLabToken()
	if glToken == "" {
		jsonError(w, http.StatusUnauthorized, "GitLab token not configured")
		return
	}

	project, err := h.gitlab.GetProject(r.Context(), glToken, info.Domain, info.ProjectPath)
	if err != nil {
		h.log.Errorw("Failed to get GitLab project", "project", info.ProjectPath, "error", err)
		jsonError(w, http.StatusNotFound, "Project not found")
		return
	}

	// Split the path to get owner and name for the response
	parts := strings.SplitN(info.ProjectPath, "/", 2)
	respOwner := parts[0]
	respName := info.ProjectPath
	if len(parts) == 2 {
		respName = parts[1]
	}

	resp := RepoDetailResponse{
		Owner:         respOwner,
		Name:          respName,
		FullName:      project.PathWithNamespace,
		Description:   project.Description,
		DefaultBranch: project.DefaultBranch,
		Private:       project.Visibility == "private" || project.Visibility == "internal",
		URL:           project.WebURL,
	}

	// Try to fetch README
	readme, err := h.gitlab.GetFileContent(r.Context(), glToken, info.Domain, info.ProjectPath, "README.md", "")
	if err != nil {
		// Try lowercase
		readme, err = h.gitlab.GetFileContent(r.Context(), glToken, info.Domain, info.ProjectPath, "readme.md", "")
	}
	if err == nil {
		resp.ReadmeContent = readme
	}

	// Fetch branches
	branches, err := h.gitlab.ListBranches(r.Context(), glToken, info.Domain, info.ProjectPath)
	if err == nil {
		for _, b := range branches {
			resp.Branches = append(resp.Branches, BranchInfo{
				Name:       b.Name,
				LastCommit: b.Commit.ID,
			})
		}
	}

	// Fetch merge requests (all states)
	mrs, err := h.gitlab.ListMergeRequests(r.Context(), glToken, info.Domain, info.ProjectPath, "all")
	if err == nil {
		for _, mr := range mrs {
			state := mr.State
			if state == "opened" {
				state = "open"
			}
			mergeable := mr.MergeStatus == "can_be_merged"
			createdAt := mr.CreatedAt
			updatedAt := mr.UpdatedAt

			resp.PullRequests = append(resp.PullRequests, PullRequestInfo{
				Number:     mr.IID,
				Title:      mr.Title,
				State:      state,
				Branch:     mr.SourceBranch,
				BaseBranch: mr.TargetBranch,
				Author:     mr.Author.Username,
				CreatedAt:  &createdAt,
				UpdatedAt:  &updatedAt,
				Mergeable:  mergeable,
				URL:        mr.WebURL,
			})
		}
	}

	// Fetch recent commits
	commits, err := h.gitlab.ListCommits(r.Context(), glToken, info.Domain, info.ProjectPath)
	if err == nil {
		for _, c := range commits {
			timestamp := c.CreatedAt
			resp.RecentCommits = append(resp.RecentCommits, CommitInfo{
				SHA:       c.ID,
				Message:   c.Title,
				Author:    c.AuthorName,
				Timestamp: &timestamp,
			})
		}
	}

	// Fetch pipelines (GitLab CI/CD equivalent of GitHub Actions)
	pipelines, err := h.gitlab.ListPipelines(r.Context(), glToken, info.Domain, info.ProjectPath)
	if err == nil {
		for _, p := range pipelines {
			createdAt := p.CreatedAt
			updatedAt := p.UpdatedAt
			resp.WorkflowRuns = append(resp.WorkflowRuns, WorkflowRunInfo{
				ID:           int64(p.ID),
				Name:         "Pipeline #" + fmt.Sprintf("%d", p.ID),
				HeadBranch:   p.Ref,
				HeadSHA:      p.SHA,
				Status:       p.Status,
				URL:          p.WebURL,
				CreatedAt:    &createdAt,
				UpdatedAt:    &updatedAt,
				Event:        p.Source,
				DisplayTitle: p.Ref,
			})
		}
	}

	jsonOK(w, resp)
}

// getGitHubRepoDetail fetches full repository details from GitHub
func (h *Handlers) getGitHubRepoDetail(w http.ResponseWriter, r *http.Request, owner, name string) {
	token := getGitHubToken()
	if token == "" {
		jsonError(w, http.StatusUnauthorized, "GitHub token not configured")
		return
	}

	// Fetch repository info
	repoInfo, err := h.github.GetRepository(r.Context(), token, owner, name)
	if err != nil {
		h.log.Errorw("Failed to get repository", "repo", owner+"/"+name, "error", err)
		jsonError(w, http.StatusNotFound, "Repository not found")
		return
	}

	resp := RepoDetailResponse{
		Owner:         owner,
		Name:          name,
		FullName:      repoInfo.FullName,
		DefaultBranch: repoInfo.DefaultBranch,
		Private:       repoInfo.Private,
		URL:           repoInfo.HTMLURL,
	}

	// Try to fetch README
	readme, err := h.github.GetRawFileContent(r.Context(), token, owner, name, "README.md")
	if err != nil {
		// Try lowercase
		readme, err = h.github.GetRawFileContent(r.Context(), token, owner, name, "readme.md")
	}
	if err == nil {
		resp.ReadmeContent = readme
	}

	// Fetch branches
	branches, err := h.github.ListBranches(r.Context(), token, owner, name)
	if err == nil {
		for _, b := range branches {
			resp.Branches = append(resp.Branches, BranchInfo{
				Name:       b.Name,
				LastCommit: b.Commit.SHA,
			})
		}
	}

	// Fetch pull requests
	prs, err := h.github.ListPullRequests(r.Context(), token, owner, name, "all")
	if err == nil {
		for _, pr := range prs {
			state := pr.State
			if pr.Merged {
				state = "merged"
			}
			createdAt := pr.CreatedAt
			updatedAt := pr.UpdatedAt
			resp.PullRequests = append(resp.PullRequests, PullRequestInfo{
				Number:       pr.Number,
				Title:        pr.Title,
				State:        state,
				Branch:       pr.Head.Ref,
				BaseBranch:   pr.Base.Ref,
				Author:       pr.User.Login,
				CreatedAt:    &createdAt,
				UpdatedAt:    &updatedAt,
				Additions:    pr.Additions,
				Deletions:    pr.Deletions,
				ChangedFiles: pr.ChangedFiles,
				URL:          pr.HTMLURL,
			})
		}
	}

	// Fetch recent commits
	commits, err := h.github.ListCommits(r.Context(), token, owner, name)
	if err == nil {
		for _, c := range commits {
			timestamp := c.Commit.Author.Date
			author := c.Commit.Author.Name
			if c.Author.Login != "" {
				author = c.Author.Login
			}
			resp.RecentCommits = append(resp.RecentCommits, CommitInfo{
				SHA:       c.SHA,
				Message:   c.Commit.Message,
				Author:    author,
				Timestamp: &timestamp,
			})
		}
	}

	// Fetch workflow runs (CI/CD status)
	runs, err := h.github.GetWorkflowRuns(r.Context(), token, owner, name)
	if err == nil {
		for _, run := range runs {
			createdAt := run.CreatedAt
			updatedAt := run.UpdatedAt
			resp.WorkflowRuns = append(resp.WorkflowRuns, WorkflowRunInfo{
				ID:           run.ID,
				Name:         run.Name,
				HeadBranch:   run.HeadBranch,
				HeadSHA:      run.HeadSHA,
				Status:       run.Status,
				Conclusion:   run.Conclusion,
				URL:          run.HTMLURL,
				CreatedAt:    &createdAt,
				UpdatedAt:    &updatedAt,
				RunNumber:    run.RunNumber,
				Event:        run.Event,
				DisplayTitle: run.DisplayTitle,
			})
		}
	}

	jsonOK(w, resp)
}

// detectLanguage returns the language for syntax highlighting based on file extension
func detectLanguage(path string) string {
	ext := strings.ToLower(getFileExtension(path))
	switch ext {
	case "go":
		return "go"
	case "ts", "tsx":
		return "typescript"
	case "js", "jsx", "mjs":
		return "javascript"
	case "py":
		return "python"
	case "rs":
		return "rust"
	case "rb":
		return "ruby"
	case "java":
		return "java"
	case "c", "h":
		return "c"
	case "cpp", "cc", "cxx", "hpp":
		return "cpp"
	case "cs":
		return "csharp"
	case "swift":
		return "swift"
	case "kt", "kts":
		return "kotlin"
	case "yaml", "yml":
		return "yaml"
	case "json":
		return "json"
	case "toml":
		return "toml"
	case "md", "markdown":
		return "markdown"
	case "html", "htm":
		return "html"
	case "css":
		return "css"
	case "scss", "sass":
		return "scss"
	case "sql":
		return "sql"
	case "sh", "bash", "zsh":
		return "bash"
	case "dockerfile":
		return "dockerfile"
	case "xml":
		return "xml"
	case "proto":
		return "protobuf"
	default:
		// Check for dotfiles
		name := getFileName(path)
		if name == "Dockerfile" {
			return "dockerfile"
		}
		if name == "Makefile" || name == "justfile" {
			return "makefile"
		}
		return "text"
	}
}

func getFileExtension(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '.' {
			return path[i+1:]
		}
		if path[i] == '/' {
			break
		}
	}
	return ""
}

func getFileName(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			return path[i+1:]
		}
	}
	return path
}
