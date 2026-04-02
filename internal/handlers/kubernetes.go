package handlers

import (
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
)

// ============================================================================
// KUBERNETES RESOURCE TYPES
// ============================================================================

// NamespaceInfo represents a namespace with its workload counts
type NamespaceInfo struct {
	Name         string            `json:"name"`
	Status       string            `json:"status"`
	Created      time.Time         `json:"created"`
	Labels       map[string]string `json:"labels,omitempty"`
	Deployments  int               `json:"deployments"`
	StatefulSets int               `json:"statefulSets"`
	Pods         int               `json:"pods"`
	Services     int               `json:"services"`
}

// WorkloadInfo represents a deployment or statefulset
type WorkloadInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Kind       string            `json:"kind"` // Deployment, StatefulSet
	Replicas   int32             `json:"replicas"`
	Ready      int32             `json:"ready"`
	Available  int32             `json:"available"`
	Created    time.Time         `json:"created"`
	Labels     map[string]string `json:"labels,omitempty"`
	Images     []string          `json:"images,omitempty"`
	Conditions []ConditionInfo   `json:"conditions,omitempty"`
}

// PodInfo represents a pod with its status
type PodInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Phase      string            `json:"phase"`
	Ready      bool              `json:"ready"`
	Restarts   int32             `json:"restarts"`
	Node       string            `json:"node"`
	IP         string            `json:"ip"`
	Created    time.Time         `json:"created"`
	Labels     map[string]string `json:"labels,omitempty"`
	Containers []ContainerInfo   `json:"containers,omitempty"`
}

// ContainerInfo represents a container in a pod
type ContainerInfo struct {
	Name         string `json:"name"`
	Image        string `json:"image"`
	Ready        bool   `json:"ready"`
	Restarts     int32  `json:"restarts"`
	State        string `json:"state"` // running, waiting, terminated
	StateReason  string `json:"stateReason,omitempty"`
	StateMessage string `json:"stateMessage,omitempty"`
}

// ConditionInfo represents a resource condition
type ConditionInfo struct {
	Type    string    `json:"type"`
	Status  string    `json:"status"`
	Reason  string    `json:"reason,omitempty"`
	Message string    `json:"message,omitempty"`
	Updated time.Time `json:"updated"`
}

// EventInfo represents a Kubernetes event
type EventInfo struct {
	Type      string    `json:"type"` // Normal, Warning
	Reason    string    `json:"reason"`
	Message   string    `json:"message"`
	Count     int32     `json:"count"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
	Source    string    `json:"source"`
}

// ServiceInfo represents a Kubernetes service
type ServiceInfo struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Type       string            `json:"type"`
	ClusterIP  string            `json:"clusterIP"`
	ExternalIP string            `json:"externalIP,omitempty"`
	Ports      []ServicePortInfo `json:"ports,omitempty"`
	Created    time.Time         `json:"created"`
	Labels     map[string]string `json:"labels,omitempty"`
}

// ServicePortInfo represents a port on a service
type ServicePortInfo struct {
	Name       string `json:"name,omitempty"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort"`
	Protocol   string `json:"protocol"`
	NodePort   int32  `json:"nodePort,omitempty"`
}

// ============================================================================
// HANDLERS
// ============================================================================

// ListNamespaces returns all namespaces with workload counts
func (h *Handlers) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	namespaces, err := h.k8s.ListNamespaces(ctx)
	if err != nil {
		h.log.Errorw("Failed to list namespaces", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list namespaces")
		return
	}

	result := make([]NamespaceInfo, 0, len(namespaces))
	for _, ns := range namespaces {
		info := NamespaceInfo{
			Name:    ns.Name,
			Status:  string(ns.Status.Phase),
			Created: ns.CreationTimestamp.Time,
			Labels:  ns.Labels,
		}

		// Get workload counts (async in future for performance)
		if deploys, err := h.k8s.ListDeployments(ctx, ns.Name); err == nil {
			info.Deployments = len(deploys)
		}
		if sts, err := h.k8s.ListStatefulSets(ctx, ns.Name); err == nil {
			info.StatefulSets = len(sts)
		}
		if pods, err := h.k8s.ListPods(ctx, ns.Name, nil); err == nil {
			info.Pods = len(pods)
		}
		if svcs, err := h.k8s.ListServices(ctx, ns.Name); err == nil {
			info.Services = len(svcs)
		}

		result = append(result, info)
	}

	// Sort by name
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	jsonOK(w, result)
}

