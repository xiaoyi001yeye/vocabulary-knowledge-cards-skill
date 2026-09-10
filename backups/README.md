# 备份与恢复

## 当前快照

- 归档：`vocabulary-knowledge-cards-skill-20260910-091403.tar.gz`
- SHA-256 校验：`vocabulary-knowledge-cards-skill-20260910-091403.tar.gz.sha256`

归档包含当前项目的源代码、`schema/`、`input/`、文档与配置。为避免存入依赖和生成物，未包含 `node_modules/`、`web/dist/`、`web/public/schema/` 及其他历史备份。

## 校验归档

在项目根目录执行：

```bash
shasum -a 256 -c backups/vocabulary-knowledge-cards-skill-20260910-091403.tar.gz.sha256
```

输出 `OK` 后再恢复。

## 恢复

恢复会覆盖目标目录中的同名项目文件。建议先复制或重命名当前项目目录，再解压：

```bash
mkdir -p /path/to/restore-target
tar -xzf backups/vocabulary-knowledge-cards-skill-20260910-091403.tar.gz -C /path/to/restore-target
```

解压后在恢复出的项目目录中执行：

```bash
pnpm install
pnpm build
pnpm dev
```
