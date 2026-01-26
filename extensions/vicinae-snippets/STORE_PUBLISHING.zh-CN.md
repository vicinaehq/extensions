# 发布到 Vicinae 扩展商店：流程与自检清单（vicinae-snippets）

> 更新日期：2026-01-26  
> 官方参考：
> - [vicinaehq/extensions README](https://github.com/vicinaehq/extensions/blob/main/README.md)
> - [vicinaehq/extensions GUIDELINES](https://github.com/vicinaehq/extensions/blob/main/GUIDELINES.md)

## 发布流程（官方 PR 流程）

1. **阅读规范**：通读官方 `GUIDELINES.md`，确认满足校验/目录/manifest/icon/安全要求。
2. **Fork 官方仓库**：Fork `vicinaehq/extensions` 到你的账号下。
3. **放置扩展目录**：把扩展放到官方仓库的 `extensions/<name>/` 下（`<name>` 必须等于 manifest 的 `name` 字段）。
4. **本地自检**（在扩展目录内执行）：

```bash
npm install
npx vici lint
npm run build
```

5. **提交 Pull Request**：
   - PR 描述清楚：扩展用途、命令列表、用户价值、测试方式与测试结果
6. **等待审核与合并**：合并后会自动构建、校验，并发布到 Vicinae 扩展商店。

## 发布到 Vicinae 扩展商店：详细操作流程（本地目录 → 官方仓库 PR）

> 起点：你的本地扩展目录（无需先把你的项目上传到 GitHub）  
> 本地路径：`/home/xiadengma/Code/Python/vicinae-snippets/extensions/vicinae-snippets`
>
> 目标：把该目录作为一个扩展提交到官方仓库 `vicinaehq/extensions` 的 `extensions/` 下，并发起 PR。

### 0) 本地准备（确保可构建）

在你的本地扩展目录内执行：

```bash
cd "/home/xiadengma/Code/Python/vicinae-snippets/extensions/vicinae-snippets"
npm install
npm run check
npm run self-check
```

### 1) 获取官方仓库代码（你可能仍然需要 Fork 官方仓库）

> 说明：你“不用 fork 本地项目”是对的；但如果你**没有** `vicinaehq/extensions` 的写权限，仍然需要 **Fork 官方仓库** 才能提 PR（这是 GitHub 的协作方式）。

#### 情况 A：你没有官方仓库写权限（常见）

1. 在 GitHub 上 Fork `vicinaehq/extensions`
2. 克隆代码到本地（推荐两种方式，二选一），并新建分支：

**方式 A1（推荐）：使用 GitHub CLI 自动 fork + clone + 配置 remote**

```bash
gh repo fork vicinaehq/extensions --clone --remote
cd extensions
git checkout -b add-vicinae-snippets
```

**方式 A2：手动 clone（官方仓库地址已知）+ 配置你的 fork 作为 origin**

```bash
git clone https://github.com/vicinaehq/extensions.git
cd extensions
git remote rename origin upstream

# 把你 fork 后的仓库加为 origin（把 xiadengma 换成你的 GitHub 用户名）
git remote add origin https://github.com/xiadengma/extensions.git

git checkout -b add-vicinae-snippets
```

#### 情况 B：你有官方仓库写权限（少见）

```bash
git clone https://github.com/vicinaehq/extensions.git
cd extensions
git checkout -b add-vicinae-snippets
```

### 2) 把本地扩展目录拷贝进官方仓库结构

把你的本地扩展目录复制到官方仓库结构的 `extensions/` 下（**不要提交 node_modules**）：

```bash
# 在 extensions（官方仓库 clone）根目录执行
mkdir -p extensions
cp -R "/home/xiadengma/Code/Python/vicinae-snippets/extensions/vicinae-snippets" extensions/vicinae-snippets
rm -rf extensions/vicinae-snippets/node_modules
```

> 提示：目录名必须等于 manifest 的 `name`（本扩展为 `vicinae-snippets`）。

### 3) 在 extensions 仓库里做一次官方自检

```bash
cd extensions/vicinae-snippets
npm install
npx vici lint
npm run build
```

### 4) 提交 commit 并推送分支

```bash
cd /path/to/extensions
git add extensions/vicinae-snippets
git commit -m "Add vicinae-snippets extension"
git push -u origin add-vicinae-snippets
```

### 5) 创建 PR（Pull Request）

在 GitHub 上对 `vicinaehq/extensions` 发起 PR（base: `main`，compare: 你的 `add-vicinae-snippets` 分支），建议包含：

- **Summary**：1-3 条说明扩展做什么、解决什么问题
- **Test plan**：粘贴你运行过的命令与结果，例如：
  - `npm install`
  - `npx vici lint`
  - `npm run build`
  - `npm run self-check`
  - 以及在 Vicinae 内实际跑过的命令（Create/Search/Import/Export）

合并后会自动构建、校验并发布到商店。

## 发布硬性要求（Must）

### 1) 校验（Validation）

- 必须通过：

```bash
npx vici lint
```

> 官方说明：该校验能力从 `@vicinae/api` v0.16.0 起提供。

### 2) 目录结构（Directory Structure）

- 扩展目录名必须与 manifest 的 `name` 一致：  
  例如 `name: my-extension` → 目录必须为 `extensions/my-extension/`。

### 3) Manifest 要求（Manifest Requirements）

- 至少包含 **一个 command**
- `title` 简洁、准确表达扩展用途
- `categories` 必须填写且取值来自官方分类列表
- 依赖必须使用 `@vicinae/api`
- 避免直接使用 `@raycast/api`（可使用 `@raycast/utils`）
- 必须使用 **npm** 生成 `package-lock.json`
- 扩展与每个 command 都应提供清晰简洁的 `description`

### 4) 图标要求（Icon Requirements）

- manifest 的 `icon` 必须有效，并能映射到 `assets/` 下的文件
- 建议：1:1 比例，推荐尺寸 512x512 或更高

## 质量标准（Should）

### 错误处理（Error Handling）

- API 调用失败：要给出有帮助的错误信息
- 缺失外部依赖（CLI 等）：说明缺什么、如何安装
- 不支持环境：明确提示不可用原因
- 避免静默失败：用户能理解“为什么不工作”

### 功能边界（Functionality）

- 不要重复实现 Vicinae 已原生提供的能力

## 安全要求（Security）

### 禁止任意二进制下载

- 扩展 **不得** 从不可信来源下载二进制文件
- 例外情况（需要在 review 中能说明理由）：
  - 仅下载来自 GitHub 或其他知名站点的资源
  - 仓库本身足够知名/成熟，且不受你直接控制
  - 能明确论证必要性

> 若依赖某 CLI，请检测其是否存在，并提示用户自行安装，而不是自动下载。

## 官方分类（Categories）

```json
[
 "Applications",
 "Communication",
 "Data",
 "Documentation",
 "Design Tools",
 "Developer Tools",
 "Finance",
 "Fun",
 "Media",
 "News",
 "Productivity",
 "Security",
 "System",
 "Web",
 "Other"
]
```

## 本扩展（vicinae-snippets）自查与差距

### 当前已满足（基于本仓库现状）

- **目录结构**：`extensions/vicinae-snippets/` 与 `package.json.name = "vicinae-snippets"` 一致
- **manifest**：包含 4 个 commands（Create/Search/Import/Export），均有 `title/subtitle/description`
- **分类**：`categories = ["Productivity"]`
- **依赖**：仅使用 `@vicinae/api`（无 `@raycast/api`）
- **图标**：`assets/extension_icon.svg`，512x512，1:1
- **锁文件**：已存在 `package-lock.json`
- **自检命令**：`npm run check`（lint + build）与 `npm run self-check`（关键逻辑回归）均可用

### 待改进（建议列入发布前待办）

- （已修复）**文档质量**：`README.zh-CN.md` 的重复内容与快捷键描述不一致已修正。

## 发布前检查清单（建议 PR 前逐项勾选）

- [ ] `npm install` 成功，无额外 postinstall 下载可执行文件
- [ ] `npx vici lint` 通过
- [ ] `npm run build` 通过
- [ ] `package.json`：`title/description/categories/commands` 信息完整且清晰
- [ ] 图标位于 `assets/`，比例 1:1，建议 512x512+
- [ ] 无从非可信来源下载二进制的逻辑（含运行时下载/安装器）
- [ ] 错误处理完善：关键失败路径会 Toast/HUD 提示且可理解
- [ ] README（中英文）无明显错误、重复或过时信息