// ListWorkloads returns deployments and statefulsets in a namespace
func (h *Handlers) ListWorkloads(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	ctx := r.Context()

	result := make([]WorkloadInfo, 0)

	// Get deployments
	deploys, err := h.k8s.ListDeployments(ctx, namespace)
	if err != nil {
		h.log.Warnw("Failed to list deployments", "namespace", namespace, "error", err)
	} else {
		for _, d := range deploys {
			images := make([]string, 0)
			for _, c := range d.Spec.Template.Spec.Containers {
				images = append(images, c.Image)
			}

			conditions := make([]ConditionInfo, 0)
			for _, c := range d.Status.Conditions {
				conditions = append(conditions, ConditionInfo{
					Type:    string(c.Type),
					Status:  string(c.Status),
					Reason:  c.Reason,
					Message: c.Message,
					Updated: c.LastTransitionTime.Time,
				})
			}

			result = append(result, WorkloadInfo{
				Name:       d.Name,
				Namespace:  d.Namespace,
				Kind:       "Deployment",
				Replicas:   *d.Spec.Replicas,
				Ready:      d.Status.ReadyReplicas,
				Available:  d.Status.AvailableReplicas,
				Created:    d.CreationTimestamp.Time,
				Labels:     d.Labels,
				Images:     images,
				Conditions: conditions,
			})
		}
	}

	// Get statefulsets
	stss, err := h.k8s.ListStatefulSets(ctx, namespace)
	if err != nil {
		h.log.Warnw("Failed to list statefulsets", "namespace", namespace, "error", err)
	} else {
		for _, s := range stss {
			images := make([]string, 0)
			for _, c := range s.Spec.Template.Spec.Containers {
				images = append(images, c.Image)
			}

			conditions := make([]ConditionInfo, 0)
			for _, c := range s.Status.Conditions {
				conditions = append(conditions, ConditionInfo{
					Type:    string(c.Type),
					Status:  string(c.Status),
					Reason:  c.Reason,
					Message: c.Message,
					Updated: c.LastTransitionTime.Time,
				})
			}

			result = append(result, WorkloadInfo{
				Name:       s.Name,
				Namespace:  s.Namespace,
				Kind:       "StatefulSet",
				Replicas:   *s.Spec.Replicas,
				Ready:      s.Status.ReadyReplicas,
				Available:  s.Status.AvailableReplicas,
				Created:    s.CreationTimestamp.Time,
				Labels:     s.Labels,
				Images:     images,
				Conditions: conditions,
			})
		}
	}

	// Sort by name
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	jsonOK(w, result)
}

