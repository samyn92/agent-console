package handlers

import (
	"strings"
	"time"

	agentsv1alpha1 "github.com/samyn92/agent-operator-core/api/v1alpha1"
)

// ============================================================================
// REQUEST TYPES
// ============================================================================

// ChatRequest is the request body for chat
type ChatRequest struct {
	Message   string `json:"message"`
	SessionID string `json:"sessionId,omitempty"`

	// Context provides selected resources/paths for the agent to focus on.
	// This is session-level configuration that augments the Agent CRD.
	Context *ChatContext `json:"context,omitempty"`

	// CustomInstructions are session-level additions to the system prompt.
	// These are prepended to messages to guide the agent's behavior.
	CustomInstructions string `json:"customInstructions,omitempty"`
}

// ChatContext represents the selected context items for a chat session.
// This allows per-session focus without modifying the Agent CRD.
type ChatContext struct {
	// Kubernetes resources to focus on
	Kubernetes []K8sContextItem `json:"kubernetes,omitempty"`

	// GitHub paths to focus on
	GitHub []GitHubContextItem `json:"github,omitempty"`

	// GitLab paths to focus on
	GitLab []GitLabContextItem `json:"gitlab,omitempty"`
}

// K8sContextItem represents a Kubernetes resource in context
type K8sContextItem struct {
	Kind      string `json:"kind"`      // Namespace, Deployment, Pod, etc.
	Name      string `json:"name"`      // Resource name
	Namespace string `json:"namespace"` // Namespace (for namespaced resources)
}

// GitHubContextItem represents a GitHub path in context
type GitHubContextItem struct {
	Owner  string `json:"owner"`            // Repository owner
	Repo   string `json:"repo"`             // Repository name
	Path   string `json:"path"`             // Path within repo (e.g., "/src/api")
	IsFile bool   `json:"isFile,omitempty"` // Whether this is a file or directory
}

// GitLabContextItem represents a GitLab path in context
type GitLabContextItem struct {
	Project string `json:"project"`          // Project path (e.g., "group/project")
	Path    string `json:"path"`             // Path within repo (e.g., "/src/api")
	IsFile  bool   `json:"isFile,omitempty"` // Whether this is a file or directory
	Domain  string `json:"domain,omitempty"` // GitLab domain (defaults to "gitlab.com")
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

// Metadata is common K8s metadata
type Metadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels,omitempty"`
}

// AgentResponse is the JSON response for an Agent
type AgentResponse struct {
	Metadata Metadata            `json:"metadata"`
	Spec     AgentSpecResponse   `json:"spec"`
	Status   AgentStatusResponse `json:"status"`
}

// AgentSpecResponse is the spec portion of Agent
type AgentSpecResponse struct {
	Model          string                  `json:"model"`
	Provider       string                  `json:"provider"`
	Identity       *IdentityResponse       `json:"identity,omitempty"`
	Tools          *ToolsConfigResponse    `json:"tools,omitempty"`
	CapabilityRefs []CapabilityRefResponse `json:"capabilityRefs,omitempty"`
}

// CapabilityRefResponse is a reference to a capability
type CapabilityRefResponse struct {
	Name string `json:"name"`
}

// IdentityResponse is agent identity
type IdentityResponse struct {
	Name         string `json:"name,omitempty"`
	SystemPrompt string `json:"systemPrompt,omitempty"`
}

// ToolsConfigResponse is tools config
type ToolsConfigResponse struct {
	Bash     bool `json:"bash"`
	Read     bool `json:"read"`
	Write    bool `json:"write"`
	Edit     bool `json:"edit"`
	Glob     bool `json:"glob"`
	Grep     bool `json:"grep"`
	WebFetch bool `json:"webfetch"`
	Task     bool `json:"task"`
}

// AgentStatusResponse is agent status
type AgentStatusResponse struct {
	Phase         string `json:"phase"`
	Ready         bool   `json:"ready"`
	ServiceURL    string `json:"serviceURL,omitempty"`
	ReadyReplicas int32  `json:"readyReplicas"`
}

