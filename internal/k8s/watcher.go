package k8s

import (
	"sync"

	agentsv1alpha1 "github.com/samyn92/agent-operator-core/api/v1alpha1"
	"k8s.io/client-go/tools/cache"
)

// ResourceEventType is the type of resource change event
type ResourceEventType string

const (
	EventAdded    ResourceEventType = "ADDED"
	EventModified ResourceEventType = "MODIFIED"
	EventDeleted  ResourceEventType = "DELETED"
)

// ResourceEvent represents a change to a K8s resource
type ResourceEvent struct {
	Type         ResourceEventType `json:"type"`
	ResourceKind string            `json:"resourceKind"`
	Namespace    string            `json:"namespace"`
	Name         string            `json:"name"`
	Resource     interface{}       `json:"resource,omitempty"`
}

// Subscriber is a function that receives resource events
type Subscriber func(event ResourceEvent)

// Watcher tracks resource changes and notifies subscribers
type Watcher struct {
	mu          sync.RWMutex
	subscribers map[string]Subscriber
	nextID      int
}

// NewWatcher creates a new watcher
func NewWatcher() *Watcher {
	return &Watcher{
		subscribers: make(map[string]Subscriber),
	}
}

// Subscribe adds a subscriber and returns an unsubscribe function
func (w *Watcher) Subscribe(fn Subscriber) func() {
	w.mu.Lock()
	defer w.mu.Unlock()

	id := string(rune(w.nextID))
	w.nextID++
	w.subscribers[id] = fn

	return func() {
		w.mu.Lock()
		defer w.mu.Unlock()
		delete(w.subscribers, id)
	}
}

// Notify sends an event to all subscribers
func (w *Watcher) Notify(event ResourceEvent) {
	w.mu.RLock()
	defer w.mu.RUnlock()

	for _, fn := range w.subscribers {
		// Send in goroutine to avoid blocking
		go fn(event)
	}
}

// AgentEventHandler returns a cache.ResourceEventHandler for Agents
func (w *Watcher) AgentEventHandler() cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if agent, ok := obj.(*agentsv1alpha1.Agent); ok {
				w.Notify(ResourceEvent{
					Type:         EventAdded,
					ResourceKind: "Agent",
					Namespace:    agent.Namespace,
					Name:         agent.Name,
					Resource:     agent,
				})
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if agent, ok := newObj.(*agentsv1alpha1.Agent); ok {
				w.Notify(ResourceEvent{
					Type:         EventModified,
					ResourceKind: "Agent",
					Namespace:    agent.Namespace,
					Name:         agent.Name,
					Resource:     agent,
				})
			}
		},
		DeleteFunc: func(obj interface{}) {
			if agent, ok := obj.(*agentsv1alpha1.Agent); ok {
				w.Notify(ResourceEvent{
					Type:         EventDeleted,
					ResourceKind: "Agent",
					Namespace:    agent.Namespace,
					Name:         agent.Name,
				})
			}
		},
	}
}

// WorkflowEventHandler returns a cache.ResourceEventHandler for Workflows
func (w *Watcher) WorkflowEventHandler() cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if wf, ok := obj.(*agentsv1alpha1.Workflow); ok {
				w.Notify(ResourceEvent{
					Type:         EventAdded,
					ResourceKind: "Workflow",
					Namespace:    wf.Namespace,
					Name:         wf.Name,
					Resource:     wf,
				})
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if wf, ok := newObj.(*agentsv1alpha1.Workflow); ok {
				w.Notify(ResourceEvent{
					Type:         EventModified,
					ResourceKind: "Workflow",
					Namespace:    wf.Namespace,
					Name:         wf.Name,
					Resource:     wf,
				})
			}
		},
		DeleteFunc: func(obj interface{}) {
			if wf, ok := obj.(*agentsv1alpha1.Workflow); ok {
				w.Notify(ResourceEvent{
					Type:         EventDeleted,
					ResourceKind: "Workflow",
					Namespace:    wf.Namespace,
					Name:         wf.Name,
				})
			}
		},
	}
}

// ChannelEventHandler returns a cache.ResourceEventHandler for Channels
func (w *Watcher) ChannelEventHandler() cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if ch, ok := obj.(*agentsv1alpha1.Channel); ok {
				w.Notify(ResourceEvent{
					Type:         EventAdded,
					ResourceKind: "Channel",
					Namespace:    ch.Namespace,
					Name:         ch.Name,
					Resource:     ch,
				})
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if ch, ok := newObj.(*agentsv1alpha1.Channel); ok {
				w.Notify(ResourceEvent{
					Type:         EventModified,
					ResourceKind: "Channel",
					Namespace:    ch.Namespace,
					Name:         ch.Name,
					Resource:     ch,
				})
			}
		},
		DeleteFunc: func(obj interface{}) {
			if ch, ok := obj.(*agentsv1alpha1.Channel); ok {
				w.Notify(ResourceEvent{
					Type:         EventDeleted,
					ResourceKind: "Channel",
					Namespace:    ch.Namespace,
					Name:         ch.Name,
				})
			}
		},
	}
}

// WorkflowRunEventHandler returns a cache.ResourceEventHandler for WorkflowRuns
func (w *Watcher) WorkflowRunEventHandler() cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if run, ok := obj.(*agentsv1alpha1.WorkflowRun); ok {
				w.Notify(ResourceEvent{
					Type:         EventAdded,
					ResourceKind: "WorkflowRun",
					Namespace:    run.Namespace,
					Name:         run.Name,
					Resource:     run,
				})
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if run, ok := newObj.(*agentsv1alpha1.WorkflowRun); ok {
				w.Notify(ResourceEvent{
					Type:         EventModified,
					ResourceKind: "WorkflowRun",
					Namespace:    run.Namespace,
					Name:         run.Name,
					Resource:     run,
				})
			}
		},
		DeleteFunc: func(obj interface{}) {
			if run, ok := obj.(*agentsv1alpha1.WorkflowRun); ok {
				w.Notify(ResourceEvent{
					Type:         EventDeleted,
					ResourceKind: "WorkflowRun",
					Namespace:    run.Namespace,
					Name:         run.Name,
				})
			}
		},
	}
}

// CapabilityEventHandler returns a cache.ResourceEventHandler for Capabilities
func (w *Watcher) CapabilityEventHandler() cache.ResourceEventHandler {
	return cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if capability, ok := obj.(*agentsv1alpha1.Capability); ok {
				w.Notify(ResourceEvent{
					Type:         EventAdded,
					ResourceKind: "Capability",
					Namespace:    capability.Namespace,
					Name:         capability.Name,
					Resource:     capability,
				})
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if capability, ok := newObj.(*agentsv1alpha1.Capability); ok {
				w.Notify(ResourceEvent{
					Type:         EventModified,
					ResourceKind: "Capability",
					Namespace:    capability.Namespace,
					Name:         capability.Name,
					Resource:     capability,
				})
			}
		},
		DeleteFunc: func(obj interface{}) {
			if capability, ok := obj.(*agentsv1alpha1.Capability); ok {
				w.Notify(ResourceEvent{
					Type:         EventDeleted,
					ResourceKind: "Capability",
					Namespace:    capability.Namespace,
					Name:         capability.Name,
				})
			}
		},
	}
}
