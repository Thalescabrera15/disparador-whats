-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'DONE');

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DispatchChips" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DispatchChips_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Dispatch_flowId_idx" ON "Dispatch"("flowId");

-- CreateIndex
CREATE INDEX "_DispatchChips_B_index" ON "_DispatchChips"("B");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DispatchChips" ADD CONSTRAINT "_DispatchChips_A_fkey" FOREIGN KEY ("A") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DispatchChips" ADD CONSTRAINT "_DispatchChips_B_fkey" FOREIGN KEY ("B") REFERENCES "WhatsappNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
