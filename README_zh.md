# Pocket Shell

移动端优化的 Web 终端，让你在手机浏览器上也能流畅使用命令行。

[English](./README.md)

## 特性

- **移动端优化** - 专为触屏设计的交互体验
- **TUI 风格界面** - 简洁的终端美学
- **虚拟键盘** - 快捷访问特殊按键和常用命令
- **手势支持** - 滑动滚动，双指缩放
- **多会话管理** - 多终端会话，标签页切换
- **主题系统** - 兼容 Base16 主题，与终端配色同步
- **可扩展认证** - 插件式认证架构
- **单文件部署** - 编译为单个二进制文件，前端资源内嵌

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Go 1.21+ |
| WebSocket | nhooyr/websocket |
| PTY | creack/pty |
| 前端语言 | TypeScript |
| 终端 | xterm.js |
| 构建 | esbuild |
| 资源内嵌 | go:embed |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                      移动端浏览器                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [1:bash●] [2:vim] [3:htop]              [+] [@]  │  │
│  ├───────────────────────────────────────────────────┤  │
│  │                                                   │  │
│  │                   xterm.js                        │  │
│  │                 终端显示区域                       │  │
│  │                                                   │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  [⇥] [Ctrl] [Alt] [Esc] [↑] [↓] [←] [→] [⋮]     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ WebSocket + JWT
                           ▼
┌─────────────────────────────────────────────────────────┐
│                        Go 后端                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                   认证中间件                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐    │   │
│  │  │  Password  │ │   LDAP     │ │   OAuth    │    │   │
│  │  │  Provider  │ │  Provider  │ │  Provider  │    │   │
│  │  └────────────┘ └────────────┘ └────────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │                   会话管理器                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │   │
│  │  │ Session1 │ │ Session2 │ │ Session3 │  ...    │   │
│  │  │   PTY    │ │   PTY    │ │   PTY    │         │   │
│  │  └──────────┘ └──────────┘ └──────────┘         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              静态资源 (embed)                     │   │
│  │     TypeScript -> esbuild -> 内嵌二进制           │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
pocket-shell/
├── cmd/
│   └── server/
│       └── main.go              # 入口
├── internal/
│   ├── auth/
│   │   ├── auth.go              # 认证接口
│   │   ├── password.go          # 用户名密码认证
│   │   └── jwt.go               # JWT Token 管理
│   ├── handler/
│   │   ├── handler.go           # HTTP 路由
│   │   ├── auth.go              # 登录接口
│   │   └── ws.go                # WebSocket 处理
│   ├── terminal/
│   │   └── pty.go               # PTY 管理
│   └── session/
│       ├── session.go           # 单个会话
│       └── manager.go           # 会话管理器
├── web/
│   ├── src/                     # TypeScript 源码
│   │   ├── main.ts              # 入口
│   │   ├── terminal.ts          # xterm.js 封装
│   │   ├── session.ts           # 会话管理
│   │   ├── keyboard.ts          # 虚拟键盘
│   │   ├── api.ts               # HTTP/WebSocket 客户端
│   │   ├── types.ts             # 类型定义
│   │   └── theme/
│   │       ├── types.ts         # 主题接口
│   │       ├── manager.ts       # 主题切换
│   │       └── builtin/         # 内置主题
│   │           ├── dracula.ts
│   │           ├── nord.ts
│   │           ├── gruvbox.ts
│   │           └── index.ts
│   ├── static/
│   │   └── index.html
│   ├── dist/                    # 构建产物 (gitignore)
│   ├── package.json
│   ├── tsconfig.json
│   └── embed.go                 # 嵌入 dist + static
├── Makefile
├── go.mod
└── README.md
```

## 核心设计

### 1. 认证架构

可扩展的认证接口：

```go
// Provider 定义认证提供者接口
type Provider interface {
    // Name 返回提供者名称
    Name() string
    
    // Authenticate 验证用户凭据
    Authenticate(ctx context.Context, credentials map[string]string) (*User, error)
}

// User 用户信息
type User struct {
    ID       string
    Username string
    Roles    []string
}

// 默认：用户名密码
// 未来：LDAP, OAuth, OIDC
```

### 2. 多会话管理

```go
// Session 单个终端会话
type Session struct {
    ID         string
    UserID     string
    PTY        *os.File
    CreatedAt  time.Time
    LastActive time.Time
}

