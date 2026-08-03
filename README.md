# ERC-8350: Agent Memory State v1

面向 AI Agent 私有记忆状态转移的 ERC 社区草案与参考实现。

> Memory is the new state, but raw cognition should never be public calldata.

当前状态是 **pre-ERC community draft**。正式编号由 EIP Editors 在提交流程中分配，
仓库统一使用 `ERC-8350`，不预占数字。

## 解决什么

旧原型存在四个基础性问题：TypeScript 与 Solidity 对同一 Delta 算出不同 ID，
链上没有验证前后状态，任意 signer 可以续写同一 Space，且 relayer 可以替换未签名 URI。

v1 将它们收束成一个可互操作状态机：

```text
prevStateRoot + ExperienceDelta v1
  -> transitionId
  -> authorized commit
  -> nextStateRoot
```

核心只提交承诺，不提交原始文本、向量、偏好、策略、latent state、盐、密钥或 URI。

## v1 核心

- 唯一的 7 字段 `ExperienceDelta v1`
- 唯一的 EIP-712 `transitionId`
- 严格的 `sequence + prevStateRoot` 状态校验
- 由初始 controller 和 salt 派生的 Space ID
- `controller + authorizer` 权限模型与 nonce 轮换
- EOA、EIP-1271、多签和智能账户支持
- 签名覆盖 `locatorCommitment`，真实 locator 留在私有 witness
- 带盐或加密 payload commitment，避免直接 Hash 短文本
- Solidity/TypeScript/独立实现共用 Golden Vector

## 分层

| 层 | 目录 | 内容 |
|---|---|---|
| Core | `packages/core`, `contracts/src/reference` | Delta、Hash、状态机、Space 权限 |
| Extensions | `contracts/src/extensions` | 可选删除证据等扩展 |
| Experimental | `contracts/src/experimental` | Market、REC、认知资产实验 |
| Adapters | `packages/awareness-adapter` | Awareness 卡片和向量映射 |
| Implementations | `packages/reference-engine`, `implementations/minimal-ts` | 两套依赖隔离的链下实现 |

仓库内第二实现证明了算法不依赖 Awareness 或核心 SDK，但它仍由同一仓库维护。
在对外宣称生态采用前，还需要一个由其他团队独立维护的实现。
外部研究者已经从规范和 Sepolia 链上状态独立重算核心哈希与状态链；这解决了
`R-002` 的“无外部复现证据”问题，但不等同于完整的外部第二客户端。

## 关键文档

- `docs/interop/fixture-space.md`: Sepolia 公开 fixture Space（4 条自验证转换 + 全公开见证，供外部 conformance checker 使用）
- `docs/interop/attestation-refs.md`: 与 WYRIWE（ERC-8299）联合的 attestation_refs 互操作说明（informative，双向零依赖）
- `docs/interop/external-reproduction.md`: R-002 外部独立复现证据、固定来源与可执行验证方法
- `evidence/private-witness/README.md`: TOOL_TRACE 私有输入 → 承诺 → 授权 transition → `[2,2]` selective audit 的端到端证据
- `docs/roadmap/README.md`: 路线图（Deployed / Specified / Direction 三级诚实标注，含 ZK profile 方向）
- `docs/whitepaper.md`: Agent Memory State 白皮书（英文，ERC 配套叙事文档，含 Open Questions，参考以太坊白皮书格式）
- `docs/whitepaper.zh.md`: 白皮书中文版
- `docs/whitepaper.pdf`: 白皮书 PDF（英文，可下载 / 打印）
- `docs/whitepaper.html`: 白皮书网页版（离线单文件，双主题）
- `SPEC.md`: v1 仓库规范与 conformance 条件
- `erc/erc-8350.md`: 按 ERC 模板重写的英文草案
- `docs/architecture.md`: 架构、边界与迁移方案
- `docs/threat-model.md`: 威胁模型与上线安全门槛
- `docs/conformance.md`: 三套 Golden Vector 与 clean-checkout conformance gate
- `docs/refactor-deliverables.md`: 12 项重构交付与验收矩阵
- `docs/release-process.md`: 版本和候选发布流程
- `docs/adr/`: 关键设计决策记录
- `test-vectors/v1.json`: 跨语言 Golden Vector
- `CONTRIBUTING.md`: 协议变更和 PR 门禁

## 快速验证

需要 Node.js 22 或更高版本、pnpm 11.7.0 和 Foundry 1.7.1。

```bash
pnpm install --frozen-lockfile
pnpm check
```

从当前提交创建干净 worktree 并记录三套实现的可复现一致性结果：

```bash
pnpm conformance:clean
```

也可以分开运行：

```bash
pnpm test:ts
cd contracts && forge fmt --check && forge test
```

外部证据验证是独立的网络任务，不属于日常单元测试：

```bash
node scripts/external-reproduction-gate.mjs
```

运行只披露一个 transition 的私有 witness 端到端演示：

```bash
pnpm demo:private-witness
```

## 社区提交前还需完成

1. 在 Ethereum Magicians 发布问题定义和最小接口讨论帖。
2. 将帖子 URL 写入 ERC 草案的 `discussions-to`。
3. 确认作者列表、GitHub handle 和 champion。
4. 邀请 EIP-712、EIP-1271、AI Agent 与隐私方向研究者评审。
5. 找到第二个外部团队实现并跑通 Golden Vector。
6. 完成外部安全审计和公开测试网验证。
7. 向 `ethereum/ERCs` 提交 PR，由编辑分配正式数字。

## License

代码使用 Apache-2.0。ERC 草案文本按 EIP 流程使用 CC0。
