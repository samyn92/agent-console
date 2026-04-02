package gitlab

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Client is a GitLab API client
type Client struct {
	httpClient *http.Client
}

// New creates a new GitLab API client
func New() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// baseURL returns the API URL for a given GitLab domain.
// If domain is empty, defaults to "gitlab.com".
func baseURL(domain string) string {
	if domain == "" {
		domain = "gitlab.com"
	}
	return "https://" + domain + "/api/v4"
}

// Project represents a GitLab project
type Project struct {
	ID                int    `json:"id"`
	PathWithNamespace string `json:"path_with_namespace"`
	DefaultBranch     string `json:"default_branch"`
	Visibility        string `json:"visibility"` // private, internal, public
	WebURL            string `json:"web_url"`
	Description       string `json:"description"`
}

// Branch represents a GitLab branch
type Branch struct {
	Name   string `json:"name"`
	Commit struct {
		ID string `json:"id"`
	} `json:"commit"`
}

// MergeRequest represents a GitLab merge request
type MergeRequest struct {
	IID          int       `json:"iid"`
	Title        string    `json:"title"`
	State        string    `json:"state"` // opened, closed, merged
	WebURL       string    `json:"web_url"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	SourceBranch string    `json:"source_branch"`
	TargetBranch string    `json:"target_branch"`
	Author       struct {
		Username string `json:"username"`
	} `json:"author"`
	MergeStatus  string `json:"merge_status"` // can_be_merged, cannot_be_merged, etc.
	ChangesCount string `json:"changes_count"`
}

// MergeRequestChanges extends MergeRequest with diff stats
type MergeRequestChanges struct {
	MergeRequest
	DiffStats struct {
		Additions int `json:"additions"`
		Deletions int `json:"deletions"`
	} `json:"diff_stats"`
}

// MRApproval represents the approval status of a merge request
type MRApproval struct {
	Approved   bool `json:"approved"`
	ApprovedBy []struct {
		User struct {
			Username string `json:"username"`
		} `json:"user"`
	} `json:"approved_by"`
}

// Commit represents a GitLab commit
type Commit struct {
	ID             string    `json:"id"`
	ShortID        string    `json:"short_id"`
	Title          string    `json:"title"`
	Message        string    `json:"message"`
	AuthorName     string    `json:"author_name"`
	AuthorEmail    string    `json:"author_email"`
	CommitterName  string    `json:"committer_name"`
	CommitterEmail string    `json:"committer_email"`
	CreatedAt      time.Time `json:"created_at"`
	WebURL         string    `json:"web_url"`
}

// TreeEntry represents a file or directory in a repository tree
type TreeEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"` // "blob" or "tree"
	Path string `json:"path"`
	Mode string `json:"mode"`
}

// Pipeline represents a GitLab CI/CD pipeline
type Pipeline struct {
	ID        int       `json:"id"`
	Status    string    `json:"status"` // running, pending, success, failed, canceled, skipped
	Ref       string    `json:"ref"`
	SHA       string    `json:"sha"`
	WebURL    string    `json:"web_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Source    string    `json:"source"` // push, merge_request_event, etc.
}

// PipelineJob represents a job within a GitLab CI/CD pipeline
type PipelineJob struct {
	ID         int        `json:"id"`
	Name       string     `json:"name"`
	Stage      string     `json:"stage"`
	Status     string     `json:"status"` // running, pending, success, failed, canceled, skipped
	WebURL     string     `json:"web_url"`
	Duration   *float64   `json:"duration"`
	StartedAt  *time.Time `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
	Pipeline   struct {
		ID int `json:"id"`
	} `json:"pipeline"`
}

