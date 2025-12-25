#!/bin/bash

# ============================================
# 安全报告生成脚本
# 生成综合安全扫描报告
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 报告目录
REPORT_DIR="${REPORT_DIR:-./security-reports}"
REPORT_DATE=$(date +%Y-%m-%d)
REPORT_FILE="${REPORT_DIR}/security-report-${REPORT_DATE}.md"

# 创建报告目录
mkdir -p "${REPORT_DIR}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    安全报告生成工具 v1.0${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 初始化报告
cat > "${REPORT_FILE}" << EOF
# 安全扫描报告

**生成日期**: ${REPORT_DATE}
**生成时间**: $(date +%H:%M:%S)
**项目**: MT5 Platform

---

## 目录

1. [概要](#概要)
2. [NPM 依赖漏洞](#npm-依赖漏洞)
3. [代码安全检查](#代码安全检查)
4. [许可证检查](#许可证检查)
5. [安全配置检查](#安全配置检查)
6. [建议和修复措施](#建议和修复措施)

---

## 概要

EOF

echo -e "${GREEN}开始安全扫描...${NC}"
echo ""

# ============================================
# NPM Audit 扫描
# ============================================
echo -e "${YELLOW}[1/4] 运行 NPM Audit 扫描...${NC}"

npm audit --json > "${REPORT_DIR}/npm-audit-raw.json" 2>/dev/null || true

if [ -f "${REPORT_DIR}/npm-audit-raw.json" ]; then
    CRITICAL=$(cat "${REPORT_DIR}/npm-audit-raw.json" | jq '.metadata.vulnerabilities.critical // 0')
    HIGH=$(cat "${REPORT_DIR}/npm-audit-raw.json" | jq '.metadata.vulnerabilities.high // 0')
    MODERATE=$(cat "${REPORT_DIR}/npm-audit-raw.json" | jq '.metadata.vulnerabilities.moderate // 0')
    LOW=$(cat "${REPORT_DIR}/npm-audit-raw.json" | jq '.metadata.vulnerabilities.low // 0')
    TOTAL=$(cat "${REPORT_DIR}/npm-audit-raw.json" | jq '.metadata.vulnerabilities.total // 0')

    cat >> "${REPORT_FILE}" << EOF
| 检查项 | 状态 | 详情 |
|--------|------|------|
| NPM 依赖漏洞 | $([ "$CRITICAL" -eq 0 ] && [ "$HIGH" -eq 0 ] && echo "✅ 通过" || echo "⚠️ 需关注") | 严重: ${CRITICAL}, 高危: ${HIGH}, 中危: ${MODERATE}, 低危: ${LOW} |

---

## NPM 依赖漏洞

### 漏洞统计

| 严重性 | 数量 | 状态 |
|--------|------|------|
| 严重 (Critical) | ${CRITICAL} | $([ "$CRITICAL" -eq 0 ] && echo "✅" || echo "🔴") |
| 高危 (High) | ${HIGH} | $([ "$HIGH" -eq 0 ] && echo "✅" || echo "🟠") |
| 中危 (Moderate) | ${MODERATE} | $([ "$MODERATE" -eq 0 ] && echo "✅" || echo "🟡") |
| 低危 (Low) | ${LOW} | $([ "$LOW" -eq 0 ] && echo "✅" || echo "⚪") |
| **总计** | **${TOTAL}** | |

EOF

    if [ "$TOTAL" -gt 0 ]; then
        echo "" >> "${REPORT_FILE}"
        echo "### 漏洞详情" >> "${REPORT_FILE}"
        echo "" >> "${REPORT_FILE}"
        echo "\`\`\`" >> "${REPORT_FILE}"
        npm audit 2>/dev/null | head -100 >> "${REPORT_FILE}" || echo "无法获取详细信息" >> "${REPORT_FILE}"
        echo "\`\`\`" >> "${REPORT_FILE}"
    fi

    echo -e "  └─ 完成: 严重=${CRITICAL}, 高危=${HIGH}, 中危=${MODERATE}, 低危=${LOW}"
else
    echo "  └─ 警告: 无法生成 NPM Audit 报告"
    echo "| NPM 依赖漏洞 | ⚠️ 未知 | 无法执行扫描 |" >> "${REPORT_FILE}"
fi

# ============================================
# 代码安全检查
# ============================================
echo ""
echo -e "${YELLOW}[2/4] 运行代码安全检查...${NC}"

cat >> "${REPORT_FILE}" << EOF

---

## 代码安全检查

### 敏感信息检测

检查硬编码的敏感信息（API 密钥、密码等）：

EOF

# 检查硬编码密码
echo -e "  └─ 检查硬编码密码..."
HARDCODED_PASSWORDS=$(grep -rn --include="*.ts" --include="*.js" -E "(password\s*[:=]\s*['\"][^'\"]+['\"]|secret\s*[:=]\s*['\"][^'\"]+['\"])" apps/ 2>/dev/null | grep -v "node_modules" | grep -v ".test." | grep -v ".spec." | wc -l || echo "0")

echo "| 检查项 | 发现数量 | 状态 |" >> "${REPORT_FILE}"
echo "|--------|----------|------|" >> "${REPORT_FILE}"
echo "| 硬编码密码/密钥 | ${HARDCODED_PASSWORDS} | $([ "$HARDCODED_PASSWORDS" -eq 0 ] && echo "✅" || echo "⚠️") |" >> "${REPORT_FILE}"

# 检查 console.log
echo -e "  └─ 检查调试日志..."
CONSOLE_LOGS=$(grep -rn --include="*.ts" --include="*.js" "console\.\(log\|debug\)" apps/ 2>/dev/null | grep -v "node_modules" | grep -v ".test." | grep -v ".spec." | wc -l || echo "0")
echo "| console.log/debug | ${CONSOLE_LOGS} | $([ "$CONSOLE_LOGS" -lt 10 ] && echo "✅" || echo "⚠️") |" >> "${REPORT_FILE}"

# 检查 TODO/FIXME
echo -e "  └─ 检查待处理标记..."
TODOS=$(grep -rn --include="*.ts" --include="*.js" -E "(TODO|FIXME|XXX|HACK)" apps/ 2>/dev/null | grep -v "node_modules" | wc -l || echo "0")
echo "| TODO/FIXME 标记 | ${TODOS} | ℹ️ 信息 |" >> "${REPORT_FILE}"

echo -e "  └─ 完成"

# ============================================
# 许可证检查
# ============================================
echo ""
echo -e "${YELLOW}[3/4] 运行许可证检查...${NC}"

cat >> "${REPORT_FILE}" << EOF

---

## 许可证检查

EOF

if command -v license-checker &> /dev/null; then
    license-checker --json > "${REPORT_DIR}/license-report.json" 2>/dev/null || true

    if [ -f "${REPORT_DIR}/license-report.json" ]; then
        echo "### 许可证分布" >> "${REPORT_FILE}"
        echo "" >> "${REPORT_FILE}"
        echo "| 许可证 | 包数量 |" >> "${REPORT_FILE}"
        echo "|--------|--------|" >> "${REPORT_FILE}"
        cat "${REPORT_DIR}/license-report.json" | jq -r 'to_entries | map(.value.licenses) | group_by(.) | map({license: .[0], count: length}) | sort_by(-.count) | .[:10][] | "| \(.license) | \(.count) |"' >> "${REPORT_FILE}" 2>/dev/null || echo "| 无法解析 | - |" >> "${REPORT_FILE}"
        echo -e "  └─ 完成"
    else
        echo "无法生成许可证报告" >> "${REPORT_FILE}"
        echo -e "  └─ 警告: 无法生成许可证报告"
    fi
else
    echo "license-checker 未安装，跳过许可证检查" >> "${REPORT_FILE}"
    echo "运行 \`npm install -g license-checker\` 以启用此检查" >> "${REPORT_FILE}"
    echo -e "  └─ 跳过: license-checker 未安装"
fi

# ============================================
# 安全配置检查
# ============================================
echo ""
echo -e "${YELLOW}[4/4] 检查安全配置...${NC}"

cat >> "${REPORT_FILE}" << EOF

---

## 安全配置检查

### 环境变量安全

EOF

echo "| 配置项 | 状态 | 说明 |" >> "${REPORT_FILE}"
echo "|--------|------|------|" >> "${REPORT_FILE}"

# 检查 .env 文件是否在 .gitignore 中
if grep -q "\.env" .gitignore 2>/dev/null; then
    echo "| .env 文件排除 | ✅ 已配置 | .gitignore 包含 .env |" >> "${REPORT_FILE}"
else
    echo "| .env 文件排除 | ⚠️ 未配置 | 应将 .env 添加到 .gitignore |" >> "${REPORT_FILE}"
fi

# 检查是否有 .env.example
if [ -f ".env.example" ]; then
    echo "| 环境变量模板 | ✅ 存在 | .env.example 已创建 |" >> "${REPORT_FILE}"
else
    echo "| 环境变量模板 | ⚠️ 缺失 | 建议创建 .env.example |" >> "${REPORT_FILE}"
fi

# 检查 Helmet 配置
if grep -rq "helmet" apps/tenant-api/src/main.ts 2>/dev/null; then
    echo "| Helmet 安全头 | ✅ 已配置 | 已在主入口配置 |" >> "${REPORT_FILE}"
else
    echo "| Helmet 安全头 | ⚠️ 未配置 | 建议添加 Helmet 中间件 |" >> "${REPORT_FILE}"
fi

# 检查 CORS 配置
if grep -rq "enableCors" apps/tenant-api/src/main.ts 2>/dev/null; then
    echo "| CORS 配置 | ✅ 已配置 | 已启用 CORS |" >> "${REPORT_FILE}"
else
    echo "| CORS 配置 | ⚠️ 未配置 | 建议配置 CORS |" >> "${REPORT_FILE}"
fi

echo -e "  └─ 完成"

# ============================================
# 建议和修复措施
# ============================================

cat >> "${REPORT_FILE}" << EOF

---

## 建议和修复措施

### 立即行动 (P0)

EOF

if [ "$CRITICAL" -gt 0 ]; then
    echo "- [ ] 修复 ${CRITICAL} 个严重级别的 NPM 依赖漏洞" >> "${REPORT_FILE}"
fi

if [ "$HIGH" -gt 0 ]; then
    echo "- [ ] 修复 ${HIGH} 个高危级别的 NPM 依赖漏洞" >> "${REPORT_FILE}"
fi

if [ "$CRITICAL" -eq 0 ] && [ "$HIGH" -eq 0 ]; then
    echo "- 无需立即行动的安全问题 ✅" >> "${REPORT_FILE}"
fi

cat >> "${REPORT_FILE}" << EOF

### 短期改进 (P1)

EOF

if [ "$MODERATE" -gt 0 ]; then
    echo "- [ ] 评估并修复 ${MODERATE} 个中危级别的依赖漏洞" >> "${REPORT_FILE}"
fi

if [ "$HARDCODED_PASSWORDS" -gt 0 ]; then
    echo "- [ ] 检查并移除 ${HARDCODED_PASSWORDS} 处可能的硬编码凭证" >> "${REPORT_FILE}"
fi

cat >> "${REPORT_FILE}" << EOF

### 长期优化 (P2)

- [ ] 建立定期安全扫描流程（建议每周）
- [ ] 配置依赖更新自动化（如 Dependabot）
- [ ] 进行安全代码审计
- [ ] 完善安全测试覆盖

---

## 附录

### 报告文件

- NPM Audit 原始数据: \`${REPORT_DIR}/npm-audit-raw.json\`
- 许可证报告: \`${REPORT_DIR}/license-report.json\`

### 下次扫描

建议下次扫描时间: $(date -d "+7 days" +%Y-%m-%d 2>/dev/null || date -v+7d +%Y-%m-%d 2>/dev/null || echo "一周后")

---

*报告由 MT5 Platform 安全扫描工具自动生成*
EOF

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}    安全报告生成完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "报告文件: ${BLUE}${REPORT_FILE}${NC}"
echo ""

# 显示摘要
echo "安全扫描摘要:"
echo "  ├─ 严重漏洞: ${CRITICAL:-0}"
echo "  ├─ 高危漏洞: ${HIGH:-0}"
echo "  ├─ 中危漏洞: ${MODERATE:-0}"
echo "  └─ 低危漏洞: ${LOW:-0}"
echo ""

# 如果有严重或高危漏洞，返回非零退出码
if [ "${CRITICAL:-0}" -gt 0 ] || [ "${HIGH:-0}" -gt 0 ]; then
    echo -e "${RED}⚠️ 发现严重或高危漏洞，请尽快处理！${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 未发现严重或高危漏洞${NC}"
exit 0
