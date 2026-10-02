# AI Native 健康档案业务设计

## 目标

当前产品更像一个健康报告文件夹：用户上传文件，再手动填写标题、医院、日期、标签和指标。下一阶段应转成 AI-native 的个人健康数据系统：用户只负责提供原始资料和少量确认，OCR 与 AI 负责理解、分类、结构化、摘要、趋势化和提醒。

核心目标：

- 减少手动录入，让上传、拍照、自然语言记录成为主要入口。
- 保留原始报告文件，同时抽取可检索、可分析、可趋势化的结构化健康数据。
- 把报告档案、健康指标、首页洞察统一到同一套健康数据模型。
- 所有 AI 结论都能追溯到原报告、页面、字段和置信度。
- 明确声明 AI 只做健康资料整理与理解辅助，不替代医生诊断。

## 业务边界

系统可以做：

- 识别报告类型和关键字段。
- 抽取化验项、生命体征、影像结论、用药信息、诊断/病史摘要。
- 标记异常值和趋势变化。
- 提醒用户补充确认低置信度字段。
- 基于用户已有资料回答“我的血糖最近怎么样”“这次体检有哪些异常”等问题。

系统不应该做：

- 直接下诊断。
- 替代医生给出治疗方案。
- 在没有来源依据时生成确定性健康结论。
- 隐藏 OCR/AI 置信度和来源。

## 参考方向

- Google Health 和 Apple Health Records 都按健康记录类别组织数据，例如化验结果、生命体征、药物、疫苗、疾病、操作/手术、就诊等。
- FHIR 中 `DiagnosticReport` 适合作为报告级数据参考，`Observation` 适合作为单个指标/检验项参考。
- Document AI、Azure Document Intelligence、Amazon Textract 这类方案说明 OCR 不应只抽纯文本，还需要抽表格、字段、键值对和版面结构。
- KeepMD、Sync.MD、My Medical Records.ai 这类产品都在向“拍照/上传记录后 AI 自动整理成时间线和可搜索档案”演进。
- OpenDesign 可作为前端统一设计语言和组件风格的参考，不建议照搬营销页风格，应该做医疗数据控制台风格。

## 新核心流程

### 1. 导入健康资料

入口统一为“导入”而不是“上传报告”：

- 拍照：适合纸质报告、血压计、血糖仪、药盒、处方。
- 上传：适合图片、PDF、医院导出的检查报告。
- 自然语言：适合快速记录，例如“今天早上血压 125/82，体重 72.4”。
- 后续扩展：Apple Health、Health Connect、可穿戴设备、医院门户/FHIR。

导入后创建一个 `HealthDocument`，状态为 `processing`。

### 2. 文件保存

原始文件必须长期保留，作为所有 AI 结果的证据源。

文件处理信息包括：

- 原始文件 URL。
- 文件类型。
- 页数或图片数量。
- 上传时间。
- 文件哈希。
- 处理状态。

### 3. OCR 识别

OCR 输出不只保存全文，还要保存结构化版面：

- 按页文本。
- 表格。
- 字段键值对。
- 段落。
- 坐标位置。
- OCR 置信度。

这些结果进入 `OCRResult`，用于后续 AI 抽取和来源追溯。

### 4. AI 分类

AI 根据 OCR 结果判断资料类型：

- 体检报告。
- 检验报告。
- 影像报告。
- 病理报告。
- 门诊病历。
- 住院记录。
- 处方/用药。
- 疫苗/免疫。
- 生命体征设备读数。
- 其他。

分类结果必须带置信度。低置信度时进入用户确认队列。

### 5. AI 结构化抽取

根据资料类型抽取不同结构：

报告级字段：

- 标题。
- 医院/机构。
- 科室。
- 报告日期。
- 就诊日期。
- 医生。
- 检查类型。
- 结论摘要。

检验项/指标：

- 项目名称。
- 标准编码，后续可映射 LOINC/SNOMED。
- 数值。
- 单位。
- 参考范围。
- 异常标记。
- 趋势方向。
- 采样时间。
- 来源页码和坐标。
- 抽取置信度。

文本结论：

- 影像所见。
- 影像印象。
- 病理诊断。
- 医嘱。
- 处方用药。
- 注意事项。

### 6. 用户确认

用户只处理 AI 不确定的部分：

- 分类不确定。
- 日期不确定。
- 医院名不确定。
- 单位/参考范围不确定。
- 项目值疑似识别错误。
- 异常项需要用户重点确认。

确认界面应该对照原图高亮来源字段，而不是让用户重新填写整张表。

### 7. 归档与分析

确认后状态变为 `ready`，进入归档：