// Manager 会话管理器
type Manager struct {
    sessions     map[string]*Session
    userSessions map[string][]string
    maxPerUser   int
}

func (m *Manager) Create(userID string) (*Session, error)
func (m *Manager) Get(sessionID string) (*Session, error)
func (m *Manager) List(userID string) ([]*Session, error)
func (m *Manager) Close(sessionID string) error
```

### 3. 主题系统

兼容 Base16 的主题系统，同时应用于 xterm.js 和 UI：

```typescript
// 主题定义（兼容 Base16）
interface Theme {
  name: string;
  colors: {
    base00: string;  // 背景
    base01: string;  // 浅背景
    base02: string;  // 选中
    base03: string;  // 注释
    base04: string;  // 深前景
    base05: string;  // 前景
    base06: string;  // 浅前景
    base07: string;  // 最浅前景
    base08: string;  // 红
    base09: string;  // 橙
    base0A: string;  // 黄
    base0B: string;  // 绿
    base0C: string;  // 青
    base0D: string;  // 蓝
    base0E: string;  // 紫
    base0F: string;  // 棕
  };
}

// 应用到 xterm.js
function applyTerminalTheme(term: Terminal, theme: Theme) {
  term.options.theme = {
    background: theme.colors.base00,
    foreground: theme.colors.base05,
    cursor: theme.colors.base05,
    selectionBackground: theme.colors.base02,
    black: theme.colors.base00,
    red: theme.colors.base08,
    green: theme.colors.base0B,
    yellow: theme.colors.base0A,
    blue: theme.colors.base0D,
    magenta: theme.colors.base0E,
    cyan: theme.colors.base0C,
    white: theme.colors.base05,
    // bright colors...
  };
}

// 通过 CSS 变量应用到 UI
function applyUITheme(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.colors.base00);
  root.style.setProperty('--color-bg-light', theme.colors.base01);
  root.style.setProperty('--color-fg', theme.colors.base05);
  root.style.setProperty('--color-border', theme.colors.base03);
  root.style.setProperty('--color-accent', theme.colors.base0D);
  root.style.setProperty('--color-error', theme.colors.base08);
  root.style.setProperty('--color-success', theme.colors.base0B);
}
```

内置主题：
- Dracula
- Nord
- Gruvbox Dark
- Solarized Dark
- Tokyo Night
- One Dark

## UI 设计

简洁的移动端优化界面：

### 登录页

```
┌─────────────────────────────────────┐
│                                     │
│          POCKET SHELL               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Username                      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Password                      │  │
│  └───────────────────────────────┘  │
│                                     │
│          [ Login ]                  │
│                                     │
└─────────────────────────────────────┘
```

### 主界面

```
┌─────────────────────────────────────┐
│ [1:bash●] [2:vim] [3]    [⚙] [+]   │  <- 标签栏
├─────────────────────────────────────┤
│ user@host:~$ ls -la                 │
│ total 24                            │
│ drwxr-xr-x  5 user user 4096 .     │
│ drwxr-xr-x 12 user user 4096 ..    │
│ -rw-r--r--  1 user user  220 ...   │
│ user@host:~$ _                      │  <- xterm.js
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [⇥] [^] [⌥] [↑] [↓] [←] [→] [⋮]   │  <- 虚拟按键
└─────────────────────────────────────┘
```

### 快捷菜单（点击 ⋮）

```
┌─────────────────────────────────────┐
│ 常用命令                            │
│ [ls -la] [cd ..] [pwd] [clear]     │
│ [git status] [docker ps] [top]     │
├─────────────────────────────────────┤
│ 组合键                              │
│ [Ctrl+C] [Ctrl+D] [Ctrl+Z]         │
│ [Ctrl+L] [Ctrl+A] [Ctrl+E]         │
├─────────────────────────────────────┤
│ 历史命令                            │
│ > npm run build                     │
│ > git commit -m "fix"               │
└─────────────────────────────────────┘
```

### 设置（点击 ⚙）

```
┌─────────────────────────────────────┐
│ 设置                         [×]    │
├─────────────────────────────────────┤
│ 主题                                │
│ ┌─────────────────────────────────┐ │
│ │ ● Dracula                       │ │
│ │ ○ Nord                          │ │
│ │ ○ Gruvbox Dark                  │ │
│ │ ○ Tokyo Night                   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ 字体大小                            │
│ [−]  14px  [+]                      │
├─────────────────────────────────────┤
│ 会话管理                            │
│ #1 bash     10:00  ● 活跃    [×]   │
│ #2 vim      10:05  ○ 空闲    [×]   │
│ #3 htop     10:10  ○ 空闲    [×]   │
└─────────────────────────────────────┘
```

### 手势操作

| 手势 | 操作 |
|------|------|
| 上下滑动 | 滚动历史 |
| 双指捏合 | 缩放字体 |
| 长按 | 复制选中内容 |
| 双击 | 粘贴 |
| 左滑标签 | 关闭会话 |

## API 接口

### HTTP 端点

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/` | 主页面 | ✓ |
| GET | `/login` | 登录页面 | ✗ |
| POST | `/api/login` | 用户登录 | ✗ |
| POST | `/api/logout` | 用户登出 | ✓ |
| GET | `/api/sessions` | 会话列表 | ✓ |
| POST | `/api/sessions` | 创建会话 | ✓ |
| DELETE | `/api/sessions/:id` | 关闭会话 | ✓ |
| GET | `/api/settings` | 获取设置 | ✓ |
| PUT | `/api/settings` | 更新设置 | ✓ |
| GET | `/ws/:sessionId` | WebSocket 连接 | ✓ |
| GET | `/health` | 健康检查 | ✗ |

