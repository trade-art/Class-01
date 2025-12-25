#!/bin/bash

# MT5 Platform 可观测性堆栈启动脚本
# 该脚本用于启动完整的可观测性基础设施

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OBSERVABILITY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$OBSERVABILITY_DIR")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    echo "MT5 Platform 可观测性堆栈管理脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --start         启动可观测性堆栈"
    echo "  --stop          停止可观测性堆栈"
    echo "  --restart       重启可观测性堆栈"
    echo "  --status        显示服务状态"
    echo "  --logs [服务]   查看服务日志"
    echo "  --clean         停止并清理所有数据"
    echo "  --help          显示此帮助信息"
    echo ""
    echo "服务端点:"
    echo "  Grafana:      http://localhost:3001 (admin/admin)"
    echo "  Prometheus:   http://localhost:9090"
    echo "  Alertmanager: http://localhost:9093"
    echo "  Loki:         http://localhost:3100"
    echo "  Tempo:        http://localhost:3200"
    echo ""
}

# 检查 Docker 是否运行
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker 未运行。请启动 Docker 后重试。"
        exit 1
    fi
    log_info "Docker 运行正常"
}

# 检查 docker-compose 是否可用
check_compose() {
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        log_error "未找到 docker-compose。请安装 Docker Compose。"
        exit 1
    fi
    log_info "使用 $COMPOSE_CMD"
}

# 创建必要的目录
create_directories() {
    log_info "创建必要的目录..."

    # 数据目录
    mkdir -p "$OBSERVABILITY_DIR/data/prometheus"
    mkdir -p "$OBSERVABILITY_DIR/data/loki"
    mkdir -p "$OBSERVABILITY_DIR/data/tempo"
    mkdir -p "$OBSERVABILITY_DIR/data/grafana"
    mkdir -p "$OBSERVABILITY_DIR/data/alertmanager"

    # 日志目录
    mkdir -p "$PROJECT_ROOT/logs"

    log_success "目录创建完成"
}

# 启动服务
start_services() {
    log_info "启动可观测性堆栈..."

    cd "$OBSERVABILITY_DIR"

    # 拉取最新镜像
    log_info "拉取 Docker 镜像..."
    $COMPOSE_CMD -f docker-compose.observability.yml pull

    # 启动服务
    log_info "启动服务..."
    $COMPOSE_CMD -f docker-compose.observability.yml up -d

    # 等待服务就绪
    log_info "等待服务就绪..."
    sleep 10

    # 检查服务状态
    check_services

    log_success "可观测性堆栈启动完成"
    echo ""
    echo "服务端点:"
    echo "  Grafana:      http://localhost:3001 (admin/admin)"
    echo "  Prometheus:   http://localhost:9090"
    echo "  Alertmanager: http://localhost:9093"
    echo "  Loki:         http://localhost:3100"
    echo "  Tempo:        http://localhost:3200"
}

# 停止服务
stop_services() {
    log_info "停止可观测性堆栈..."

    cd "$OBSERVABILITY_DIR"
    $COMPOSE_CMD -f docker-compose.observability.yml down

    log_success "可观测性堆栈已停止"
}

# 重启服务
restart_services() {
    stop_services
    sleep 2
    start_services
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."

    cd "$OBSERVABILITY_DIR"

    services=("prometheus" "loki" "grafana" "tempo" "alertmanager" "promtail")
    all_healthy=true

    for service in "${services[@]}"; do
        if $COMPOSE_CMD -f docker-compose.observability.yml ps "$service" 2>/dev/null | grep -q "Up"; then
            log_success "$service: 运行中"
        else
            log_error "$service: 未运行"
            all_healthy=false
        fi
    done

    if [ "$all_healthy" = true ]; then
        log_success "所有服务运行正常"
    else
        log_warning "部分服务未正常运行"
    fi
}

# 显示服务状态
show_status() {
    log_info "可观测性堆栈状态:"
    echo ""

    cd "$OBSERVABILITY_DIR"
    $COMPOSE_CMD -f docker-compose.observability.yml ps
}

# 查看日志
show_logs() {
    local service=$1

    cd "$OBSERVABILITY_DIR"

    if [ -z "$service" ]; then
        $COMPOSE_CMD -f docker-compose.observability.yml logs -f --tail=100
    else
        $COMPOSE_CMD -f docker-compose.observability.yml logs -f --tail=100 "$service"
    fi
}

# 清理数据
clean_data() {
    log_warning "这将停止所有服务并删除所有数据!"
    read -p "确定要继续吗? (y/N) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        stop_services

        log_info "清理数据目录..."
        rm -rf "$OBSERVABILITY_DIR/data"

        log_success "清理完成"
    else
        log_info "操作已取消"
    fi
}

# 健康检查
health_check() {
    log_info "执行健康检查..."

    # 检查 Prometheus
    if curl -s "http://localhost:9090/-/healthy" > /dev/null 2>&1; then
        log_success "Prometheus: 健康"
    else
        log_error "Prometheus: 不健康"
    fi

    # 检查 Grafana
    if curl -s "http://localhost:3001/api/health" > /dev/null 2>&1; then
        log_success "Grafana: 健康"
    else
        log_error "Grafana: 不健康"
    fi

    # 检查 Loki
    if curl -s "http://localhost:3100/ready" > /dev/null 2>&1; then
        log_success "Loki: 健康"
    else
        log_error "Loki: 不健康"
    fi

    # 检查 Tempo
    if curl -s "http://localhost:3200/ready" > /dev/null 2>&1; then
        log_success "Tempo: 健康"
    else
        log_error "Tempo: 不健康"
    fi

    # 检查 Alertmanager
    if curl -s "http://localhost:9093/-/healthy" > /dev/null 2>&1; then
        log_success "Alertmanager: 健康"
    else
        log_error "Alertmanager: 不健康"
    fi
}

# 主函数
main() {
    case "${1:-}" in
        --start)
            check_docker
            check_compose
            create_directories
            start_services
            ;;
        --stop)
            check_compose
            stop_services
            ;;
        --restart)
            check_docker
            check_compose
            restart_services
            ;;
        --status)
            check_compose
            show_status
            health_check
            ;;
        --logs)
            check_compose
            show_logs "$2"
            ;;
        --clean)
            check_compose
            clean_data
            ;;
        --help|"")
            show_help
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