// WorkflowResponse is the JSON response for a Workflow
type WorkflowResponse struct {
	Metadata Metadata               `json:"metadata"`
	Spec     WorkflowSpecResponse   `json:"spec"`
	Status   WorkflowStatusResponse `json:"status"`
}

// WorkflowSpecResponse is workflow spec
type WorkflowSpecResponse struct {
	Trigger TriggerResponse `json:"trigger"`
	Steps   []StepResponse  `json:"steps"`
}

// TriggerResponse is trigger config
type TriggerResponse struct {
	Schedule *ScheduleResponse `json:"schedule,omitempty"`
	Webhook  *WebhookResponse  `json:"webhook,omitempty"`
	GitHub   *GitHubResponse   `json:"github,omitempty"`
	GitLab   *GitLabResponse   `json:"gitlab,omitempty"`
}

// ScheduleResponse is schedule trigger
type ScheduleResponse struct {
	Cron     string `json:"cron"`
	Timezone string `json:"timezone,omitempty"`
}

// WebhookResponse is webhook trigger
type WebhookResponse struct {
	Path string `json:"path,omitempty"`
}

// GitHubResponse is GitHub trigger
type GitHubResponse struct {
	Events  []string `json:"events,omitempty"`
	Actions []string `json:"actions,omitempty"`
	Repos   []string `json:"repos,omitempty"`
}

// GitLabResponse is GitLab trigger
type GitLabResponse struct {
	Events   []string `json:"events,omitempty"`
	Actions  []string `json:"actions,omitempty"`
	Projects []string `json:"projects,omitempty"`
}

// StepResponse is workflow step
type StepResponse struct {
	Name   string `json:"name"`
	Agent  string `json:"agent"`
	Prompt string `json:"prompt"`
}

// WorkflowStatusResponse is workflow status
type WorkflowStatusResponse struct {
	WebhookURL    string `json:"webhookURL,omitempty"`
	LastTriggered string `json:"lastTriggered,omitempty"`
	RunCount      int    `json:"runCount"`
	LastRunStatus string `json:"lastRunStatus,omitempty"`
}

// WorkflowRunResponse is the JSON response for a WorkflowRun
type WorkflowRunResponse struct {
	Metadata Metadata                  `json:"metadata"`
	Spec     WorkflowRunSpecResponse   `json:"spec"`
	Status   WorkflowRunStatusResponse `json:"status"`
}

// WorkflowRunSpecResponse is workflow run spec
type WorkflowRunSpecResponse struct {
	WorkflowRef string `json:"workflowRef"`
	TriggerData string `json:"triggerData,omitempty"`
}

// WorkflowRunStatusResponse is workflow run status
type WorkflowRunStatusResponse struct {
	Phase       string               `json:"phase"`
	StartTime   *time.Time           `json:"startTime,omitempty"`
	EndTime     *time.Time           `json:"endTime,omitempty"`
	CurrentStep int                  `json:"currentStep,omitempty"`
	Error       string               `json:"error,omitempty"`
	Steps       []StepStatusResponse `json:"steps,omitempty"`
}

// StepEventResponse is a single trace event from step execution (tool call, message, error)
type StepEventResponse struct {
	Type       string `json:"type"`                 // tool_call, message, error, thinking
	Timestamp  int64  `json:"ts"`                   // Unix millis
	ToolName   string `json:"toolName,omitempty"`   // for tool_call events
	ToolArgs   string `json:"toolArgs,omitempty"`   // JSON string of args
	ToolResult string `json:"toolResult,omitempty"` // JSON string of result
	Duration   int64  `json:"duration,omitempty"`   // ms
	Content    string `json:"content,omitempty"`    // for message/error events
}

// StepStatusResponse is step status
type StepStatusResponse struct {
	Name       string              `json:"name"`
	Phase      string              `json:"phase"`
	StartTime  *time.Time          `json:"startTime,omitempty"`
	EndTime    *time.Time          `json:"endTime,omitempty"`
	Output     string              `json:"output,omitempty"`
	Error      string              `json:"error,omitempty"`
	JobName    string              `json:"jobName,omitempty"`
	SessionID  string              `json:"sessionID,omitempty"`
	ToolCalls  int                 `json:"toolCalls,omitempty"`
	TokensUsed int                 `json:"tokensUsed,omitempty"`
	Events     []StepEventResponse `json:"events,omitempty"`
}

