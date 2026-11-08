package main

import (
	"archive/tar"
	"context"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/gorilla/websocket"
)

type Config struct {
	Port      string
	Token     string
	StateDir  string
	PanelURL  string
}

type Agent struct {
	docker *client.Client
	config Config
	mu sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

type CreateRequest struct {
	Name string `json:"name"`
	Image string `json:"image"`
	Startup string `json:"startup"`
	WorkingDirectory string `json:"workingDirectory"`
	Environment map[string]string `json:"environment"`
	MemoryBytes int64 `json:"memoryBytes"`
	CpuPercent float64 `json:"cpuPercent"`
	DiskBytes int64 `json:"diskBytes"`
	PortBindings map[string]string `json:"portBindings"`
}

func envConfig() Config {
	return Config{
		Port: value("EGAGENT_PORT", "8443"),
		Token: value("EGAGENT_TOKEN", ""),
		StateDir: value("EGAGENT_STATE_DIR", "/var/lib/egagent"),
		PanelURL: value("EGPANEL_URL", ""),
	}
}

func value(key, fallback string) string {
	if result := os.Getenv(key); result != "" { return result }
	return fallback
}

func main() {
	config := envConfig()
	if config.Token == "" {
		log.Fatal("EGAGENT_TOKEN is required")
	}
	docker, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil { log.Fatal(err) }
	defer docker.Close()
	if err := os.MkdirAll(config.StateDir, 0750); err != nil { log.Fatal(err) }

	agent := &Agent{docker: docker, config: config, clients: make(map[*websocket.Conn]struct{})}
	go agent.runPanelConnection(context.Background())

	server := &http.Server{Addr: ":" + config.Port, ReadHeaderTimeout: 10 * time.Second}
	http.HandleFunc("/health", agent.health)
	http.HandleFunc("/api/v1/server/create", agent.authorize(agent.createServer))
	http.HandleFunc("/api/v1/server/start", agent.authorize(agent.startServer))
	http.HandleFunc("/api/v1/server/stop", agent.authorize(agent.stopServer))
	http.HandleFunc("/api/v1/server/kill", agent.authorize(agent.killServer))
	http.HandleFunc("/api/v1/server/restart", agent.authorize(agent.restartServer))
	http.HandleFunc("/api/v1/server/stats", agent.authorize(agent.serverStats))
	http.HandleFunc("/api/v1/server/files", agent.authorize(agent.files))
	http.HandleFunc("/api/v1/server/backup", agent.authorize(agent.backup))
	http.HandleFunc("/api/v1/ws", agent.websocket)

	go func() {
		signals := make(chan os.Signal, 1)
		signal.Notify(signals, os.Interrupt)
		<-signals
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()

	log.Printf("EGAgent listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func (a *Agent) authorize(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" || subtleTokenCompare(token, a.config.Token) == false {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func subtleTokenCompare(a, b string) bool {
	if len(a) != len(b) { return false }
	var result byte
	for i := range a { result |= a[i] ^ b[i] }
	return result == 0
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func safeServerName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || name != filepath.Base(name) || strings.ContainsAny(name, `/\`) || len(name) > 100 {
		return "", fmt.Errorf("invalid server name")
	}
	return "egpanel-" + strings.ToLower(strings.ReplaceAll(name, " ", "-")), nil
}

func (a *Agent) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "EGAgent"})
}

func (a *Agent) createServer(w http.ResponseWriter, r *http.Request) {
	var req CreateRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest); return
	}
	name, err := safeServerName(req.Name)
	if err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }
	root := filepath.Join(a.config.StateDir, name)
	if err := os.MkdirAll(root, 0750); err != nil { http.Error(w, err.Error(), 500); return }

	env := make([]string, 0, len(req.Environment))
	for key, value := range req.Environment {
		env = append(env, key+"="+value)
	}
	nanoCPUs := int64(req.CpuPercent / 100 * 1_000_000_000)
	config := &container.Config{
		Image: req.Image,
		Cmd: strings.Fields(req.Startup),
		WorkingDir: req.WorkingDirectory,
		Env: env,
		Tty: false,
		OpenStdin: true,
	}
	hostConfig := &container.HostConfig{
		NetworkMode: "egpanel",
		ReadonlyRootfs: true,
		Resources: container.Resources{
			Memory: req.MemoryBytes,
			NanoCPUs: nanoCPUs,
			PidsLimit: func(v int64) *int64 { return &v }(512),
		},
		Mounts: []mount.Mount{
			{Type: mount.TypeBind, Source: root, Target: req.WorkingDirectory, ReadOnly: false, BindOptions: &mount.BindOptions{CreateMountpoint: true}},
		},
		RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyDisabled},
	}
	result, err := a.docker.ContainerCreate(context.Background(), config, hostConfig, nil, nil, name)
	if err != nil { http.Error(w, err.Error(), http.StatusBadGateway); return }
	writeJSON(w, http.StatusCreated, map[string]any{"containerId": result.ID, "name": name})
}

func serverID(r *http.Request) (string, error) {
	id := r.URL.Query().Get("server")
	if id == "" { return "", fmt.Errorf("server is required") }
	return safeServerName(id)
}

func (a *Agent) startServer(w http.ResponseWriter, r *http.Request) {
	id, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	err = a.docker.ContainerStart(context.Background(), id, container.StartOptions{})
	writeAction(w, err)
}

func (a *Agent) stopServer(w http.ResponseWriter, r *http.Request) {
	id, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	timeout := 30
	err = a.docker.ContainerStop(context.Background(), id, container.StopOptions{Timeout: &timeout})
	writeAction(w, err)
}

func (a *Agent) killServer(w http.ResponseWriter, r *http.Request) {
	id, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	err = a.docker.ContainerKill(context.Background(), id, "SIGKILL")
	writeAction(w, err)
}

func (a *Agent) restartServer(w http.ResponseWriter, r *http.Request) {
	id, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	timeout := 30
	err = a.docker.ContainerRestart(context.Background(), id, container.StopOptions{Timeout: &timeout})
	writeAction(w, err)
}

func writeAction(w http.ResponseWriter, err error) {
	if err != nil { http.Error(w, err.Error(), http.StatusBadGateway); return }
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
}

func (a *Agent) serverStats(w http.ResponseWriter, r *http.Request) {
	id, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second); defer cancel()
	stats, err := a.docker.ContainerStatsOneShot(ctx, id)
	if err != nil { http.Error(w, err.Error(), http.StatusBadGateway); return }
	defer stats.Body.Close()
	body, err := io.ReadAll(io.LimitReader(stats.Body, 1<<20))
	if err != nil { http.Error(w, err.Error(), 500); return }
	writeJSON(w, http.StatusOK, json.RawMessage(body))
}

func (a *Agent) websocket(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool {
		return subtleTokenCompare(r.Header.Get("Authorization"), "Bearer "+a.config.Token)
	}}
	conn, err := upgrader.Upgrade(w, r, nil); if err != nil { return }
	a.mu.Lock(); a.clients[conn] = struct{}{}; a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.clients, conn); a.mu.Unlock(); conn.Close() }()
	for {
		_, message, err := conn.ReadMessage()
		if err != nil { return }
		if string(message) == `{"v":1,"type":"ping"}` {
			_ = conn.WriteJSON(map[string]any{"v": 1, "type": "pong", "payload": map[string]any{"time": time.Now().UnixMilli()}})
		}
	}
}

func (a *Agent) runPanelConnection(ctx context.Context) {
	if a.config.PanelURL == "" { return }
	url := strings.Replace(a.config.PanelURL, "http://", "ws://", 1)
	url = strings.Replace(url, "https://", "wss://", 1) + "/api/v1/agent/ws"
	for {
		select { case <-ctx.Done(): return; default: }
		conn, _, err := websocket.DefaultDialer.Dial(url, http.Header{"Authorization": {"Bearer " + a.config.Token}})
		if err != nil { time.Sleep(5*time.Second); continue }
		for {
			if _, _, err := conn.ReadMessage(); err != nil { conn.Close(); break }
		}
		time.Sleep(2*time.Second)
	}
}

func (a *Agent) files(w http.ResponseWriter, r *http.Request) {
	server, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	root := filepath.Join(a.config.StateDir, server)
	relative := filepath.Clean(strings.TrimPrefix(r.URL.Query().Get("path"), "/"))
	if relative == "." { relative = "" }
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		http.Error(w, "Invalid path", http.StatusBadRequest); return
	}
	target := filepath.Join(root, relative)
	switch r.Method {
	case http.MethodGet:
		if r.URL.Query().Get("content") == "true" {
			info, err := os.Stat(target); if err != nil || info.IsDir() { http.Error(w, "File not found", 404); return }
			if info.Size() > 10<<20 { http.Error(w, "File is too large", http.StatusRequestEntityTooLarge); return }
			http.ServeFile(w, r, target); return
		}
		entries, err := os.ReadDir(target); if err != nil { http.Error(w, "Directory not found", 404); return }
		result := make([]map[string]any, 0, len(entries))
		for _, entry := range entries {
			info, _ := entry.Info()
			result = append(result, map[string]any{"name": entry.Name(), "directory": entry.IsDir(), "size": info.Size(), "modified": info.ModTime()})
		}
		writeJSON(w, 200, result)
	case http.MethodPut:
		var body struct { Content string `json:"content"` }
		if err := json.NewDecoder(io.LimitReader(r.Body, 10<<20)).Decode(&body); err != nil { http.Error(w, "Invalid file", 400); return }
		if err := os.MkdirAll(filepath.Dir(target), 0750); err != nil { http.Error(w, err.Error(), 500); return }
		if err := os.WriteFile(target, []byte(body.Content), 0640); err != nil { http.Error(w, err.Error(), 500); return }
		writeJSON(w, 200, map[string]any{"saved": true})
	case http.MethodPost:
		if err := os.RemoveAll(target); err != nil { http.Error(w, err.Error(), 500); return }
		writeJSON(w, 200, map[string]any{"deleted": true})
	default: http.Error(w, "Method not allowed", 405)
	}
}

func (a *Agent) backup(w http.ResponseWriter, r *http.Request) {
	server, err := serverID(r); if err != nil { http.Error(w, err.Error(), 400); return }
	backupName := strconv.FormatInt(time.Now().Unix(), 10) + ".tar.gz"
	root := filepath.Join(a.config.StateDir, server)
	archive := filepath.Join(a.config.StateDir, "backups", server, backupName)
	if err := os.MkdirAll(filepath.Dir(archive), 0750); err != nil { http.Error(w, err.Error(), 500); return }
	commandContext := context.Background()
	_ = commandContext
	if err := writeTarGz(root, archive); err != nil { http.Error(w, err.Error(), 500); return }
	info, _ := os.Stat(archive)
	writeJSON(w, 201, map[string]any{"name": backupName, "path": archive, "size": info.Size()})
}

func writeTarGz(source, destination string) error {
	info, err := os.Stat(source)
	if err != nil { return err }
	out, err := os.Create(destination); if err != nil { return err }
	defer out.Close()
	gzipWriter := gzip.NewWriter(out)
	defer gzipWriter.Close()
	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()
	root := source
	if info.IsDir() {
		return filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil { return walkErr }
			header, err := tar.FileInfoHeader(info, "")
			if err != nil { return err }
			header.Name, err = filepath.Rel(root, path)
			if err != nil { return err }
			if header.Name == "." { header.Name = "" }
			if err := tarWriter.WriteHeader(header); err != nil { return err }
			if info.IsDir() || !info.Mode().IsRegular() { return nil }
			file, err := os.Open(path); if err != nil { return err }
			defer file.Close()
			_, err = io.Copy(tarWriter, file)
			return err
		})
	}
	return fmt.Errorf("backup source must be a directory")
}
