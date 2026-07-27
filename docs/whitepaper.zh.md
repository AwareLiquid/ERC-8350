# Awareness 白皮书

## 一个去中心化的智能体记忆状态协议

### Agent Memory State — A Next-Generation Protocol for Verifiable, Private AI Memory

> **Memory is the new state, but raw cognition should never be public calldata.**
> 记忆是新的状态，但原始认知永远不该成为公开的调用数据。

- **规范配套：** ERC-8337（Agent Memory State Registry），`erc/erc-8337.md`
- **作者：** Everest An¹\*、XiaoHai¹、Luo¹、Eric¹ —— ¹ Awareness（https://awareness.market ）· \* 通讯：[@everest-an](https://github.com/everest-an)
- **讨论：** https://ethereum-magicians.org/t/agent-memory-state/29098
- **状态：** ERC-8337 Draft —— 已提交上游（[ethereum/ERCs#1910](https://github.com/ethereum/ERCs/pull/1910)），Sepolia 部署已上线
- **参考发布：** `1.0.0-alpha.1`（2026-07-14）
- **许可：** CC0（见 `erc/LICENSE.md`）

> 本白皮书是规范（ERC）的**互补叙事文档**：ERC 给出精确的 `MUST`/`MUST NOT`、哈希与测试向量；本文讲"为什么、是什么"的大图景与设计理由，面向 Ethereum Magicians 读者，并在结尾以 Open Questions 召集讨论。

---

## 摘要（Abstract）

比特币向世界证明了：在没有可信第三方的前提下，一个去中心化的账本可以就"谁拥有什么"达成共识。以太坊将这一思想推广为一台通用的**状态转换机器**——任何可计算的状态，都能以确定性的方式在无需信任的网络上被验证和推进。

十余年后，计算的主体正在从"人调用合约"转向"智能体自主行动"。一个 AI 智能体的价值，越来越不取决于它某一时刻的推理，而取决于它**跨越时间积累的记忆**：它记住了什么、从谁那里学到、如何演化偏好与技能。记忆，成为了智能体真正的"状态"。

然而智能体记忆有一对看似不可调和的诉求：它必须**可验证、可携带、可交易、可追溯**（否则无法在多方之间建立信任、无法沉淀为资产），同时它又**高度私密**（原始文本、向量、偏好、策略、密钥绝不能公开上链）。现有的智能体记忆原型在这两点上全面失败：跨语言实现算出不一致的哈希、链上没有任何合法性校验、任意签名者都能续写同一空间、中继者可以替换未签名的资源地址。

**Awareness** 提出的 **Agent Memory State v1** 协议解决了这对矛盾。它不把记忆本身放上链，而只承诺记忆状态转换的**密码学证明**：

```
prevStateRoot + ExperienceDelta v1  →  transitionId  →  authorized commit  →  nextStateRoot
```

链上永远只见到 32 字节的承诺（commitment）与状态根（state root），而原始认知——文本、向量、偏好、潜在状态、盐值、密钥、资源定位符——**始终作为私有见证保留在链下**。任何实现（Solidity、TypeScript、独立客户端）对同一个经验增量都会算出**逐位相同**的 `transitionId`，从而在异构生态中建立起可互操作、可审计、隐私优先的智能体记忆信任层。

本白皮书阐述该协议的动机、设计哲学、核心状态机、威胁模型，以及其上可以生长出的应用生态——从记忆删除证明，到认知资产市场。

---

## 1. 引言：从"状态"到"记忆状态"

### 1.1 历史：区块链作为状态转换系统

从技术角度看，区块链的账本可以被理解为一个**状态转换系统（state transition system）**：存在一个"状态"（记录所有账户的余额与所有权），以及一个"状态转换函数"，它接受当前状态与一笔交易，输出新的状态：

```
APPLY(S, TX) -> S'   （若交易非法则返回 ERROR）
```

比特币的状态是全部未花费交易输出（UTXO）的集合；以太坊将其推广为账户与合约存储的集合，并让状态转换函数变得图灵完备。这一范式的力量在于：**任何人都可以独立地重放交易历史，验证当前状态的合法性，而无需信任任何单一方**。状态的每一次推进都是确定性的、可验证的、防篡改的。

区块链真正的创新，不是"记账"，而是把"什么是合法的下一个状态"这件事，从某个中心权威手里，转移到了一套所有人都能独立执行的确定性规则上。

### 1.2 智能体时代的新问题：记忆即状态

大型语言模型与自主智能体的兴起，引入了一类新的、区块链从未处理过的"状态"——**认知状态（cognitive state）**，或者更朴素地说，**记忆**。

一个有价值的智能体不是无状态的函数。它会：

- 记住与特定用户的历次交互，形成个性化偏好；
- 从一次次任务中提炼出可复用的技能（skill）与工作流；
- 积累领域知识，沉淀为可检索的知识卡片；
- 随时间演化其世界模型与策略。

这些记忆构成了智能体的**身份与资产**。一个记住了你三年习惯的助理，和一个刚初始化的空白模型，是两个完全不同的经济实体。记忆，就是智能体的"链上余额"——它决定了这个智能体值多少钱、能被谁信任、可以卖给谁。

但今天，智能体记忆存在于孤立的、不可验证的黑箱里：

- 你无法向第三方**证明**你的智能体确实拥有某段学习历史，而没有事后篡改；
- 你无法在不泄露隐私的前提下，把一段记忆**携带**到另一个平台或**转让**给另一个主体；
- 你无法**审计**一段记忆是何时、由谁、以何种顺序写入的；
- 多个协作的智能体之间，无法就"共享记忆的当前状态"达成无需信任的共识。

换言之：**记忆已经成为智能体最重要的状态，但我们还没有一个像区块链之于金融那样的、可验证的记忆状态层。**

### 1.3 核心命题

Awareness 的全部设计围绕一句话展开：

> **Memory is the new state, but raw cognition should never be public calldata.**

前半句是机会：如果我们能把智能体记忆变成一个可验证的状态机，就能为整个智能体经济建立信任基础设施。

后半句是约束：与金融账本不同，记忆的内容本身是**极度敏感的私有数据**。把一个人偏好、一个企业的知识库、一个智能体的策略权重公开上链，是灾难性的隐私泄露。因此，任何可行的方案都**不能把原始认知放进公开的交易数据里**。

协议的巧妙之处，正是在于把这两句话同时满足：**上链的是"发生了一次合法的、有序的、被授权的记忆状态转换"这一事实的密码学证明，而不是记忆的内容。**

### 1.4 现有原型的四个致命缺陷

Agent Memory State v1 是对早期原型四个基础性失败的直接回应：

1. **跨语言不一致（Cross-language inconsistency）**：TypeScript 与 Solidity 实现对同一个 Delta 对象算出不同的 ID。没有确定性哈希，就没有互操作性——不同实现根本无法就"这是同一次转换"达成一致。
2. **缺乏链上验证（Lack of on-chain validation）**：没有任何机制验证一次状态转换是否合法，链上退化为一个不设防的留言板。
3. **授权漏洞（Authorization gaps）**：任意签名者都能继续向同一个记忆空间写入，空间的所有权形同虚设。
4. **中继篡改（Relay vulnerability）**：中继者（relayer）可以替换未被签名覆盖的资源定位符（URI），把用户的记忆指向恶意内容。

这里必须把"什么是新的"说准确，因为最直观的那个理解是错的。**"提交摘要而不是数据本身"并不新颖**——ERC-8004、ERC-7857、ERC-8257、ERC-8273、ERC-8299 以及 EAS 全都在提交不透明摘要。§1.3 的那句命题陈述的是设计**必须满足的约束**，它不是本协议的贡献。

真正未解的问题在上一层：**没有任何规范规定，一次承诺必须与它前面那次承诺构成什么关系。** 锚定（anchoring）已经被充分覆盖，**定序（sequencing）没有**。一个已发布的锚点，无法确立它是前一状态的唯一后继，无法确立中间没有被跳过或悄悄回滚，也无法确立它所指向的引用确实被签名覆盖。缺了这些规则，一段记忆历史只是一袋哈希，不是一条轨迹。

v1 把这四个问题统一收敛进**单一的、可互操作的状态机**中，用确定性哈希、严格的序列与状态根校验、明确的控制者/授权者模型、以及"签名必须覆盖全部字段（包括定位符承诺）"的规则，逐一堵死。具体而言，强制 `sequence == current + 1` 与 `prevStateRoot == currentStateRoot` 这两条，正是让第三方能够察觉以下情形的依据：运营方悄悄把空间回滚到较早的记忆状态再向前重放；同一身份下并行生长出两条互相矛盾的历史；记录中存在被丢弃的转换所留下的缺口；中继者替换了本应被签名覆盖的定位符。**扁平锚点无法把上述任何一种与正常运行区分开。**

---

## 2. 设计哲学与目标

在展开协议细节之前，先明确指导整个设计的几条原则。它们互相约束，共同定义了"什么是一个正确的实现"。

### 2.1 隐私优先：只承诺，不暴露

链上**永远不出现**以下任何一项的明文：原始文本、向量嵌入、用户偏好、策略、潜在状态、盐值、密钥、资源定位符（URI）。上链的只有对它们的**承诺（commitment）**——通常是加盐或加密后的 `keccak256` 哈希。承诺具有绑定性（无法事后抵赖内容）与隐藏性（无法从承诺反推内容）。

这条原则不是可选的功能，而是**一致性要求**：一个把原始认知放进公开 calldata 的实现，按定义就不符合本协议。

### 2.2 确定性：跨实现逐位一致

同一个 `ExperienceDelta`，无论用 Solidity、TypeScript 还是任何独立客户端计算，都必须产出**逐位相同**的 `transitionId`。这通过固定的类型字符串、固定的 ABI 编码方式、以及一组"黄金测试向量"（Golden Vectors，`test-vectors/v1.json`）来保证。任何实现都必须通过这组向量才算合格。

### 2.3 授权：所有权是密码学事实

一个记忆空间的写入权，不是靠"谁先来"或"谁有签名"，而是密码学地绑定到其**初始控制者（initial controller）**。空间 ID 由控制者地址与盐值派生而来，使得对命名空间的主张"在密码学上专属于其初始控制者"。后续每一次写入都必须获得当前授权者的批准。

### 2.4 兼容一切签名主体

协议不假设写入者是一个简单的外部账户（EOA）。它原生支持：非可延展的 ECDSA（EOA）、EIP-1271（智能合约账户、多签、抽象账户）、以及来自控制者的直接调用（空签名）。这让协议能服务于从个人钱包到 DAO 到企业多签的全谱系主体。

### 2.5 抗攻击的承诺

对短文本或低熵内容的承诺，容易被暴力枚举反推。协议要求承诺**加盐或加密**，以抵抗"短文本攻击"。真实的资源定位符作为**私有见证**保留，链上只留 `locatorCommitment`。

---

## 3. 协议核心：Agent Memory State v1

本章是白皮书的技术核心。我们采用与以太坊白皮书相同的叙事策略：先建立"账户"，再定义"交易"，然后给出"状态转换函数"，最后说明"授权与共识"。为便于类比，下表先给出对照：

| 以太坊 | Agent Memory State | 含义 |
|---|---|---|
| 账户（Account） | 记忆空间（MemorySpace） | 状态的容器与身份 |
| 交易（Transaction） | 经验增量（ExperienceDelta） | 推进状态的原子操作 |
| 状态根（State Root） | 记忆状态根（stateRoot） | 当前状态的密码学摘要 |
| 交易哈希（Tx Hash） | 转换 ID（transitionId） | 一次操作的唯一标识 |
| nonce / 顺序 | sequence | 防重放、保序 |
| 签名（ECDSA/1271） | 授权（authorizer + EIP-712） | 谁有权推进状态 |

关键区别在于：以太坊的状态转换会把"转了多少钱"写进公开状态；而 Agent Memory State 只写"发生了一次合法转换"的证明，**内容本身留在链下**。

### 3.1 记忆空间（MemorySpace）——身份与容器

一个记忆空间是一段记忆历史的容器，类比以太坊的账户。它的身份不是随意分配的地址，而是从**初始控制者**与一个**盐值**确定性派生的：

```solidity
MEMORY_SPACE_TYPE = "MemorySpace(address initialController,bytes32 salt)"

spaceId = keccak256(abi.encode(
    keccak256(bytes(MEMORY_SPACE_TYPE)),
    initialController,
    salt
))
```

这样，"我要创建这个命名空间"的主张在密码学上专属于 `initialController`——没有对应私钥的人无法伪造出指向该控制者的 `spaceId`。盐值则允许同一控制者创建多个互不关联的空间。

每个空间维护一个"头部（head）"，记录它当前的 `sequence`（已写入的最新序号）与 `stateRoot`（当前记忆状态根）。空间的权限采用**控制者 + 授权者（controller + authorizer）**模型，并支持 nonce 轮换以撤销旧授权。

### 3.2 经验增量（ExperienceDelta）——推进状态的原子操作

一次记忆的演化——学到一个新偏好、提炼一个新技能、修正一段旧知识——被抽象为一个**经验增量**。这是协议的规范结构，恰好包含七个字段，**不多不少**：

```solidity
struct ExperienceDelta {
    bytes32 spaceId;              // 属于哪个记忆空间
    uint64  sequence;            // 在该空间中的序号（严格递增）
    bytes32 prevStateRoot;       // 转换前的状态根（链接到历史）
    bytes32 deltaCommitment;     // 对"变化内容"的承诺
    bytes32 provenanceCommitment;// 对"来源/出处"的承诺
    bytes32 profileId;           // 画像/主体标识
    bytes32 locatorCommitment;   // 对"资源定位符"的承诺
}
```

设计上极为克制。规范**明确排除**了以下字段进入 `transitionId`：作者、时间戳、原始 URI、记忆类型枚举、前一个 delta 的引用、以及分离的输入/推理字段。理由是：每多一个进入哈希的字段，就多一个跨实现不一致的风险面，也多一个信息泄露的通道。七个字段是"既足以表达一次有意义的、可授权的、可追溯的状态转换，又不泄露任何认知内容"的最小集合。

三个承诺字段承担了"隐私优先"的全部重量：

- `deltaCommitment`——变化了什么（记忆内容的加盐/加密哈希）；
- `provenanceCommitment`——这段记忆从何而来（出处、信任链的承诺）；
- `locatorCommitment`——真实内容存在哪里（链下资源地址的承诺，真实 URI 作为私有见证保留）。

### 3.3 状态转换函数——从 Delta 到新状态根

给定一个经验增量，协议分两步确定性地推进状态。

**第一步：计算 transitionId。** 使用固定的类型字符串与 ABI 编码：

```
EXPERIENCE_DELTA_TYPE =
  "ExperienceDelta(bytes32 spaceId,uint64 sequence,bytes32 prevStateRoot,\
   bytes32 deltaCommitment,bytes32 provenanceCommitment,bytes32 profileId,\
   bytes32 locatorCommitment)"

transitionId = keccak256(abi.encode(
    keccak256(bytes(EXPERIENCE_DELTA_TYPE)),
    spaceId, sequence, prevStateRoot, deltaCommitment,
    provenanceCommitment, profileId, locatorCommitment
))
```

`transitionId` 是这一次记忆转换的全局唯一指纹。因为类型字符串与编码方式被完全固定，任何符合规范的实现都会算出相同的值——这正是"确定性"原则的落地。

**第二步：折叠出新的状态根。** 新状态根由前一个状态根与本次 transitionId 折叠而成，形成一条不可篡改的哈希链：

```
MEMORY_STATE_TYPE = "MemoryState(bytes32 prevStateRoot,bytes32 transitionId)"

nextStateRoot = keccak256(abi.encode(
    keccak256(bytes(MEMORY_STATE_TYPE)),
    prevStateRoot, transitionId
))
```

于是整个记忆历史成为一个**只增不改的状态累加器（append-only state accumulator）**：每个 `stateRoot` 都密码学地承诺了从创世至今的完整转换序列。想要篡改历史中的任何一次转换，都会导致其后所有状态根失效——正如区块链上改动一个旧区块会使后续所有区块失效一样。

### 3.4 授权与共识——谁有权推进状态

计算出合法的 `nextStateRoot` 只是必要条件。要让注册表（Registry）**接受**一次转换，还必须通过一组严格校验：

- 空间必须存在；
- `deltaCommitment` 与 `profileId` 非零；
- `sequence == head.sequence + 1`（严格连续，防重放、防插队、防分叉）；
- `prevStateRoot == head.stateRoot`（必须链接到当前头部）；
- 通过授权者批准。

授权通过 **EIP-712** 结构化签名完成，其域（domain）被固定为：

```
name    = "AgentMemoryState"
version = "1"
chainId = <当前链 ID>
verifyingContract = <Registry 合约地址>
```

固定的域把签名牢牢绑定到特定链上的特定注册表，杜绝跨链、跨合约重放。授权机制支持三种主体：

- **EOA**：非可延展的 ECDSA 签名；
- **智能账户/多签**：EIP-1271 的 `isValidSignature` 校验；
- **控制者直接调用**：链上直接交易，空签名。

至关重要的一条一致性规则是：**签名必须覆盖 Delta 的全部字段，包括 `locatorCommitment`**。这正是堵死"中继篡改"缺陷的关键——中继者无法在不使签名失效的前提下替换资源定位符。

### 3.5 一致性标准（Conformance）

一个实现要声称符合 Agent Memory State v1，必须：

- 使用**精确**的类型字符串与 ABI 编码；
- 通过 `test-vectors/v1.json` 全部黄金向量；
- 强制执行空间、序列、前序状态根、授权四类检查；
- 对包括 `locatorCommitment` 在内的全部 Delta 字段签名；
- 支持 EIP-1271 授权者；
- **绝不**要求把原始认知放进公开 calldata。

这些标准使得"符合协议"成为一个客观、可测试的事实，而非主观解释。仓库为此提供了参考的 Solidity 合约、两个独立的链下引擎，以及跨语言测试向量，确保多方实现能被机械地验证互操作。

---

## 4. 威胁模型与安全性

一个记忆状态协议若要承载真实经济价值，其安全边界必须被诚实、精确地划定。本章明确协议**保护什么、信任什么、以及它明确不承诺什么**。

### 4.1 一条至关重要的"非主张"

许多号称"链上记忆"的方案，隐含地暗示上链就等于"真实、可用、被拥有"。这是危险的误导。Agent Memory State v1 对此保持严格诚实：

> **一次合法的状态转换，只证明"某个被配置的授权方，批准了某一次被承诺的状态转换"。它不证明记忆内容的真实性、不证明链下数据的可用性、不证明任何所有权，也不证明删除确已发生。**

注册表（Registry）只验证两件事：**授权**（这次写入是否得到当前授权者批准）与**状态机连续性**（序列与前序状态根是否严格衔接）。它对记忆的"内容是否属实、链下是否还能取到、谁在道德上拥有它"一无所知，也不假装知道。把信任边界说清楚，本身就是最重要的安全特性——它避免了下游应用建立在虚假的保证之上。

### 4.2 信任假设

> **注册表只被信任去执行它已公开的字节码。**

除此之外，协议对生态中的其他角色**不授予任何隐含信任**：存储提供方、中继者（relayer）、索引器、画像（profile）发布者，都不在可信基（TCB）之内。这种最小化信任的立场，使得协议的安全性可以被独立、机械地论证。

### 4.3 威胁—缓解—残余风险

| 威胁 | 缓解措施 | 残余风险 |
|---|---|---|
| **命名空间劫持** | `spaceId = keccak256(controller, salt)`；注册需授权 | 控制者私钥在注册前即被攻破 |
| **未授权修改** | 注册表只认当前配置的授权者 | 授权者本身过于宽松或被攻破 |
| **中继篡改** | 全部 Delta 字段（含 `locatorCommitment`）纳入签名 | 中继者仍可审查/延迟（但不能篡改） |
| **非法前序状态** | 精确校验 `prevStateRoot` + `sequence` | 线性模型不支持并发分支 |
| **跨链重放** | EIP-712 域绑定 `chainId` | 相同参数的分叉链需运营层应对 |
| **配置重放** | 每空间 `configNonce` 轮换 | 控制者被攻破后可发起恶意更新 |
| **定位符泄露** | 链上只暴露加盐承诺 | 带外（out-of-band）见证泄露 |
| **哈希漂移** | Solidity/TS 跨语言黄金向量 | 新实现可能跳过一致性测试 |

### 4.4 私有承诺的密码学（ADR-0003）

对短小或低熵的记忆内容直接做哈希是**可被暴力枚举反推的**——"用户偏好深色模式"这样的短文本，攻击者可以穷举候选并比对哈希。协议因此要求：

- 每个承诺使用 **32 字节、带域分隔（domain-separated）的盐**；
- 对低熵负载，使用**保密的盐**，或干脆用随机密钥与 nonce 进行**加密**。

盐、密钥、明文负载、真实定位符共同构成**私有见证（private witness）**，全程留在链下，注册表永远不接触记忆本身。这带来一个明确的责任转移：**应用方承担起见证保存与密钥恢复的责任**。协议大幅降低了泄露面，但并未消除它——转换的**时序、频率、以及 `profileId`** 在链上仍然可见，构成侧信道。诚实地列出这些残余可观测量，胜过假装零泄露。

### 4.5 部署前的安全门禁

在任何生产部署之前，规范要求通过七道门：EIP-712 签名校验、对序列逻辑的模糊测试（fuzzing）、独立实现的交叉验证、加密画像的评审、恢复流程演练、测试网监控、以及外部的 Solidity 安全审计。安全不是一次性声明，而是一组可执行、可复核的关卡。

---

## 5. 应用与展望

协议核心刻意保持极小——只做"授权 + 状态机连续性"。真正的产品价值，生长在核心之上的分层结构里。这一分层本身就是一个重要的架构决策（ADR-0004）。

### 5.1 四层架构：让核心可被独立审计

早期原型把状态原语、记忆框架、删除、市场结算、"REC 语言"、以及各种智能体行为**捆绑在一起**——过度耦合，无法审计。重构将其拆为四个清晰的层级，每层信任模型独立：

```
┌─────────────────────────────────────────────────────────┐
│  Adapters（适配层）  Awareness 分类法、负载构造、真实记忆系统对接  │
├─────────────────────────────────────────────────────────┤
│  Experimental（实验层）  Memory Market 记忆市场、REC 认知资产（愿景）│
├─────────────────────────────────────────────────────────┤
│  Extensions（扩展层）  DeletionAttestation 删除证明等（各自声明信任模型）│
├─────────────────────────────────────────────────────────┤
│  Core（核心层）  授权、Delta 哈希、状态规则、签名、事件  ← 唯一的规范协议 │
└─────────────────────────────────────────────────────────┘
```

**目标：核心足够小，可以被任何人独立实现与审计；产品特性在上层自由演化，而无需触碰底层协议。** 这正是以太坊"薄协议、厚应用"哲学在记忆领域的复刻——正如以太坊把 ERC-20、DeFi、NFT 留给应用层，Agent Memory State 也把市场、删除、认知资产留给核心之外的层级。

### 5.2 扩展层：删除证明（Deletion Attestation）

"被遗忘权"是记忆系统绕不开的合规诉求。删除作为**扩展**而非核心存在——因为"删除"在一个只增的累加器上是一个语义主张，而非物理事实。删除证明扩展允许一个空间发布"我已删除某段记忆"的承诺，但它必须**公开声明自己的信任模型**：链上无法证明链下数据真的被抹除，它只能证明"授权方声明了删除"。把这一限制显式化，避免了"链上删除"这种误导性承诺。

### 5.3 实验层：记忆市场（Memory Market）

`MemoryMarket.sol` 是协议之上第一个经济层原型——一个**面向记忆空间的时限许可市场（time-limited licensing marketplace）**。它回答了"记忆如何成为可交易资产"这一问题，同时不违反隐私优先原则：交易的是**对某个已承诺记忆状态的、有时限的访问许可**，而非记忆明文。

机制要点：

- **挂单（`list`）**：空间控制者设定结算代币、价格、许可时长、可选版税（0–10,000 个基点），并**捕获当前状态根**——把这份许可锚定到一个确切的、已承诺的记忆配置上，防止"陈旧状态出售"（卖家事后偷偷推进状态，让买家买到不同于展示的东西）。
- **购买（`purchase`）**：带重入保护；校验挂单仍处于激活状态**且状态根未变**；把付款在版税接收方与卖方之间分账；许可到期时间**叠加式延长**（stacking，而非重置）——续费的买家累加时长，符合直觉。
- **视图**：`hasLicense()`、`licenseExpiresAt()`、`getListing()` 让第三方合约可组合地查询许可状态。

值得强调：市场用**任意 ERC-20 代币**结算。协议核心不绑定任何原生代币；一个生态结算/治理代币（如 **AWAR**）是这一经济层的自然演化方向，而非协议的前置依赖。这保持了"核心中立、经济层可选"的分层纪律。

### 5.4 实验层：认知资产与 REC（愿景）

在市场之上，更远的愿景是把记忆本身资本化为**认知资产（cognitive assets）**，并发展一套描述认知价值与许可关系的 **REC** 体系。需要诚实说明：截至当前版本（`1.0.0-alpha.1`），REC 与认知资产**尚无合约代码**，它们在架构决策记录中被明确标注为"未来的产品级演化，而非基础协议"。把它们放在实验层、并与已可用的核心清晰隔离，正是为了不让愿景污染可审计的地基。

### 5.5 适配层：与真实记忆系统对接（Awareness Adapter）

协议要落地，必须能接上真实的、正在运行的记忆系统。`@erc-awar/awareness-adapter` 就是这样一座桥——它把 **Awareness 的知识卡片与嵌入**，转换为**公开的 `ExperienceDelta` + 私有的见证（witness）**。

**卡片类型 → 画像（profile）映射：**

| Awareness 卡片类型 | 默认画像 | 语义 |
|---|---|---|
| `decision` | **POLICY** | 约束智能体未来行为的策略 |
| `insight` / `solution` / `workflow` | **TEXT** | 人类可读的知识 |
| `memory` | **EPISODIC** | 在某一时点被观察到的情景记忆 |
| `task` | **EPISODIC** | 随时间被追踪的工作单元 |

完整画像词表（`TEXT, EMBEDDING, LATENT, TOOL_TRACE, EPISODIC, POLICY, SHARED_WORKING, PROOF`）由适配层拥有，**不是协议枚举**，因此可以自由演化，服务于检索索引、协作系统、执行轨迹、证明等更广的场景。

**桥接流程（`bridge.ts`）：**

1. `ingest(card)` 读取卡片的 `id / type / content / title / tags / 时间戳 / subject`，校验类型，解析出目标画像；
2. `buildContent()` 按画像塑形负载：TEXT → `{text, title?, cardKind, tags?}`；POLICY → `{rule, scope:"agent", cardKind}`；EPISODIC → `{event, occurredAt, cardKind, subject?}`；
3. 调用参考状态机 `machine.commit({...})`，传入负载、`profileId`、定位符、出处，以及各项盐值；
4. 把返回的 `TransitionRecord` 包装为 `AwarenessTransition`，分离出 `exportDeltas()`（可提交上链的公开 Delta）与 `export()`（带私有见证的缓存转换）。

**关键架构诚实**：适配器刻意做得很"薄"——它**不自己生成盐、也不自己构造承诺**。盐由外部提供，所有密码学承诺的构造被**委托给底层的参考状态机（`MemoryStateMachine`）**。记忆操作被抽象为通用的 `{ op:"upsert", resourceId, observedAt, content }`。这意味着，一个"真实记忆系统"（例如 Awareness 的卡片存储）接入协议的方式是：把自己的记录映射为卡片、提供盐与定位符；适配器则负责把**可安全放入 calldata 的公开 `delta`**，与**必须留在链下的私有 `witness`（定位符 + 盐）**干净地分开。

配套的参考引擎（`@erc-awar/reference-engine`）是一台链下状态机：它维护本地的状态累加器、准备隐私保护的转换、接受外部预先构造的 Delta、并验证完整的序列/状态根历史。差分/合并（diff/merge）等便利功能被刻意**隔离在规范的线性协议之外**，以免污染核心的确定性。

### 5.6 迁移路径

从 v0 原型迁移到 v1 的方式是：**创建全新的 v1 空间**，并附一份私有迁移负载，记录 v0 的导出、标识符、工具链与审计信息；原有链保持不变。v0 使用的 JCS 规范化 ID、未签名 URI、固定枚举，与 v1 **不进行线格式兼容**——干净的断代，胜过背负历史包袱的伪兼容。

### 5.7 与现有 agent 标准的关系

截至 2026 年年中，agent 相关 ERC 数量众多，其中若干触及记忆。把边界讲清楚，比宣称新颖更重要：

| 提案 | 覆盖什么 | 仍然缺什么 |
|---|---|---|
| **ERC-8004** Trustless Agents | 身份 / 声誉 / 验证三个注册表 | 明确不覆盖记忆、持久状态与认知 |
| **ERC-8181** Self-Sovereign Agent NFTs | 面向链下认知状态的 State Anchor | 锚点是**扁平**的——无 `prevStateRoot`、无 `sequence`、无唯一后继约束，且 `contentUri` 是未签名参数，中继者可替换 |
| **ERC-8264** AI Agent Memory Access Rights | 面向记忆记录的数据主体权利（读/写/删/导出），GDPR 框架 | 是对**记录本身**的权利，不是记录**之间**状态演进的可验证性 |
| **ERC-8269** Body Lease / Capsule | 打包格式：单个 capsule 内负载哈希的 Merkle 根 | 是 capsule **内部**的完整性，不是**跨时间**的转换链 |
| **ERC-7857**（已 Final） | 带密封密钥与访问证明的所有权转移 | 是转移的**那一刻**，不是状态演进的**过程** |

一个合理的追问是：[Ethereum Attestation Service](https://attest.org) 是否已经覆盖了这个用例？它提供 `refUID` 链接、带 Merkle multiproof 的 Private Data Attestations（支持选择性披露）、以及可注入任意校验逻辑的 resolver。它**没有**提供的是**后继唯一性**——在 `EAS.sol` 中，对 `refUID` 的唯一校验是"被引用的 attestation 存在"，因此多个 attestation 可以引用同一个 `refUID`，协议层允许分叉。没有序列号，没有前序状态绑定，也没有按命名空间划分的控制者/授权者模型。这些语义**可以**用 EAS schema 加自定义 resolver 实现，但那产出的是逐应用的自定义实现，而非可互操作的标准。

本协议自始至终的意图是：上述任何提案都可以引用它，而它们都不需要依赖它。

---

### 5.8 外部判定组合（attestation refs）

与 WYRIWE（ERC-8299）在 Magicians 讨论中联合定稿，成文于 `docs/interop/attestation-refs.md`（informative）：签名的外部判定放进**已承诺载荷内部**——由 `provenanceCommitment` 下的 `provenanceBytes` 承载。因为该承诺位于被签名的 delta 之内，判定是**授权者批准过的因果输入**，而非事后贴上的注解；七字段结构体永久冻结，任何引用都不会成为第八个字段。

引用集是无序集合：JCS 规范化、按 `decision_ref` 排序、按 `(event_id, pubkey)` 去重。`verify_url` 仅为指路信息，**不进任何哈希**——验证只需验证者公钥，无需回调任何一方。针对这些规则的外部一致性检查器正在 `babyblueviper1/preaction-governance-conformance` 中构建，fixture 取自 Sepolia 真实部署而非合成数据。

一条组合非主张，先说在膨胀之前：判定 + 已承诺转换 **≠** 已验证的记忆。两个规范都不做此宣称。

## 6. 杂项与关切（Miscellanea and Concerns）

### 6.1 线性模型 vs 并发分支

协议采用严格线性的状态推进（`sequence == head + 1` 且 `prevStateRoot == head.stateRoot`）。这换来了防重放、防插队、防历史分叉的强保证，代价是**单个空间内不支持并发写入分支**。对需要并发协作的场景，正确的做法是使用多个空间 + 链下合并，而非把分叉语义塞进核心。这是一个有意识的、以可审计性换灵活性的取舍。

### 6.2 Gas 成本与可扩展性

每次转换上链的只是若干个 `bytes32`——固定宽度、体积极小，与记忆内容的大小完全解耦。无论一次记忆更新对应一句话还是一整个向量库，链上足迹都是恒定的。这使得协议在 Gas 成本上高度可预测，也天然适配 L2 与 rollup：真实数据永远在链下，链上只承载常数大小的证明。

### 6.3 链下可用性是应用的责任

协议不保证链下数据可取。`locatorCommitment` 只承诺"定位符是什么"，不承诺"定位符指向的内容此刻还在"。数据可用性、备份、见证保存、密钥恢复，全部是应用层的责任。这不是协议的缺陷，而是信任边界的诚实划分——把可用性伪装成协议保证，只会制造虚假的安全感。

### 6.4 画像而非枚举

核心协议不冻结任何记忆分类法。`profileId` 是应用自定义的解释画像，其词表由适配层拥有、可自由演化。这避免了把某一时刻对"记忆有哪些类型"的有限认知，永久固化进底层协议——正如以太坊没有把"代币"写进协议，而是留给了 ERC-20。

### 6.5 走向正式 ERC 的路线图

当前状态为**社区草案（pre-ERC community draft）**。迈向 `ethereum/ERCs` 正式编号的路径包括：在 Ethereum Magicians 发起议题讨论、把讨论链接写入 ERC 元数据、确认作者列表与 EIP 冠军（champion）、邀请密码学与智能体研究者评审、取得通过黄金向量的独立第二实现、完成外部安全审计与测试网验证，最终向 `ethereum/ERCs` 仓库提交 PR。标准化是一场公开的、多方参与的过程，而非单方宣告。

---

## 7. 结论

比特币让"价值"有了无需信任的状态；以太坊让"任意可计算的状态"有了无需信任的转换。而当计算的主体变成会记忆、会学习、会积累的自主智能体时，一类新的、最重要的状态浮现出来——**记忆**。

Agent Memory State v1 为这类状态提供了它所需要的东西：一个**确定性、隐私优先、授权严格、可跨实现互操作**的状态机。它的全部智慧凝结在一个克制的选择里——**上链的是记忆状态转换的证明，而不是记忆本身**。七个字段的经验增量、逐位一致的 `transitionId`、只增的状态累加器、以及被诚实划清的信任边界，共同构成一个可以被独立审计、被自由扩展、被真实经济价值所依赖的地基。

在这个地基之上，记忆得以第一次成为可验证、可携带、可交易而又不失隐私的资产：删除可以被证明其被声明、访问可以被时限地许可、认知可以被资本化为资产。核心保持中立而微小，产品在其上百花齐放。

> **记忆是新的状态。而 Awareness 让这个状态，第一次同时做到了可验证与私密。**

这是智能体经济的信任层的起点。

---

## 8. 开放问题与征求反馈（Open Questions）

欢迎在 Ethereum Magicians 讨论帖中反馈。我们最希望听到社区意见的具体问题：

1. **线性性**：本协议强制严格线性的单空间历史，我们认为这是正确的基础原语——它正是让"无缺口、无静默回滚、无互相矛盾的并行历史"可被第三方核验的依据。并发应当交给"多空间 + 链下合并"。是否存在某个具体的 agent 工作负载，使这个判断是错的？
2. **基线承诺方案**：附录 A 的域分隔 keccak 基线是否是可接受的规范下限，而把 ZK/更强方案作为可选画像？ERC 是否应对任何低熵负载强制加密，而不仅仅是保密盐？
3. **EIP-1271 / EIP-7702 边界情形**：「先试 ERC-1271，再回落到规范 ECDSA」是否是正确的顺序？它让存在委托策略时该策略得以生效，但由于委托并不撤销私钥，ECDSA 这条路径始终存在。是否应允许注册表按空间关闭这个回落？此外，授权者合约的哪些行为（revert、畸形返回、通过 `STATICCALL` 的 gas griefing）规范应当更明确地点名？
4. **`profileId` 治理**：画像标识符是否需要任何注册表层面的约定，还是完全交由应用定义才是正确的长期立场？注意：取自公开词表且未加盐的 `profileId` 实质上是公开的——ADR-0005 已将其如实记载。
5. **删除语义**：删除扩展用"带明确范围的证明（attestation）"来表述是否恰当？核心应规范性地引用它还是保持沉默？
6. **可发现性的分层**：空间被刻意设计为不透明，这也使它不可被发现——包括对潜在的被许可方。最小描述性元数据应当放在可选扩展里（ADR-0005 采取的做法），还是核心需要一个钩子？注意这里的张力：`profileId` 同时是唯一刻意保留的隐私泄露，又是唯一可用的可发现性抓手。
7. **命名**：ERC 标题用 "Agent Memory State" 是否合适，还是应以 "Commitments" / "Registry" 领衔，以便正确设定对 §4.1 非主张的预期？

---

## 附录 A：规范常量

**类型字符串（Type Strings）**

```
ExperienceDelta(bytes32 spaceId,uint64 sequence,bytes32 prevStateRoot,
  bytes32 deltaCommitment,bytes32 provenanceCommitment,bytes32 profileId,
  bytes32 locatorCommitment)

MemoryState(bytes32 prevStateRoot,bytes32 transitionId)

MemorySpace(address initialController,bytes32 salt)

SpaceAuthorization(bytes32 spaceId,address newController,address newAuthorizer,uint256 nonce)
```

**已发布的黄金 TypeHash（Golden TypeHashes，v1 规范向量）**

```text
ExperienceDelta typehash:
  0x4f020f86bc06d852f1fde17853b4d92a70214eeab8e09718028124af097d070d
MemoryState typehash:
  0xf3148762556cbf851baf4b9a205e18ff4e6b366a58a3a1ef58e8626ba41beadb
MemorySpace typehash:
  0x9ae5478f084ad3b841da58a9cb2354d153cddec59ee64d0cb741fa9d08884531
```

**黄金派生值（Golden Derived Values）**

```text
transitionId:
  0xdd00dd6eb3aec704b5455502647a0caacf23be6c724eda4a60d9645291e7f4e5
nextStateRoot:
  0x9684a8d3571c5cd9c1e3abb1b0c0797b9fef6965e9002aeefba91e8cb1163754
```

**基线私有承诺方案（Baseline Private Commitments）**

画像（profile）可定义更强的方案（含零知识承诺）；一致的实现应支持以下域分隔基线：

```text
DELTA_DOMAIN      = keccak256("AgentMemoryState.deltaCommitment.v1")
PROVENANCE_DOMAIN = keccak256("AgentMemoryState.provenanceCommitment.v1")
LOCATOR_DOMAIN    = keccak256("AgentMemoryState.locatorCommitment.v1")

deltaCommitment      = keccak256(abi.encode(DELTA_DOMAIN, profileId, deltaSalt, keccak256(payloadBytes)))
provenanceCommitment = keccak256(abi.encode(PROVENANCE_DOMAIN, provenanceSalt, keccak256(provenanceBytes)))
locatorCommitment    = keccak256(abi.encode(LOCATOR_DOMAIN, locatorSalt, keccak256(bytes(locator))))
```

每个盐为 32 字节、独立采样。对低熵明文，盐**必须**保密，或 `payloadBytes` **必须**是用全新高熵密钥与 nonce 加密的密文——公开盐无法阻止针对性字典攻击。

**EIP-712 域**

```
name              = "AgentMemoryState"
version           = "1"
chainId           = <当前链 ID>
verifyingContract = <Registry 合约地址>
```

**核心接口 `IAgentMemoryState`**

```
deriveSpaceId · registerSpace · updateSpaceAuthorization ·
commitTransition · head · spaceAuthorization
事件：SpaceRegistered · SpaceAuthorizationUpdated · TransitionCommitted
```

## 附录 B：验证与一致性

```bash
# 一键校验（安装 + 全套检查）
pnpm install --frozen-lockfile && pnpm check

# 分别运行
pnpm test:ts
cd contracts && forge fmt --check && forge test
```

一致性的客观标准：任何实现都必须通过跨语言的 `test-vectors/v1.json` 黄金向量，逐位复现三个 TypeHash 与全部转换 ID。

## 附录 C：版本与许可

- **协议版本**：Agent Memory State **v1**
- **当前发布**：`1.0.0-alpha.1`（2026-07-14）
- **状态**：社区草案（pre-ERC community draft）
- **规范文档**：`erc/erc-8337.md`
- **参考实现**：Solidity 合约、两个独立链下引擎、Awareness 适配器
- **仓库**：`AwareLiquid/ERC-AWAR`
- **版权**：通过 [CC0](../erc/LICENSE.md) 放弃相关权利

---

*本白皮书为社区草案，描述的部分特性（记忆市场、认知资产、REC）处于实验或愿景阶段，不构成任何投资建议或对未来功能的承诺。协议核心的安全边界以第 4 章"非主张"声明为准。*