- 原始文档进入分类档案。
- 抽取出的检验项同步进入健康指标时间线。
- AI 生成报告摘要、异常清单和随访建议。
- 首页和趋势页自动更新。

## 报告档案分类

一级分类建议：

- 体检。
- 检验。
- 影像。
- 病历。
- 用药。
- 疫苗。
- 手术/操作。
- 生命体征。
- 其他。

二级分类建议：

- 检验：血常规、尿常规、肝功能、肾功能、血脂、血糖、甲状腺、肿瘤标志物、感染指标。
- 影像：X 光、CT、MRI、超声、内镜、心电图。
- 病历：门诊、急诊、住院、出院小结。
- 用药：处方、长期用药、过敏/禁忌。
- 生命体征：血压、血糖、体重、心率、体温、血氧。

分类不是纯标签。分类决定页面展示、抽取 schema、筛选方式和趋势化逻辑。

## 健康指标新流程

当前流程是用户手动选择类型、填数值、填单位、填时间。新流程应改为多来源自动汇聚：

- 报告抽取：从检验报告和体检报告中自动生成指标。
- 拍照识别：从血压计、血糖仪、体重秤屏幕识别数值。
- 自然语言：从一句话中解析指标。
- 设备导入：后续从 Apple Health、Health Connect 或可穿戴设备同步。
- 手动编辑：只作为纠错和补录，不作为主流程。

健康指标不再只是 `MetricEntry`，应升级为 `Observation`：

- 一个 Observation 可以来自报告、设备、自然语言或手动录入。
- 每个 Observation 都有来源、置信度和审核状态。
- 同一个指标支持不同名称归一化，例如“空腹血糖”“葡萄糖”“GLU”归到同一趋势项。

## 首页新逻辑

首页定位从“功能入口集合”改为“今日健康态势”。

第一屏只展示最重要的内容：

- AI 输入框：拍照、上传、提问、记录一句话。
- 待处理事项：待确认 OCR、异常报告、长期未复查项目。
- 最近洞察：新增异常、指标变差、指标改善、重要报告摘要。

第二屏展示：

- 健康时间线：报告、指标、用药、就诊按时间统一排列。
- 异常指标卡片：只显示真正需要注意的指标。
- 最近报告：按分类显示，不按文件列表堆积。

页面原则：

- 首页不展示空卡片。
- 每个洞察都必须能点进来源。
- 用“待确认”“已归档”“需关注”表达状态，不用技术状态污染用户界面。
- AI 生成内容必须有来源和免责声明。

## 关键页面调整

### 导入页

替代当前上传页。

主要控件：

- 拍照/上传按钮。
- 拖拽上传区域。
- 自然语言输入框。
- 导入队列。
- 处理进度。

用户上传后不立即要求填写完整表单，只允许补充少量可选信息。

### 处理结果页

新增页面。

展示：

- 原图/PDF 预览。
- OCR 高亮。
- AI 分类。
- 抽取字段。
- 异常项。
- 低置信度待确认项。

主要动作：

- 确认归档。
- 修改分类。
- 修正字段。
- 忽略无关项。

### 档案页

从“报告列表”变成“健康资料库”。

支持：

- 按分类浏览。
- 按时间线浏览。
- 按医院/机构浏览。
- 按异常项浏览。
- 全文搜索和语义搜索。

### 指标页

从“录入+趋势”变成“趋势+来源”。

支持：

- 指标趋势。
- 每个点的来源报告。
- 参考范围随报告来源变化。
- 异常区间标注。
- AI 总结最近变化。

### AI 助手页或全局抽屉

用户可以问：

- 我最近有哪些异常？
- 这次体检和上次比有什么变化？
- 我的血脂趋势怎么样？
- 哪些报告还没整理？
- 帮我整理一份给医生看的摘要。

回答必须引用具体报告和指标。

## 数据模型建议

保留当前 `reports` 和 `metric_entries` 作为兼容层，新增更适合 AI 的模型。

### health_documents

导入资料主表。

- id
- user_id
- title
- category
- subcategory
- source_type: upload, photo, text, device, fhir
- status: uploaded, processing, needs_review, ready, failed
- organization
- department
- document_date
- summary
- ai_conclusion
- confidence
- created_at
- updated_at

### document_files

资料文件表。

- id
- document_id
- file_url
- preview_url
- mime_type
- file_size
- page_count
- sha256
- display_order

### ocr_results

OCR 结果表。

- id
- document_id
- provider
- raw_text
- pages_json
- tables_json
- key_values_json
- confidence
- created_at

### extracted_observations

AI 抽取出的单项指标。

