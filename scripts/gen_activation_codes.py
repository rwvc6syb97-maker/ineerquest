#!/usr/bin/env python3
"""
InnerQuest 激活码运营工具
===========================
脱离后端独立运行，支持：
  1. 批量生成激活码 → 写入 MySQL activation_code 表
  2. 邮件发送（SMTP）
  3. 短信发送（阿里云 SMS SDK，可选）

用法:
  # 生成 10 个 pro-monthly 激活码，365 天有效期
  python gen_activation_codes.py generate --plan pro-monthly --count 10 --expire-days 365

  # 生成 + 打印但不写库（dry-run）
  python gen_activation_codes.py generate --plan pro-monthly --count 5 --dry-run

  # 发送邮件
  python gen_activation_codes.py send-email --code DEMO-PRO-BBBBBB --to user@example.com --plan "Pro 月度"

  # 列出某个批次
  python gen_activation_codes.py list --batch BXXXXXXXXX

依赖:
  pip install pymysql

环境变量（可通过 .env 文件或直接 export）:
  DATABASE_URL=mysql://root:password@localhost:3306/innerquest
  SMTP_HOST=smtp.example.com
  SMTP_PORT=587
  SMTP_USER=noreply@innerquest.cn
  SMTP_PASS=your_password
"""

import argparse
import os
import random
import string
import sys
from datetime import datetime, timedelta
from urllib.parse import urlparse

# ---- 数据库连接 ----
def get_db_connection():
    """从 DATABASE_URL 解析连接参数"""
    try:
        import pymysql  # noqa: F401
    except ImportError:
        return None  # 返回 None 表示 pymysql 未安装
    url = os.getenv("DATABASE_URL", "mysql://root:innerquest@localhost:3306/innerquest")
    parsed = urlparse(url)
    try:
        import pymysql
        return pymysql.connect(
            host=parsed.hostname or "localhost",
            port=parsed.port or 3306,
            user=parsed.username or "root",
            password=parsed.password or "",
            database=parsed.path.lstrip("/") or "innerquest",
            charset="utf8mb4",
        )
    except Exception:
        return None  # 连接失败返回 None


# ---- 激活码生成 ----
def gen_code(length: int = 16) -> str:
    """生成大写字母+数字的激活码（排除易混淆字符 I/L/O/0/1）"""
    chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=length))


def generate_codes(plan_code: str, count: int, expire_days: int = 0, note: str = "", dry_run: bool = False):
    """批量生成激活码并写入数据库"""
    batch_no = f"B{datetime.now().strftime('%Y%m%d%H%M%S')}"
    expire_at = (datetime.now() + timedelta(days=expire_days)).strftime("%Y-%m-%d %H:%M:%S") if expire_days > 0 else None

    if dry_run:
        print(f"[DRY RUN] 批次: {batch_no}  套餐: {plan_code}  数量: {count}  过期: {expire_at or '永不过期'}")
        codes = [gen_code() for _ in range(count)]
        for c in codes:
            print(f"  {c}")
        print(f"[DRY RUN] 未写入数据库（--dry-run）")
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 校验套餐存在
            cur.execute("SELECT code, name FROM membership_plan WHERE code = %s AND is_deleted = 0", (plan_code,))
            plan = cur.fetchone()
            if not plan:
                print(f"[ERROR] 套餐编码不存在: {plan_code}")
                sys.exit(1)
            plan_name = plan[1]

            codes = []
            for _ in range(count):
                code = gen_code()
                cur.execute(
                    """INSERT INTO activation_code (code, plan_code, status, expire_at, note, batch_no, created_at, updated_at)
                       VALUES (%s, %s, 0, %s, %s, %s, NOW(), NOW())""",
                    (code, plan_code, expire_at, note or None, batch_no),
                )
                codes.append(code)
            conn.commit()

        print(f"[OK] 已生成 {count} 个激活码")
        print(f"     批次: {batch_no}")
        print(f"     套餐: {plan_name} ({plan_code})")
        print(f"     过期: {expire_at or '永不过期'}")
        print(f"     备注: {note or '(无)'}")
        print()
        for c in codes:
            print(f"  {c}")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] {e}")
        sys.exit(1)
    finally:
        conn.close()