// ChannelResponse is the JSON response for a Channel
type ChannelResponse struct {
	Metadata Metadata              `json:"metadata"`
	Spec     ChannelSpecResponse   `json:"spec"`
	Status   ChannelStatusResponse `json:"status"`
}

// ChannelSpecResponse is channel spec
type ChannelSpecResponse struct {
	Type     string `json:"type"`
	AgentRef string `json:"agentRef"`
}

// ChannelStatusResponse is channel status
type ChannelStatusResponse struct {
	Phase      string `json:"phase"`
	Ready      bool   `json:"ready"`
	ServiceURL string `json:"serviceURL,omitempty"`
	WebhookURL string `json:"webhookURL,omitempty"`
}

// ============================================================================
// REPOSITORY TYPES
// ============================================================================

// RepoResponse represents a git repository aggregated from agent capabilities
type RepoResponse struct {
	// Owner is the repo owner/org (e.g., "acme")
	Owner string `json:"owner"`
	// Name is the repo name (e.g., "backend")
	Name string `json:"name"`
	// FullName is owner/name (e.g., "acme/backend")
	FullName string `json:"fullName"`
	// URL is the full repository URL
	URL string `json:"url"`
	// Provider is github, gitlab, or bitbucket
	Provider string `json:"provider"`
	// Agents are the agents that can work on this repo
	Agents []RepoAgentRef `json:"agents"`
	// Activity contains recent activity on this repo (optional, for detail view)
	Activity *RepoActivity `json:"activity,omitempty"`
}

// RepoAgentRef references an agent that works on a repo
type RepoAgentRef struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	// Source is the name of the git source on this agent
	Source string `json:"source"`
}

// RepoActivity contains activity data for a repo
type RepoActivity struct {
	// DefaultBranch is the main branch (e.g., "main")
	DefaultBranch string `json:"defaultBranch,omitempty"`
	// OpenPRs is the count of open pull requests
	OpenPRs int `json:"openPRs"`
	// Branches created by agents
	Branches []BranchInfo `json:"branches,omitempty"`
	// PullRequests created or worked on by agents
	PullRequests []PullRequestInfo `json:"pullRequests,omitempty"`
	// RecentCommits by agents
	RecentCommits []CommitInfo `json:"recentCommits,omitempty"`
}

// BranchInfo represents a git branch
type BranchInfo struct {
	Name        string     `json:"name"`
	LastCommit  string     `json:"lastCommit,omitempty"`
	LastUpdated *time.Time `json:"lastUpdated,omitempty"`
	// AgentName is the agent that created this branch (if known)
	AgentName string `json:"agentName,omitempty"`
	// PRNumber if this branch has an associated PR
	PRNumber int `json:"prNumber,omitempty"`
}

// PullRequestInfo represents a pull request
type PullRequestInfo struct {
	Number     int        `json:"number"`
	Title      string     `json:"title"`
	State      string     `json:"state"` // open, closed, merged
	Branch     string     `json:"branch"`
	BaseBranch string     `json:"baseBranch"`
	Author     string     `json:"author,omitempty"`
	CreatedAt  *time.Time `json:"createdAt,omitempty"`
	UpdatedAt  *time.Time `json:"updatedAt,omitempty"`
	// Additions is lines added
	Additions int `json:"additions"`
	// Deletions is lines deleted
	Deletions int `json:"deletions"`
	// ChangedFiles count
	ChangedFiles int `json:"changedFiles"`
	// Mergeable indicates if the PR can be merged
	Mergeable bool `json:"mergeable"`
	// URL to the PR
	URL string `json:"url,omitempty"`
}

