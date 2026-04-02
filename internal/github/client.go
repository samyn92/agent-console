package github

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Client is a GitHub API client
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// New creates a new GitHub API client
func New() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL: "https://api.github.com",
	}
}

// Repository represents a GitHub repository
type Repository struct {
	FullName      string `json:"full_name"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
	HTMLURL       string `json:"html_url"`
}

// Branch represents a GitHub branch
type Branch struct {
	Name   string `json:"name"`
	Commit struct {
		SHA string `json:"sha"`
	} `json:"commit"`
}

// PullRequest represents a GitHub pull request
type PullRequest struct {
	Number    int       `json:"number"`
	Title     string    `json:"title"`
	State     string    `json:"state"`
	HTMLURL   string    `json:"html_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	User      struct {
		Login string `json:"login"`
	} `json:"user"`
	Head struct {
		Ref string `json:"ref"`
	} `json:"head"`
	Base struct {
		Ref string `json:"ref"`
	} `json:"base"`
	Additions    int   `json:"additions"`
	Deletions    int   `json:"deletions"`
	ChangedFiles int   `json:"changed_files"`
	Mergeable    *bool `json:"mergeable"`
	Merged       bool  `json:"merged"`
}

// Commit represents a GitHub commit
type Commit struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
		Author  struct {
			Name  string    `json:"name"`
			Email string    `json:"email"`
			Date  time.Time `json:"date"`
		} `json:"author"`
	} `json:"commit"`
	Author struct {
		Login string `json:"login"`
	} `json:"author"`
}

// ContentEntry represents a file or directory in a repository
type ContentEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	SHA         string `json:"sha"`
	Size        int    `json:"size"`
	URL         string `json:"url"`
	HTMLURL     string `json:"html_url"`
	GitURL      string `json:"git_url"`
	DownloadURL string `json:"download_url"`
	Type        string `json:"type"` // "file" or "dir"
}

// FileContent represents a file's content from GitHub
type FileContent struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	SHA         string `json:"sha"`
	Size        int    `json:"size"`
	URL         string `json:"url"`
	HTMLURL     string `json:"html_url"`
	GitURL      string `json:"git_url"`
	DownloadURL string `json:"download_url"`
	Type        string `json:"type"`
	Content     string `json:"content"`  // Base64 encoded
	Encoding    string `json:"encoding"` // "base64"
}

// WorkflowRun represents a GitHub Actions workflow run
type WorkflowRun struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	HeadBranch   string    `json:"head_branch"`
	HeadSHA      string    `json:"head_sha"`
	Status       string    `json:"status"`     // queued, in_progress, completed
	Conclusion   string    `json:"conclusion"` // success, failure, cancelled, etc.
	HTMLURL      string    `json:"html_url"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	RunNumber    int       `json:"run_number"`
	WorkflowID   int64     `json:"workflow_id"`
	Event        string    `json:"event"` // push, pull_request, etc.
	DisplayTitle string    `json:"display_title"`
}

// WorkflowRunsResponse is the GitHub API response for workflow runs
type WorkflowRunsResponse struct {
	TotalCount   int           `json:"total_count"`
	WorkflowRuns []WorkflowRun `json:"workflow_runs"`
}

// WorkflowJob represents a job within a GitHub Actions workflow run
type WorkflowJob struct {
	ID          int64      `json:"id"`
	RunID       int64      `json:"run_id"`
	Name        string     `json:"name"`
	Status      string     `json:"status"`     // queued, in_progress, completed
	Conclusion  string     `json:"conclusion"` // success, failure, cancelled, skipped, etc.
	HTMLURL     string     `json:"html_url"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

// WorkflowJobsResponse is the GitHub API response for workflow jobs
type WorkflowJobsResponse struct {
	TotalCount int           `json:"total_count"`
	Jobs       []WorkflowJob `json:"jobs"`
}

