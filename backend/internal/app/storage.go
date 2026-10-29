package app

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Storage keeps already-encrypted uploads and curated audio on the local disk.
// Browsers reach it only through short-lived URLs signed by this API, the same
// contract the frontend previously used with S3 presigned POST/GET.
type Storage struct {
	root string
	key  []byte
}

type objectInfo struct {
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

var storageKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$`)

func NewStorage(root, secret string) (*Storage, error) {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("untukmu:local-storage:v1"))
	return &Storage{root: root, key: mac.Sum(nil)}, nil
}

func (s *Storage) path(key string) (string, error) {
	if !storageKeyPattern.MatchString(key) {
		return "", errors.New("kunci objek tidak valid")
	}
	for _, part := range strings.Split(key, "/") {
		if part == "." || part == ".." {
			return "", errors.New("kunci objek tidak valid")
		}
	}
	return filepath.Join(s.root, filepath.FromSlash(key)), nil
}

func (s *Storage) sign(parts ...string) string {
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(strings.Join(parts, "\n")))
	return hex.EncodeToString(mac.Sum(nil))
}

// PresignPost returns the upload form, mirroring S3's {url, fields} shape.
func (s *Storage) PresignPost(key, contentType string, size int64, lifetime time.Duration) map[string]any {
	expires := strconv.FormatInt(time.Now().Add(lifetime).Unix(), 10)
	sizeText := strconv.FormatInt(size, 10)
	return map[string]any{
		"url": "/api/v1/storage/upload",
		"fields": map[string]string{
			"key":          key,
			"Content-Type": contentType,
			"size":         sizeText,
			"expires":      expires,
			"signature":    s.sign("put", key, contentType, sizeText, expires),
		},
	}
}

func (s *Storage) PresignGet(key string, lifetime time.Duration) string {
	expires := strconv.FormatInt(time.Now().Add(lifetime).Unix(), 10)
	query := url.Values{"key": {key}, "expires": {expires}, "signature": {s.sign("get", key, expires)}}
	return "/api/v1/storage/object?" + query.Encode()
}

func (s *Storage) Head(key string) (*objectInfo, error) {
	path, err := s.path(key)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(path + ".meta")
	if err != nil {
		return nil, err
	}
	var info objectInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, err
	}
	stat, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	info.Size = stat.Size()
	return &info, nil
}

func (s *Storage) Delete(key string) error {
	path, err := s.path(key)
	if err != nil {
		return nil
	}
	for _, name := range []string{path, path + ".meta"} {
		if err := os.Remove(name); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func expired(value string) bool {
	unix, err := strconv.ParseInt(value, 10, 64)
	return err != nil || time.Now().Unix() > unix
}

func storageError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"detail": message})
}

// HandleUpload accepts the multipart form produced from PresignPost.
func (s *Storage) HandleUpload(w http.ResponseWriter, r *http.Request) {
	mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" {
		storageError(w, http.StatusBadRequest, "Formulir unggahan tidak valid.")
		return
	}
	reader := multipart.NewReader(r.Body, params["boundary"])
	fields := map[string]string{}
	for {
		part, err := reader.NextPart()
		if err != nil {
			storageError(w, http.StatusBadRequest, "Berkas unggahan tidak ditemukan.")
			return
		}
		name := part.FormName()
		if name != "file" {
			value, _ := io.ReadAll(io.LimitReader(part, 4096))
			fields[name] = string(value)
			part.Close()
			continue
		}
		key, contentType, sizeText := fields["key"], fields["Content-Type"], fields["size"]
		signature := s.sign("put", key, contentType, sizeText, fields["expires"])
		if !hmac.Equal([]byte(signature), []byte(fields["signature"])) {
			storageError(w, http.StatusForbidden, "Tanda tangan unggahan tidak valid.")
			return
		}
		if expired(fields["expires"]) {
			storageError(w, http.StatusForbidden, "Izin unggahan telah kedaluwarsa.")
			return
		}
		size, _ := strconv.ParseInt(sizeText, 10, 64)
		if err := s.write(key, contentType, size, part); err != nil {
			storageError(w, http.StatusBadRequest, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
}

func (s *Storage) write(key, contentType string, size int64, body io.Reader) error {
	path, err := s.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(temporary.Name())
	written, err := io.Copy(temporary, io.LimitReader(body, size+1))
	closeErr := temporary.Close()
	if err != nil || closeErr != nil {
		return errors.New("Unggahan terputus.")
	}
	if written != size {
		return fmt.Errorf("Ukuran unggahan tidak sesuai izin.")
	}
	meta, _ := json.Marshal(objectInfo{ContentType: contentType, Size: size})
	if err := os.WriteFile(path+".meta", meta, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary.Name(), path)
}

func (s *Storage) HandleDownload(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	key, expires := query.Get("key"), query.Get("expires")
	if !hmac.Equal([]byte(s.sign("get", key, expires)), []byte(query.Get("signature"))) || expired(expires) {
		storageError(w, http.StatusForbidden, "Tautan berkas tidak berlaku.")
		return
	}
	info, err := s.Head(key)
	if err != nil {
		storageError(w, http.StatusNotFound, "Berkas tidak ditemukan.")
		return
	}
	path, _ := s.path(key)
	file, err := os.Open(path)
	if err != nil {
		storageError(w, http.StatusNotFound, "Berkas tidak ditemukan.")
		return
	}
	defer file.Close()
	stat, _ := file.Stat()
	w.Header().Set("Content-Type", info.ContentType)
	w.Header().Set("Content-Disposition", "attachment")
	http.ServeContent(w, r, "", stat.ModTime(), file)
}
