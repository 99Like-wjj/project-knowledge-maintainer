# 安装 / Installation · 0.1.0

需要 Node.js >=22；本地Git快照和三方比较需要Git。运行时无需npm依赖。
Requires Node.js >=22 and Git for local snapshots/comparison. No npm runtime dependencies.

1. 校验Release附件SHA256SUMS中的ZIP摘要，再解压完整ZIP。
2. 将完整project-knowledge-maintainer目录放入你的AI客户端支持的Skills目录；不要只复制SKILL.md，不覆盖已有安装或知识目录。具体Skills位置以所用客户端为准。
3. CLI为安装目录下runtime/src/cli.mjs。用node ABS_SKILL/runtime/src/cli.mjs --help检查；详见[运行指南](references/format-and-tools.md)。
4. 真实资料、知识和备份必须留在用户明确确认的安装目录和源码仓库之外。

Verify the ZIP against SHA256SUMS, then extract the entire directory into your AI client's supported Skills location. Do not copy SKILL.md alone or overwrite an existing installation. Run node ABS_SKILL/runtime/src/cli.mjs --help. Keep real project data outside the installation and source repository.

包内manifest.json记录版本、知识格式和每个载荷文件的SHA-256。包不含模型、设计文档、测试、示例知识或真实资料。
No open-source license is declared. Access to this private repository does not grant a general redistribution license.