# ---- 列表查询 ----
def list_codes(batch_no: str = "", plan_code: str = "", status: str = ""):
    """查询激活码列表"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            sql = """SELECT code, plan_code, status, sent_to, sent_channel, expire_at, note, batch_no, created_at
                     FROM activation_code WHERE 1=1"""
            params = []
            if batch_no:
                sql += " AND batch_no = %s"
                params.append(batch_no)
            if plan_code:
                sql += " AND plan_code = %s"
                params.append(plan_code)
            if status:
                sql += " AND status = %s"
                params.append(int(status))
            sql += " ORDER BY id DESC LIMIT 200"

            cur.execute(sql, params)
            rows = cur.fetchall()

            if not rows:
                print("(空)")
                return

            status_map = {0: "未使用", 1: "已使用", 2: "已过期"}
            channel_map = {1: "邮件", 2: "短信"}
            print(f"{'激活码':<18} {'套餐':<16} {'状态':<8} {'发送':<28} {'过期':<12} {'批次'}")
            print("-" * 105)
            for r in rows:
                code, plan, st, sent_to, channel, expire, note, batch, created = r
                st_text = status_map.get(st, str(st))
                sent = f"{sent_to or ''} ({channel_map.get(channel or 0, '')})" if sent_to else "-"
                exp = str(expire)[:10] if expire else "永不过期"
                print(f"{code:<18} {plan:<16} {st_text:<8} {sent:<28} {exp:<12} {batch}")

    except Exception as e:
        print(f"[ERROR] {e}")
    finally:
        conn.close()


# ---- 日志工具 ----
def log(step: str, msg: str, level: str = "INFO"):
    """统一带时间戳的日志输出"""
    ts = datetime.now().strftime("%H:%M:%S")
    prefix = {"INFO": "  [->]", "OK": "  [OK]", "WARN": "  [!!]", "ERROR": "  [XX]"}.get(level, "  [--]")
    print(f"{ts} {prefix} [{step}] {msg}")


# ---- 内部工具 ----
def resolve_plan_name(plan_code: str) -> str:
    """查套餐名称（先查 DB，失败用 code 兜底）"""
    try:
        conn = get_db_connection()
        if conn is None:
            return plan_code
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM membership_plan WHERE code = %s AND is_deleted = 0", (plan_code,))
            row = cur.fetchone()
        conn.close()
        return row[0] if row else plan_code
    except Exception:
        return plan_code


def ensure_code(code: str, plan_code: str, expire_days: int, note: str) -> str:
    """若 code 为空则生成新码；若 DB 可用则写入，否则仅打印预览"""
    if code:
        return code

    new_code = gen_code()
    conn = get_db_connection()

    if conn is None:
        log("DB", f"MySQL 未连接（pymysql 未安装或 DATABASE_URL 无效），激活码仅生成不写入: {new_code}", "WARN")
        return new_code

    expire_at = (datetime.now() + timedelta(days=expire_days)).strftime("%Y-%m-%d %H:%M:%S") if expire_days > 0 else None
    batch_no = f"B{datetime.now().strftime('%Y%m%d%H%M%S')}"

    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO activation_code (code, plan_code, status, expire_at, note, batch_no, created_at, updated_at)
                   VALUES (%s, %s, 0, %s, %s, %s, NOW(), NOW())""",
                (new_code, plan_code, expire_at, note or None, batch_no),
            )
            conn.commit()
        log("DB", f"已写入 {new_code} (批次 {batch_no})", "OK")
    except Exception as e:
        conn.rollback()
        log("DB", f"写入失败: {e}", "ERROR")
        sys.exit(1)
    finally:
        conn.close()

    return new_code


