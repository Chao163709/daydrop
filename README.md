# 日点 · Daydrop（第六阶段）

2026-10-14 个人效率与日历改期：快捷添加可选今天、明天或暂不安排；新增待安排、逾期筛选和一键安排。今日视图仍包含未安排和逾期任务。日历任务及非重复事件均可点击「改期」选择日期，月/周视图还可拖动右侧把手到日期格。普通事件保留时长、全天事件保留天数，提醒跟随移动；重复事件通过「编辑系列」处理，不支持单次例外改期。改期保存失败保留原数据。

产品方向：服务学生和办公人群的个人使用，优先做好快速记录、明确日期和重新安排。当前功能是待验证的产品假设，不能用竞品功能代替需求验证。后续优先通过小范围试用评估首次记录耗时、次日使用情况和改期操作成功率，再决定专注计时或多设备同步的优先级；应用没有新增行为采集或账号要求。

本轮验证：任务、日历、设置、提醒、备份测试通过；日历覆盖上海和纽约时区、跨月、时长/提醒保留、写入失败回滚及重新加载。浏览器实际操作验证：新建 09:00–10:00 事件，点击改期从 10 月 14 日移到 16 日，拖动到 22 日，刷新后日期和时间保持正确。Windows 原生 WebView 的本轮鼠标交互尚未实机复测。

2026-10-11 交互优化：备份处理中禁用偏好修改、固定模式切换、隐藏和退出，防止导入期间操作冲突；选择主题、颜色、透明度或宽度时暂停自动收起，页面导航仍可用；导入预览可按 Esc 取消。备份文件名使用本地日期，避免午夜时带上前一天的 UTC 日期。保留圆球无外阴影、无背景模糊的样式。

一个用于 Windows / macOS 的桌面待办与日历浮窗。已实现项目初始化、浮窗交互、任务管理、日历、系统集成及 JSON 备份。浏览器可直接运行，Windows 可生成 EXE / MSI 安装包；macOS 尚未实机验收。

## 产品方案与外观

- 常驻形态：56px 日期圆点（64px 透明窗口），显示今日未完成数量，可拖动、吸附屏幕边缘。
- 展开形态：360–420 × 560px 桌面面板；顶部标题栏与导航，中间日期、进度、快捷输入与任务列表，底部显示保存状态。浏览器窄侧栏自动适配可用空间。
- 展开策略：悬停 300ms、点击、固定展开。移开 1 秒、失焦或 Esc 收起；编辑、快捷输入、删除确认和拖动期间暂停自动收起。
- 视觉：半透明毛玻璃、24px 圆角、细边框、柔和阴影；冷白、蓝灰文字与蓝色强调色，深色使用独立的深灰紫配色。模糊、透明度只作用于背景，文字保持清晰。
- 动画：面板淡入与轻缩放、列表增删与位置过渡、进度变化、按钮反馈；遵循系统“减少动态效果”设置。
- 外观设置：浅色 / 深色 / 跟随系统；背景不透明度 65%–98%，默认 82%。偏好自动保存。

## 技术选型

Tauri 2 / React / TypeScript / Vite / Tailwind CSS 4 / Zustand / SQLite / date-fns / Framer Motion / lucide-react。保留 shadcn/ui 源码组件基础（Radix Slot、CVA、clsx、tailwind-merge）。

Tauri 负责原生窗口和 SQLite，React 负责视图，Zustand 管理界面与任务状态。使用同一个任务仓储接口：桌面版写 SQLite，浏览器预览写本机 localStorage。两种运行环境的数据相互独立；底部明确显示当前存储方式。

## 安装、运行与验证

第五阶段新增官方开机自启、通知绑定；原生依赖已写入 Cargo.toml。项目使用锁文件安装：

```powershell
cd D:\Codex\ToDo
npm ci
npm run dev
```

浏览器访问 http://127.0.0.1:1420/ 。

```powershell
# TypeScript 检查与生产构建
npm run build
# 任务与 SQLite 验证（测试脚本需要 Node.js 24+）
npm test
# 原生桌面运行
npm run tauri -- dev
# 生成桌面安装包
npm run tauri -- build
```

