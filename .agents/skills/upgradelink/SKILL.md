---
name: upgradeLink
description: Provides comprehensive guidance for upgrade link management including upgrade link creation, configuration, and upgrade link best practices. Use when the user asks about upgrade links, needs to create upgrade links, configure upgrade processes, or manage upgrade links.
license: Complete terms in LICENSE.txt
---

## When to use this skill

Use this skill whenever the user wants to:
- Use UpgradeLink tool for system upgrades
- Understand UpgradeLink features and capabilities
- Perform version migrations
- Configure UpgradeLink settings
- Troubleshoot UpgradeLink issues
- Implement upgrade workflows
- Use UpgradeLink APIs or integrations
- Follow UpgradeLink best practices

## How to use this skill

This skill is organized to match the UpgradeLink official documentation structure (https://www.toolsetlink.com/upgrade/what-is-upgrade.html). When working with UpgradeLink:

1. **Identify the topic** from the user's request:
   - Getting started/快速开始 → `examples/getting-started/introduction.md` or `examples/getting-started/basic-usage.md`
   - Features/功能特性 → `examples/features/` directory
   - Advanced usage/高级用法 → `examples/advanced/` directory

2. **Load the appropriate example file** from the `examples/` directory:

   **Getting Started (快速开始) - `examples/getting-started/`**:
   - `examples/getting-started/introduction.md` - What is UpgradeLink
   - `examples/getting-started/basic-usage.md` - Basic usage examples

   **Features (功能特性) - `examples/features/`**:
   - `examples/features/` - Feature-specific examples

   **Advanced (高级) - `examples/advanced/`**:
   - `examples/advanced/` - Advanced usage examples

3. **Follow the specific instructions** in that example file for syntax, structure, and best practices

   **Important Notes**:
   - All examples follow UpgradeLink official documentation
   - Each example file includes key concepts, code examples, and key points
   - Always check the example file for best practices and common patterns

4. **Reference API documentation** in the `api/` directory when needed:
   - `api/` - API reference documentation

5. **Use templates** from the `templates/` directory:
   - `templates/` - Usage templates


### Doc mapping (one-to-one with official documentation)

- `examples/` → https://www.toolsetlink.com/upgrade/what-is-upgrade.html

## Examples and Templates

This skill includes detailed examples organized to match the official documentation structure. All examples are in the `examples/` directory (see mapping above).

**To use examples:**
- Identify the topic from the user's request
- Load the appropriate example file from the mapping above
- Follow the instructions, syntax, and best practices in that file
- Adapt the code examples to your specific use case

**To use templates:**
- Reference templates in `templates/` directory for common scaffolding
- Adapt templates to your specific needs and coding style

## API Reference

Detailed API documentation is available in the `api/` directory, organized to match the official UpgradeLink API documentation structure.

**To use API reference:**
1. Identify the API you need help with
2. Load the corresponding API file from the `api/` directory
3. Find the API signature, parameters, return type, and examples
4. Reference the linked example files for detailed usage patterns
5. All API files include links to relevant example files in the `examples/` directory

## Best Practices

1. **Follow official documentation**: Always refer to official UpgradeLink documentation
2. **Test upgrades**: Test upgrades in development environment first
3. **Backup data**: Always backup data before performing upgrades
4. **Version compatibility**: Check version compatibility requirements
5. **Error handling**: Implement proper error handling
6. **Logging**: Enable logging for troubleshooting
7. **Documentation**: Document upgrade procedures
8. **Rollback plan**: Have a rollback plan ready

## Resources

- **Official Website**: https://www.toolsetlink.com/
- **Documentation**: https://www.toolsetlink.com/upgrade/what-is-upgrade.html

## Keywords

UpgradeLink, upgrade, migration, version, toolsetlink, 升级, 迁移, 版本

## 能力边界

### ✅ 适用场景
- 当你需要使用此技能对应的技术栈时
- 当项目需要遵循最佳实践时
- 当需要快速上手或深入理解核心概念时

### ⚠️ 需要注意
- 复杂业务逻辑需要结合具体场景调整
- 性能优化需要根据实际数据量评估

### ❌ 不适用场景
- 不相关的技术栈或框架
- 需要完全自定义的特殊场景

## 常见陷阱 (Gotchas)

1. **版本兼容性**：注意框架版本与依赖库的兼容性，不同版本 API 可能有差异
2. **配置文件格式**：配置文件格式错误是最常见的问题，建议使用编辑器的语法检查
3. **环境变量**：确保所有必要的环境变量已正确设置，敏感信息不要硬编码
4. **依赖冲突**：多版本共存时注意依赖冲突，使用 lock 文件锁定版本
5. **性能陷阱**：大数据量场景下注意性能优化，避免 N+1 查询等常见问题

## 使用流程

### Step 1: 环境准备
确保开发环境已安装必要的依赖和工具。

### Step 2: 配置初始化
根据项目需求进行基础配置。

### Step 3: 核心功能使用
按照示例代码实现核心功能。

### Step 4: 测试验证
运行测试确保功能正常。

### Step 5: 部署上线
完成开发后进行部署和监控。
