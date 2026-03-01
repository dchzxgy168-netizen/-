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
