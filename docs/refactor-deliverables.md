# v1 重构交付矩阵

本表是团队验收入口。`代码完成` 表示仓库内已有实现和自动化测试，
不代表 ERC 已获社区接受或合约已经过外部安全审计。

| 重构工作 | 状态 | 主要产出 | 验证入口 |
|---|---|---|---|
| 统一 Delta 定义 | 代码完成 | 七字段 `ExperienceDelta v1` | `SPEC.md`、`packages/core/src/types.ts`、`IAgentMemoryState.sol` |
| 统一 Hash 算法 | 代码完成 | 唯一 `transitionId = hashStruct(ExperienceDelta)` | `packages/core/src/delta.ts`、Registry、Golden Vector |
| 重建状态机 | 代码完成 | `prevStateRoot -> Delta -> nextStateRoot` 与严格 sequence | Registry 单测和 invariant 测试 |
| 建立 Space 控制权 | 代码完成 | controller 派生 Space ID，controller/authorizer 与轮换 nonce | `AgentMemoryStateRegistry.t.sol` |
| 修复 Relayer 篡改 | 代码完成 | 签名覆盖 `locatorCommitment`，原始 locator 只进私有 witness | relayer 篡改回归测试 |
| 加强隐私承诺 | 代码完成 | 域隔离 salted commitment 与 encrypted-payload profile | Core commitment、`PrivateCommitment.sol`、威胁模型 |
| 支持合约钱包 | 代码完成 | EOA、EIP-1271、多签和智能账户授权路径 | Mock ERC-1271 单测 |
| 拆分协议与产品 | 代码完成 | Core、Extensions、Experimental、Adapters 四层 | `docs/architecture.md` 与目录结构 |
| 建立互操作测试 | 代码完成 | Solidity、核心 TS、隔离 TS 直接读取同一份 `test-vectors/v1.json` | `pnpm conformance:clean`、JSON/Markdown 结果记录 |
| 修复工程流程 | 代码完成 | pnpm frozen lock、固定 Foundry 依赖、clean-checkout gate、CI、候选发布包 | `pnpm conformance:clean`、`pnpm release:check`、GitHub workflows |
| 重写 ERC 文档 | 草案完成 | 符合模板结构的 `ERC-XXXX` 英文草案 | `erc/erc-xxxx-agent-memory-state.md` |
| 建立外部实现 | 技术接口完成 | Awareness adapter 与不依赖 Core SDK 的第二 TS 实现 | `packages/awareness-adapter`、`implementations/minimal-ts` |

## 尚需外部动作

1. 发布 Ethereum Magicians 讨论帖并替换 `discussions-to` 占位 URL。
2. 确认作者和 champion 后向 `ethereum/ERCs` 提交，正式编号由编辑分配。
3. `R-002`“无外部独立复现证据”已解决：两个外部仓库的固定提交可分别重放
   Sepolia 状态链和重算跨 ERC 组合，见 `docs/interop/external-reproduction.md`。
4. 邀请另一个组织维护完整第三方实现并直接运行 Golden Vector。仓库内的隔离实现证明
   技术独立性，但不能被描述成外部生态采用。
5. 在公开测试网验证事件、索引器和钱包流程，并完成外部安全审计。
