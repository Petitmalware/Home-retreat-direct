ALTER TABLE "Product" ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD CONSTRAINT "Product_discountPercent_check" CHECK ("discountPercent" BETWEEN 0 AND 90);
