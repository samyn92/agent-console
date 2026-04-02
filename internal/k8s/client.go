package k8s

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	agentsv1alpha1 "github.com/samyn92/agent-operator-core/api/v1alpha1"
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/controller-runtime/pkg/cache"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// Client wraps the K8s client with caching via informers
type Client struct {
	client       client.Client
	directClient client.Client // Direct API server client (no cache)
	cache        cache.Cache
	log          *zap.SugaredLogger
	watcher      *Watcher

	mu      sync.RWMutex
	started bool
}

// NewClient creates a new K8s client with informer-based caching.
// If namespace is non-empty, the cache is restricted to that namespace only
// (required for namespace-scoped RBAC where cluster-wide list/watch is forbidden).
func NewClient(kubeconfig string, namespace string, log *zap.SugaredLogger) (*Client, error) {
	var cfg *rest.Config
	var err error

	if kubeconfig == "" {
		// Check KUBECONFIG env var
		kubeconfig = os.Getenv("KUBECONFIG")
	}

	if kubeconfig != "" {
		cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	} else {
		cfg, err = rest.InClusterConfig()
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get kubeconfig: %w", err)
	}

	// Create scheme with our CRDs
	scheme := runtime.NewScheme()
	if err := agentsv1alpha1.AddToScheme(scheme); err != nil {
		return nil, fmt.Errorf("failed to add agents.io scheme: %w", err)
	}

	// Add core types
	if err := addCoreTypes(scheme); err != nil {
		return nil, fmt.Errorf("failed to add core scheme: %w", err)
	}

	// Create cache (informers)
	cacheOpts := cache.Options{
		Scheme: scheme,
		// Sync every 30 seconds
		SyncPeriod: ptr(30 * time.Second),
	}
	if namespace != "" {
		log.Infow("Restricting cache to namespace", "namespace", namespace)
		cacheOpts.DefaultNamespaces = map[string]cache.Config{
			namespace: {},
		}
	}
	c, err := cache.New(cfg, cacheOpts)
	if err != nil {
		return nil, fmt.Errorf("failed to create cache: %w", err)
	}

	// Create client that reads from cache
	cl, err := client.New(cfg, client.Options{
		Scheme: scheme,
		Cache: &client.CacheOptions{
			Reader: c,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}

	// Create direct client (no cache) for resources we don't want to watch
	directCl, err := client.New(cfg, client.Options{
		Scheme: scheme,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create direct client: %w", err)
	}

	return &Client{
		client:       cl,
		directClient: directCl,
		cache:        c,
		log:          log,
		watcher:      NewWatcher(),
	}, nil
}

// Start starts the informers and waits for cache sync
func (c *Client) Start(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.started {
		return nil
	}

	// Start cache in background FIRST (GetInformer blocks until cache is started)
	go func() {
		if err := c.cache.Start(ctx); err != nil {
			c.log.Errorw("Cache error", "error", err)
		}
	}()

	// Register event handlers for all resource types
	// This enables real-time updates via the watcher
	// Note: GetInformer will block briefly until cache starts, that's OK
	go func() {
		agentInformer, err := c.cache.GetInformer(ctx, &agentsv1alpha1.Agent{})
		if err != nil {
			c.log.Warnw("Failed to get Agent informer", "error", err)
		} else {
			agentInformer.AddEventHandler(c.watcher.AgentEventHandler())
		}

		capabilityInformer, err := c.cache.GetInformer(ctx, &agentsv1alpha1.Capability{})
		if err != nil {
			c.log.Warnw("Failed to get Capability informer", "error", err)
		} else {
			capabilityInformer.AddEventHandler(c.watcher.CapabilityEventHandler())
		}

		workflowInformer, err := c.cache.GetInformer(ctx, &agentsv1alpha1.Workflow{})
		if err != nil {
			c.log.Warnw("Failed to get Workflow informer", "error", err)
		} else {
			workflowInformer.AddEventHandler(c.watcher.WorkflowEventHandler())
		}

		channelInformer, err := c.cache.GetInformer(ctx, &agentsv1alpha1.Channel{})
		if err != nil {
			c.log.Warnw("Failed to get Channel informer", "error", err)
		} else {
			channelInformer.AddEventHandler(c.watcher.ChannelEventHandler())
		}

		workflowRunInformer, err := c.cache.GetInformer(ctx, &agentsv1alpha1.WorkflowRun{})
		if err != nil {
			c.log.Warnw("Failed to get WorkflowRun informer", "error", err)
		} else {
			workflowRunInformer.AddEventHandler(c.watcher.WorkflowRunEventHandler())
		}
	}()

	// Wait for initial cache sync with timeout
	// Note: The cache syncs lazily as informers are created on first access
	c.log.Info("Waiting for cache sync...")
	syncCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if !c.cache.WaitForCacheSync(syncCtx) {
		c.log.Warn("Initial cache sync timed out, will sync lazily on first access")
	} else {
		c.log.Info("Cache synced")
	}

	c.started = true
	return nil
}

// Watcher returns the resource watcher for subscribing to events
func (c *Client) Watcher() *Watcher {
	return c.watcher
}

// ListAgents returns all Agents across namespaces (or filtered by namespace)
func (c *Client) ListAgents(ctx context.Context, namespace string) ([]agentsv1alpha1.Agent, error) {
	var list agentsv1alpha1.AgentList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetAgent returns a specific Agent
func (c *Client) GetAgent(ctx context.Context, namespace, name string) (*agentsv1alpha1.Agent, error) {
	var agent agentsv1alpha1.Agent
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &agent); err != nil {
		return nil, err
	}
	return &agent, nil
}

// ListCapabilities returns all Capabilities across namespaces (or filtered by namespace)
func (c *Client) ListCapabilities(ctx context.Context, namespace string) ([]agentsv1alpha1.Capability, error) {
	var list agentsv1alpha1.CapabilityList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetCapability returns a specific Capability
func (c *Client) GetCapability(ctx context.Context, namespace, name string) (*agentsv1alpha1.Capability, error) {
	var capability agentsv1alpha1.Capability
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &capability); err != nil {
		return nil, err
	}
	return &capability, nil
}

// GetAgentServiceURL returns the internal service URL for an agent pod
// In dev mode, uses kubectl proxy URL if KUBECTL_PROXY_URL is set
// Otherwise checks for AGENT_URL_OVERRIDE for single-agent testing
func (c *Client) GetAgentServiceURL(namespace, name string) string {
	// Allow single agent override for simple local testing
	if override := os.Getenv("AGENT_URL_OVERRIDE"); override != "" {
		return override
	}
	// Use kubectl proxy for multi-agent dev (run: kubectl proxy --port=8001)
	// URL format: http://localhost:8001/api/v1/namespaces/{ns}/services/{svc}:{port}/proxy/
	if proxyURL := os.Getenv("KUBECTL_PROXY_URL"); proxyURL != "" {
		return fmt.Sprintf("%s/api/v1/namespaces/%s/services/%s:4096/proxy", proxyURL, namespace, name)
	}
	return fmt.Sprintf("http://%s.%s.svc.cluster.local:4096", name, namespace)
}

// ListWorkflows returns all Workflows across namespaces (or filtered by namespace)
func (c *Client) ListWorkflows(ctx context.Context, namespace string) ([]agentsv1alpha1.Workflow, error) {
	var list agentsv1alpha1.WorkflowList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetWorkflow returns a specific Workflow
func (c *Client) GetWorkflow(ctx context.Context, namespace, name string) (*agentsv1alpha1.Workflow, error) {
	var wf agentsv1alpha1.Workflow
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &wf); err != nil {
		return nil, err
	}
	return &wf, nil
}

// ListChannels returns all Channels across namespaces (or filtered by namespace)
func (c *Client) ListChannels(ctx context.Context, namespace string) ([]agentsv1alpha1.Channel, error) {
	var list agentsv1alpha1.ChannelList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetChannel returns a specific Channel
func (c *Client) GetChannel(ctx context.Context, namespace, name string) (*agentsv1alpha1.Channel, error) {
	var ch agentsv1alpha1.Channel
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &ch); err != nil {
		return nil, err
	}
	return &ch, nil
}

// ListWorkflowRuns returns all WorkflowRuns across namespaces (or filtered by namespace)
func (c *Client) ListWorkflowRuns(ctx context.Context, namespace string) ([]agentsv1alpha1.WorkflowRun, error) {
	var list agentsv1alpha1.WorkflowRunList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

func ptr[T any](v T) *T {
	return &v
}

func addCoreTypes(scheme *runtime.Scheme) error {
	// Add core K8s types (pods, namespaces, deployments, etc.)
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	return nil
}

// ============================================================================
// KUBERNETES RESOURCES (for browsing)
// ============================================================================

// ListNamespaces returns all namespaces.
// Note: This requires cluster-scoped list permissions on namespaces.
// When running with namespace-scoped RBAC, this will fail — return an empty
// list instead of propagating the error so the UI degrades gracefully.
func (c *Client) ListNamespaces(ctx context.Context) ([]corev1.Namespace, error) {
	var list corev1.NamespaceList
	if err := c.client.List(ctx, &list); err != nil {
		c.log.Warnw("Failed to list namespaces (likely namespace-scoped RBAC), returning empty list", "error", err)
		return nil, nil
	}
	return list.Items, nil
}

// ListDeployments returns deployments in a namespace
func (c *Client) ListDeployments(ctx context.Context, namespace string) ([]appsv1.Deployment, error) {
	var list appsv1.DeploymentList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetDeployment returns a specific deployment
func (c *Client) GetDeployment(ctx context.Context, namespace, name string) (*appsv1.Deployment, error) {
	var deploy appsv1.Deployment
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &deploy); err != nil {
		return nil, err
	}
	return &deploy, nil
}

// ListStatefulSets returns statefulsets in a namespace
func (c *Client) ListStatefulSets(ctx context.Context, namespace string) ([]appsv1.StatefulSet, error) {
	var list appsv1.StatefulSetList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetStatefulSet returns a specific statefulset
func (c *Client) GetStatefulSet(ctx context.Context, namespace, name string) (*appsv1.StatefulSet, error) {
	var sts appsv1.StatefulSet
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &sts); err != nil {
		return nil, err
	}
	return &sts, nil
}

// ListPods returns pods in a namespace, optionally filtered by labels
func (c *Client) ListPods(ctx context.Context, namespace string, labelSelector map[string]string) ([]corev1.Pod, error) {
	var list corev1.PodList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if len(labelSelector) > 0 {
		opts = append(opts, client.MatchingLabels(labelSelector))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// GetPod returns a specific pod
func (c *Client) GetPod(ctx context.Context, namespace, name string) (*corev1.Pod, error) {
	var pod corev1.Pod
	if err := c.client.Get(ctx, client.ObjectKey{Namespace: namespace, Name: name}, &pod); err != nil {
		return nil, err
	}
	return &pod, nil
}

// ListServices returns services in a namespace
func (c *Client) ListServices(ctx context.Context, namespace string) ([]corev1.Service, error) {
	var list corev1.ServiceList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}
	return list.Items, nil
}

// ListEvents returns events for a resource
func (c *Client) ListEvents(ctx context.Context, namespace, name, kind string) ([]corev1.Event, error) {
	var list corev1.EventList
	opts := []client.ListOption{}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.client.List(ctx, &list, opts...); err != nil {
		return nil, err
	}

	// Filter events for the specific resource
	if name != "" && kind != "" {
		filtered := make([]corev1.Event, 0)
		for _, e := range list.Items {
			if e.InvolvedObject.Name == name && e.InvolvedObject.Kind == kind {
				filtered = append(filtered, e)
			}
		}
		return filtered, nil
	}

	return list.Items, nil
}

// ============================================================================
// HELM RELEASES
// ============================================================================

// HelmRelease represents a Helm release extracted from K8s secrets
type HelmRelease struct {
	Name         string    `json:"name"`
	Namespace    string    `json:"namespace"`
	Chart        string    `json:"chart"`
	ChartVersion string    `json:"chartVersion"`
	AppVersion   string    `json:"appVersion"`
	Revision     int       `json:"revision"`
	Status       string    `json:"status"`
	Updated      time.Time `json:"updated"`
}

// ListHelmReleases returns all Helm releases by reading helm.sh/release.v1 secrets
// Uses the direct client to avoid cache timeouts for secrets
func (c *Client) ListHelmReleases(ctx context.Context, namespace string) ([]HelmRelease, error) {
	var list corev1.SecretList
	opts := []client.ListOption{
		client.MatchingLabels{"owner": "helm"},
	}
	if namespace != "" {
		opts = append(opts, client.InNamespace(namespace))
	}
	if err := c.directClient.List(ctx, &list, opts...); err != nil {
		return nil, err
	}

	// Map to track latest revision per release
	releaseMap := make(map[string]*HelmRelease)

	for _, secret := range list.Items {
		// Only process helm release secrets
		if secret.Type != "helm.sh/release.v1" {
			continue
		}

		// Parse release info from labels
		releaseName := secret.Labels["name"]
		if releaseName == "" {
			continue
		}

		// Get revision from version label
		var revision int
		if v := secret.Labels["version"]; v != "" {
			fmt.Sscanf(v, "%d", &revision)
		}

		// Key for deduplication
		key := fmt.Sprintf("%s/%s", secret.Namespace, releaseName)

		// Keep only the latest revision
		existing, exists := releaseMap[key]
		if exists && existing.Revision >= revision {
			continue
		}

		// Decode the release data to get chart info
		releaseData, ok := secret.Data["release"]
		if !ok {
			continue
		}

		// Helm stores releases as base64(gzip(json))
		release, err := decodeHelmRelease(releaseData)
		if err != nil {
			c.log.Debugw("Failed to decode helm release", "name", releaseName, "error", err)
			continue
		}

		releaseMap[key] = &HelmRelease{
			Name:         releaseName,
			Namespace:    secret.Namespace,
			Chart:        release.Chart,
			ChartVersion: release.ChartVersion,
			AppVersion:   release.AppVersion,
			Revision:     revision,
			Status:       release.Status,
			Updated:      secret.CreationTimestamp.Time,
		}
	}

	// Convert map to slice
	releases := make([]HelmRelease, 0, len(releaseMap))
	for _, r := range releaseMap {
		releases = append(releases, *r)
	}

	return releases, nil
}

// helmReleaseInfo holds decoded helm release metadata
type helmReleaseInfo struct {
	Chart        string
	ChartVersion string
	AppVersion   string
	Status       string
}

// decodeHelmRelease decodes the base64+gzip+json helm release data
func decodeHelmRelease(data []byte) (*helmReleaseInfo, error) {
	// Helm release data is base64 encoded
	decoded := make([]byte, base64.StdEncoding.DecodedLen(len(data)))
	n, err := base64.StdEncoding.Decode(decoded, data)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	decoded = decoded[:n]

	// Then gzip compressed
	gzReader, err := gzip.NewReader(bytes.NewReader(decoded))
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer gzReader.Close()

	uncompressed, err := io.ReadAll(gzReader)
	if err != nil {
		return nil, fmt.Errorf("gzip read: %w", err)
	}

	// Parse the JSON structure - we only need chart metadata
	var release struct {
		Chart struct {
			Metadata struct {
				Name       string `json:"name"`
				Version    string `json:"version"`
				AppVersion string `json:"appVersion"`
			} `json:"metadata"`
		} `json:"chart"`
		Info struct {
			Status string `json:"status"`
		} `json:"info"`
	}

	if err := json.Unmarshal(uncompressed, &release); err != nil {
		return nil, fmt.Errorf("json unmarshal: %w", err)
	}

	return &helmReleaseInfo{
		Chart:        release.Chart.Metadata.Name,
		ChartVersion: release.Chart.Metadata.Version,
		AppVersion:   release.Chart.Metadata.AppVersion,
		Status:       release.Info.Status,
	}, nil
}
