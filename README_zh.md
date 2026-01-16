# Pocket Shell

移动端优化的 Web 终端，让你在手机浏览器上也能流畅使用命令行。

[English](./README.md)

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
Pocket Shell v0.0.10
Password: aB3dEf9x
Listening on http://0.0.0.0:8080
```

在手机浏览器打开地址，使用用户名 `admin` 和生成的密码登录。

### 自定义设置

```bash
# 自定义端口和密码
pocket-shell -port 3000 -password mypassword

# 自定义用户名
pocket-shell -user john -password secret

# 指定 shell
pocket-shell -shell /bin/zsh

# 查看帮助
pocket-shell -help
```

## 命令行参数

| 参数 | 默认值 | 描述 |
|------|--------|------|
| `-port` | `8080` | 服务端口 |
| `-host` | `0.0.0.0` | 监听地址 |
| `-user` | `admin` | 登录用户名 |
| `-password` | 随机生成 | 登录密码 |
| `-shell` | 系统默认 | 使用的 Shell (bash/zsh/sh) |
| `-version` | - | 显示版本 |
| `-help` | - | 显示帮助 |

## 移动端键盘快捷键

虚拟键盘提供快捷访问特殊按键：

| 按钮 | 功能 |
|------|------|
| `Ctrl` | 切换 Ctrl 修饰键（点击激活，再次点击取消） |
| `Alt` | 切换 Alt 修饰键 |
| `Tab` | 发送 Tab 键 |
| `Esc` | 发送 Escape 键 |
| `↑` `↓` `←` `→` | 方向键（长按可连续输入） |

### 快捷键栏

左右滑动可访问更多快捷键：

- `Ctrl+C` - 中断当前进程
- `Ctrl+D` - 发送 EOF / 退出
- `Ctrl+Z` - 挂起进程
- `Ctrl+L` - 清屏
- `Ctrl+A` - 光标移到行首
- `Ctrl+E` - 光标移到行尾
- `Ctrl+U` - 清除光标前的内容
- `Ctrl+K` - 清除光标后的内容
- `Ctrl+R` - 搜索历史命令
- `Ctrl+W` - 删除光标前的单词

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