// GetProject fetches project information
func (c *Client) GetProject(ctx context.Context, token, domain, pathWithNamespace string) (*Project, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s", baseURL(domain), encodedPath)

	var result Project
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListBranches lists branches for a project
func (c *Client) ListBranches(ctx context.Context, token, domain, pathWithNamespace string) ([]Branch, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/branches?per_page=30", baseURL(domain), encodedPath)

	var result []Branch
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListMergeRequests lists merge requests for a project
func (c *Client) ListMergeRequests(ctx context.Context, token, domain, pathWithNamespace, state string) ([]MergeRequest, error) {
	if state == "" {
		state = "opened"
	}
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/merge_requests?state=%s&per_page=30", baseURL(domain), encodedPath, state)

	var result []MergeRequest
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetMergeRequest fetches a single merge request by IID with full details
func (c *Client) GetMergeRequest(ctx context.Context, token, domain, pathWithNamespace string, iid int) (*MergeRequestChanges, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/merge_requests/%d?include_diverged_commits_count=true", baseURL(domain), encodedPath, iid)

	var result MergeRequestChanges
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListMRApprovals fetches approval status for a merge request
func (c *Client) ListMRApprovals(ctx context.Context, token, domain, pathWithNamespace string, iid int) (*MRApproval, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/merge_requests/%d/approvals", baseURL(domain), encodedPath, iid)

	var result MRApproval
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListCommits lists recent commits for a project
func (c *Client) ListCommits(ctx context.Context, token, domain, pathWithNamespace string) ([]Commit, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/commits?per_page=20", baseURL(domain), encodedPath)

	var result []Commit
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListCommitsByBranch lists recent commits for a specific branch
func (c *Client) ListCommitsByBranch(ctx context.Context, token, domain, pathWithNamespace, branch string) ([]Commit, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/commits?per_page=20&ref_name=%s", baseURL(domain), encodedPath, url.QueryEscape(branch))

	var result []Commit
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetTree lists files and directories at a path in the repository
func (c *Client) GetTree(ctx context.Context, token, domain, pathWithNamespace, path string) ([]TreeEntry, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/tree?per_page=100", baseURL(domain), encodedPath)
	if path != "" {
		apiURL += "&path=" + url.QueryEscape(path)
	}

	var result []TreeEntry
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetFileContent fetches raw file content from the repository
func (c *Client) GetFileContent(ctx context.Context, token, domain, pathWithNamespace, filePath, ref string) (string, error) {
	encodedProject := url.PathEscape(pathWithNamespace)
	encodedFile := url.PathEscape(filePath)
	apiURL := fmt.Sprintf("%s/projects/%s/repository/files/%s/raw", baseURL(domain), encodedProject, encodedFile)
	if ref != "" {
		apiURL += "?ref=" + url.QueryEscape(ref)
	} else {
		apiURL += "?ref=HEAD"
	}

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("User-Agent", "agent-operator-console")
	if token != "" {
		req.Header.Set("PRIVATE-TOKEN", token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("not found")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading body: %w", err)
	}

	return string(body), nil
}

// ListPipelines fetches recent CI/CD pipelines
func (c *Client) ListPipelines(ctx context.Context, token, domain, pathWithNamespace string) ([]Pipeline, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/pipelines?per_page=10", baseURL(domain), encodedPath)

	var result []Pipeline
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListPipelinesByRef fetches recent CI/CD pipelines for a specific ref (branch)
func (c *Client) ListPipelinesByRef(ctx context.Context, token, domain, pathWithNamespace, ref string) ([]Pipeline, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/pipelines?per_page=20&ref=%s", baseURL(domain), encodedPath, url.QueryEscape(ref))

	var result []Pipeline
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListPipelineJobs fetches jobs for a specific pipeline
func (c *Client) ListPipelineJobs(ctx context.Context, token, domain, pathWithNamespace string, pipelineID int) ([]PipelineJob, error) {
	encodedPath := url.PathEscape(pathWithNamespace)
	apiURL := fmt.Sprintf("%s/projects/%s/pipelines/%d/jobs?per_page=50", baseURL(domain), encodedPath, pipelineID)

	var result []PipelineJob
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// doRequest performs an authenticated HTTP request
func (c *Client) doRequest(ctx context.Context, token, apiURL string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("User-Agent", "agent-operator-console")
	if token != "" {
		req.Header.Set("PRIVATE-TOKEN", token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("not found")
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("unauthorized - check GitLab token")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}

	return nil
}
