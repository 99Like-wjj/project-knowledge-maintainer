# 正式版本构建与安装

当前软件版本0.1.0，知识格式v3。开发阶段版本仅保留在历史验证记录。

运行npm ci、npm run typecheck、npm test、npm run test:package、npm run schema:check、npm run check:public和git diff --check。全部通过后运行：

    npm run package -- --output /ABS/OUTSIDE/REPOSITORY

打包与test:package测试需要Python 3；输出目录必须位于仓库外，且版本产物不得已存在。构建工具采用精确允许清单，只包含LICENSE、SKILL.md、INSTALL.md、运行指南、6个编译运行模块、JSON Schema、版本元数据和manifest.json。运行时无需npm依赖，不包含源码、设计文档、测试、示例或真实知识文件。

输出完整project-knowledge-maintainer目录、project-knowledge-maintainer-0.1.0.zip和SHA256SUMS。安装方法见[INSTALL](../skills/project-knowledge-maintainer/INSTALL.md)。

发布前审查完整包清单、全部文本及相对引用，校验manifest和ZIP摘要；在仓库外解压后执行help/init/validate/save/recover冒烟并核对版本。只有通过这些检查的ZIP才能作为正式附件，不能把.build目录或GitHub自动源码压缩包称为完整安装包。

推送、合并、Tag与Release必须基于用户授权，并再次核实远端分支及待发布提交。本仓库采用[MIT许可证](../LICENSE)，打包工具复制完整LICENSE并在版本元数据中声明MIT；分发时须保留版权和许可声明。历史验证文档的开发状态不代表当前发行状态。

### v0.1.0 许可证补充

已发布的v0.1.0标签、12文件ZIP、SHA256SUMS和CONTENTS.txt保持原样，不覆盖或重新打包。该版本项目软件及随附文档现采用MIT许可证，许可证作为独立LICENSE附件随Release提供；下载原版ZIP时同时保存该附件。新的本地构建包含13个文件（增加LICENSE），manifest记录其摘要；不得将这些新构建悄悄替换到原版发布附件中。

MIT许可适用于本项目软件和随附文档，不授予对用户另行提供的真实资料、知识库或第三方内容的权利。
