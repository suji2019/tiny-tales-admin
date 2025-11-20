#!/bin/bash
# Cloud Run部署脚本 - Admin API

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
GCP_PROJECT=${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo "")}
GCP_REGION=${GCP_REGION:-us-central1}
PROJECT_NAME=${PROJECT_NAME:-tiny-tales}
SERVICE_NAME=${SERVICE_NAME:-${PROJECT_NAME}-admin-api}
ARTIFACT_REGISTRY_REPO=${ARTIFACT_REGISTRY_REPO:-${PROJECT_NAME}-repo}
IMAGE_NAME=${IMAGE_NAME:-${PROJECT_NAME}-admin-api}
PUBSUB_TOPIC=${PUBSUB_TOPIC:-${PROJECT_NAME}-books-topic}

echo "🚀 开始部署Admin API到 Cloud Run..."
echo "项目: $GCP_PROJECT"
echo "区域: $GCP_REGION"
echo "服务: $SERVICE_NAME"
echo ""

# 检查GCP项目
if [ -z "$GCP_PROJECT" ]; then
    echo -e "${RED}❌ 错误: 未设置GCP项目${NC}"
    echo "请运行: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

# 设置项目
gcloud config set project "$GCP_PROJECT" > /dev/null

# 获取Artifact Registry URI
ARTIFACT_REGISTRY_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${ARTIFACT_REGISTRY_REPO}"
FULL_IMAGE_NAME="${ARTIFACT_REGISTRY_URI}/${IMAGE_NAME}:latest"

echo "📦 构建Docker镜像..."
echo "   镜像: $FULL_IMAGE_NAME"
echo ""

# 配置Docker认证
echo "🔐 配置Docker认证..."
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

# 构建并推送镜像
echo "🔨 构建Docker镜像 (AMD64平台，适用于Cloud Run)..."
docker build --platform linux/amd64 -t "$FULL_IMAGE_NAME" .

echo "📤 推送镜像到Artifact Registry..."
docker push "$FULL_IMAGE_NAME"

echo ""
echo "📝 部署到Cloud Run..."

# 从Secret Manager获取配置
GCS_BUCKET=$(gcloud secrets versions access latest --secret="gcs-bucket" --project="$GCP_PROJECT" 2>/dev/null || echo "$PROJECT_NAME-storage")

# 部署Cloud Run服务
gcloud run deploy "$SERVICE_NAME" \
    --image="$FULL_IMAGE_NAME" \
    --platform=managed \
    --region="$GCP_REGION" \
    --project="$GCP_PROJECT" \
    --allow-unauthenticated \
    --cpu=1 \
    --memory=512Mi \
    --timeout=300 \
    --max-instances=10 \
    --min-instances=0 \
    --concurrency=80 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=$GCP_PROJECT,PUBSUB_TOPIC=$PUBSUB_TOPIC,GCS_BUCKET=$GCS_BUCKET,NODE_ENV=production" \
    --service-account="${SERVICE_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com" 2>/dev/null || \
    gcloud run deploy "$SERVICE_NAME" \
        --image="$FULL_IMAGE_NAME" \
        --platform=managed \
        --region="$GCP_REGION" \
        --project="$GCP_PROJECT" \
        --allow-unauthenticated \
        --cpu=1 \
        --memory=512Mi \
        --timeout=300 \
        --max-instances=10 \
        --min-instances=0 \
        --concurrency=80 \
        --set-env-vars="GOOGLE_CLOUD_PROJECT=$GCP_PROJECT,PUBSUB_TOPIC=$PUBSUB_TOPIC,GCS_BUCKET=$GCS_BUCKET,NODE_ENV=production"

# 获取服务URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform=managed \
    --region="$GCP_REGION" \
    --project="$GCP_PROJECT" \
    --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo -e "${GREEN}✅ 部署完成！${NC}"
echo ""
echo "📋 服务信息:"
echo "  服务名称: $SERVICE_NAME"
echo "  区域: $GCP_REGION"
if [ -n "$SERVICE_URL" ]; then
    echo "  服务URL: $SERVICE_URL"
fi
echo ""
echo "📝 下一步:"
echo "  1. 查看日志:"
echo "     gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME\" --limit 50"
echo ""
echo "  2. 查看服务状态:"
echo "     gcloud run services describe $SERVICE_NAME --region=$GCP_REGION"
echo ""