### WebSocket 消息

```typescript
// 客户端 -> 服务端
type ClientMessage = 
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number };

// 服务端 -> 客户端
type ServerMessage = 
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number };
```

## 构建

### 前置条件

- Go 1.21+
- Node.js 18+
- Make

### 构建单文件

```bash
# 安装前端依赖
cd web && npm install && cd ..

# 构建
make build

# 输出
ls -lh pocket-shell
# -rwxr-xr-x 1 user user 15M Jan 14 10:00 pocket-shell
```

### 开发

```bash
# 终端 1：前端开发服务器（热重载）
cd web && npm run dev

# 终端 2：后端（使用 air 热重载）
air

# 或者同时启动
make dev
```

### Makefile

```makefile
.PHONY: build dev clean

build: build-frontend build-backend

build-frontend:
	cd web && npm run build

build-backend:
	go build -o pocket-shell ./cmd/server

dev:
	@echo "Starting development servers..."
	cd web && npm run dev &
	air

clean:
	rm -rf pocket-shell web/dist
```

## 配置

### 命令行参数

```bash
./pocket-shell \
  -port 8080 \
  -host 0.0.0.0 \
  -user admin \
  -password secret \
  -shell /bin/bash \
  -max-sessions 5 \
  -session-timeout 30m
```

| 参数 | 默认值 | 描述 |
|------|--------|------|
| `-port` | `8080` | 服务端口 |
| `-host` | `0.0.0.0` | 监听地址 |
| `-user` | `admin` | 默认用户名 |
| `-password` | 随机生成 | 默认密码（启动时打印） |
| `-shell` | `/bin/bash` | 默认 Shell |
| `-max-sessions` | `5` | 每用户最大会话数 |
| `-session-timeout` | `30m` | 会话空闲超时 |
| `-config` | - | 配置文件路径 |

### 配置文件

```yaml
server:
  host: 0.0.0.0
  port: 8080

auth:
  provider: password
  password:
    users:
      - username: admin
        password: $2a$10$...  # bcrypt hash

session:
  max_per_user: 5
  idle_timeout: 30m
  shell: /bin/bash

terminal:
  term: xterm-256color

theme:
  default: dracula
```

## 安全

- [x] 用户名密码认证
- [x] JWT Token 鉴权
- [x] 会话隔离
- [ ] HTTPS（建议使用反向代理）
- [ ] 速率限制
- [ ] 审计日志

## 开发计划

### v0.1 - MVP
- [ ] 基础终端
- [ ] 密码认证
- [ ] 单会话
- [ ] 虚拟键盘

### v0.2 - 多会话
- [ ] 会话管理
- [ ] 会话标签页
- [ ] 断线重连

### v0.3 - 主题与设置
- [ ] 主题系统
- [ ] 用户偏好
- [ ] 字体大小调节

### v0.4 - 认证扩展
- [ ] LDAP 支持
- [ ] OAuth 支持

## 许可证

MIT