// CheckInfo represents a CI/CD check or status check on a PR
type CheckInfo struct {
	Name        string     `json:"name"`
	Status      string     `json:"status"`               // queued, in_progress, completed (GitHub) / running, pending, success, failed (GitLab)
	Conclusion  string     `json:"conclusion,omitempty"` // success, failure, neutral, cancelled, skipped, timed_out, action_required
	URL         string     `json:"url,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
}

// ReviewInfo represents a review or approval on a PR
type ReviewInfo struct {
	Author      string     `json:"author"`
	State       string     `json:"state"` // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
	Body        string     `json:"body,omitempty"`
	SubmittedAt *time.Time `json:"submittedAt,omitempty"`
}

// EnrichedPullRequest extends PullRequestInfo with checks and reviews
type EnrichedPullRequest struct {
	PullRequestInfo
	// Checks are CI/CD status checks on the PR
	Checks []CheckInfo `json:"checks,omitempty"`
	// Reviews are code reviews / approvals
	Reviews []ReviewInfo `json:"reviews,omitempty"`
	// MergeReady indicates whether all checks pass and required reviews are approved
	MergeReady bool `json:"mergeReady"`
}

// AgentPRResponse is the response from GetAgentPRs
type AgentPRResponse struct {
	PullRequests []EnrichedPullRequest `json:"pullRequests"`
	Repository   *GitRepoInfo          `json:"repository,omitempty"`
	Branch       string                `json:"branch,omitempty"`
}

// CommitInfo represents a git commit
type CommitInfo struct {
	SHA       string     `json:"sha"`
	Message   string     `json:"message"`
	Author    string     `json:"author"`
	Timestamp *time.Time `json:"timestamp,omitempty"`
	// Files changed in this commit
	Files []FileChange `json:"files,omitempty"`
}

// FileChange represents a file changed in a commit or PR
type FileChange struct {
	Path      string `json:"path"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Status    string `json:"status"` // added, modified, deleted, renamed
}

// RepoContentEntry represents a file or directory in a repository
type RepoContentEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"` // "file" or "dir"
	Size int    `json:"size"`
	SHA  string `json:"sha,omitempty"`
	URL  string `json:"url,omitempty"`
}

// FileContentResponse represents file content with metadata
type FileContentResponse struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Size     int    `json:"size"`
	SHA      string `json:"sha"`
	Content  string `json:"content"`  // Raw text content
	Language string `json:"language"` // Detected language for syntax highlighting
	URL      string `json:"url"`      // GitHub URL
	// Commit info for the file
	LastCommit *CommitInfo `json:"lastCommit,omitempty"`
}

// WorkflowRunInfo represents a GitHub Actions workflow run
type WorkflowRunInfo struct {
	ID           int64      `json:"id"`
	Name         string     `json:"name"`
	HeadBranch   string     `json:"headBranch"`
	HeadSHA      string     `json:"headSHA"`
	Status       string     `json:"status"`     // queued, in_progress, completed
	Conclusion   string     `json:"conclusion"` // success, failure, cancelled, etc.
	URL          string     `json:"url"`
	CreatedAt    *time.Time `json:"createdAt,omitempty"`
	UpdatedAt    *time.Time `json:"updatedAt,omitempty"`
	RunNumber    int        `json:"runNumber"`
	Event        string     `json:"event"` // push, pull_request, etc.
	DisplayTitle string     `json:"displayTitle"`
}

// PipelineInfo represents a CI/CD pipeline or workflow run (unified across providers)
type PipelineInfo struct {
	// ID is the pipeline/run ID
	ID int64 `json:"id"`
	// Name is the workflow name (GitHub) or "Pipeline #N" (GitLab)
	Name string `json:"name"`
	// Status is the overall status: queued, in_progress, completed (GitHub) / pending, running, success, failed, canceled (GitLab)
	Status string `json:"status"`
	// Conclusion is the result when completed: success, failure, cancelled, skipped, etc. (GitHub only; GitLab uses status directly)
	Conclusion string `json:"conclusion,omitempty"`
	// Branch is the source branch
	Branch string `json:"branch"`
	// SHA is the commit SHA that triggered this pipeline
	SHA string `json:"sha"`
	// URL links to the pipeline/run in the provider's UI
	URL string `json:"url,omitempty"`
	// Event is the trigger event (push, pull_request, merge_request_event, etc.)
	Event string `json:"event,omitempty"`
	// CreatedAt is when the pipeline was created
	CreatedAt *time.Time `json:"createdAt,omitempty"`
	// UpdatedAt is the last update time
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
	// DurationSeconds is the total duration in seconds (if completed)
	DurationSeconds *float64 `json:"durationSeconds,omitempty"`
	// Jobs are the individual jobs/stages within this pipeline
	Jobs []PipelineJobInfo `json:"jobs,omitempty"`
}

