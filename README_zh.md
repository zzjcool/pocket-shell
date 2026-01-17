# Pocket Shell

移动端优化的 Web 终端，让你在手机浏览器上也能流畅使用命令行。

[English](./README.md)

<img width="603" height="1311" alt="Pocket Shell" src="https://github.com/user-attachments/assets/67bd176a-d5a4-4cd2-977d-89fc05dc8f2b" />


## 特性

- **移动端优化** - 专为触屏设计的交互体验
- **虚拟键盘** - 快捷访问 Ctrl、Alt、Tab、方向键等特殊按键
- **手势支持** - 长按方向键连续输入，滑动滚动历史
- **选择模式** - 触屏设备上轻松选择和复制文本
- **单文件部署** - 单个可执行文件，前端资源内嵌，无依赖
- **安全认证** - 密码认证 + JWT Token

## 快速开始

### 安装

```bash
# 使用 curl
curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh

# 使用 wget
wget -qO- https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh
```

### 运行

```bash
pocket-shell
```

首次运行会打印随机生成的密码：

```
Pocket Shell v0.0.11
Password: aB3dEf9x
Listening on http://0.0.0.0:8080
```

在手机浏览器打开地址，使用用户名 `admin` 和生成的密码登录。

### 使用示例

```bash
pocket-shell                     # 启动，使用随机密码
pocket-shell -p 3000             # 使用 3000 端口
pocket-shell -P mypass           # 设置密码
pocket-shell -u john -P secret   # 自定义用户名和密码
pocket-shell -s /bin/zsh         # 使用 zsh
nohup pocket-shell &             # 后台运行
nohup pocket-shell > ps.log 2>&1 &  # 后台运行并保存日志
```

## 命令行参数

| 短参数 | 长参数 | 默认值 | 描述 |
|--------|--------|--------|------|
| `-p` | `--port` | `8080` | 服务端口 |
| `-h` | `--host` | `0.0.0.0` | 监听地址 |
| `-u` | `--user` | `admin` | 登录用户名 |
| `-P` | `--pass` | 随机生成 | 登录密码 |
| `-s` | `--shell` | 系统默认 | 使用的 Shell |
| `-v` | `--version` | - | 显示版本 |
| | `--help` | - | 显示帮助 |

注意：
- 未指定 `--shell` 时，会按顺序自动检测：`SHELL` 环境变量、`/etc/passwd` 中的登录 Shell、常见路径（`zsh`/`bash`/`sh`），最后通过 PATH 查找。
- 新会话默认工作目录为用户的 home 目录。

## 移动端虚拟键盘

浮动虚拟键盘提供快捷访问特殊按键：

### 修饰键

| 按钮 | 功能 |
|------|------|
| `Ctrl` | 切换 Ctrl 修饰键（点击激活，再次点击释放） |
| `Alt` | 切换 Alt 修饰键 |
| `Tab` | 发送 Tab 键 |
| `Esc` | 发送 Escape 键 |

### 方向键长按手势

方向键支持特殊的长按手势，可以连续导航：

1. **长按**任意方向键进入手势模式
2. 手指位置会出现圆形指示器
3. **滑动**任意方向可连续发送方向键
4. 滑动距离越远，重复速度越快
5. **松开**退出手势模式

适用场景：
- 浏览命令历史（上/下）
- 在文本编辑器中移动光标（vim、nano）
- 滚动查看长输出

## 更新

```bash
# 检查更新
curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh -s -- --check

# 更新到最新版本
curl -fsSL https://raw.githubusercontent.com/zzjcool/pocket-shell/main/install.sh | sh -s -- --update
```

## 从源码构建

环境要求：Go 1.21+, Node.js 18+

```bash
git clone https://github.com/zzjcool/pocket-shell.git
cd pocket-shell
make build
./pocket-shell
```

## 安全提示

- 生产环境请务必使用强密码
- 公网访问建议配置反向代理并启用 HTTPS（nginx、caddy 等）
- 默认用户执行命令的权限与 pocket-shell 进程相同

## 许可证

MIT
