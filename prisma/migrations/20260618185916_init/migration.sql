-- CreateEnum
CREATE TYPE "FlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChipStatus" AS ENUM ('NEW', 'WARMING', 'ACTIVE', 'PAUSED', 'COOLDOWN', 'RETIRED');

-- CreateEnum
CREATE TYPE "Warmth" AS ENUM ('WARM', 'ENGAGED', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'QUEUED', 'OPENED', 'REPLIED', 'CONVERSING', 'CONVERTED', 'LOST', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "ConvState" AS ENUM ('WAITING_REPLY', 'ACTIVE', 'LINK_RELEASED', 'CONVERTED', 'CLOSED', 'HANDOFF');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MsgType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'PDF');

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "FlowStatus" NOT NULL DEFAULT 'DRAFT',
    "aiModel" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "knowledgeBase" TEXT NOT NULL,
    "fewShotExamples" JSONB NOT NULL,
    "guardRules" JSONB NOT NULL,
    "linkReleaseRule" JSONB NOT NULL,
    "bridgeDomain" TEXT NOT NULL,
    "checkoutBaseUrl" TEXT NOT NULL,
    "sendConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningMessage" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OpeningMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappNumber" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "ChipStatus" NOT NULL DEFAULT 'NEW',
    "authState" JSONB,
    "authStateRef" TEXT,
    "rampDay" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER NOT NULL DEFAULT 0,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "lastResetAt" TIMESTAMP(3),
    "windowStart" INTEGER NOT NULL DEFAULT 9,
    "windowEnd" INTEGER NOT NULL DEFAULT 20,
    "restDays" JSONB,
    "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "consecFails" INTEGER NOT NULL DEFAULT 0,
    "lastSignalAt" TIMESTAMP(3),
    "proxyId" TEXT,
    "profileName" TEXT,
    "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proxy" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "type" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "meta" JSONB,
    "source" TEXT,
    "warmth" "Warmth" NOT NULL DEFAULT 'WARM',
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "slug" TEXT NOT NULL,
    "importBatchId" TEXT,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "invalid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "state" "ConvState" NOT NULL DEFAULT 'WAITING_REPLY',
    "summary" TEXT,
    "linkSent" BOOLEAN NOT NULL DEFAULT false,
    "handoff" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "chipId" TEXT,
    "direction" "Direction" NOT NULL,
    "type" "MsgType" NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "waMessageId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedLink" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "firstClick" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEvent" (
    "id" TEXT NOT NULL,
    "chipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Flow_slug_key" ON "Flow"("slug");

-- CreateIndex
CREATE INDEX "OpeningMessage_flowId_idx" ON "OpeningMessage"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappNumber_phone_key" ON "WhatsappNumber"("phone");

-- CreateIndex
CREATE INDEX "WhatsappNumber_status_idx" ON "WhatsappNumber"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_slug_key" ON "Lead"("slug");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_flowId_status_idx" ON "Lead"("flowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_flowId_phone_key" ON "Lead"("flowId", "phone");

-- CreateIndex
CREATE INDEX "ImportBatch_flowId_idx" ON "ImportBatch"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_leadId_key" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Message_chipId_createdAt_idx" ON "Message"("chipId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedLink_slug_key" ON "TrackedLink"("slug");

-- CreateIndex
CREATE INDEX "TrackedLink_leadId_idx" ON "TrackedLink"("leadId");

-- CreateIndex
CREATE INDEX "HealthEvent_chipId_createdAt_idx" ON "HealthEvent"("chipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_phone_key" ON "Suppression"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "OpeningMessage" ADD CONSTRAINT "OpeningMessage_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappNumber" ADD CONSTRAINT "WhatsappNumber_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "Proxy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chipId_fkey" FOREIGN KEY ("chipId") REFERENCES "WhatsappNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEvent" ADD CONSTRAINT "HealthEvent_chipId_fkey" FOREIGN KEY ("chipId") REFERENCES "WhatsappNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
