# Polyarbooor — VPS 部署指南

> 目标环境：Ubuntu 22.04 / Debian 12，Node.js v20.20.2，TypeScript 项目

---

## 目录

1. [服务器初始配置](#1-服务器初始配置)
2. [安装 Node.js v20](#2-安装-nodejs-v20)
3. [拉取代码并配置环境变量](#3-拉取代码并配置环境变量)
4. [安装依赖并编译](#4-安装依赖并编译)
5. [使用 pm2 管理进程](#5-使用-pm2-管理进程)
6. [日志管理](#6-日志管理)
7. [更新代码](#7-更新代码)
8. [故障排查](#8-故障排查)

---

## 1. 服务器初始配置

```bash
# 更新系统软件包
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl git wget build-essential
```

---

## 2. 安装 Node.js v20

### 方式一：使用 NodeSource（推荐）

```bash
# 添加 NodeSource 源（v20.x）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node.js
sudo apt install -y nodejs

# 验证版本
node --version   # 应显示 v20.x.x
npm --version    # 应显示 10.x
```

### 方式二：使用 nvm（如果需要多版本管理）

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc

# 安装 Node.js v20
nvm install 20
nvm alias default 20
nvm use 20

# 验证版本
node --version
```

---

## 3. 拉取代码并配置环境变量

```bash
# 创建项目目录
mkdir -p ~/apps && cd ~/apps

# 克隆仓库
git clone https://github.com/RohanKishibeCN/Polyarbooor.git

# 进入项目目录
cd Polyarbooor

# 复制环境变量模板
cp .env.example .env
```

### 3.1 填写环境变量

编辑 `.env` 文件：

```bash
nano .env
```

**最小必要配置（必填）：**

```bash
# ================================================================
#  Polyarbooor — 最小启动配置
# ================================================================

# 私钥（以太坊钱包私钥，0x 开头）
POLYMARKET_PRIVATE_KEY=0x_your_private_key_here

# 资金方地址（钱包地址，0x 开头）
POLYMARKET_FUNDER=0x_your_wallet_address

# 第一次务必开启 dry_run 模式测试
DRY_RUN=true
```

> ⚠️ **安全提醒**：请使用一个**单独**的 Polymarket 钱包，不要将主钱包的私钥放在 VPS 上。

**可选配置（根据需求调整）：**

```bash
# 策略参数
ORDER_SIZE=50                    # 每次交易股数
TARGET_PAIR_COST=0.99            # 套利触发阈值
MIN_NET_PROFIT=0.10              # 最小净利润（扣除 gas 后）

# 风控参数
MAX_TRADES_PER_MARKET=3          # 每市场最大交易次数
MIN_TIME_REMAINING_MINUTES=1     # 市场最小剩余时间
MAX_DAILY_LOSS=50                # 单日最大亏损上限

# Notion 集成（可选，推送到你创建的数据库）
NOTION_ENABLED=false
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

### 3.2 删除原 Python 源文件（可选）

仓库中不包含 Python 源码，无需此项操作。

---

## 4. 安装依赖并编译

```bash
cd ~/apps/Polyarbooor

# 安装项目依赖
npm install

# TypeScript 编译检查（确认无类型错误）
npx tsc --noEmit

# 预编译（可选，tsx 运行可跳过此步）
npm run build
```

> 项目使用 `tsx` 直接运行 `.ts` 文件，不需要每次都预编译。`npm start` 会自动处理。

---

## 5. 使用 pm2 管理进程

### 5.1 安装 pm2

```bash
# 全局安装 pm2
npm install -g pm2
```

### 5.2 创建 pm2 配置文件

在项目目录下创建 `ecosystem.config.cjs`：

```bash
nano ecosystem.config.cjs
```

内容如下：

```javascript
module.exports = {
  apps: [{
    name: 'polyarbooor',
    script: 'src/index.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    cwd: '/home/你的用户名/apps/Polyarbooor',
    env: {
      NODE_ENV: 'production',
    },
    // 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    // 自动重启
    max_restarts: 10,
    restart_delay: 10000,
    // 内存限制（超过 200MB 自动重启）
    max_memory_restart: '200M',
  }]
};
```

> 将 `/home/你的用户名/apps/Polyarbooor` 替换为你的实际路径。

### 5.3 创建日志目录

```bash
mkdir -p logs
```

### 5.4 启动机器人

```bash
# 首次启动
pm2 start ecosystem.config.cjs

# 查看运行状态
pm2 status

# 查看实时日志
pm2 logs polyarbooor

# 查看最近 100 行日志
pm2 logs polyarbooor --lines 100
```

### 5.5 pm2 常用命令速查

```bash
# 状态查看
pm2 status                    # 查看所有进程状态
pm2 show polyarbooor          # 查看进程详细信息
pm2 monit                     # 实时监控面板（CPU/内存）

# 启停控制
pm2 stop polyarbooor          # 停止
pm2 restart polyarbooor       # 重启
pm2 delete polyarbooor        # 删除进程

# 日志
pm2 logs polyarbooor          # 实时日志
pm2 logs polyarbooor --lines 200  # 最近 200 行
pm2 flush                     # 清空所有日志

# 保存进程列表（开机自启）
pm2 save
pm2 startup                   # 设置开机自启
```

### 5.6 设置开机自启

```bash
# pm2 会输出一条命令，复制执行即可
pm2 startup
pm2 save
```

测试开机自启：

```bash
sudo reboot
# 等待 VPS 重启后 SSH 连接
pm2 status
# polyarbooor 应显示为 online
```

---

## 6. 日志管理

### 6.1 日志文件位置

```
~/apps/Polyarbooor/
├── logs/
│   ├── out.log      # 标准输出（console.log）
│   └── error.log    # 错误输出
└── ~/.pm2/logs/
    ├── polyarbooor-out.log
    └── polyarbooor-error.log
```

### 6.2 日志轮转（防止磁盘占满）

```bash
# 安装 pm2-logrotate
pm2 install pm2-logrotate

# 配置日志轮转（保留 7 天，每天切割）
pm2 set pm2-logrotate:max_size 50M     # 单文件上限
pm2 set pm2-logrotate:retain 7          # 保留天数
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # 每天 00:00 切割
```

### 6.3 关键日志字段解读

```
[INFO] 🚀 BTC 15分钟套利机器人已启动
[INFO] 市场: btc-updown-15m-1782453600
[INFO] 模式: 🔸 模拟                     ← 确认 DRY_RUN=true
[INFO] 成本阈值: $0.99
[INFO] 订单数量: 50 股

[INFO] [Scan #1] 14:00:23
[INFO] 无套利机会: ... 总成本 $1.01      ← 正常，说明在监控中
[INFO] 发现的机会: 0/1

[INFO] 🚨 市场已关闭！                  ← 15分钟后自动切换
[INFO] ✅ 找到新市场: btc-updown-15m-...
```

---

## 7. 更新代码

```bash
cd ~/apps/Polyarbooor

# 拉取最新代码
git pull origin main

# 安装新依赖（如有）
npm install

# 重启机器人
pm2 restart polyarbooor
```

> 更新后建议先观察 5 分钟日志确认运行正常。

---

## 8. 故障排查

### 8.1 机器人无法启动

```bash
# 检查 Node 版本
node --version   # 必须是 v20.x

# 查看详细错误日志
pm2 logs polyarbooor --lines 50

# 直接运行看错误输出
npx tsx src/index.ts
```

### 8.2 私钥相关错误

```
❌ 错误: .env 中未配置 POLYMARKET_PRIVATE_KEY
```
→ 检查 `.env` 文件是否存在，`POLYMARKET_PRIVATE_KEY` 是否已填写。

### 8.3 市场未找到

```
搜索 BTC 15分钟市场时出错: ...
```
→ 检查 VPS 能否访问 `polymarket.com`（可能需要配置代理或 DNS）。

### 8.4 订单无法成交

```
⚠️ 持仓不平衡
```
→ 说明一边成交了另一边没成交。在 DRY_RUN=false 时，需人工检查 Polymarket 上的挂单。

### 8.5 Notion 推送失败

```
❌ 推送 Notion 失败: ...
```
→ 检查 `NOTION_API_KEY` 和 `NOTION_DATABASE_ID` 配置是否正确。

---

## 附：推荐 VPS 配置

| 规格 | 说明 |
|------|------|
| **CPU** | 1 核（足够） |
| **内存** | 512MB–1GB（Node.js + pm2 约 50–80MB） |
| **硬盘** | 10GB（日志轮转后占用可忽略） |
| **带宽** | 不限（仅 HTTP/WebSocket 请求，流量极小） |
| **系统** | Ubuntu 22.04 LTS 或 Debian 12 |

**推荐服务商：** DigitalOcean / Vultr / 阿里云轻量 / AWS Lightsail（$5/月档位足够）

---

## 启动后检查清单

- [ ] `pm2 status` → polyarbooor 显示 `online`
- [ ] `pm2 logs polyarbooor --lines 20` → 看到"机器人已启动"日志
- [ ] `.env` 中 `DRY_RUN=true`（先用模拟模式跑 1–2 周验证）
- [ ] 确认 VPS 时区与目标市场一致：`timedatectl set-timezone Asia/Shanghai`
- [ ] （可选）配置好 Notion → 第二天确认有推送