# ---- 邮件发送 ----
def send_email(to_email: str, plan_name: str, code: str = "", plan_code: str = "", expire_days: int = 0, note: str = ""):
    """通过 SMTP 发送激活码邮件，每步均有详细日志。若未指定 code 则自动生成并写入 DB。"""
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587") or "587")
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    smtp_from = os.getenv("SMTP_FROM", smtp_user) or smtp_user
    smtp_timeout = int(os.getenv("SMTP_TIMEOUT", "30") or "30")
    smtp_use_ssl = os.getenv("SMTP_USE_SSL", "0") == "1"
    smtp_skip_tls = os.getenv("SMTP_SKIP_TLS", "0") == "1"

    # 自动生成
    if not code:
        if not plan_code:
            log("CONFIG", "--code 未指定且 --plan-code 未指定，无法自动生成", "ERROR")
            sys.exit(1)
        plan_name = resolve_plan_name(plan_code)
        code = ensure_code("", plan_code, expire_days, note)
        log("CONFIG", f"自动生成激活码: {code}")

    log("CONFIG", f"收件人: {to_email}")
    log("CONFIG", f"激活码: {code}")
    log("CONFIG", f"套餐: {plan_name}")
    log("CONFIG", f"SMTP 服务器: {smtp_host}:{smtp_port} (SSL={smtp_use_ssl}, TLS={'SKIP' if smtp_skip_tls else 'ON'}, timeout={smtp_timeout}s)")
    log("CONFIG", f"发件账号: {smtp_user}")
    if smtp_from != smtp_user:
        log("CONFIG", f"信封发件人 (From): {smtp_from}")

    if not smtp_host:
        log("DRY", "SMTP_HOST 未配置，跳过真实发送，以下为预览", "WARN")
        print()
        print(f"  To: {to_email}")
        print(f"  From: {smtp_user or '(未配置)'}")
        print(f"  Subject: 【InnerQuest】您的{plan_name}激活码")
        print(f"  Body (节选): 您的{plan_name}激活码为 {code}...")
        print()
        log("DRY", "配置 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS 环境变量以启用真实发送", "WARN")
        return False

    import smtplib
    from email.mime.text import MIMEText
    import socket as sock_module

    # ---- 构建邮件 ----
    log("BUILD", "构建 MIME 邮件...")
    subject = f"【InnerQuest】您的{plan_name}激活码"
    body = f"""Hi，

感谢你对 InnerQuest 向内求索的关注！

你的 {plan_name} 激活码是：

    {code}

请访问 https://innerquest.cn/pricing 在页面底部输入激活码兑换。

兑换后你将获得 {plan_name} 的全部权益。

如有问题，请回复此邮件联系。

InnerQuest 团队
"""
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg["Date"] = datetime.now().strftime("%a, %d %b %Y %H:%M:%S +0800")
    msg["Message-ID"] = f"<innerquest-{code}@{smtp_host}>"
    log("BUILD", f"邮件已构建: Subject='{subject}', {len(body)} 字符", "OK")

    # ---- DNS 预检 (可选) ----
    try:
        ip = sock_module.getaddrinfo(smtp_host, smtp_port, proto=sock_module.IPPROTO_TCP)
        resolved = ip[0][4][0] if ip else "(解析失败)"
        log("DNS", f"{smtp_host} → {resolved}", "OK")
    except Exception as e:
        log("DNS", f"{smtp_host} 解析失败: {e}", "WARN")

    # ---- SMTP 发送 ----
    server = None
    try:
        conn_type = smtplib.SMTP_SSL if smtp_use_ssl else smtplib.SMTP
        log("CONNECT", f"连接 {smtp_host}:{smtp_port} (类型: {'SSL' if smtp_use_ssl else 'PLAIN'}) ...")

        server = conn_type(smtp_host, smtp_port, timeout=smtp_timeout)
        log("CONNECT", f"TCP 连接成功", "OK")

        # 读初始 banner
        try:
            banner = server.ehlo_resp if hasattr(server, 'ehlo_resp') else getattr(server, 'sock', None)
            log("BANNER", f"服务器 banner: {(server.ehlo() if hasattr(server, 'ehlo') else 'N/A')}", "OK")
        except Exception:
            log("BANNER", "无法读取 banner（不影响后续流程）", "WARN")

        # STARTTLS（非 SSL 模式且未跳过 TLS）
        if not smtp_use_ssl and not smtp_skip_tls:
            log("TLS", "发起 STARTTLS 协商...")
            server.starttls()
            log("TLS", "TLS 握手成功，连接已加密", "OK")
            # TLS 后重新 EHLO
            server.ehlo()
            log("TLS", "TLS 后 EHLO 完成", "OK")
        elif smtp_skip_tls:
            log("TLS", "已跳过 TLS（SMTP_SKIP_TLS=1）", "WARN")

        # 登录
        log("AUTH", f"登录账号: {smtp_user}")
        server.login(smtp_user, smtp_pass)
        log("AUTH", f"认证成功", "OK")

        # 发送
        log("SEND", f"发送邮件至 {to_email} ...")
        server.send_message(msg)
        log("SEND", f"邮件已提交至 SMTP 服务器", "OK")

        # 关闭
        server.quit()
        log("QUIT", "SMTP 连接已正常关闭", "OK")

    except smtplib.SMTPAuthenticationError as e:
        log("AUTH", f"认证失败: {e.smtp_code} {e.smtp_error}", "ERROR")
        log("AUTH", "请检查 SMTP_USER / SMTP_PASS 是否正确，以及是否开启了 SMTP 授权码（非登录密码）", "ERROR")
        return False
    except smtplib.SMTPConnectError as e:
        log("CONNECT", f"连接失败: {e.smtp_code} {e.smtp_error}", "ERROR")
        log("CONNECT", "请检查 SMTP_HOST / SMTP_PORT 是否正确，防火墙是否开放", "ERROR")
        return False
    except smtplib.SMTPRecipientsRefused as e:
        log("SEND", f"收件人拒绝: {e}", "ERROR")
        log("SEND", "请检查收件人邮箱地址是否正确", "ERROR")
        return False
    except smtplib.SMTPSenderRefused as e:
        log("SEND", f"发件人拒绝: {e.smtp_code} {e.smtp_error}", "ERROR")
        log("SEND", f"请检查 SMTP_FROM ({smtp_from}) 是否被服务器允许", "ERROR")
        return False
    except smtplib.SMTPDataError as e:
        log("SEND", f"邮件内容被拒绝: {e.smtp_code} {e.smtp_error}", "ERROR")
        log("SEND", "邮件内容可能触发垃圾邮件过滤或大小超限", "ERROR")
        return False
    except smtplib.SMTPException as e:
        log("SMTP", f"SMTP 异常: {type(e).__name__}: {e}", "ERROR")
        return False
    except OSError as e:
        log("NETWORK", f"网络错误: {e}", "ERROR")
        log("NETWORK", f"无法连接 {smtp_host}:{smtp_port}，请检查网络和防火墙", "ERROR")
        return False
    except Exception as e:
        log("UNKNOWN", f"未预期的错误: {type(e).__name__}: {e}", "ERROR")
        import traceback
        log("UNKNOWN", traceback.format_exc().strip().split('\n')[-1], "ERROR")
        return False

    # ---- 更新数据库 ----
    log("DB", f"更新 activation_code.sent_to = {to_email} ...")
    conn = get_db_connection()
    if conn is None:
        log("DB", "MySQL 未连接，跳过更新 sent_to", "WARN")
        print()
        log("DONE", f"激活码 {code} 已成功发送至 {to_email} (DB 未更新)", "OK")
        return True

    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE activation_code SET sent_to=%s, sent_channel=1 WHERE code=%s",
                (to_email, code),
            )
            affected = cur.rowcount
            conn.commit()
        conn.close()
        if affected > 0:
            log("DB", f"已更新 {affected} 行 (sent_channel=1)", "OK")
        else:
            log("DB", f"未找到激活码 {code}（可能已被删除或不存在）", "WARN")
    except Exception as e:
        log("DB", f"数据库更新失败: {e}", "WARN")

    print()
    log("DONE", f"激活码 {code} 已成功发送至 {to_email}", "OK")
    return True


