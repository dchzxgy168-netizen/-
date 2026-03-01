# 灰域封锁（简易 pygame 搜打撤原型）

一个可直接运行的 Python `pygame` 小游戏原型，演示“搜打撤”核心循环：
- **搜**：在地图中捡取高价值物资
- **打**：击退持续刷新的敌人
- **撤**：在倒计时结束前，带着足够价值物资进入撤离区

## 运行方式

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## 玩法说明
- `WASD`：移动
- 鼠标左键：射击
- `R`：结算后重开
- `ESC`：退出

## 胜负规则
- **胜利**：进入撤离区，且物资价值达到目标（默认 1000）
- **失败**：角色生命归零，或倒计时结束前未成功撤离

## 文件结构
- `main.py`：完整游戏逻辑（渲染、输入、AI、射击、拾取、撤离、结算）
- `requirements.txt`：运行依赖


## 附加记录
- `dream_20250301.md`：一条与 AI 数字员工相关的梦境记录与简要解析。


## 每日客户沟通消息提醒（新增）
如果你需要“每天提醒我跟客户交流，并且能实时更新、方便修改”，可以使用 `client_reminder.py`。

### 快速开始
```bash
python client_reminder.py init --force
python client_reminder.py list
python client_reminder.py preview 1
python client_reminder.py smart --text "/每天早上9点提醒我联系客户张三同步进展" --save
python client_reminder.py sync-db
python client_reminder.py report --sync
python client_reminder.py run --interval 10
```

默认会创建一条“每日客户沟通”提醒，并在设定时间输出消息提醒。

### 常用命令
```bash
# 新增提醒
python client_reminder.py add --title "客户跟进" --message "给客户发今日进展" --time 10:00

# 修改提醒（示例：修改 id=1 的时间和文案）
python client_reminder.py update 1 --time 09:30 --message "请同步今日进展、风险和下一步计划"

# 立即预览某条提醒（消息方式）
python client_reminder.py preview 1

# 中文智能识别（支持 / 后输入需求，自动归类时间+人物）
python client_reminder.py smart --text "/工作日下午3点提醒我联系客户李总复盘" --save

# 删除提醒
python client_reminder.py delete 1
```

### 实时更新说明
`run` 模式会在每轮检查时重新读取 `client_reminders.json`，所以你可以：
- 运行提醒服务的同时，用 `add/update/delete` 命令调整提醒；
- 或直接编辑 JSON 文件；
- 无需重启提醒服务即可生效。


### 实用增强
- `init --force`：可重置为默认配置。
- `preview <id>`：不等到触发时间，立即查看提醒消息内容。
- `run --once`：只执行一轮检查，便于验证配置。
- `weekdays` 参数会自动校验为 0-6（0=周一 ... 6=周日），避免误配置。


### 中文智能识别（你的新要求）
- 现在支持在 `/` 后面直接写你的中文需求。
- 脚本会智能归类：
  - **时间**（如 `9:30`、`9点半`、`下午3点`）
  - **人物**（如 `客户张三`、`联系李总`）
- 通过 `smart --text "..." --save` 可直接落地为提醒。
- 通过 `sync-db` + `report --sync` 可生成“今日工作扫描”（会面事项/提醒事项）。