// GetWorkload returns details of a specific deployment or statefulset
func (h *Handlers) GetWorkload(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	kind := r.URL.Query().Get("kind")
	ctx := r.Context()

	if kind == "" {
		kind = "Deployment" // default
	}

	var result WorkloadInfo

	switch kind {
	case "Deployment":
		d, err := h.k8s.GetDeployment(ctx, namespace, name)
		if err != nil {
			jsonError(w, http.StatusNotFound, "Deployment not found")
			return
		}

		images := make([]string, 0)
		for _, c := range d.Spec.Template.Spec.Containers {
			images = append(images, c.Image)
		}

		conditions := make([]ConditionInfo, 0)
		for _, c := range d.Status.Conditions {
			conditions = append(conditions, ConditionInfo{
				Type:    string(c.Type),
				Status:  string(c.Status),
				Reason:  c.Reason,
				Message: c.Message,
				Updated: c.LastTransitionTime.Time,
			})
		}

		result = WorkloadInfo{
			Name:       d.Name,
			Namespace:  d.Namespace,
			Kind:       "Deployment",
			Replicas:   *d.Spec.Replicas,
			Ready:      d.Status.ReadyReplicas,
			Available:  d.Status.AvailableReplicas,
			Created:    d.CreationTimestamp.Time,
			Labels:     d.Labels,
			Images:     images,
			Conditions: conditions,
		}

	case "StatefulSet":
		s, err := h.k8s.GetStatefulSet(ctx, namespace, name)
		if err != nil {
			jsonError(w, http.StatusNotFound, "StatefulSet not found")
			return
		}

		images := make([]string, 0)
		for _, c := range s.Spec.Template.Spec.Containers {
			images = append(images, c.Image)
		}

		conditions := make([]ConditionInfo, 0)
		for _, c := range s.Status.Conditions {
			conditions = append(conditions, ConditionInfo{
				Type:    string(c.Type),
				Status:  string(c.Status),
				Reason:  c.Reason,
				Message: c.Message,
				Updated: c.LastTransitionTime.Time,
			})
		}

		result = WorkloadInfo{
			Name:       s.Name,
			Namespace:  s.Namespace,
			Kind:       "StatefulSet",
			Replicas:   *s.Spec.Replicas,
			Ready:      s.Status.ReadyReplicas,
			Available:  s.Status.AvailableReplicas,
			Created:    s.CreationTimestamp.Time,
			Labels:     s.Labels,
			Images:     images,
			Conditions: conditions,
		}

	default:
		jsonError(w, http.StatusBadRequest, "Invalid kind, must be Deployment or StatefulSet")
		return
	}

	jsonOK(w, result)
}

// ListPods returns pods in a namespace
func (h *Handlers) ListPods(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	ctx := r.Context()

	pods, err := h.k8s.ListPods(ctx, namespace, nil)
	if err != nil {
		h.log.Errorw("Failed to list pods", "namespace", namespace, "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list pods")
		return
	}

	result := make([]PodInfo, 0, len(pods))
	for _, p := range pods {
		var restarts int32
		ready := true
		containers := make([]ContainerInfo, 0, len(p.Status.ContainerStatuses))

		for _, cs := range p.Status.ContainerStatuses {
			restarts += cs.RestartCount
			if !cs.Ready {
				ready = false
			}

			state := "unknown"
			stateReason := ""
			stateMessage := ""
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = "waiting"
				stateReason = cs.State.Waiting.Reason
				stateMessage = cs.State.Waiting.Message
			} else if cs.State.Terminated != nil {
				state = "terminated"
				stateReason = cs.State.Terminated.Reason
				stateMessage = cs.State.Terminated.Message
			}

			containers = append(containers, ContainerInfo{
				Name:         cs.Name,
				Image:        cs.Image,
				Ready:        cs.Ready,
				Restarts:     cs.RestartCount,
				State:        state,
				StateReason:  stateReason,
				StateMessage: stateMessage,
			})
		}

		result = append(result, PodInfo{
			Name:       p.Name,
			Namespace:  p.Namespace,
			Phase:      string(p.Status.Phase),
			Ready:      ready,
			Restarts:   restarts,
			Node:       p.Spec.NodeName,
			IP:         p.Status.PodIP,
			Created:    p.CreationTimestamp.Time,
			Labels:     p.Labels,
			Containers: containers,
		})
	}

	// Sort by name
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	jsonOK(w, result)
}