桌面运行需要 Rust stable 1.90 或更新版本；Windows 使用 MSVC 工具链、Visual Studio C++ 构建工具与 WebView2，macOS 需要 Xcode 开发工具。依据 [Tauri 官方前置环境说明](https://v2.tauri.app/start/prerequisites/) 准备。

本阶段已从 Rust 官方来源安装 Rust 1.99.0，工具链和缓存位于 D:\Codex\rustup、D:\Codex\cargo；没有修改系统 PATH。MSVC 与 WebView2 已由 Tauri 环境检查确认。`npm run tauri -- dev` 和 `npm run tauri -- build` 已统一经过包装脚本，只为子进程设置工具路径，避免终端找不到 Cargo。下面的命令也是等价入口：

```powershell
npm run desktop:dev
npm run desktop:build
npm run desktop:test
```

已有日点 1420 预览服务时，desktop:dev 会复用它，不重复启动占用同一端口的服务。无服务时由 Tauri 启动 Vite。其他电脑仍需按官方说明准备原生环境。

## 项目结构与完整代码入口

```text
src/
  App.tsx                         主面板、圆点、导航、设置和存储状态
  main.tsx                        React 启动
  styles.css                      毛玻璃、主题、动画、任务与表单样式
  types.ts                        Task / CalendarEvent / Settings
  components/
    TaskPane.tsx                  快捷添加、列表、分类、搜索、排序、删除确认
    TaskEditor.tsx                完整任务详情编辑与键盘焦点管理
    CalendarPane.tsx              月 / 周 / 日、当天安排与指针拖拽改期
    EventEditor.tsx               事件表单、全天日期、颜色与重复系列
    ui/button.tsx                 shadcn 风格源码组件
  hooks/
    useAppearance.ts              系统主题监听与背景不透明度
    useFloatingWindow.ts          展开收起、拖动、动态尺寸、吸附与多屏工作区
  lib/
    database.ts                   SQLite 初始化与环境识别
    geometry.ts                   工作区限制、屏幕边缘吸附
    tasks.ts                      验证、日期分类、过滤排序、重复任务生成
    taskSql.ts                    数据库映射与原子批量写入
    taskRepository.ts             SQLite / 浏览器本地存储仓储
    calendar.ts                   日历范围、重复事件、日期边界与任务改期
    eventRepository.ts            事件 SQLite 映射与浏览器仓储
    utils.ts                      className 合并
  store/
    useAppStore.ts                导航状态
    useWidgetStore.ts             浮窗与外观偏好
    useTaskStore.ts                任务状态、串行写入、失败恢复
    useEventStore.ts               事件状态与持久化
scripts/
  test-tasks.mjs                   任务行为、SQLite 与持久化测试
  test-calendar.mjs                日历、事件、改期和两个时区测试
src-tauri/
  Cargo.toml / build.rs            Rust 依赖与构建入口
  tauri.conf.json                 原生窗口与构建配置
  capabilities/default.json       主窗口权限
  src/main.rs / src/lib.rs         桌面入口、SQL 插件与迁移注册
  migrations/
    001_initial.sql               tasks / events / settings 建表
    002_task_history.sql          完成时间、重复任务来源与唯一索引
```

以上文件均为可运行的完整源码，可直接在项目中打开；不需要再拼接代码片段。

## 数据库表

| 表 | 字段与约定 |
| --- | --- |
| tasks | id、title、note、due_at、remind_at、priority、tags、subtasks、repeat、completed、archived、completed_at、repeat_source_id、created_at、updated_at、sort_order |
| events | id、title、start_at、end_at、all_day、color、location、note、repeat、remind_at |
| settings | key（主键）、value（JSON 字符串） |

标签和子任务存储为 JSON 文本，布尔值为 0 / 1。时间使用 UTC ISO 8601，界面按本地时间显示。数据库文件由 SQL 插件保存在应用配置目录，名为 daydrop.db，启动时执行版本化迁移，已有设置不被覆盖。参见 [Tauri SQL 插件](https://v2.tauri.app/plugin/sql/)。

浮窗与外观偏好已统一接入 settings 表；旧版 localStorage 偏好首次启动时迁移。任务在原生桌面环境使用 SQLite。日历事件在桌面版写入 events 表，浏览器预览使用独立的本地存储。

## 第二阶段：桌面浮窗

无边框、透明背景、始终置顶、跳过任务栏；窗口可动态调整尺寸。保持当前位置展开，靠边时向屏幕内移动，使用显示器 workArea 排除任务栏 / Dock，并按 scaleFactor 换算物理坐标。窗口更新串行执行，收起动画完成后再缩小原生窗口。

拖动阈值为 5px，避免点击误触；固定展开模式暂停离开 / 失焦收起，Esc 与收起按钮仍可使用。标题栏提供隐藏到托盘按钮；关闭窗口也隐藏到托盘，明确退出在托盘菜单或设置页完成。macOS 透明窗口使用 macOSPrivateApi，发布时需按分发渠道评估。

已验证浏览器展开收起、悬停、失焦、固定展开、拖动与吸附，以及负坐标显示器和工作区边界的几何逻辑。Windows 已编译并启动，窗口拖动、吸附和多屏仍需实机交互验收。窗口实现依据 [Tauri 窗口定制文档](https://v2.tauri.app/learn/window-customization/)。

## 第三阶段：任务管理

- 快捷添加；完整添加 / 编辑 / 删除；完成 / 取消完成；归档 / 恢复。
- 标题、备注、截止时间、提醒时间、优先级、标签、子任务、重复规则全部可编辑。
- 今日包含未完成的无截止任务、今日截止和逾期任务，以及今天完成的记录；归档任务不计入今日进度。
- 全部页提供待办、未来 7 天即将到期、已完成、已归档。支持标题 / 备注 / 标签搜索与优先级筛选，按手动 / 截止时间 / 优先级 / 最近添加排序。
- 手动排序支持拖动把手，也支持把手聚焦后使用上下方向键。筛选或搜索时暂停手动排序。
- 日 / 周 / 月重复任务在完成时生成下一条未来任务，重置子任务完成状态；同一来源只生成一次，取消再完成不会重复生成。
- 提醒时间已持久化；系统通知在第五阶段启用。
- 写入成功后才更新界面；失败时保留原状态并显示错误。完成与重复任务生成使用单条 SQL 原子写入，避免只保存一半。
- 编辑表单支持 Escape 取消、Tab 焦点约束、关闭后恢复焦点；删除前有明确确认提示。

第三阶段不需要新增安装命令，使用上面的 npm ci / npm run dev / npm run build / npm test 即可。

## 本次验收结果与后续阶段

- TypeScript 检查和 Vite 生产构建通过。
- npm test 通过：输入验证、本地日期分类、搜索筛选、重复规则、SQLite 两个迁移与读写映射、原子写入回滚、保存失败恢复、重新加载持久化、排序、完成、归档、删除、浏览器仓储。
- 浏览器验证快捷添加、详情编辑、刷新恢复、完成与进度、搜索空结果、标签搜索、优先级筛选、归档和删除确认取消。
- 桌面尺寸 1280 × 800 预览下，面板保持 420 × 560；深色主题、半透明背景、34px 模糊和 24px 圆角正常。
- 第五阶段新增 Windows 原生编译和 SQLite 启动核对；原生交互验收范围见第五阶段。

第四阶段已完成，详见下方说明。第五阶段系统集成代码已实现，详见下方说明。第六阶段：JSON 导入导出、强调色 / 大小和剩余体验优化。深浅主题与背景不透明度已提前完成。

## 第四阶段：日历与事件

浅色主题恢复原蓝色 #5279D8、文字 #27334A 和冷白 #F6F9FF，浏览器背景同步去掉紫色。深色配色保持独立。

### 功能与交互

- 月视图以周一为每周开始，只显示当月所需的 4–6 周。日期格显示任务数量、彩色事件标题与其他事件数量，点击查看当天详情。
- 周视图显示七天日期及每天的安排；日视图显示全天事件、带时间的事件和任务。支持前后翻页与回到今天。
- 在选中日期直接添加任务或事件。任务可以完成和编辑；事件可以添加、编辑、删除，保存标题、开始 / 结束、全天、颜色、地点、备注、重复和提醒。
- 工作 / 生活 / 学习 / 重要四种预设颜色，以及自定义颜色。日 / 周 / 月重复事件按系列显示；编辑或删除重复事件前明确提示影响整个系列。
- 未安排日期的任务单独列出。按住任务右侧把手，拖到日期格或某一天的安排区即可改期；采用指针捕获，不依赖 WebView 的原生 HTML 拖放。
- 已有截止时间的任务保留时分，关联提醒保留相对截止时间的间隔；无截止日期的任务安排到当天结束。写入失败时保留原截止日期。
- 全天事件使用本地 YYYY-MM-DD 日期与不包含结束日的范围；界面结束日期“含当天”。跨日事件会出现在经过的每一天，不重复计入恰好结束于午夜的下一天。
- 月末重复从原始日期计算，例如 1 月 31 日 → 2 月 28 日 → 3 月 31 日。跨夏令时保留本地时间；时钟回拨造成结束时间倒置时保留原时长。
- 事件提醒时间已保存，系统通知在第五阶段接入。

### 安装与运行

没有新增依赖或迁移；沿用第一阶段的 events 表。

```powershell
cd D:\Codex\ToDo
npm ci
npm run dev
npm run build
npm test
# 配好 Rust / C++ / WebView2 后运行桌面版
npm run tauri -- dev
```

关键文件的完整代码见项目中的 CalendarPane.tsx、EventEditor.tsx、calendar.ts、eventRepository.ts、useEventStore.ts，以及新增 reschedule 操作的 useTaskStore.ts。

### 验证范围

- 前端构建与任务测试通过；日历测试覆盖输入验证、4–6 周月历、周 / 日范围、全天结束边界、跨日、月末重复、夏令时、任务截止与提醒改期、事件 SQLite 读写、失败恢复和重新加载持久化。
- 日历测试分别在 Asia/Shanghai 与 America/New_York 运行。
- 使用独立的 1421 预览验收事件添加 / 编辑、颜色分类、每周重复、全天跨日、月 / 周 / 日切换、拖动未安排任务、带时间与提醒的任务再次改期，以及刷新恢复。测试记录与常用 1420 预览数据独立。
- 事件删除仓储与状态操作通过测试；浏览器验收删除确认与取消。
- 第五阶段已验证原生程序启动、数据库迁移和设置初始化；日历的原生指针交互尚未实机验收。


## 第五阶段：设置与系统集成

### 已实现的行为

- 设置页分为浮窗与外观、桌面与启动、提醒；沿用浅色蓝色毛玻璃和独立深色配色。浏览器预览明确标出并禁用系统功能，避免显示虚假的系统状态。
- 设置统一保存在 SQLite 的 settings 表 preferences JSON 中。旧版 localStorage 浮窗偏好只迁移一次，之后以数据库为准；浏览器预览使用独立的 daydrop-settings-v2。保留原始旧偏好作为迁移来源，不覆盖损坏数据。
- 修改串行执行，原生操作与保存都成功后更新 UI；保存失败时恢复原生设置。置顶失败、快捷键冲突、启动项读写失败都会显示错误。
- Rust 创建常驻托盘，菜单提供显示浮窗、隐藏到托盘、今日任务、退出日点；左键唤回。窗口关闭隐藏而不退出；任务编辑内容留在页面中。托盘“今日任务”不会打断正在进行的编辑。
- 默认全局快捷键 Alt+Space 唤回浮窗，可在设置里修改，支持字母、数字、Space、F1–F24 及 Control / Alt / Shift / Super / CommandOrControl 修饰键。先注册新键，再释放旧键；冲突时保留旧键。注册失败后可点“应用”重试。
- 开机自启使用官方插件，macOS 使用 LaunchAgent。启动时读取插件报告的启动项注册状态，尊重外部注销，不自动重新注册。操作系统单独禁用已注册启动项时，请同时检查系统启动项设置。
- 单实例插件避免登录启动与手动启动同时创建两套浮窗、托盘和提醒。
- 任务和事件提醒统一生成滚动 32 天队列，每分钟、数据改变和恢复焦点时更新；原生后台每 5 秒检查到期，隐藏到托盘后不依赖页面计时器。原生后台每小时请求刷新队列。
- 未完成且未归档的任务可以提醒；事件按每次重复发生时间推算提醒，保持相对开始时间的间隔。完成、归档、删除、改期之后重新提交队列。
- 启动或休眠恢复补发最近 24 小时内的提醒；更旧提醒忽略。同一轮多条提醒合并为一条通知，避免连续弹窗。
- 发送记录在应用数据目录 reminder-deliveries.json 原子写入，保留 30 天。同一任务 / 事件发生时间 / 提醒时间不重复发送；更改提醒时间产生新记录。记录损坏时保留文件并暂停发送，不清空后重复通知。
- 发送前保存记录，正常发送失败会恢复记录并重试；如果恰好在保存记录后、通知显示前崩溃，该次提醒可能漏发，这是避免重启重复提醒的取舍。
- 设置提供提醒开关、测试通知和明确退出确认。隐藏继续提醒，退出后停止；没有配置系统级计划任务，应用完全退出期间不会发送通知。

### 安装与运行命令

```powershell
cd D:\Codex\ToDo
# 推荐：安装锁定的完整前端依赖
npm ci
# 本阶段新增依赖的单独安装命令
npm install @tauri-apps/plugin-autostart @tauri-apps/plugin-notification
npm run dev
npm run build
npm test
# 配好 Rust 1.90+、Windows C++ / WebView2 或 macOS Xcode 后
npm run tauri -- dev
npm run tauri -- build
# 原生提醒边界与原子记录测试（需上述原生构建环境）
npm run desktop:test
```

Windows 通知应安装生成的桌面包后验收；开发模式可能使用 PowerShell 的名称和图标，依据 [Tauri 通知说明](https://v2.tauri.app/plugin/notification/)。Windows 自带 Alt+Space 可能发生快捷键竞争，可在设置改为 Control+Shift+D。macOS 可使用 CommandOrControl+Shift+D。

### 关键文件完整代码

所有实现都保存在项目中，可直接编辑运行：

```text
src/components/SettingsPane.tsx         设置页、系统状态、通知测试、退出确认
src/store/useSettingsStore.ts           串行保存、实际启动项状态、失败恢复
src/store/useWidgetStore.ts             窗口临时状态，不再另存一套偏好
src/lib/settings.ts                     设置验证、快捷键规范化、旧偏好迁移
src/lib/settingsRepository.ts           SQLite / 浏览器设置仓储
src/lib/desktop.ts                      官方插件与原生命令适配
src/lib/reminders.ts                    任务和事件重复提醒队列
src/hooks/useDesktopIntegration.ts      托盘事件、唤回、队列刷新与错误显示
src-tauri/src/desktop.rs                原生托盘、关闭隐藏、快捷键、通知测试
src-tauri/src/reminders.rs              原生后台发送与持久化记录、Rust 单元测试
src-tauri/src/lib.rs                    插件注册、命令与初始化
src-tauri/Cargo.toml                    原生依赖与最低 Rust 版本
src-tauri/capabilities/default.json     所需最小权限
scripts/test-desktop.mjs                设置与提醒逻辑验证
```

### 验证与限制

前端 TypeScript / Vite 构建、任务 / 日历 / 设置 / 提醒逻辑测试通过。新增测试覆盖旧设置迁移不重复、SQLite 保存、刷新恢复、并发修改、原生适配器失败回滚、快捷键失败重试、启动项注册状态同步、提醒边界、月末 / 全天 / 重复事件、完成与归档排除、改期及重启去重。

浏览器独立预览验证浅色、深色、偏好刷新恢复及原生控件禁用说明。Windows 已通过原生编译和两项 Rust 提醒测试：到期/补发边界与发送记录的重复原子写入。桌面程序已启动核对，SQLite 的两个迁移均成功，tasks / events / settings 表已建立，设置保存为 schemaVersion 2。实际托盘操作、全局快捷键冲突、登录自启动和通知投递尚未逐项实机验收；macOS 尚未实机验收。

原生实现参照 [系统托盘](https://v2.tauri.app/learn/system-tray/)、[全局快捷键](https://v2.tauri.app/plugin/global-shortcut/)、[开机自启](https://v2.tauri.app/plugin/autostart/)、[通知](https://v2.tauri.app/plugin/notification/)、[单实例](https://v2.tauri.app/plugin/single-instance/) 官方文档。


### Windows 开发版程序

已生成嵌入前端页面的独立程序，无需浏览器或 Vite 服务：

D:\Chatgpt\Daydrop-第五阶段\Windows-20261010-112708\Daydrop.exe

双击启动后显示日期圆点，悬停或点击展开。标题栏隐藏到托盘；明确退出位于托盘菜单或设置页。此版本是开发构建，尚未生成正式安装包。源码中的可重复构建命令：

```powershell
npm run desktop:build -- --debug --no-bundle
```

程序使用标准应用目录保存数据，Windows 为 %APPDATA%\com.daydrop.desktop；浏览器预览的数据与桌面版独立。JSON 导入导出已在第六阶段实现。

## 第六阶段：备份与外观

- 设置页导出 JSON：包含任务（含完成、归档、子任务、重复关联）、日程与设置；格式为 `daydrop-backup`，版本 1。桌面版使用系统保存对话框，浏览器使用下载。
- 导入前校验格式、版本、重复 ID、时间和完整字段，限制 20 MB、每类最多 10000 条。显示条目预览，经确认后合并；同 ID 保留当前记录，重复导入不增加副本。
- 桌面任务与事件在同一 SQLite 事务中导入，任何写入失败全部回滚。浏览器用恢复日志处理失败或导入时中断，下次加载恢复原数据。
- 默认保留本机偏好；可勾选恢复备份的主题、强调色、透明度、宽度。自启、快捷键和通知开关保持当前设置，不自动应用备份中的系统设置。
- 宽度 360–420px 实际影响窗口尺寸；强调色实际影响主题，默认保留浅色蓝色与深色独立配色。支持恢复默认外观参数、键盘焦点提示和减少动态效果。
- `src/lib/sync.ts` 预留云同步提供者接口，目前只使用本地存储。

新增依赖：`npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs`；Rust 依赖由 Cargo 管理（dialog、fs、sqlx）。新机器可 `npm ci` 后运行 `npm run tauri -- dev`；打包 `npm run tauri -- build`；验证 `npm test` 和 `npm run desktop:test`。

关键完整源码：`src/lib/backup.ts`（格式与验证）、`src/components/BackupPane.tsx`（导入导出）、`src-tauri/src/backup.rs`（事务）、`src/components/SettingsPane.tsx`、`src/hooks/useAppearance.ts`、`src/hooks/useFloatingWindow.ts`；文件权限配置在 `src-tauri/capabilities/default.json`。

第六阶段已通过 TypeScript / Vite 构建、全部前端逻辑测试和 3 项原生测试，完整 release 构建成功生成 MSI / EXE 安装包。新增测试覆盖损坏 JSON、字段校验、重复 ID、保留当前记录、浏览器写入失败与中断恢复、全天日期和原生跨表回滚。用户按 Esc 停止桌面自动化，系统文件对话框读写和完整导入导出操作尚未实机验收；macOS 仍待实测。

### Windows 打包工具缓存

`bundle.useLocalToolsDir` 已启用，WiX 3.14.1、NSIS 3.11 与 Tauri NSIS 插件缓存位于 `src-tauri/target/.tauri/`，保持工具位于 D 盘。当前网络直连 GitHub 发布下载地址会超时，已通过官方 GitHub Release Assets API 下载并核对 Tauri 要求的哈希值。缓存完整时，打包不再下载这些工具；删除 `target` 目录会同时删除缓存，下一次打包需要重新下载。

完整编译并生成安装包：`npm run tauri -- build`。已经编译后仅重新生成安装包：`npm run tauri -- bundle`。输出目录为 `src-tauri/target/release/bundle/msi/` 和 `src-tauri/target/release/bundle/nsis/`。

2026-10-10 已验证完整构建退出码为 0，生成 MSI（4,775,936 字节）和 EXE 安装包（3,329,975 字节）。安装包已复制到 `D:\Chatgpt\Daydrop-第五阶段\安装包-20261010-123748\`，复制前后 SHA256 一致。此前的独立程序仍为开发版；本目录内为 release 构建安装包。安装及系统集成功能的逐项验收仍待实机验证。
