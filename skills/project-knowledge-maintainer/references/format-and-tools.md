# 格式v3与本地工具

正式安装包使用Skill根目录下runtime/src/cli.mjs的绝对路径。源码开发在明确仓库运行npm run build后使用绝对路径下.build/src/cli.mjs。用户提供任务和资料，AI准备JSON请求；构建不更新已安装Skill。

~~~text
node ABS_CLI init --knowledge-root ABS --request ABS_JSON
node ABS_CLI validate --knowledge-root ABS
node ABS_CLI save --knowledge-root ABS --request ABS_JSON
node ABS_CLI compare --knowledge-root ABS --request ABS_JSON
node ABS_CLI recover --knowledge-root ABS
node ABS_CLI recover --knowledge-root ABS --transaction-id ID --complete true
~~~

## 四类文件

| 文件 | 内容 |
| --- | --- |
| knowledge.json | knowledgeFormatVersion=3、knowledgeId、projectId、projectName、createdAt |
| feature-map.json | domains、modules、checks、issues；应用/页面名称和入口路径直接写在模块入口内 |
| rules/ID.json | id、title、entries、issues；rule/role保留完整陈述、来源及确认状态 |
| accounts.json | 用户提供的非秘密账号，{"items":[]} |
| project.json | 用户提供的项目配置，{"items":[]} |
| sources/ID.json | 规则/观察的确定版本来源及定位、局限 |

init最少projectName，可给projectId、allowExistingDirectory、protectedRoots；默认只建身份和空project.json，其他文件可以缺省。已有身份/时间保留，未知非空目录、管理文件冲突、旧格式和错项目不覆盖。

## 轻量配置

两类配置共用记录：id/title必填；summary、tags、description、properties可选。AI生成稳定id，保留用户的属性名称、嵌套、数组、数字、布尔和null，不建立额外角色/环境/组织模型。properties中的meta、sourceRefs、id等名称也是普通用户数据，不解释成知识元数据。

完全合成最小记录：{"items":[{"id":"fictional-account","title":"完全合成测试账号"}]}。

账号标识、角色限制、环境、登录说明和其他参数按用户实际提供的内容写入description/properties；字段不是模板必填项。摘要/标签便于检索，不抄登录标识或补推权限。没有账号、网址或版本时不造数据、不自动生成missing问题。只在当前明确任务缺关键资料时集中询问。

不存密码、Token、Cookie或可兑换登录链接；不读取秘密文件、不解析引用或执行配置值。

## 规则、导航与来源

规则/角色条目保留title、aliases、summary、moduleIds、businessTags、statements。陈述为id/text、可选自然语言appliesTo、meta、relations、issueIds；适用范围未知可以省略，不代表全局适用。

模块保留domainId、用途descriptions、entryPoints、ruleIds/roleIds。入口为id、menuPath、accessNotes、meta，以及可选application/page/url/appliesTo；不要求project.pages或页面ID。多应用/页面分别记入口，已有UI进入要求写在说明中。稳定HTTP(S)地址不携带用户秘密或一次性认证参数，不录CSS/坐标/逐按钮脚本。

Meta为confirmed/observed/pending、active/superseded/retired、sourceRefs、updatedAt、changeReason、limitations。非pending必须有来源，只有观察不能confirmed。Source.kind独立表示requirement/manual/observation/confirmation/other。

Check保留目标模块/入口、actorNote、四态outcome、coverage、observedAt、description、sourceRefs及limitations；环境和当时身份写在说明中，不依赖账号或环境档案。原捕获时间未知不补造，历史入口观察不代表当前业务通过。

## 保存、比较与恢复

save字段为projectId、knowledgeId、expectedSnapshotSha256、files、reason、backupDir。先validate取得指纹；files仅限受管JSON集合，拒绝路径穿越、链接绕行和旧快照。

覆盖未由干净Git保存的文件时，backupDir须在库外并保留原字节。配置可按明确指令修改或移除，不要求retired墓碑；规则/陈述及历史检查仍保留，来源版本ID不改指其他资料。已有Meta实质变化需新updatedAt/changeReason，升级confirmed需新依据。

recover默认只查看，按精确transactionId完成同一prepared事务；外部改动先保留和核实。compare只读明确的完整本地base/ours/theirs提交，按稳定ID返回差异/冲突；自由属性原样比较，AI判断业务含义。不执行Git合并、远端同步或按时间戳选胜者。

当前只支持v3，不读旧格式、不双写、不转换。外部Schema是格式源；修改后运行schema:write生成运行Schema，并用schema:check核对。源码仓库示例均在examples/knowledge.synthetic且完全合成；安装包不包含示例或设计文档。
