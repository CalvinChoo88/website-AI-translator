-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "CancellationFeedback" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancellationFeedback_shopId_idx" ON "CancellationFeedback"("shopId");

-- AddForeignKey
ALTER TABLE "CancellationFeedback" ADD CONSTRAINT "CancellationFeedback_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
