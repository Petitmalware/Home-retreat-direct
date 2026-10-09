CREATE TABLE "ContactMessage" (
 "id" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "subject" TEXT NOT NULL,
 "message" TEXT NOT NULL,
 "reviewed" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactMessage_reviewed_createdAt_idx" ON "ContactMessage"("reviewed", "createdAt");
