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

### 国内镜像安装（可选）

如果默认源下载失败，可尝试：

```bash
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pygame
```

## 玩法说明
- `WASD`：移动
- 鼠标左键：射击
- `R`：战局内手动换弹；结算后重开
- `ESC`：退出

### 新增战斗/撤离细节
- 武器采用弹匣机制：默认 20 发，打空后自动换弹（约 1.6 秒）
- 撤离需在撤离区内持续站位约 2 秒（且物资达标）

## 胜负规则
- **胜利**：物资价值达到目标（默认 1000）后，在撤离区内完成站位读条
- **失败**：角色生命归零，或倒计时结束前未成功撤离

## 文件结构
- `main.py`：完整游戏逻辑（渲染、输入、AI、射击、拾取、撤离、结算）
- `requirements.txt`：运行依赖

