package app

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Operational metrics and strictly minimal error reporting, without message data.

var (
	registry = prometheus.NewRegistry()
	requests = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "untukmu_http_requests_total", Help: "API responses by route template",
	}, []string{"method", "route", "status"})
	duration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "untukmu_http_duration_seconds", Help: "API response duration",
	}, []string{"method", "route"})
	sentryEnabled bool
)

func init() {
	registry.MustRegister(requests, duration)
}

// ConfigureSentry rebuilds every event from an allowlist: no request, user,
// breadcrumb, SQL, URL, stack frame, exception message or arbitrary tag.
func ConfigureSentry(conf *Config) error {
	if conf.SentryDSN == "" {
		return nil
	}
	err := sentry.Init(sentry.ClientOptions{
		Dsn:              conf.SentryDSN,
		Environment:      conf.Environment,
		SendDefaultPII:   false,
		AttachStacktrace: false,
		MaxBreadcrumbs:   -1,
		TracesSampleRate: 0,
		BeforeSend: func(event *sentry.Event, _ *sentry.EventHint) *sentry.Event {
			scrubbed := sentry.NewEvent()
			scrubbed.EventID, scrubbed.Timestamp = event.EventID, event.Timestamp
			scrubbed.Platform, scrubbed.Level, scrubbed.Environment = "go", sentry.LevelError, conf.Environment
			for _, value := range event.Exception {
				scrubbed.Exception = append(scrubbed.Exception, sentry.Exception{Type: value.Type, Value: "Application error"})
			}
			return scrubbed
		},
	})
	sentryEnabled = err == nil
	return err
}

func reportError(err error) {
	if sentryEnabled {
		sentry.CaptureException(err)
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(body []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return r.ResponseWriter.Write(body)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// observe records route-template metrics and turns panics into a scrubbed 500.
func (a *App) observe(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w}
		defer func() {
			if recovered := recover(); recovered != nil {
				a.Log.Error("panic while handling request", "route", r.Pattern)
				reportError(fmt.Errorf("panic: %T", recovered))
				if recorder.status == 0 {
					writeJSON(recorder, http.StatusInternalServerError,
						map[string]string{"detail": "Terjadi kesalahan pada server."})
				}
				recorder.status = http.StatusInternalServerError
			}
			route := "unmatched"
			if _, path, found := strings.Cut(r.Pattern, " "); found {
				route = path
			} else if r.Pattern != "" && r.Pattern != "/" {
				route = r.Pattern
			}
			if route == "/metrics" {
				return
			}
			if recorder.status == 0 {
				recorder.status = http.StatusOK
			}
			requests.WithLabelValues(r.Method, route, strconv.Itoa(recorder.status)).Inc()
			duration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
		}()
		next.ServeHTTP(recorder, r)
	})
}

func (a *App) metricsHandler() http.HandlerFunc {
	exposition := promhttp.HandlerFor(registry, promhttp.HandlerOpts{})
	return func(w http.ResponseWriter, r *http.Request) {
		token := a.Conf.MetricsToken
		if token == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Tidak ditemukan."})
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+token)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"detail": "Token pemantauan diperlukan."})
			return
		}
		exposition.ServeHTTP(w, r)
	}
}
