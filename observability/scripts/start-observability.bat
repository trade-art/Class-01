@echo off
setlocal enabledelayedexpansion

:: MT5 Platform 可观测性堆栈启动脚本 (Windows)
:: 该脚本用于启动完整的可观测性基础设施

set SCRIPT_DIR=%~dp0
set OBSERVABILITY_DIR=%SCRIPT_DIR%..
set PROJECT_ROOT=%OBSERVABILITY_DIR%\..

:: 颜色定义 (使用 ANSI 转义码)
for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "RED=%ESC%[91m"
set "GREEN=%ESC%[92m"
set "YELLOW=%ESC%[93m"
set "BLUE=%ESC%[94m"
set "NC=%ESC%[0m"

:: 检查参数
if "%1"=="" goto :help
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help
if "%1"=="--start" goto :start
if "%1"=="--stop" goto :stop
if "%1"=="--restart" goto :restart
if "%1"=="--status" goto :status
if "%1"=="--logs" goto :logs
if "%1"=="--clean" goto :clean

echo %RED%[ERROR]%NC% 未知选项: %1
goto :help

:help
echo MT5 Platform 可观测性堆栈管理脚本
echo.
echo 用法: %~nx0 [选项]
echo.
echo 选项:
echo   --start         启动可观测性堆栈
echo   --stop          停止可观测性堆栈
echo   --restart       重启可观测性堆栈
echo   --status        显示服务状态
echo   --logs [服务]   查看服务日志
echo   --clean         停止并清理所有数据
echo   --help          显示此帮助信息
echo.
echo 服务端点:
echo   Grafana:      http://localhost:3001 (admin/admin)
echo   Prometheus:   http://localhost:9090
echo   Alertmanager: http://localhost:9093
echo   Loki:         http://localhost:3100
echo   Tempo:        http://localhost:3200
echo.
goto :eof

:check_docker
echo %BLUE%[INFO]%NC% 检查 Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Docker 未运行。请启动 Docker 后重试。
    exit /b 1
)
echo %GREEN%[SUCCESS]%NC% Docker 运行正常
goto :eof

:create_directories
echo %BLUE%[INFO]%NC% 创建必要的目录...

if not exist "%OBSERVABILITY_DIR%\data\prometheus" mkdir "%OBSERVABILITY_DIR%\data\prometheus"
if not exist "%OBSERVABILITY_DIR%\data\loki" mkdir "%OBSERVABILITY_DIR%\data\loki"
if not exist "%OBSERVABILITY_DIR%\data\tempo" mkdir "%OBSERVABILITY_DIR%\data\tempo"
if not exist "%OBSERVABILITY_DIR%\data\grafana" mkdir "%OBSERVABILITY_DIR%\data\grafana"
if not exist "%OBSERVABILITY_DIR%\data\alertmanager" mkdir "%OBSERVABILITY_DIR%\data\alertmanager"
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"

echo %GREEN%[SUCCESS]%NC% 目录创建完成
goto :eof

:start
call :check_docker
call :create_directories

echo %BLUE%[INFO]%NC% 启动可观测性堆栈...
cd /d "%OBSERVABILITY_DIR%"

echo %BLUE%[INFO]%NC% 拉取 Docker 镜像...
docker compose -f docker-compose.observability.yml pull

echo %BLUE%[INFO]%NC% 启动服务...
docker compose -f docker-compose.observability.yml up -d

echo %BLUE%[INFO]%NC% 等待服务就绪...
timeout /t 10 /nobreak >nul

call :health_check

echo %GREEN%[SUCCESS]%NC% 可观测性堆栈启动完成
echo.
echo 服务端点:
echo   Grafana:      http://localhost:3001 (admin/admin)
echo   Prometheus:   http://localhost:9090
echo   Alertmanager: http://localhost:9093
echo   Loki:         http://localhost:3100
echo   Tempo:        http://localhost:3200
goto :eof

:stop
echo %BLUE%[INFO]%NC% 停止可观测性堆栈...
cd /d "%OBSERVABILITY_DIR%"
docker compose -f docker-compose.observability.yml down
echo %GREEN%[SUCCESS]%NC% 可观测性堆栈已停止
goto :eof

:restart
call :stop
timeout /t 2 /nobreak >nul
call :start
goto :eof

:status
echo %BLUE%[INFO]%NC% 可观测性堆栈状态:
echo.
cd /d "%OBSERVABILITY_DIR%"
docker compose -f docker-compose.observability.yml ps
echo.
call :health_check
goto :eof

:logs
echo %BLUE%[INFO]%NC% 查看日志...
cd /d "%OBSERVABILITY_DIR%"
if "%2"=="" (
    docker compose -f docker-compose.observability.yml logs -f --tail=100
) else (
    docker compose -f docker-compose.observability.yml logs -f --tail=100 %2
)
goto :eof

:clean
echo %YELLOW%[WARNING]%NC% 这将停止所有服务并删除所有数据!
set /p CONFIRM=确定要继续吗? (y/N)
if /i not "%CONFIRM%"=="y" (
    echo %BLUE%[INFO]%NC% 操作已取消
    goto :eof
)

call :stop

echo %BLUE%[INFO]%NC% 清理数据目录...
if exist "%OBSERVABILITY_DIR%\data" rmdir /s /q "%OBSERVABILITY_DIR%\data"

echo %GREEN%[SUCCESS]%NC% 清理完成
goto :eof

:health_check
echo %BLUE%[INFO]%NC% 执行健康检查...

:: 检查 Prometheus
curl -s "http://localhost:9090/-/healthy" >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Prometheus: 不健康
) else (
    echo %GREEN%[SUCCESS]%NC% Prometheus: 健康
)

:: 检查 Grafana
curl -s "http://localhost:3001/api/health" >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Grafana: 不健康
) else (
    echo %GREEN%[SUCCESS]%NC% Grafana: 健康
)

:: 检查 Loki
curl -s "http://localhost:3100/ready" >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Loki: 不健康
) else (
    echo %GREEN%[SUCCESS]%NC% Loki: 健康
)

:: 检查 Tempo
curl -s "http://localhost:3200/ready" >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Tempo: 不健康
) else (
    echo %GREEN%[SUCCESS]%NC% Tempo: 健康
)

:: 检查 Alertmanager
curl -s "http://localhost:9093/-/healthy" >nul 2>&1
if errorlevel 1 (
    echo %RED%[ERROR]%NC% Alertmanager: 不健康
) else (
    echo %GREEN%[SUCCESS]%NC% Alertmanager: 健康
)
goto :eof