# ---- 短信发送（占位） ----
def send_sms(phone: str, code: str, plan_name: str):
    """短信发送（需配置阿里云 SMS 或腾讯云 SMS）"""
    print("[INFO] 短信发送需接入第三方 SDK（阿里云/腾讯云），当前仅打印内容：")
    print(f"  Phone: {phone}")
    print(f"  文案: 【InnerQuest】您的{plan_name}激活码：{code}，请登录兑换。")

    # TODO: 接入阿里云 SMS
    # from alibabacloud_dysmsapi20170525.client import Client as DysmsapiClient
    # ...
    #
    # config = open_api_models.Config(access_key_id=os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID"),
    #                                  access_key_secret=os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET"))
    # config.endpoint = 'dysmsapi.aliyuncs.com'
    # client = DysmsapiClient(config)
    # client.send_sms(...)

    # 更新数据库 sent_to
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE activation_code SET sent_to=%s, sent_channel=2 WHERE code=%s",
            (phone, code),
        )
        conn.commit()
    conn.close()


# ---- CLI ----
def main():
    parser = argparse.ArgumentParser(description="InnerQuest 激活码运营工具")
    sub = parser.add_subparsers(dest="command", required=True)

    # generate
    gen = sub.add_parser("generate", help="批量生成激活码")
    gen.add_argument("--plan", required=True, help="套餐编码 (free/pro-monthly/pro-yearly/coaching-single)")
    gen.add_argument("--count", type=int, default=10, help="数量 (默认 10)")
    gen.add_argument("--expire-days", type=int, default=0, help="过期天数 (0=永不过期)")
    gen.add_argument("--note", default="", help="备注")
    gen.add_argument("--dry-run", action="store_true", help="仅打印不写入数据库")

    # list
    lst = sub.add_parser("list", help="查询激活码列表")
    lst.add_argument("--batch", default="", help="按批次号筛选")
    lst.add_argument("--plan", default="", help="按套餐编码筛选")
    lst.add_argument("--status", default="", help="按状态筛选 (0=未使用 1=已使用 2=已过期)")

    # send-email
    sem = sub.add_parser("send-email", help="邮件发送激活码（可自动生成新码）")
    sem.add_argument("--code", default="", help="已有激活码（不填则根据 --plan-code 自动生成）")
    sem.add_argument("--plan-code", default="", help="套餐编码，自动生成时必需 (free/pro-monthly/pro-yearly/coaching-single)")
    sem.add_argument("--to", required=True, help="收件人邮箱")
    sem.add_argument("--plan", default="", help="套餐名称，用于邮件模板（不填则从DB查询或使用plan-code）")
    sem.add_argument("--expire-days", type=int, default=0, help="过期天数，自动生成时生效 (0=永不过期)")
    sem.add_argument("--note", default="", help="备注，自动生成时写入DB")

    # send-sms
    ssm = sub.add_parser("send-sms", help="短信发送激活码（可自动生成新码）")
    ssm.add_argument("--code", default="", help="已有激活码（不填则根据 --plan-code 自动生成）")
    ssm.add_argument("--plan-code", default="", help="套餐编码，自动生成时必需")
    ssm.add_argument("--phone", required=True, help="收件人手机号")
    ssm.add_argument("--plan", default="", help="套餐名称（不填则从DB查询）")
    ssm.add_argument("--expire-days", type=int, default=0, help="过期天数")
    ssm.add_argument("--note", default="", help="备注")

    args = parser.parse_args()

    if args.command == "generate":
        generate_codes(args.plan, args.count, args.expire_days, args.note, args.dry_run)
    elif args.command == "list":
        list_codes(args.batch, args.plan, args.status)
    elif args.command == "send-email":
        send_email(
            to_email=args.to,
            plan_name=args.plan or args.plan_code,
            code=args.code,
            plan_code=args.plan_code,
            expire_days=args.expire_days,
            note=args.note,
        )
    elif args.command == "send-sms":
        send_sms(args.phone, args.code, args.plan or args.plan_code)


if __name__ == "__main__":
    main()
