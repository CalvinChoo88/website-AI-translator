-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "autoWarmOnFirstUse" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LocaleWarm" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "visitedJson" TEXT NOT NULL DEFAULT '[]',
    "frontierJson" TEXT NOT NULL DEFAULT '[]',
    "pagesDone" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocaleWarm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocaleWarm_shopId_locale_key" ON "LocaleWarm"("shopId", "locale");

-- AddForeignKey
ALTER TABLE "LocaleWarm" ADD CONSTRAINT "LocaleWarm_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