// PipelineJobInfo represents a single job/step within a pipeline
type PipelineJobInfo struct {
	ID              int64      `json:"id"`
	Name            string     `json:"name"`
	Stage           string     `json:"stage,omitempty"` // GitLab stage name
	Status          string     `json:"status"`          // queued, in_progress, completed / pending, running, success, failed
	Conclusion      string     `json:"conclusion,omitempty"`
	URL             string     `json:"url,omitempty"`
	StartedAt       *time.Time `json:"startedAt,omitempty"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
	DurationSeconds *float64   `json:"durationSeconds,omitempty"`
}

// AgentPipelineResponse is the response from GetAgentPipelines
type AgentPipelineResponse struct {
	Pipelines  []PipelineInfo `json:"pipelines"`
	Repository *GitRepoInfo   `json:"repository,omitempty"`
	Branch     string         `json:"branch,omitempty"`
}

// RepoDetailResponse is the full repository detail for the context panel
type RepoDetailResponse struct {
	Owner         string            `json:"owner"`
	Name          string            `json:"name"`
	FullName      string            `json:"fullName"`
	Description   string            `json:"description"`
	DefaultBranch string            `json:"defaultBranch"`
	Private       bool              `json:"private"`
	URL           string            `json:"url"`
	ReadmeContent string            `json:"readmeContent,omitempty"`
	Branches      []BranchInfo      `json:"branches,omitempty"`
	PullRequests  []PullRequestInfo `json:"pullRequests,omitempty"`
	RecentCommits []CommitInfo      `json:"recentCommits,omitempty"`
	WorkflowRuns  []WorkflowRunInfo `json:"workflowRuns,omitempty"`
}

// ============================================================================
// CONVERTERS
// ============================================================================

func agentToResponse(a agentsv1alpha1.Agent) AgentResponse {
	resp := AgentResponse{
		Metadata: Metadata{
			Name:              a.Name,
			Namespace:         a.Namespace,
			CreationTimestamp: a.CreationTimestamp.Time,
		},
		Spec: AgentSpecResponse{
			Model:    a.Spec.Model,
			Provider: providerFromModel(a.Spec.Model),
		},
		Status: AgentStatusResponse{
			Phase:         string(a.Status.Phase),
			Ready:         a.Status.Phase == agentsv1alpha1.AgentPhaseRunning,
			ServiceURL:    a.Status.ServiceURL,
			ReadyReplicas: a.Status.ReadyReplicas,
		},
	}

	if a.Spec.Identity != nil {
		resp.Spec.Identity = &IdentityResponse{
			Name:         a.Spec.Identity.Name,
			SystemPrompt: a.Spec.Identity.SystemPrompt,
		}
	}

	if a.Spec.Tools != nil {
		resp.Spec.Tools = &ToolsConfigResponse{
			Bash:     boolValue(a.Spec.Tools.Bash),
			Read:     boolValue(a.Spec.Tools.Read),
			Write:    boolValue(a.Spec.Tools.Write),
			Edit:     boolValue(a.Spec.Tools.Edit),
			Glob:     boolValue(a.Spec.Tools.Glob),
			Grep:     boolValue(a.Spec.Tools.Grep),
			WebFetch: boolValue(a.Spec.Tools.WebFetch),
			Task:     boolValue(a.Spec.Tools.Task),
		}
	}

	// Convert capabilityRefs
	for _, ref := range a.Spec.CapabilityRefs {
		resp.Spec.CapabilityRefs = append(resp.Spec.CapabilityRefs, CapabilityRefResponse{
			Name: ref.Name,
		})
	}

	return resp
}

func workflowToResponse(wf agentsv1alpha1.Workflow) WorkflowResponse {
	resp := WorkflowResponse{
		Metadata: Metadata{
			Name:              wf.Name,
			Namespace:         wf.Namespace,
			CreationTimestamp: wf.CreationTimestamp.Time,
		},
		Spec: WorkflowSpecResponse{
			Trigger: TriggerResponse{},
		},
		Status: WorkflowStatusResponse{
			WebhookURL:    wf.Status.WebhookURL,
			RunCount:      wf.Status.RunCount,
			LastRunStatus: wf.Status.LastRunStatus,
		},
	}

	// Convert trigger
	if wf.Spec.Trigger.Schedule != nil {
		resp.Spec.Trigger.Schedule = &ScheduleResponse{
			Cron:     wf.Spec.Trigger.Schedule.Cron,
			Timezone: wf.Spec.Trigger.Schedule.Timezone,
		}
	}
	if wf.Spec.Trigger.Webhook != nil {
		resp.Spec.Trigger.Webhook = &WebhookResponse{
			Path: wf.Spec.Trigger.Webhook.Path,
		}
	}
	if wf.Spec.Trigger.GitHub != nil {
		resp.Spec.Trigger.GitHub = &GitHubResponse{
			Events:  wf.Spec.Trigger.GitHub.Events,
			Actions: wf.Spec.Trigger.GitHub.Actions,
			Repos:   wf.Spec.Trigger.GitHub.Repos,
		}
	}
	if wf.Spec.Trigger.GitLab != nil {
		resp.Spec.Trigger.GitLab = &GitLabResponse{
			Events:   wf.Spec.Trigger.GitLab.Events,
			Actions:  wf.Spec.Trigger.GitLab.Actions,
			Projects: wf.Spec.Trigger.GitLab.Projects,
		}
	}

	// Convert steps
	for _, s := range wf.Spec.Steps {
		resp.Spec.Steps = append(resp.Spec.Steps, StepResponse{
			Name:   s.Name,
			Agent:  s.Agent,
			Prompt: s.Prompt,
		})
	}

	return resp
}

func workflowRunToResponse(run agentsv1alpha1.WorkflowRun) WorkflowRunResponse {
	resp := WorkflowRunResponse{
		Metadata: Metadata{
			Name:              run.Name,
			Namespace:         run.Namespace,
			CreationTimestamp: run.CreationTimestamp.Time,
			Labels:            run.Labels,
		},
		Spec: WorkflowRunSpecResponse{
			WorkflowRef: run.Spec.WorkflowRef,
			TriggerData: run.Spec.TriggerData,
		},
		Status: WorkflowRunStatusResponse{
			Phase:       string(run.Status.Phase),
			CurrentStep: run.Status.CurrentStep,
			Error:       run.Status.Error,
		},
	}

	if run.Status.StartTime != nil {
		t := run.Status.StartTime.Time
		resp.Status.StartTime = &t
	}
	if run.Status.CompletionTime != nil {
		t := run.Status.CompletionTime.Time
		resp.Status.EndTime = &t
	}

	for _, s := range run.Status.StepResults {
		step := StepStatusResponse{
			Name:       s.Name,
			Phase:      s.Phase,
			Output:     s.Output,
			Error:      s.Error,
			JobName:    s.JobName,
			SessionID:  s.SessionID,
			ToolCalls:  s.ToolCalls,
			TokensUsed: s.TokensUsed,
		}
		if s.StartTime != nil {
			t := s.StartTime.Time
			step.StartTime = &t
		}
		if s.CompletionTime != nil {
			t := s.CompletionTime.Time
			step.EndTime = &t
		}
		// Map step trace events
		for _, ev := range s.Events {
			step.Events = append(step.Events, StepEventResponse{
				Type:       ev.Type,
				Timestamp:  ev.Timestamp,
				ToolName:   ev.ToolName,
				ToolArgs:   ev.ToolArgs,
				ToolResult: ev.ToolResult,
				Duration:   ev.Duration,
				Content:    ev.Content,
			})
		}
		resp.Status.Steps = append(resp.Status.Steps, step)
	}

	return resp
}

func channelToResponse(ch agentsv1alpha1.Channel) ChannelResponse {
	return ChannelResponse{
		Metadata: Metadata{
			Name:              ch.Name,
			Namespace:         ch.Namespace,
			CreationTimestamp: ch.CreationTimestamp.Time,
		},
		Spec: ChannelSpecResponse{
			Type:     ch.Spec.Type,
			AgentRef: ch.Spec.AgentRef,
		},
		Status: ChannelStatusResponse{
			Phase:      string(ch.Status.Phase),
			Ready:      ch.Status.Phase == agentsv1alpha1.ChannelPhaseReady,
			ServiceURL: ch.Status.ServiceURL,
			WebhookURL: ch.Status.WebhookURL,
		},
	}
}

// ============================================================================
// CAPABILITY TYPES
// ============================================================================

// CapabilityResponse is the JSON response for a Capability
type CapabilityResponse struct {
	Metadata Metadata                 `json:"metadata"`
	Spec     CapabilitySpecResponse   `json:"spec"`
	Status   CapabilityStatusResponse `json:"status"`
}

// CapabilitySpecResponse is the spec portion of Capability
type CapabilitySpecResponse struct {
	Type               string                         `json:"type"`
	Description        string                         `json:"description"`
	Image              string                         `json:"image,omitempty"`
	ServiceAccountName string                         `json:"serviceAccountName,omitempty"`
	CommandPrefix      string                         `json:"commandPrefix,omitempty"`
	Permissions        *CapabilityPermissionsResponse `json:"permissions,omitempty"`
	RateLimit          *CapabilityRateLimitResponse   `json:"rateLimit,omitempty"`
	Audit              bool                           `json:"audit"`
	Instructions       string                         `json:"instructions,omitempty"`

	// Type-specific sub-specs (only one populated based on Type)
	Container *ContainerCapResponse `json:"container,omitempty"`
	MCP       *MCPCapResponse       `json:"mcp,omitempty"`
	Skill     *SkillCapResponse     `json:"skill,omitempty"`
	Tool      *ToolCapResponse      `json:"tool,omitempty"`
	Plugin    *PluginCapResponse    `json:"plugin,omitempty"`
}

// ContainerCapResponse is the Container sub-spec
type ContainerCapResponse struct {
	Image              string `json:"image"`
	ServiceAccountName string `json:"serviceAccountName,omitempty"`
	CommandPrefix      string `json:"commandPrefix,omitempty"`
	ContainerType      string `json:"containerType,omitempty"`
}

// MCPCapResponse is the MCP sub-spec
type MCPCapResponse struct {
	Mode    string `json:"mode"`
	URL     string `json:"url,omitempty"`
	Enabled *bool  `json:"enabled,omitempty"`
}

// SkillCapResponse is the Skill sub-spec
type SkillCapResponse struct {
	HasContent      bool `json:"hasContent"`
	HasConfigMapRef bool `json:"hasConfigMapRef"`
}

// ToolCapResponse is the Tool sub-spec
type ToolCapResponse struct {
	HasCode         bool `json:"hasCode"`
	HasConfigMapRef bool `json:"hasConfigMapRef"`
}

// PluginCapResponse is the Plugin sub-spec
type PluginCapResponse struct {
	HasCode         bool   `json:"hasCode"`
	HasConfigMapRef bool   `json:"hasConfigMapRef"`
	Package         string `json:"package,omitempty"`
}

// CapabilityPermissionsResponse is the three-tier permission model
type CapabilityPermissionsResponse struct {
	Allow   []string               `json:"allow,omitempty"`
	Approve []ApprovalRuleResponse `json:"approve,omitempty"`
	Deny    []string               `json:"deny,omitempty"`
}

// ApprovalRuleResponse is an approval rule
type ApprovalRuleResponse struct {
	Pattern  string `json:"pattern"`
	Message  string `json:"message,omitempty"`
	Severity string `json:"severity,omitempty"`
	Timeout  int32  `json:"timeout,omitempty"`
}

// CapabilityRateLimitResponse is rate limit config for a capability
type CapabilityRateLimitResponse struct {
	RequestsPerMinute int32 `json:"requestsPerMinute,omitempty"`
}

// CapabilityStatusResponse is capability status
type CapabilityStatusResponse struct {
	Phase  string   `json:"phase"`
	UsedBy []string `json:"usedBy,omitempty"`
}

func capabilityToResponse(capability agentsv1alpha1.Capability) CapabilityResponse {
	resp := CapabilityResponse{
		Metadata: Metadata{
			Name:              capability.Name,
			Namespace:         capability.Namespace,
			CreationTimestamp: capability.CreationTimestamp.Time,
		},
		Spec: CapabilitySpecResponse{
			Type:         string(capability.Spec.Type),
			Description:  capability.Spec.Description,
			Audit:        capability.Spec.Audit,
			Instructions: capability.Spec.Instructions,
		},
		Status: CapabilityStatusResponse{
			Phase:  string(capability.Status.Phase),
			UsedBy: capability.Status.UsedBy,
		},
	}

	// Populate Container-specific fields (flat fields kept for backward compat)
	if capability.Spec.Container != nil {
		resp.Spec.Image = capability.Spec.Container.Image
		resp.Spec.ServiceAccountName = capability.Spec.Container.ServiceAccountName
		resp.Spec.CommandPrefix = capability.Spec.Container.CommandPrefix
		resp.Spec.Container = &ContainerCapResponse{
			Image:              capability.Spec.Container.Image,
			ServiceAccountName: capability.Spec.Container.ServiceAccountName,
			CommandPrefix:      capability.Spec.Container.CommandPrefix,
			ContainerType:      capability.Spec.Container.ContainerType,
		}
	}

	// Populate MCP sub-spec
	if capability.Spec.MCP != nil {
		resp.Spec.MCP = &MCPCapResponse{
			Mode:    capability.Spec.MCP.Mode,
			URL:     capability.Spec.MCP.URL,
			Enabled: capability.Spec.MCP.Enabled,
		}
	}

	// Populate Skill sub-spec
	if capability.Spec.Skill != nil {
		resp.Spec.Skill = &SkillCapResponse{
			HasContent:      capability.Spec.Skill.Content != "",
			HasConfigMapRef: capability.Spec.Skill.ConfigMapRef != nil,
		}
	}

	// Populate Tool sub-spec
	if capability.Spec.Tool != nil {
		resp.Spec.Tool = &ToolCapResponse{
			HasCode:         capability.Spec.Tool.Code != "",
			HasConfigMapRef: capability.Spec.Tool.ConfigMapRef != nil,
		}
	}

	// Populate Plugin sub-spec
	if capability.Spec.Plugin != nil {
		resp.Spec.Plugin = &PluginCapResponse{
			HasCode:         capability.Spec.Plugin.Code != "",
			HasConfigMapRef: capability.Spec.Plugin.ConfigMapRef != nil,
			Package:         capability.Spec.Plugin.Package,
		}
	}

	// Convert permissions
	if capability.Spec.Permissions != nil {
		resp.Spec.Permissions = &CapabilityPermissionsResponse{
			Allow: capability.Spec.Permissions.Allow,
			Deny:  capability.Spec.Permissions.Deny,
		}
		for _, rule := range capability.Spec.Permissions.Approve {
			resp.Spec.Permissions.Approve = append(resp.Spec.Permissions.Approve, ApprovalRuleResponse{
				Pattern:  rule.Pattern,
				Message:  rule.Message,
				Severity: rule.Severity,
				Timeout:  rule.Timeout,
			})
		}
	}

	// Convert rate limit
	if capability.Spec.RateLimit != nil {
		resp.Spec.RateLimit = &CapabilityRateLimitResponse{
			RequestsPerMinute: capability.Spec.RateLimit.RequestsPerMinute,
		}
	}

	return resp
}

func boolValue(b *bool) bool {
	if b == nil {
		return true // Default to enabled
	}
	return *b
}

// providerFromModel extracts the provider name from a "provider/model" string.
// e.g., "anthropic/claude-sonnet-4-20250514" -> "anthropic"
func providerFromModel(model string) string {
	if idx := strings.Index(model, "/"); idx > 0 {
		return model[:idx]
	}
	return model
}
