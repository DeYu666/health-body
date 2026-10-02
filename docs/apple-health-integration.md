# Apple 健康数据接入医疗本

核对日期：2026-09-06。本文记录接入依据与设计建议，不代表原生同步、第三方桥接或真实设备验收已经完成。

## 接入结论

Apple Watch 采集的数据可以经 iPhone 的健康数据存储进入医疗本。Apple 官方提供“导出所有健康数据”的 XML 文件出口；原生应用可以经 HealthKit 读取用户授权的数据。[Apple 导出指南](https://support.apple.com/guide/iphone/iph5ede58c3d/ios) · [HealthKit 概览](https://developer.apple.com/documentation/healthkit)

网页需要负责接收文件或接收手机桥接程序的 HTTPS 上传。官方公开 HealthKit 接入要求 Xcode capability、设备可用性检查、`HKHealthStore` 和逐项授权；本次未找到 Safari/PWA 可直接调用的公共 HealthKit JavaScript API。因此，当前工程方案不依赖“网页直接连接 Apple Watch”。这是依据公开平台接口作出的工程判断。[HealthKit 配置](https://developer.apple.com/documentation/healthkit/setting-up-healthkit)

| 路径 | 用户操作与网页接收方式 | 适用阶段 |
| --- | --- | --- |
| 健康 App 导出 | 健康 → 头像 → 导出所有健康数据；将导出文件交给医疗本导入 | 第一期，历史数据和价值验证 |
| 快捷指令 | 查找指定健康样本 → 组装 JSON → POST 到医疗本 | 第二期，少量指标、用户主动触发 |
| 用户选择的第三方桥接 | 用户安装并授权桥接 App，配置医疗本接收地址 | 第二期，需要持续更新时评估 |
| 医疗本原生 iPhone 桥接 | HealthKit 授权、增量查询、上传及同步状态管理 | 需要完整增删同步和稳定体验时 |

前两条的官方能力分别见 [Find Health Samples](https://support.apple.com/guide/shortcuts/apd3c845e881/ios) 和 [Get Contents of URL](https://support.apple.com/guide/shortcuts/apd58d46713f/ios)。后两条的约束见下文。

## 第一期导入建议

目标是让用户导入后立刻看到身体记录、覆盖日期和来源，随后能与就医档案一起查阅。

- 接受 XML，并兼容 ZIP 内的健康数据 XML。Apple 支持文档明确保证的是 XML 导出；本次没有找到其对 ZIP 包装、内部路径或 XML schema 长期稳定性的正式承诺。不要把固定文件名当成唯一判断依据，也不要将任意 XML 当作健康数据。
- 导入前明确归属成员和接收范围，解析后显示新增、重复、跳过、失败数，以及实际覆盖日期。资料归属使用用户选择，不按设备名推断家人身份。
- 优先接离散指标：心率、静息心率、体重等；支持哪些类型、单位，应在页面列清。步数和活动能量必须连同来源处理；睡眠必须先完成区间语义再加入趋势。
- 数据走结构化解析，不需要送入 OCR 或大模型。采用流式读取、压缩与解压体积上限；不解压无关附件，不访问 XML 外部实体。未知类型/单位跳过并给出数量，文件损坏或超限则明确失败，避免把部分结果显示成完整成功。
- 重复导入应幂等；保留来源、原始值/单位、测量起止时间、导入批次。缺少上游稳定 ID 时，基于规范化字段的指纹只是重复导入策略，不能替代 HealthKit UUID。
- 全量 XML 是一次快照。没有可靠删除信息时，不因后一次文件缺少某条记录就删除历史数据，也不声称已与健康 App 完全同步。

以上是医疗本的实现建议；其中导出步骤依据 [Apple 导出指南](https://support.apple.com/guide/iphone/iph5ede58c3d/ios)，对象身份与来源语义依据 [HKObject](https://developer.apple.com/documentation/healthkit/hkobject)。尚需用户主动提供的真实导出文件做兼容验收；合成测试不能证明所有 iOS 导出版本可用。

本轮本地实现：XML/ZIP 历史追加导入，先预览再确认；独立保存 `wearable_samples`，包括原始数值/单位、标准化值、起止时间/时区偏移。按指标、来源、设备和样本开始时间所在日期生成每日汇总，不合并不同来源。支持普通/静息/步行平均心率、心率变异性 SDNN、体重、体脂率、血氧、步数与活动能量；睡眠、运动等暂不导入并计数说明。文件限制 256 MiB、XML 解压内容 1 GiB、有效样本 50 万条；超限拒绝整次导入。ZIP 兼容查找 `export.xml` 或 `导出.xml`，其它路径可解压后直接选择 XML。原始附件不持久化、不传 OCR/AI。新接口仅接受有效 JWT。

日汇总口径：步数/活动能量使用所选来源样本的数值之和，其他类型使用算术样本均值；不会消除同源重叠区间，也不声称等同 Apple 健康总量。时间跨日样本归入开始日期。设备描述忽略易变的内存地址及软件版本，保留可用的设备标识；XML 没有稳定样本 UUID，精确指纹去重不能处理上游更正和删除。当前未实现导入批次历史、原生/第三方桥接或原始样本查询界面。

本地合成测试覆盖单位换算、日期时区、多来源、精确重复、损坏 XML/ZIP、成员隔离、JWT 与 multipart 预览/保存/重试。数据库事务代码通过编译与静态检查，但本机没有运行中的数据库；浏览器连接也不可用，真实导出文件、实际落库和手机界面尚未验收。

## 必须保留的数据语义

| 数据 | Apple 定义 | 医疗本处理建议 |
| --- | --- | --- |
| 步数 `StepCount` | `count` 单位，累计量；iPhone、Watch 均可记录 | 原始样本按来源保存；来源重叠处理完成前，按来源展示，不直接算跨设备总步数 |
| 活动能量 `ActiveEnergyBurned` | 能量单位，累计量；不包含静息能量 | 先规范单位，再按来源和区间统计；与静息能量区分 |
| 心率 `HeartRate` | 次数/时间单位，离散量 | 展示测量值及范围；不对心率求和，不把普通心率当静息心率 |
| 静息心率 `RestingHeartRate` | 独立的离散估计值，可能被后续估计替换 | 保留独立指标类型；持续同步必须处理删除与新增 |
| 体重 `BodyMass` | 质量单位，离散量 | 单位匹配后转换到统一展示单位；保留原值 |
| 睡眠 `SleepAnalysis` | 分类与起止区间 | 区分在床、清醒、睡眠阶段；使用区间运算 |

类型依据：[步数](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/stepcount)、[活动能量](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/activeenergyburned)、[心率](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartrate)、[静息心率](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/restingheartrate)、[体重](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/bodymass)、[睡眠](https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis)。

**多来源去重与重复文件去重是两件事。** Health App 对同类数据按来源优先级组织，用户还能调整次序；将 Watch 和 iPhone 的原始步数全部相加不等于 Health App 显示值。本次未取得可依赖的导出来源优先级契约，不能宣称完全复现其汇总。第一期可显示各来源的记录或由用户明确选择来源；要提供统一总数，则需单独验证重叠区间及来源规则。[Apple 多来源管理](https://support.apple.com/en-us/108779)

**离散量和累计量不能共用一个求和函数。** Apple 按聚合类型区分累计求和、算术平均、时间加权平均等方式。医疗本应对每个支持类型指定聚合策略；原始测量值、日均值和每日累计值需要能在数据模型与界面中区分。[聚合语义](https://developer.apple.com/documentation/healthkit/hkquantityaggregationstyle)

**测量时间不是导入时间。** 样本可以是一个瞬间，也可以是起止区间。建议保存起止时刻及原始时区偏移；每日分组显式指定统计时区，不截取未经解析的日期字符串。跨午夜、夏令时、换时区的归日策略属于医疗本规则，需要测试并保持一致。[HKSample](https://developer.apple.com/documentation/healthkit/hksample)

**在床时长不能加到睡眠时长里。** `inBed` 与 `awake`、`asleepCore`、`asleepDeep`、`asleepREM` 的区间按设计会重叠；还存在 `asleepUnspecified` 及旧版 `asleep`。实际睡眠时长应仅计算睡眠类区间，处理跨来源重叠；不能把所有分类的时长求和。Watch 记录的清醒样本也不保证覆盖在床区间首尾。[睡眠分类与重叠说明](https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis)

## 第二期桥接选择

### 快捷指令

Apple 官方确认有 `Find Health Samples`，并支持通过 `Get Contents of URL` 的 POST 请求发送 JSON、表单或文件。可先设计“同步最近几天选定指标”的手动快捷指令，手机直接上传到医疗本已认证接收接口。[查找动作](https://support.apple.com/guide/shortcuts/apd3c845e881/ios) · [HTTP 请求动作](https://support.apple.com/guide/shortcuts/apd58d46713f/ios)

这是根据两个官方动作组合出的可行设计，本次没有进行真机验证。官方通用说明未保证每种样本字段、历史规模、删除事件或锁屏执行效果；因此不把它当完整 HealthKit 镜像。先验证少量指标、单位、时区、来源、重复执行，再决定自动化范围。

### 第三方桥接候选

Health Auto Export 的厂商文档提供到自定义地址的 HTTP POST，支持 JSON/CSV、认证请求头、指标选择、来源偏好、分批请求及手动历史导出。厂商隐私说明称数据从设备直接发往用户配置的目的地，不经过其服务器；这是厂商陈述，本次未独立审计。[REST 接口说明](https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/) · [厂商隐私说明](https://www.healthyapps.dev/health-auto-export/privacy-policy/)

可以在用户选定此路线后做适配，不在第一期强绑定或代为安装购买。适配必须固定导出版本、区分原始/聚合数据，并验证重传幂等；“上次同步之后”过滤不应未经验证就被认为覆盖历史更正和删除。厂商也说明后台更新受系统运行条件限制，不能承诺实时同步。[自动化说明](https://help.healthyapps.dev/en/health-auto-export/automations/)

### 自有 iPhone 桥接

- 开启 HealthKit capability，按所需类型请求读取权限，并提供 `NSHealthShareUsageDescription`；只读导入无需为了方便额外请求写权限。查询无数据不能证明用户没有该数据或授权成功；官方刻意限制读取授权状态的可辨识性。[授权说明](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- 使用 `HKAnchoredObjectQuery` 保存查询 anchor，处理新增样本与 `HKDeletedObject`；服务端按成员、数据连接与上游 UUID 幂等应用增删。建议收到服务端成功回执后推进上传进度，以支持断网重试。[增量查询](https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery)
- 后台由 observer 通知唤醒，再读取增量。iOS 15/watchOS 8 起需要 background-delivery entitlement；频率参数是最多唤醒频率，iOS 步数最多每小时一次，完成后必须调用 completion handler。必须用真机验证。[后台投递](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:))
- 不承诺锁屏即时上传。Apple 当前安全文档说明锁屏后数据访问会受保护，描述了十分钟后的访问释放和活动中的 `HKWorkoutSession` 例外。网页应显示“数据更新至”和“上次接收时间”，并区分未更新与无记录。[设备数据保护](https://support.apple.com/guide/security/sec88be9900f/web)

接收接口建议使用可撤销、限定单成员与只写导入范围的连接凭据；凭据不放 URL、日志或分享链接。只记录批次状态与数量，错误日志避免原始健康值。此处是实现设计，不表示已建立任何真实连接。

## 验收重点

1. 导入一份用户主动选择的文件后，能核对指定日期的一条测量值、单位、来源和所属成员；重复导入不重复生成。
2. 含多来源步数、睡眠重叠区间、旧日期、跨午夜数据时，不产生重复总数或错误归日。
3. 未支持类型/单位、超限、损坏文件和无可导入数据各有准确结果；失败不留下显示为成功的半份导入。
4. 自动桥接另行验收断网重试、历史更正、删除传播、撤销授权及延迟展示；文件导入通过不能替代这些检查。

产品价值应落在“检查前后一段时间，身体记录发生了什么变化”，并能回到原始记录核对。不要让采集数量或图表数量替代可理解、可找回的实际结果。
