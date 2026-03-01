import argparse
import json
import re
import sqlite3
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

CONFIG_PATH = Path("client_reminders.json")
DB_PATH = Path("tasks.db")


@dataclass
class Reminder:
    id: int
    title: str
    message: str
    time_of_day: str = "09:00"
    enabled: bool = True
    weekdays: list[int] | None = None  # 0=Mon ... 6=Sun


def parse_time(value: str) -> tuple[int, int]:
    try:
        hh, mm = value.split(":", 1)
        hour = int(hh)
        minute = int(mm)
    except (ValueError, TypeError) as exc:
        raise ValueError("时间必须是 HH:MM 格式，例如 09:30") from exc

    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("时间必须是 HH:MM 格式，例如 09:30")
    return hour, minute


def parse_weekdays(value: str | None) -> list[int] | None:
    if value is None or value.strip() == "":
        return None

    try:
        days = [int(x.strip()) for x in value.split(",") if x.strip() != ""]
    except ValueError as exc:
        raise ValueError("weekdays 必须是 0-6 的逗号分隔数字，例如 0,1,2,3,4") from exc

    if not days:
        return None

    invalid = [d for d in days if d < 0 or d > 6]
    if invalid:
        raise ValueError("weekdays 仅允许 0-6（0=周一 ... 6=周日）")

    return sorted(set(days))


def validate_reminder(reminder: Reminder) -> Reminder:
    parse_time(reminder.time_of_day)
    reminder.weekdays = parse_weekdays(
        None if reminder.weekdays is None else ",".join(str(d) for d in reminder.weekdays)
    )
    return reminder


def load_config(path: Path = CONFIG_PATH) -> list[Reminder]:
    if not path.exists():
        return []

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"配置文件 JSON 格式错误: {path}") from exc

    if not isinstance(raw, list):
        raise ValueError("配置文件格式错误：顶层必须是数组")

    reminders: list[Reminder] = []
    for item in raw:
        r = Reminder(
            id=item["id"],
            title=item["title"],
            message=item["message"],
            time_of_day=item.get("time_of_day", "09:00"),
            enabled=item.get("enabled", True),
            weekdays=item.get("weekdays"),
        )
        reminders.append(validate_reminder(r))
    return reminders


def save_config(reminders: list[Reminder], path: Path = CONFIG_PATH) -> None:
    normalized = [asdict(validate_reminder(r)) for r in reminders]
    path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")


def next_id(reminders: list[Reminder]) -> int:
    return max((r.id for r in reminders), default=0) + 1


def should_trigger(reminder: Reminder, now: datetime) -> bool:
    if not reminder.enabled:
        return False
    if reminder.weekdays is not None and now.weekday() not in reminder.weekdays:
        return False
    hour, minute = parse_time(reminder.time_of_day)
    return now.hour == hour and now.minute == minute


def print_reminder(reminder: Reminder) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{ts}] 🔔 {reminder.title}\n{reminder.message}\n")


def weekdays_text(weekdays: list[int] | None) -> str:
    if weekdays is None or len(weekdays) == 7:
        return "每天"
    return "周" + ",".join(str(d + 1) for d in weekdays)


def extract_request_text(raw: str) -> str:
    # 支持“/后面输入需求”的习惯，例如：/每天早上9点提醒我联系客户张三
    if "/" in raw:
        suffix = raw.split("/", 1)[1].strip()
        if suffix:
            return suffix
    return raw.strip()


def infer_time_from_chinese(text: str) -> str:
    m = re.search(r"(\d{1,2})[:：](\d{1,2})", text)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2))
        parse_time(f"{hour:02d}:{minute:02d}")
        return f"{hour:02d}:{minute:02d}"

    m2 = re.search(r"(\d{1,2})点(半|一刻|三刻)?", text)
    if m2:
        hour = int(m2.group(1))
        token = m2.group(2)
        minute = 0
        if token == "半":
            minute = 30
        elif token == "一刻":
            minute = 15
        elif token == "三刻":
            minute = 45

        if any(k in text for k in ["下午", "晚上", "傍晚"]) and hour < 12:
            hour += 12
        if "中午" in text and hour < 11:
            hour += 12

        parse_time(f"{hour:02d}:{minute:02d}")
        return f"{hour:02d}:{minute:02d}"

    if "早上" in text or "上午" in text:
        return "09:00"
    if "下午" in text:
        return "15:00"
    if "晚上" in text:
        return "20:00"
    return "09:00"


def infer_weekdays_from_chinese(text: str) -> list[int] | None:
    if any(k in text for k in ["工作日", "周一到周五", "周一至周五"]):
        return [0, 1, 2, 3, 4]
    if any(k in text for k in ["每天", "每日", "天天"]):
        return None
    return None


