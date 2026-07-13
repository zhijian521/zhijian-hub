# 06 · Git 和版本控制规范

## 分支策略

### 分支命名规范

| 类型 | 前缀 | 示例 | 用途 |
|------|------|------|-----|
| 功能开发 | `feat/` | `feat/user-login` | 新功能开发 |
| Bug修复 | `fix/` | `fix/login-validation` | 修复已知问题 |
| 重构 | `refactor/` | `refactor/api-service` | 代码重构 |
| 文档更新 | `docs/` | `docs/api-spec` | 文档相关修改 |
| 测试相关 | `test/` | `test/user-component` | 测试代码 |
| 构建相关 | `build/` | `build/docker-config` | 构建配置 |

### 主要分支

- **main**：主分支，用于生产环境部署
- **develop**：开发分支，用于集成各功能（可选）
- **feat/xxx**：功能分支，从 develop/main 检出

## Commit 规范

### Commit 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| feat | 新功能 | `feat(auth): add user login` |
| fix | Bug修复 | `fix(api): handle null response` |
| docs | 文档更新 | `docs: update API specification` |
| style | 代码格式 | `style: format with prettier` |
| refactor | 代码重构 | `refactor(service): extract utils` |
| test | 测试相关 | `test(component): add unit tests` |
| chore | 构建任务 | `chore(deps): update dependencies` |

### Scope 范围（可选）

- auth: 认证相关
- api: API 接口
- component: 组件
- ui: 用户界面
- styles: CSS 样式
- types: TypeScript 类型
- docs: 文档
- test: 测试
- build: 构建相关
- deploy: 部署相关

### Subject 要求

- 使用现在时、主动语态
- 首字母小写
- 不加句号
- 控制在 50 字符以内

### Body 内容

- 解释修改的原因和内容
- 说明与之前版本的差异
- 如有 breaking change 需特别标注

### Footer

- 引用相关 Issue 或 PR
- 标记 Breaking Changes

## 示例 Commit

```bash
# 新功能
feat(auth): implement JWT authentication

Add JWT-based authentication system with refresh token support.
Includes middleware for API protection and user context injection.

Closes #123

# Bug修复
fix(api): handle null response in user service

Fixed null pointer exception when user data is not found.
Return appropriate error response instead of crashing.

Fixes #124

# 重构
refactor(component): extract shared modal logic

Extract repeated modal logic into shared component to reduce
code duplication and improve maintainability.

# 文档
docs: update API documentation

Update API specs to reflect latest changes in v1.2.0.

# Breaking Change
feat(api)!: change user endpoint structure

Change user endpoint from /api/users/:id to /api/v1/users/:id

BREAKING CHANGE: Old endpoint /api/users/:id is no longer supported
```

## Merge 和 PR 规范

### PR 标题格式

与 commit 格式保持一致：
- `feat: add new dashboard feature`
- `fix: resolve login validation issue`
- `refactor: improve component structure`

### PR 描述模板

```markdown
## 问题/需求
简述这个 PR 要解决的问题或实现的功能

## 实现方案
详细描述实现方案和关键技术点

## 修改内容
- [ ] 新增文件
- [ ] 修改文件
- [ ] 删除文件

## 测试情况
- [ ] 单元测试
- [ ] 集成测试
- [ ] 手动测试

## Breaking Changes
如有不向后兼容的变更，请说明

## 截图/录屏
如有 UI 变更，提供截图

## 相关 Issue
Closes #xxx 或 Related to #xxx
```

## 代码审查清单

### 提 PR 前自检

- [ ] 代码符合项目规范（代码风格、目录结构等）
- [ ] 变量、函数命名语义化
- [ ] 函数职责单一，代码简洁
- [ ] 重要逻辑添加注释
- [ ] 移除调试代码和 console.log
- [ ] 通过 lint 和类型检查
- [ ] 本地测试通过
- [ ] 更新相关文档

### 审查要点

- 代码逻辑正确性
- 是否符合项目架构规范
- 是否有安全问题
- 性能是否合理
- 测试覆盖是否充分
- 文档是否完整

## 版本发布

### 版本号规范

遵循 [SemVer](https://semver.org/) 规范：

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向下兼容的功能新增
- **PATCH**：向下兼容的问题修正

### 发布流程

1. 更新版本号 (package.json)
2. 更新 CHANGELOG
3. 执行回归测试
4. 创建发布 Tag
5. 合并到主分支
6. 部署到生产环境

## 常用 Git 命令

```bash
# 创建功能分支
git checkout -b feat/new-feature

# 提交代码
git add .
git commit -m "feat: implement new feature"

# 推送到远程
git push origin feat/new-feature

# 更新主分支
git checkout main
git pull origin main

# 合并功能分支
git merge feat/new-feature

# 删除已合并的分支
git branch -d feat/new-feature
git push origin --delete feat/new-feature
```

## 安全最佳实践

1. **敏感信息保护**
   - 不在代码中硬编码密码、密钥
   - 使用环境变量或配置文件
   - .gitignore 中忽略敏感文件

2. **提交信息安全**
   - 不在 commit message 中包含敏感信息
   - 不在描述中暴露内部实现细节

3. **权限控制**
   - 主分支设置保护规则
   - 重要操作需要审核
   - 定期审查团队成员权限