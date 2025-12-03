# 分支保护配置指南

本文档说明如何在 GitHub 仓库中配置分支保护规则，以确保代码质量和团队协作效率。

## 推荐的分支保护配置

### main 分支（生产环境）

进入 **Settings → Branches → Add branch protection rule**

| 配置项 | 建议值 | 说明 |
|--------|--------|------|
| Branch name pattern | `main` | 保护主分支 |
| Require a pull request before merging | ✅ | 禁止直接推送 |
| Require approvals | 1-2 | 需要审批人数 |
| Dismiss stale pull request approvals | ✅ | 新提交后清除旧审批 |
| Require review from Code Owners | 可选 | 需要代码所有者审批 |
| Require status checks to pass | ✅ | 必须通过 CI 检查 |
| Status checks that are required | `CI Success` | 选择必须通过的检查 |
| Require branches to be up to date | ✅ | 必须与 main 同步 |
| Require conversation resolution | ✅ | 必须解决所有讨论 |
| Do not allow bypassing | ✅ | 管理员也受限制 |

### develop 分支（开发环境）

| 配置项 | 建议值 | 说明 |
|--------|--------|------|
| Branch name pattern | `develop` | 保护开发分支 |
| Require a pull request before merging | ✅ | 禁止直接推送 |
| Require approvals | 1 | 至少 1 人审批 |
| Require status checks to pass | ✅ | 必须通过 CI 检查 |
| Status checks that are required | `CI Success` | 选择必须通过的检查 |

## CI 状态检查

配置分支保护时，应选择以下 CI 检查作为必需项：

### 必需的状态检查

- **CI Success** - 主 CI 工作流汇总检查

### 可选的细分检查

- `Platform Service` - 平台服务测试
- `Tenant API` - 租户 API 测试
- `Platform Console` - 平台控制台构建
- `Tenant Console` - 租户控制台构建

## 工作流说明

### 1. ci.yml（主工作流）

**触发条件**：
- Push 到 `main` 或 `develop`
- PR 到 `main` 或 `develop`

**功能**：
- 智能检测变更的项目
- 仅对变更的项目运行测试
- 汇总所有检查结果

### 2. platform-service-tests.yml

**触发条件**：
- `apps/platform-service/**` 路径变更

**任务**：
- Lint 检查
- 单元测试 (384 个)
- E2E 契约测试
- 构建验证

### 3. tenant-api-tests.yml

**触发条件**：
- `apps/tenant-api/**` 路径变更

**任务**：
- Lint 检查
- 单元测试
- E2E 契约测试 (263 个)
- 构建验证

## 推荐的开发流程

```
main (生产)
  ↑
  └── PR (需要审批 + CI 通过)
      ↑
develop (开发)
  ↑
  └── PR (需要 CI 通过)
      ↑
feature/xxx 或 fix/xxx (功能分支)
```

### 分支命名规范

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能 | `feature/描述` | `feature/user-auth` |
| 修复 | `fix/描述` | `fix/login-bug` |
| 热修复 | `hotfix/描述` | `hotfix/security-patch` |
| 发布 | `release/版本` | `release/v1.2.0` |

## 配置步骤

1. **进入仓库设置**
   - GitHub 仓库 → Settings → Branches

2. **添加保护规则**
   - 点击 "Add branch protection rule"
   - 输入分支名称模式
   - 勾选相应选项

3. **配置 Status Checks**
   - 首次需要先运行一次 CI 工作流
   - 之后在 "Require status checks" 下拉框中选择

4. **保存规则**
   - 点击 "Create" 或 "Save changes"

## 注意事项

- 首次配置前需要先成功运行一次 CI 工作流，否则状态检查选项不会出现
- 修改 CI 工作流后，可能需要更新分支保护规则中的检查名称
- 紧急情况下管理员可以临时禁用保护规则，但应谨慎使用