def infer_person_from_chinese(text: str) -> str:
    patterns = [
        r"客户([\u4e00-\u9fa5A-Za-z0-9_]{1,8}?)(?=同步|复盘|沟通|提醒|拜访|会面|会议|见面|[，。,\s]|$)",
        r"联系([\u4e00-\u9fa5A-Za-z0-9_]{1,8}?)(?=同步|复盘|沟通|提醒|拜访|会面|会议|见面|[，。,\s]|$)",
        r"跟([\u4e00-\u9fa5A-Za-z0-9_]{1,8}?)沟通",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m and m.group(1):
            return m.group(1)
    if "客户" in text:
        return "客户"
    return "未指定人物"


def smart_classify(text: str) -> dict[str, str | list[int] | None]:
    request = extract_request_text(text)
    return {
        "request": request,
        "time_of_day": infer_time_from_chinese(request),
        "weekdays": infer_weekdays_from_chinese(request),
        "person": infer_person_from_chinese(request),
    }


def reminder_to_cron_expr(reminder: Reminder) -> str:
    """生成简化 cron 表达式（仅用于工作扫描匹配星期）。"""
    if reminder.weekdays is None or len(reminder.weekdays) == 7:
        return "* * * * *"
    # Python: 0=Mon..6=Sun; 这里转成 1-7（周一到周日）
    days = ",".join(str(d + 1) for d in reminder.weekdays)
    return f"* * * * {days}"


def ensure_db(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            cron_expr TEXT NOT NULL,
            time_of_day TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            message TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def sync_json_to_db(db_path: Path = DB_PATH) -> int:
    reminders = load_config()
    conn = ensure_db(db_path)
    c = conn.cursor()
    c.execute("DELETE FROM reminders")

    for r in reminders:
        c.execute(
            """
            INSERT INTO reminders (id, title, cron_expr, time_of_day, enabled, message)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                r.id,
                r.title,
                reminder_to_cron_expr(r),
                r.time_of_day,
                1 if r.enabled else 0,
                r.message,
            ),
        )

    conn.commit()
    conn.close()
    return len(reminders)


def daily_report(db_path: Path = DB_PATH) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    weekday = datetime.now().weekday()  # 0-6

    conn = ensure_db(db_path)
    c = conn.cursor()

    meetings: list[str] = []
    reminders: list[str] = []

    for row in c.execute("SELECT title, cron_expr, enabled, message FROM reminders"):
        title, cron_expr, enabled, message = row
        if not enabled:
            continue

        # 简单匹配今天是否触发：匹配星期或全量 *
        if str(weekday + 1) in cron_expr or "*" in cron_expr:
            reminders.append(title)
            meeting_text = f"{title} {message}"
            if any(k in meeting_text for k in ["会面", "会议", "见面", "拜访"]):
                meetings.append(title)

    print("===== 今日工作扫描 =====")
    print(f"日期: {today}")

    if meetings:
        print("今日有会面事项：")
        for m in meetings:
            print("-", m)
    else:
        print("今日无会面安排")

    print("\n今日提醒事项：")
    if reminders:
        for r in reminders:
            print("-", r)
    else:
        print("- （无）")

    conn.close()


def cmd_init(args: argparse.Namespace) -> None:
    if CONFIG_PATH.exists() and not args.force:
        print(f"配置文件已存在: {CONFIG_PATH}（如需覆盖请加 --force）")
        return

    default = [
        Reminder(
            id=1,
            title="每日客户沟通",
            message="请与客户进行每日沟通，并同步今天的进展与阻塞项。",
            time_of_day="09:00",
            weekdays=[0, 1, 2, 3, 4, 5, 6],
        )
    ]
    save_config(default)
    print(f"已初始化提醒配置: {CONFIG_PATH}")


def cmd_list(_: argparse.Namespace) -> None:
    reminders = load_config()
    if not reminders:
        print("暂无提醒。先执行: python client_reminder.py init")
        return

    for r in reminders:
        status = "启用" if r.enabled else "停用"
        print(f"[{r.id}] {r.title} | {r.time_of_day} | {weekdays_text(r.weekdays)} | {status}\n  {r.message}")


def cmd_add(args: argparse.Namespace) -> None:
    parse_time(args.time)
    reminders = load_config()
    reminders.append(
        Reminder(
            id=next_id(reminders),
            title=args.title,
            message=args.message,
            time_of_day=args.time,
            weekdays=parse_weekdays(args.weekdays),
            enabled=not args.disabled,
        )
    )
    save_config(reminders)
    print("提醒已新增。")


def cmd_update(args: argparse.Namespace) -> None:
    reminders = load_config()
    target = next((r for r in reminders if r.id == args.id), None)
    if not target:
        print(f"未找到 id={args.id} 的提醒")
        return

    if args.title is not None:
        target.title = args.title
    if args.message is not None:
        target.message = args.message
    if args.time is not None:
        parse_time(args.time)
        target.time_of_day = args.time
    if args.weekdays is not None:
        target.weekdays = parse_weekdays(args.weekdays)
    if args.enable:
        target.enabled = True
    if args.disable:
        target.enabled = False

    save_config(reminders)
    print("提醒已更新。")


def cmd_delete(args: argparse.Namespace) -> None:
    reminders = load_config()
    kept = [r for r in reminders if r.id != args.id]
    if len(kept) == len(reminders):
        print(f"未找到 id={args.id} 的提醒")
        return
    save_config(kept)
    print("提醒已删除。")


def cmd_preview(args: argparse.Namespace) -> None:
    reminders = load_config()
    target = next((r for r in reminders if r.id == args.id), None)
    if not target:
        print(f"未找到 id={args.id} 的提醒")
        return
    print_reminder(target)


def cmd_smart(args: argparse.Namespace) -> None:
    info = smart_classify(args.text)
    person = str(info["person"])
    time_of_day = str(info["time_of_day"])
    weekdays = info["weekdays"]
    request = str(info["request"])

    print("智能识别结果：")
    print(f"- 人物: {person}")
    print(f"- 时间: {time_of_day}")
    print(f"- 周期: {weekdays_text(weekdays if isinstance(weekdays, list) else None)}")
    print(f"- 原始需求: {request}")

    if args.save:
        reminders = load_config()
        title = f"{person}沟通提醒" if person != "未指定人物" else "客户沟通提醒"
        message = f"请按需求执行：{request}"
        reminders.append(
            Reminder(
                id=next_id(reminders),
                title=title,
                message=message,
                time_of_day=time_of_day,
                weekdays=weekdays if isinstance(weekdays, list) else None,
                enabled=True,
            )
        )
        save_config(reminders)
        print("已根据智能识别结果新增提醒。")


def cmd_sync_db(args: argparse.Namespace) -> None:
    count = sync_json_to_db(Path(args.db))
    print(f"已同步 {count} 条提醒到数据库: {args.db}")


def cmd_report(args: argparse.Namespace) -> None:
    db_path = Path(args.db)
    if args.sync:
        count = sync_json_to_db(db_path)
        print(f"已先从 JSON 同步 {count} 条提醒到数据库。")
    daily_report(db_path)


def cmd_run(args: argparse.Namespace) -> None:
    print("提醒服务已启动（Ctrl+C 退出）。支持实时更新：直接修改 JSON 或使用 add/update/delete/smart 命令。")
    fired_keys: set[tuple[int, str]] = set()

    while True:
        now = datetime.now()
        current_key = now.strftime("%Y-%m-%d %H:%M")

        reminders = load_config()
        for r in reminders:
            key = (r.id, current_key)
            if should_trigger(r, now) and key not in fired_keys:
                print_reminder(r)
                fired_keys.add(key)

        if args.once:
            break

        if len(fired_keys) > 10_000:
            fired_keys.clear()

        time.sleep(max(5, args.interval))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="客户沟通每日消息提醒")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="初始化默认提醒")
    p_init.add_argument("--force", action="store_true", help="覆盖已存在的配置文件")
    p_init.set_defaults(func=cmd_init)

    p_list = sub.add_parser("list", help="查看所有提醒")
    p_list.set_defaults(func=cmd_list)

    p_add = sub.add_parser("add", help="新增提醒")
    p_add.add_argument("--title", required=True)
    p_add.add_argument("--message", required=True)
    p_add.add_argument("--time", default="09:00")
    p_add.add_argument("--weekdays", default=None, help="逗号分隔，0=周一 ... 6=周日；留空表示每天")
    p_add.add_argument("--disabled", action="store_true")
    p_add.set_defaults(func=cmd_add)

    p_update = sub.add_parser("update", help="更新提醒")
    p_update.add_argument("id", type=int)
    p_update.add_argument("--title")
    p_update.add_argument("--message")
    p_update.add_argument("--time")
    p_update.add_argument("--weekdays", help="逗号分隔；传空字符串表示每天")
    p_update.add_argument("--enable", action="store_true")
    p_update.add_argument("--disable", action="store_true")
    p_update.set_defaults(func=cmd_update)

    p_delete = sub.add_parser("delete", help="删除提醒")
    p_delete.add_argument("id", type=int)
    p_delete.set_defaults(func=cmd_delete)

    p_preview = sub.add_parser("preview", help="立即预览某条提醒消息")
    p_preview.add_argument("id", type=int)
    p_preview.set_defaults(func=cmd_preview)

    p_smart = sub.add_parser("smart", help="中文智能识别：支持 /后输入需求，自动归类时间与人物")
    p_smart.add_argument("--text", required=True, help='例如 "/每天早上9点提醒我联系客户张三"')
    p_smart.add_argument("--save", action="store_true", help="将识别结果保存为提醒")
    p_smart.set_defaults(func=cmd_smart)

    p_sync_db = sub.add_parser("sync-db", help="将 JSON 提醒同步到 SQLite（tasks.db）")
    p_sync_db.add_argument("--db", default=str(DB_PATH), help="数据库文件路径")
    p_sync_db.set_defaults(func=cmd_sync_db)

    p_report = sub.add_parser("report", help="今日工作扫描（会面与提醒事项）")
    p_report.add_argument("--db", default=str(DB_PATH), help="数据库文件路径")
    p_report.add_argument("--sync", action="store_true", help="扫描前先从 JSON 同步数据库")
    p_report.set_defaults(func=cmd_report)

    p_run = sub.add_parser("run", help="启动提醒循环")
    p_run.add_argument("--interval", type=int, default=10, help="轮询间隔秒")
    p_run.add_argument("--once", action="store_true", help="仅执行一次检查（用于验证）")
    p_run.set_defaults(func=cmd_run)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
