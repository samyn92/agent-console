package handlers

import (
	"net/http"
	"sort"
	"time"

	"github.com/samyn92/agent-console/internal/k8s"
)

// HelmReleaseResponse is the API response for a Helm release
type HelmReleaseResponse struct {
	Name         string    `json:"name"`
	Namespace    string    `json:"namespace"`
	Chart        string    `json:"chart"`
	ChartVersion string    `json:"chartVersion"`
	AppVersion   string    `json:"appVersion"`
	Revision     int       `json:"revision"`
	Status       string    `json:"status"`
	Updated      time.Time `json:"updated"`
}

// ListHelmReleases returns all Helm releases across namespaces
func (h *Handlers) ListHelmReleases(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")

	releases, err := h.k8s.ListHelmReleases(r.Context(), namespace)
	if err != nil {
		h.log.Errorw("Failed to list helm releases", "error", err)
		jsonError(w, http.StatusInternalServerError, "Failed to list helm releases")
		return
	}

	// Convert to response format and sort by namespace, then name
	result := make([]HelmReleaseResponse, 0, len(releases))
	for _, rel := range releases {
		result = append(result, helmReleaseToResponse(rel))
	}

	// Sort: namespace first, then name
	sort.Slice(result, func(i, j int) bool {
		if result[i].Namespace != result[j].Namespace {
			return result[i].Namespace < result[j].Namespace
		}
		return result[i].Name < result[j].Name
	})

	jsonOK(w, result)
}

func helmReleaseToResponse(rel k8s.HelmRelease) HelmReleaseResponse {
	return HelmReleaseResponse{
		Name:         rel.Name,
		Namespace:    rel.Namespace,
		Chart:        rel.Chart,
		ChartVersion: rel.ChartVersion,
		AppVersion:   rel.AppVersion,
		Revision:     rel.Revision,
		Status:       rel.Status,
		Updated:      rel.Updated,
	}
}