// ListWorkloadPods returns pods for a specific workload
func (h *Handlers) ListWorkloadPods(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	kind := r.URL.Query().Get("kind")
	ctx := r.Context()

	if kind == "" {
		kind = "Deployment"
	}

	// Get selector from the workload
	var selector map[string]string
	switch kind {
	case "Deployment":
		d, err := h.k8s.GetDeployment(ctx, namespace, name)
		if err != nil {
			jsonError(w, http.StatusNotFound, "Deployment not found")
			return
		}
		selector = d.Spec.Selector.MatchLabels
	case "StatefulSet":
		s, err := h.k8s.GetStatefulSet(ctx, namespace, name)
		if err != nil {
			jsonError(w, http.StatusNotFound, "StatefulSet not found")
			return
		}
		selector = s.Spec.Selector.MatchLabels
	default:
		jsonError(w, http.StatusBadRequest, "Invalid kind")
		return
	}

	pods, err := h.k8s.ListPods(ctx, namespace, selector)
	if err != nil {
		h.log.Errorw("Failed to list pods", "namespace", namespace, "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list pods")
		return
	}

	result := make([]PodInfo, 0, len(pods))
	for _, p := range pods {
		var restarts int32
		ready := true
		containers := make([]ContainerInfo, 0, len(p.Status.ContainerStatuses))

		for _, cs := range p.Status.ContainerStatuses {
			restarts += cs.RestartCount
			if !cs.Ready {
				ready = false
			}

			state := "unknown"
			stateReason := ""
			stateMessage := ""
			if cs.State.Running != nil {
				state = "running"
			} else if cs.State.Waiting != nil {
				state = "waiting"
				stateReason = cs.State.Waiting.Reason
				stateMessage = cs.State.Waiting.Message
			} else if cs.State.Terminated != nil {
				state = "terminated"
				stateReason = cs.State.Terminated.Reason
				stateMessage = cs.State.Terminated.Message
			}

			containers = append(containers, ContainerInfo{
				Name:         cs.Name,
				Image:        cs.Image,
				Ready:        cs.Ready,
				Restarts:     cs.RestartCount,
				State:        state,
				StateReason:  stateReason,
				StateMessage: stateMessage,
			})
		}

		result = append(result, PodInfo{
			Name:       p.Name,
			Namespace:  p.Namespace,
			Phase:      string(p.Status.Phase),
			Ready:      ready,
			Restarts:   restarts,
			Node:       p.Spec.NodeName,
			IP:         p.Status.PodIP,
			Created:    p.CreationTimestamp.Time,
			Labels:     p.Labels,
			Containers: containers,
		})
	}

	jsonOK(w, result)
}

// ListEvents returns events for a resource
func (h *Handlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := r.URL.Query().Get("name")
	kind := r.URL.Query().Get("kind")
	ctx := r.Context()

	events, err := h.k8s.ListEvents(ctx, namespace, name, kind)
	if err != nil {
		h.log.Errorw("Failed to list events", "namespace", namespace, "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list events")
		return
	}

	result := make([]EventInfo, 0, len(events))
	for _, e := range events {
		result = append(result, EventInfo{
			Type:      e.Type,
			Reason:    e.Reason,
			Message:   e.Message,
			Count:     e.Count,
			FirstSeen: e.FirstTimestamp.Time,
			LastSeen:  e.LastTimestamp.Time,
			Source:    e.Source.Component,
		})
	}

	// Sort by last seen (newest first)
	sort.Slice(result, func(i, j int) bool {
		return result[i].LastSeen.After(result[j].LastSeen)
	})

	jsonOK(w, result)
}

// ListServices returns services in a namespace
func (h *Handlers) ListServices(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	ctx := r.Context()

	services, err := h.k8s.ListServices(ctx, namespace)
	if err != nil {
		h.log.Errorw("Failed to list services", "namespace", namespace, "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list services")
		return
	}

	result := make([]ServiceInfo, 0, len(services))
	for _, s := range services {
		ports := make([]ServicePortInfo, 0, len(s.Spec.Ports))
		for _, p := range s.Spec.Ports {
			ports = append(ports, ServicePortInfo{
				Name:       p.Name,
				Port:       p.Port,
				TargetPort: p.TargetPort.String(),
				Protocol:   string(p.Protocol),
				NodePort:   p.NodePort,
			})
		}

		externalIP := ""
		if len(s.Spec.ExternalIPs) > 0 {
			externalIP = s.Spec.ExternalIPs[0]
		}

		result = append(result, ServiceInfo{
			Name:       s.Name,
			Namespace:  s.Namespace,
			Type:       string(s.Spec.Type),
			ClusterIP:  s.Spec.ClusterIP,
			ExternalIP: externalIP,
			Ports:      ports,
			Created:    s.CreationTimestamp.Time,
			Labels:     s.Labels,
		})
	}

	// Sort by name
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	jsonOK(w, result)
}