// CheckRun represents a GitHub check run (CI/CD status check)
type CheckRun struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	Status      string     `json:"status"`     // queued, in_progress, completed
	Conclusion  string     `json:"conclusion"` // success, failure, neutral, cancelled, skipped, timed_out, action_required
	HTMLURL     string     `json:"html_url"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

// CheckRunsResponse is the GitHub API response for check runs
type CheckRunsResponse struct {
	TotalCount int        `json:"total_count"`
	CheckRuns  []CheckRun `json:"check_runs"`
}

// Review represents a GitHub pull request review
type Review struct {
	ID          int64      `json:"id"`
	State       string     `json:"state"` // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
	Body        string     `json:"body"`
	SubmittedAt *time.Time `json:"submitted_at"`
	User        struct {
		Login string `json:"login"`
	} `json:"user"`
}

// GetRepository fetches repository information
func (c *Client) GetRepository(ctx context.Context, token, owner, repo string) (*Repository, error) {
	url := fmt.Sprintf("%s/repos/%s/%s", c.baseURL, owner, repo)

	var result Repository
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListBranches lists branches for a repository
func (c *Client) ListBranches(ctx context.Context, token, owner, repo string) ([]Branch, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/branches?per_page=30", c.baseURL, owner, repo)

	var result []Branch
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListPullRequests lists pull requests for a repository
func (c *Client) ListPullRequests(ctx context.Context, token, owner, repo, state string) ([]PullRequest, error) {
	if state == "" {
		state = "open"
	}
	url := fmt.Sprintf("%s/repos/%s/%s/pulls?state=%s&per_page=30", c.baseURL, owner, repo, state)

	var result []PullRequest
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetPullRequest gets a specific pull request with full details
func (c *Client) GetPullRequest(ctx context.Context, token, owner, repo string, number int) (*PullRequest, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/pulls/%d", c.baseURL, owner, repo, number)

	var result PullRequest
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListCheckRuns lists check runs for a specific ref (commit SHA or branch)
func (c *Client) ListCheckRuns(ctx context.Context, token, owner, repo, ref string) ([]CheckRun, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s/commits/%s/check-runs?per_page=50", c.baseURL, owner, repo, url.PathEscape(ref))

	var result CheckRunsResponse
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result.CheckRuns, nil
}

// ListReviews lists reviews for a pull request
func (c *Client) ListReviews(ctx context.Context, token, owner, repo string, number int) ([]Review, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s/pulls/%d/reviews?per_page=50", c.baseURL, owner, repo, number)

	var result []Review
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListCommits lists recent commits for a repository
func (c *Client) ListCommits(ctx context.Context, token, owner, repo string) ([]Commit, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/commits?per_page=20", c.baseURL, owner, repo)

	var result []Commit
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// ListCommitsByBranch lists recent commits for a specific branch
func (c *Client) ListCommitsByBranch(ctx context.Context, token, owner, repo, branch string) ([]Commit, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s/commits?per_page=20&sha=%s", c.baseURL, owner, repo, url.QueryEscape(branch))

	var result []Commit
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetContents lists files and directories at a path in the repository
func (c *Client) GetContents(ctx context.Context, token, owner, repo, path string) ([]ContentEntry, error) {
	// URL encode path but keep slashes
	url := fmt.Sprintf("%s/repos/%s/%s/contents/%s", c.baseURL, owner, repo, path)

	var result []ContentEntry
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// GetFileContent fetches a file's content from the repository
func (c *Client) GetFileContent(ctx context.Context, token, owner, repo, path string) (*FileContent, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/contents/%s", c.baseURL, owner, repo, path)

	var result FileContent
	if err := c.doRequest(ctx, token, url, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetRawFileContent fetches raw file content (decoded, not base64)
func (c *Client) GetRawFileContent(ctx context.Context, token, owner, repo, path string) (string, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/contents/%s", c.baseURL, owner, repo, path)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}

	// Request raw content directly
	req.Header.Set("Accept", "application/vnd.github.raw+json")
	req.Header.Set("User-Agent", "agent-operator-console")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
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

// GetWorkflowRuns fetches recent GitHub Actions workflow runs
func (c *Client) GetWorkflowRuns(ctx context.Context, token, owner, repo string) ([]WorkflowRun, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s/actions/runs?per_page=10", c.baseURL, owner, repo)

	var result WorkflowRunsResponse
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result.WorkflowRuns, nil
}

// GetWorkflowRunsByBranch fetches recent GitHub Actions workflow runs for a specific branch
func (c *Client) GetWorkflowRunsByBranch(ctx context.Context, token, owner, repo, branch string) ([]WorkflowRun, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s/actions/runs?per_page=20&branch=%s", c.baseURL, owner, repo, url.QueryEscape(branch))

	var result WorkflowRunsResponse
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result.WorkflowRuns, nil
}

// ListWorkflowRunJobs fetches jobs for a specific workflow run
func (c *Client) ListWorkflowRunJobs(ctx context.Context, token, owner, repo string, runID int64) ([]WorkflowJob, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s/actions/runs/%d/jobs?per_page=50", c.baseURL, owner, repo, runID)

	var result WorkflowJobsResponse
	if err := c.doRequest(ctx, token, apiURL, &result); err != nil {
		return nil, err
	}
	return result.Jobs, nil
}

// doRequest performs an authenticated HTTP request
func (c *Client) doRequest(ctx context.Context, token, url string, result interface{}) error {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "agent-operator-console")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
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
		return fmt.Errorf("unauthorized - check GitHub token")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(result); err != nil {
		return fmt.Errorf("decoding response: %w", err)
	}

	return nil
}
