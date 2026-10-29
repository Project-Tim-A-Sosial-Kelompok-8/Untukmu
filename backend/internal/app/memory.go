package app

import (
	"strconv"
	"sync"
	"time"
)

// Memory replaces Redis for a single API process: short-lived caches, one-time
// challenges, sliding-window rate limits and the moderation wake-up signal.
// Its contents are intentionally lost on restart.
type Memory struct {
	mu      sync.Mutex
	items   map[string]memoryItem
	windows map[string][]time.Time
	notify  chan struct{}
}

type memoryItem struct {
	value   string
	expires time.Time
}

func NewMemory() *Memory {
	return &Memory{items: map[string]memoryItem{}, windows: map[string][]time.Time{}, notify: make(chan struct{}, 1)}
}

func (m *Memory) Get(key string) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	item, ok := m.items[key]
	if !ok || (!item.expires.IsZero() && time.Now().After(item.expires)) {
		delete(m.items, key)
		return "", false
	}
	return item.value, true
}

// Set stores a value; a zero ttl keeps it until deletion or restart.
func (m *Memory) Set(key, value string, ttl time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	item := memoryItem{value: value}
	if ttl > 0 {
		item.expires = time.Now().Add(ttl)
	}
	m.items[key] = item
}

func (m *Memory) Delete(keys ...string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, key := range keys {
		delete(m.items, key)
	}
}

func (m *Memory) Incr(key string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	current, _ := strconv.ParseInt(m.items[key].value, 10, 64)
	current++
	m.items[key] = memoryItem{value: strconv.FormatInt(current, 10)}
	return current
}

// Allow records one attempt unless limit attempts already happened inside window.
func (m *Memory) Allow(key string, limit int, window time.Duration) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	instant := time.Now()
	attempts := m.windows[key]
	kept := attempts[:0]
	for _, attempt := range attempts {
		if instant.Sub(attempt) < window {
			kept = append(kept, attempt)
		}
	}
	if len(kept) >= limit {
		m.windows[key] = kept
		return false
	}
	m.windows[key] = append(kept, instant)
	return true
}

// Notify wakes the background worker without blocking the caller.
func (m *Memory) Notify() {
	select {
	case m.notify <- struct{}{}:
	default:
	}
}

func (m *Memory) sweep(window time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	instant := time.Now()
	for key, item := range m.items {
		if !item.expires.IsZero() && instant.After(item.expires) {
			delete(m.items, key)
		}
	}
	for key, attempts := range m.windows {
		if len(attempts) == 0 || instant.Sub(attempts[len(attempts)-1]) >= window {
			delete(m.windows, key)
		}
	}
}
