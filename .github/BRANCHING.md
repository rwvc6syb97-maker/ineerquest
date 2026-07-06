# 分支策略与保护规则（InnerQuest）

## 分支模型：主干 + 特性分支

| 分支 | 用途 | 保护 |
|------|------|------|
| `main` | 生产可发布主干，始终可部署 | 受保护，禁止直接 push |
| `develop`（可选） | 集成分支，汇聚特性分支 | 受保护 |
| `feature/<任务ID>-<简述>` | 特性开发，如 `feature/T0-02-nest-scaffold` | 经 PR 合并 |
| `fix/<任务ID>-<简述>` | 缺陷修复 | 经 PR 合并 |
| `chore/<简述>` | 构建/脚手架/杂项 | 经 PR 合并 |

## 分支保护（建议在托管平台配置）

- `main` / `develop`：
  - 禁止直接 push，仅允许通过 PR 合并
  - PR 至少 1 名 reviewer 审批通过
  - 必须通过 CI 状态检查（lint / test / build）
  - 合并前要求分支为最新（up-to-date）
  - 禁止 force push 与删除受保护分支

## 提交规范（Conventional Commits）

```
<type>(<scope>): <subject>

type: feat | fix | refactor | docs | chore | test | perf
scope: web | api | packages | ci | db
```

示例：`feat(api): 挂载 10 个服务模块空壳 (T0-02)`

## PR 要求

- 使用 `.github/PULL_REQUEST_TEMPLATE.md` 模板
- 关联任务 ID，勾选验收自测项
- 引用一致性：命名回溯到五份设计文档