- id
- user_id
- document_id
- name
- normalized_name
- code_system
- code
- value_number
- value_text
- unit
- reference_low
- reference_high
- reference_text
- abnormal_flag
- observed_at
- source_page
- source_bbox_json
- confidence
- review_status
- created_at

### ai_analyses

AI 分析结果表。

- id
- document_id
- model
- analysis_type
- summary
- findings_json
- risks_json
- recommendations_json
- citations_json
- confidence
- created_at

### review_tasks

用户确认任务表。

- id
- user_id
- document_id
- task_type
- field_name
- suggested_value
- source_page
- source_bbox_json
- confidence
- status
- resolved_value
- created_at
- resolved_at

## API 建议

导入：

- `POST /api/v1/documents/import`
- `GET /api/v1/documents/imports/:id/status`
- `POST /api/v1/documents/:id/reprocess`

档案：

- `GET /api/v1/documents`
- `GET /api/v1/documents/:id`
- `PATCH /api/v1/documents/:id`
- `DELETE /api/v1/documents/:id`

审核：

- `GET /api/v1/review-tasks`
- `POST /api/v1/review-tasks/:id/resolve`
- `POST /api/v1/documents/:id/confirm`

指标：

- `GET /api/v1/observations`
- `GET /api/v1/observations/trends`
- `PATCH /api/v1/observations/:id`

AI：

- `POST /api/v1/ai/chat`
- `POST /api/v1/ai/documents/:id/analyze`
- `GET /api/v1/ai/insights`

## 处理流水线

建议后端引入异步任务，而不是在上传请求里同步 OCR 和 AI。

阶段：

1. 文件上传完成。
2. 创建 document。
3. 投递 processing job。
4. OCR worker 执行识别。
5. AI worker 执行分类和抽取。
6. 生成 review tasks。
7. 生成 observations。
8. 生成 analysis。
9. 更新 document 状态。

失败处理：

- OCR 失败：允许重试，保留原文件。
- AI 抽取失败：允许只归档原文件。
- 低置信度：进入用户确认，不阻塞文件保存。

## PIN 登录处理

当前 PIN 登录只是半实现：demo 用户可以用 PIN，普通注册用户没有设置 PIN 的流程。

建议：

- 短期隐藏 PIN 登录入口，避免用户误解。
- 或补全设置 PIN、修改 PIN、关闭 PIN 的接口和页面。
- 长期将 PIN 定位为本机快速解锁，而不是替代邮箱密码登录。
- PIN 应绑定设备或本地会话，不建议作为跨设备主认证方式。

## 前端风格方向

参考 OpenDesign 的方式建立统一视觉规范，而不是零散页面样式。

建议风格：

- 医疗数据控制台，而不是营销型健康 App。
- 白色/浅灰为主背景。
- 医疗蓝或青色作为主操作色。
- amber 表示待确认，red 表示异常，green 表示改善。
- 卡片半径不超过 8px。
- 信息密度适中，优先扫描效率。
- 重要内容用来源引用和状态标记，不靠大面积装饰。

组件建议：

- `InsightCard`
- `ImportDropzone`
- `ProcessingQueue`
- `DocumentCategoryTabs`
- `ObservationTrendCard`
- `SourceCitation`
- `ReviewField`
- `HealthTimeline`
- `AIAssistantInput`

## 分阶段落地

### Phase 1：业务和数据底座

- 新增 AI-native 文档模型。
- 新增导入状态和分类字段。
- 将现有 reports 兼容迁移到 health_documents。
- 隐藏或补全 PIN 登录。
- 将上传页改名为导入页。

### Phase 2：OCR 和归档

- 接入 OCR 服务。
- 保存 OCR 原文、表格和字段。
- 实现处理状态页。
- 支持用户确认分类、医院、日期。

### Phase 3：AI 抽取和指标自动生成

- 接入 AI 抽取 schema。
- 生成 extracted_observations。
- 将报告中的指标自动进入趋势页。
- 新增低置信度确认任务。

### Phase 4：首页和 AI 助手

- 首页改为今日健康态势。
- 新增 AI 洞察卡片。
- 新增基于资料来源的问答。
- 支持生成给医生看的摘要。

### Phase 5：设备和外部数据

- 支持自然语言记录。
- 支持设备读数拍照识别。
- 后续接 Apple Health、Health Connect、FHIR。

## 下一步建议

优先顺序：

1. 先改信息架构：上传页改成导入页，首页改成健康态势，档案页改成分类资料库。
2. 再改后端模型：新增 `health_documents`、`document_files`、`ocr_results`、`extracted_observations`。
3. 接一个最小可用 OCR 流程：图片/PDF 到 raw text。
4. 接 AI 分类和摘要，不急着一次抽完所有指标。
5. 最后做趋势自动生成和 AI 问答。

